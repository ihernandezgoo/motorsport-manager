import { useSyncExternalStore } from "react";
import { helmetOf } from "./game/data/liveries";
import { QualiSim, type QEvent, type QPhase, type QualiLiveConfig, type QualiOrder } from "./game/qualiLive";
import type { Compound, QualiEntry, TyreSet } from "./game/types";
import { wetnessAt } from "./game/weather";
import type { LiveDot } from "./liveRace";

export interface QualiRow {
  id: string;
  code: string;
  last: string;
  number: number;
  color: string;
  teamId: string;
  pos: number;
  best: number | null;
  gap: number | null;
  lastLap: number | null;
  lastNote?: string;
  compound: Compound | null;
  phase: QPhase;
  crashed: boolean;
  isPlayer: boolean;
  laps: number;
}

export interface QualiPlayer {
  id: string;
  phase: QPhase;
  /** Fracción de la fase actual completada. */
  phaseFrac: number;
  crashed: boolean;
  auto: boolean;
  queued: QualiOrder | null;
  order: QualiOrder | null;
  readyIn: number;
  pushLeft: number;
  abort: boolean;
  pos: number;
  best: number | null;
  sets: TyreSet[];
}

export interface QualiSnapshot {
  key: string;
  segName: string;
  segIdx: number;
  keep: number;
  clock: number;
  remaining: number;
  red: boolean;
  chequered: boolean;
  finished: boolean;
  playing: boolean;
  speed: number;
  wet: number;
  rain: number;
  rows: QualiRow[];
  dots: LiveDot[];
  players: QualiPlayer[];
  events: QEvent[];
}

/** Velocidades de la sesión (segundos de sesión por segundo real). */
export const QUALI_SPEEDS = [1, 5, 10, 20, 40];

class LiveQualiStore {
  private sim: QualiSim | null = null;
  private key = "";
  private playing = false;
  private speed = 10;
  private snap: QualiSnapshot | null = null;
  private listeners = new Set<() => void>();
  private raf = 0;
  private lastTs = 0;
  private lastEmit = 0;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = () => this.snap;

  start(key: string, cfg: QualiLiveConfig) {
    this.dispose();
    this.sim = new QualiSim(cfg);
    this.key = key;
    this.emit();
  }

  dispose() {
    this.stopLoop();
    this.sim = null;
    this.key = "";
    this.playing = false;
    this.snap = null;
    this.emit();
  }

  play() {
    if (!this.sim || this.sim.finished) return;
    this.playing = true;
    this.startLoop();
    this.emit();
  }

  pause() {
    this.playing = false;
    this.stopLoop();
    this.emit();
  }

  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }

  /** Simula el resto de la tanda al instante. */
  finishNow() {
    if (!this.sim) return;
    this.sim.runToEnd();
    this.pause();
  }

  sendOut(id: string, order: QualiOrder): string | null {
    const err = this.sim?.sendOut(id, order) ?? "Sin sesión";
    if (!err && !this.playing) this.play();
    this.emit();
    return err;
  }

  boxNow(id: string) {
    this.sim?.boxNow(id);
    this.emit();
  }

  setAuto(id: string, auto: boolean) {
    this.sim?.setAuto(id, auto);
    this.emit();
  }

  results(): QualiEntry[] | null {
    return this.sim?.finished ? this.sim.results() : null;
  }

  /** Juegos de neumáticos de los pilotos del jugador tras la tanda. */
  sets(): Record<string, TyreSet[]> | null {
    return this.sim ? structuredClone(this.sim.sets) : null;
  }

  private startLoop() {
    if (this.raf || typeof window === "undefined") return;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (ts: number) => {
    this.raf = 0;
    const sim = this.sim;
    if (!sim || !this.playing) return;
    const dt = Math.min(0.25, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    sim.advance(dt * this.speed);
    if (sim.finished) {
      this.playing = false;
      this.emit();
      return;
    }
    if (ts - this.lastEmit > 50) {
      this.lastEmit = ts;
      this.emit();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private emit() {
    this.snap = this.sim ? this.build(this.sim) : null;
    for (const l of this.listeners) l();
  }

  private build(sim: QualiSim): QualiSnapshot {
    const order = sim.order();
    const top = order[0]?.best ?? null;
    const rows: QualiRow[] = order.map((c, i) => ({
      id: c.id,
      code: c.code,
      last: c.last,
      number: c.number,
      color: c.color,
      teamId: c.teamId,
      pos: i + 1,
      best: c.best,
      gap: c.best !== null && top !== null && i > 0 ? c.best - top : null,
      lastLap: c.lastLap,
      lastNote: c.lastNote,
      compound: c.order?.compound ?? c.bestCompound,
      phase: c.phase,
      crashed: c.crashed,
      isPlayer: c.isPlayer,
      laps: c.laps,
    }));
    const posOf = new Map(rows.map((r) => [r.id, r.pos]));
    const dots: LiveDot[] = sim.cars.map((c) => {
      const p = sim.position(c);
      return {
        id: c.id,
        teamId: c.teamId,
        helmet: helmetOf(sim.cfg.ctx.drivers[c.id]).base,
        code: c.code,
        last: c.last,
        number: c.number,
        color: c.color,
        accent: c.accent,
        progress: p.progress,
        inPit: p.inPit,
        boxed: p.boxed,
        out: c.crashed,
        isPlayer: c.isPlayer,
        pos: posOf.get(c.id) ?? 99,
        compound: c.order?.compound ?? c.bestCompound ?? "M",
        wear: c.setWear,
      };
    });
    const players: QualiPlayer[] = sim.cars
      .filter((c) => c.isPlayer)
      .map((c) => ({
        id: c.id,
        phase: c.phase,
        phaseFrac: c.phase === "garage" ? 0 : Math.min(1, Math.max(0, (sim.clock - c.phaseStart) / Math.max(1, c.phaseEnd - c.phaseStart))),
        crashed: c.crashed,
        auto: c.auto,
        queued: c.queued,
        order: c.order,
        readyIn: Math.max(0, c.readyAt - sim.clock),
        pushLeft: c.pushLeft,
        abort: c.abort,
        pos: posOf.get(c.id) ?? 0,
        best: c.best,
        sets: sim.sets[c.id] ?? [],
      }));
    const plan = sim.cfg.ctx.weather;
    const minute = sim.cfg.startMinute + sim.clock / 60;
    return {
      key: this.key,
      segName: sim.cfg.segName,
      segIdx: sim.cfg.segIdx,
      keep: sim.cfg.keep,
      clock: sim.clock,
      remaining: sim.remaining(),
      red: sim.redActive(),
      chequered: sim.chequered(),
      finished: sim.finished,
      playing: this.playing,
      speed: this.speed,
      wet: wetnessAt(plan, Math.min(1, minute / plan.minutes)),
      rain: sim.rainNow(),
      rows,
      dots,
      players,
      events: [...sim.events].filter((e) => e.time <= sim.clock).reverse().slice(0, 40),
    };
  }
}

export const liveQuali = new LiveQualiStore();

export function useLiveQuali(): QualiSnapshot | null {
  return useSyncExternalStore(liveQuali.subscribe, liveQuali.getSnapshot, () => null);
}
