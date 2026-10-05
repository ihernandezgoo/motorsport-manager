import { useSyncExternalStore } from "react";
import { helmetOf } from "./game/data/liveries";
import { RaceSim, type LapStatus, type RaceConfig, type RaceEvent, type TeamOrder } from "./game/race";
import { scoreResult } from "./game/season";
import type { Plan } from "./game/strategy";
import type { Compound, DrivingStyle, EngineMode, ErsMode, RaceKind, RaceResult, SeriesId } from "./game/types";
import { rainAt } from "./game/weather";

export interface LiveTowerRow {
  id: string;
  code: string;
  last: string;
  color: string;
  number: number;
  pos: number;
  gap: string;
  interval: string;
  compound: Compound;
  tyreAge: number;
  wear: number;
  pits: number;
  inPit: boolean;
  out: boolean;
  finished: boolean;
  isPlayer: boolean;
  delta: number;
  penalty: number;
  lastLap: number;
  bestLap: number;
}

export interface LiveDot {
  id: string;
  teamId: string;
  /** Color principal del casco del piloto. */
  helmet: string;
  code: string;
  last: string;
  number: number;
  color: string;
  accent: string;
  progress: number;
  inPit: boolean;
  /** Parado en su garaje. */
  boxed: boolean;
  out: boolean;
  isPlayer: boolean;
  pos: number;
  compound: Compound;
  wear: number;
}

export interface Neighbour {
  pos: number;
  number: number;
  code: string;
  color: string;
  gap: string;
}

export interface LivePlayer {
  id: string;
  code: string;
  name: string;
  last: string;
  number: number;
  color: string;
  accent: string;
  pos: number;
  out: boolean;
  dnfReason?: string;
  finished: boolean;
  style: DrivingStyle;
  engine: EngineMode;
  ers: ErsMode;
  auto: boolean;
  pitRequest: Compound | null;
  pitLap: number;
  compound: Compound;
  wear: number;
  wearRate: number;
  temp: number;
  tyreAge: number;
  fuelMargin: number;
  fuelPerLap: number;
  battery: number;
  currentLap: number;
  lapProgress: number;
  lastLap: number;
  bestLap: number;
  ahead: Neighbour | null;
  behind: Neighbour | null;
  pits: number;
  penalty: number;
  aeroDamage: number;
  floorDamage: number;
  powerLoss: number;
  needsOther: boolean;
  /** Último mensaje de radio reciente del piloto. */
  radio: string | null;
  /** Juegos de repuesto que quedan (null si no se lleva la cuenta). */
  spareSets: { compound: Compound; wear: number }[] | null;
}

export interface LiveSnapshot {
  key: string;
  name: string;
  series: SeriesId;
  kind: RaceKind;
  circuitId: string;
  clock: number;
  speed: number;
  playing: boolean;
  finished: boolean;
  computedAll: boolean;
  lap: number;
  totalLaps: number;
  baseLap: number;
  status: LapStatus;
  wet: number;
  rain: number;
  trackTemp: number;
  airTemp: number;
  hasErs: boolean;
  tower: LiveTowerRow[];
  dots: LiveDot[];
  players: LivePlayer[];
  events: RaceEvent[];
  radar: number[];
  fastest: { id: string; code: string; time: number; lap: number } | null;
  pauseReason: string | null;
  result: RaceResult | null;
  /** Carrera suspendida por bandera roja: segundos (de carrera) hasta la salida parada. */
  redFlag: { restartIn: number } | null;
  /** Orden de equipo vigente para los coches del jugador. */
  teamOrder: TeamOrder;
  /** Repetición de un momento de la carrera ya terminada. */
  replaying: boolean;
  /** Momentos clave de la carrera (solo al terminar). */
  highlights: RaceEvent[];
}

const IMPORTANT: RaceEvent["type"][] = ["sc", "vsc", "red", "weather"];

class LiveRaceStore {
  private sim: RaceSim | null = null;
  private key = "";
  private clock = 0;
  private speed = 10;
  private playing = false;
  private finished = false;
  private replaying = false;
  private autoPause = true;
  private pauseReason: string | null = null;
  private handled = new Set<number>();
  private snap: LiveSnapshot | null = null;
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

  start(key: string, cfg: RaceConfig, opts: { auto: Record<string, boolean>; speed: number; autoPause: boolean }) {
    this.dispose();
    this.sim = new RaceSim(cfg);
    this.sim.keepHistory = true;
    this.key = key;
    this.clock = 0;
    this.speed = opts.speed;
    this.autoPause = opts.autoPause;
    this.finished = false;
    this.pauseReason = null;
    this.handled = new Set();
    for (const [id, auto] of Object.entries(opts.auto)) this.sim.setAuto(id, auto);
    this.ensureComputed();
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
    if (!this.sim || this.finished) return;
    this.playing = true;
    this.pauseReason = null;
    this.startLoop();
    this.emit();
  }

  pause(reason: string | null = null) {
    if (!this.sim) return;
    this.playing = false;
    this.pauseReason = reason;
    this.stopLoop();
    this.emit();
  }

  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }

  finishNow() {
    if (!this.sim) return;
    this.sim.runToEnd();
    this.clock = this.endTime();
    this.finished = true;
    this.playing = false;
    this.stopLoop();
    this.emit();
  }

  /** Repite la carrera terminada desde unos segundos antes del instante `t`. */
  replay(t: number) {
    if (!this.sim?.done || (!this.finished && !this.replaying)) return;
    this.replaying = true;
    this.finished = false;
    this.clock = Math.max(0, t - 6 * Math.max(1, this.speed));
    this.speed = Math.min(this.speed, 2);
    this.playing = true;
    this.pauseReason = null;
    this.startLoop();
    this.emit();
  }

  /** Termina la repetición y vuelve a los resultados. */
  stopReplay() {
    if (!this.replaying) return;
    this.replaying = false;
    this.finished = true;
    this.playing = false;
    this.clock = this.endTime();
    this.stopLoop();
    this.emit();
  }

  result(): RaceResult | null {
    if (!this.sim || !this.sim.done) return null;
    return scoreResult(this.sim.toResult());
  }

  /** Desgaste final de los juegos de neumáticos que han usado los pilotos del jugador. */
  tyreUsage(): Record<string, { id: string; wear: number }[]> {
    const sim = this.sim;
    if (!sim) return {};
    return Object.fromEntries(sim.cars.filter((c) => c.isPlayer).map((c) => [c.driverId, sim.tyreUsage(c.driverId)]));
  }

  /** Estrategia recomendada para el resto de la carrera. */
  suggest(id: string): Plan | null {
    return this.sim?.suggestFromNow(id) ?? null;
  }

  setStyle(id: string, s: DrivingStyle) {
    if (this.replaying) return;
    this.sim?.setStyle(id, s);
    this.emit();
  }
  setEngine(id: string, e: EngineMode) {
    this.sim?.setEngine(id, e);
    this.emit();
  }
  setErs(id: string, e: ErsMode) {
    this.sim?.setErs(id, e);
    this.emit();
  }
  /**
   * Pide (o cancela) una parada. Si el coche aún no ha pasado la entrada del pit lane, entra en esta
   * misma vuelta; si no, en la siguiente. Como el simulador calcula las vueltas por adelantado, se
   * rebobina a esa vuelta y se recalcula con la nueva orden.
   */
  requestPit(id: string, c: Compound | null) {
    const sim = this.sim;
    if (!sim || this.replaying || sim.done) return;
    const car = sim.cars.find((x) => x.driverId === id);
    if (car?.status === "run") {
      const current = sim.completedAt(car, this.clock).k + 1;
      const target = sim.pitThisLap(id, this.clock) ?? current + 1;
      if (target < sim.totalLaps && sim.lap >= target) this.rewind(target);
    }
    sim.requestPit(id, c);
    this.ensureComputed();
    this.skipPastEvents();
    this.emit();
  }

  /** Vuelve al inicio de la vuelta `lap` conservando las órdenes actuales del jugador. */
  private rewind(lap: number) {
    const sim = this.sim;
    if (!sim) return;
    const mine = sim.cars.filter((c) => c.isPlayer);
    const keep = mine.map((c) => ({ id: c.driverId, style: c.style, engine: c.engine, ers: c.ers, auto: c.auto, pit: c.pitRequest }));
    const orders = [...sim.teamOrders];
    if (!sim.rewindToLap(lap)) return;
    for (const k of keep) {
      sim.setStyle(k.id, k.style);
      sim.setEngine(k.id, k.engine);
      sim.setErs(k.id, k.ers);
      // Activar la IA recalcula la estrategia (consume azar): solo si el modo cambió de verdad.
      if (sim.cars.find((c) => c.driverId === k.id)?.auto !== k.auto) sim.setAuto(k.id, k.auto);
      sim.requestPit(k.id, k.pit);
    }
    sim.teamOrders.clear();
    for (const [team, o] of orders) sim.teamOrders.set(team, o);
    // Los sucesos recalculados vuelven a generarse: se olvidan los índices que ya no existen.
    for (const i of [...this.handled]) if (i >= sim.events.length) this.handled.delete(i);
  }

  /** Marca como vistos los sucesos ya pasados (tras recalcular no deben volver a pausar la carrera). */
  private skipPastEvents() {
    this.sim?.events.forEach((e, i) => {
      if (e.time <= this.clock) this.handled.add(i);
    });
  }
  setAuto(id: string, auto: boolean) {
    this.sim?.setAuto(id, auto);
    this.emit();
  }
  setTeamOrder(order: TeamOrder) {
    const team = this.sim?.cars.find((c) => c.isPlayer)?.teamId;
    if (!this.sim || !team) return;
    this.sim.setTeamOrder(team, order);
    this.emit();
  }

  // ───────────────────────── bucle de animación ─────────────────────────

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
    if (!this.sim || !this.playing) return;
    const dt = Math.min(0.25, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.clock += dt * this.speed;
    this.ensureComputed();
    this.checkEvents();
    if (this.sim.done && this.clock >= this.endTime()) {
      this.clock = this.endTime();
      this.finished = true;
      this.replaying = false;
      this.playing = false;
      this.emit();
      return;
    }
    if (ts - this.lastEmit > 33 || !this.playing) {
      this.lastEmit = ts;
      this.emit();
    }
    if (this.playing) this.raf = requestAnimationFrame(this.frame);
  };

  private ensureComputed() {
    const sim = this.sim;
    if (!sim) return;
    let guard = 0;
    while (!sim.done && guard++ < 200) {
      const running = sim.cars.filter((c) => c.status === "run");
      if (running.length === 0) break;
      const minCum = Math.min(...running.map((c) => c.cum));
      if (sim.lap > 0 && this.clock < minCum - 0.5) break;
      sim.step();
    }
  }

  private endTime() {
    const sim = this.sim;
    if (!sim) return 0;
    let t = 0;
    for (const c of sim.cars) t = Math.max(t, c.finishTime ?? 0, c.dnfTime ?? 0);
    return t + 2;
  }

  private checkEvents() {
    const sim = this.sim;
    if (!sim) return;
    const players = new Set(sim.cars.filter((c) => c.isPlayer).map((c) => c.driverId));
    sim.events.forEach((e, i) => {
      if (this.handled.has(i) || e.time > this.clock) return;
      this.handled.add(i);
      if (!this.autoPause || !this.playing || this.replaying) return;
      const mine = e.drivers.some((d) => players.has(d)) && ["dnf", "incident", "penalty"].includes(e.type);
      const big = IMPORTANT.includes(e.type) && (e.type !== "weather" || e.text.includes("llover") || e.text.includes("mojada"));
      if (mine || big) {
        this.playing = false;
        this.pauseReason = e.text;
        this.stopLoop();
      }
    });
  }

  // ───────────────────────── instantánea para React ─────────────────────────

  private emit() {
    this.snap = this.sim ? this.build(this.sim) : null;
    for (const l of this.listeners) l();
  }

  private build(sim: RaceSim): LiveSnapshot {
    const clock = this.clock;
    const tower = sim.towerAt(clock);
    const lap = sim.leaderLapAt(clock);
    const live = new Map(sim.cars.map((c) => [c.driverId, sim.liveState(c, clock)]));
    const rows: LiveTowerRow[] = tower.map((r, i) => {
      const ls = live.get(r.car.driverId);
      const last = r.completed > 0 ? r.car.laps[r.completed - 1]?.time ?? 0 : 0;
      let best = Infinity;
      for (let k = 0; k < r.completed; k++) {
        const l = r.car.laps[k];
        if (l.pitTime === 0 && l.time < best) best = l.time;
      }
      return {
        id: r.car.driverId,
        code: r.car.code,
        last: r.car.last,
        color: r.car.color,
        number: r.car.number,
        pos: i + 1,
        gap: r.gapLeader,
        interval: r.interval,
        compound: ls?.compound ?? r.car.compound,
        tyreAge: ls?.tyreAge ?? 0,
        wear: ls?.wear ?? 0,
        pits: r.car.laps.slice(0, Math.max(0, r.completed)).filter((l) => l.pitCompound).length,
        inPit: r.inPit,
        out: r.out,
        finished: r.finished,
        isPlayer: r.car.isPlayer,
        delta: r.out ? 0 : r.car.grid - (i + 1),
        penalty: r.car.penalty,
        lastLap: last,
        bestLap: best,
      };
    });
    const posOf = new Map(rows.map((r) => [r.id, r]));
    const dots: LiveDot[] = sim.cars.map((c) => {
      const out = c.status === "dnf" && c.dnfTime !== undefined && clock >= c.dnfTime;
      const ls = live.get(c.driverId);
      const lane = out ? null : sim.laneAt(c, clock);
      return {
        id: c.driverId,
        teamId: c.teamId,
        helmet: helmetOf(sim.cfg.drivers[c.driverId]).base,
        code: c.code,
        last: c.last,
        number: c.number,
        color: c.color,
        accent: c.accent,
        progress: sim.progressAt(c, clock),
        inPit: lane !== null,
        boxed: lane?.boxed ?? false,
        out,
        isPlayer: c.isPlayer,
        pos: posOf.get(c.driverId)?.pos ?? 99,
        compound: ls?.compound ?? c.compound,
        wear: ls?.wear ?? 0,
      };
    });
    const neighbour = (pos: number, gap: string): Neighbour | null => {
      const r = rows[pos - 1];
      if (!r || r.out) return null;
      return { pos: r.pos, number: r.number, code: r.code, color: r.color, gap };
    };
    // Un mensaje de radio se muestra en el panel del piloto durante un tercio de vuelta.
    const lastRadio = (id: string) => {
      let best: RaceEvent | null = null;
      for (const e of sim.events) {
        if (e.type === "radio" && e.drivers[0] === id && e.time <= clock && clock - e.time < sim.base * 0.35 && (!best || e.time > best.time)) best = e;
      }
      return best ? best.text.replace(/^[^:]+:\s*/, "") : null;
    };
    const players: LivePlayer[] = sim.cars
      .filter((c) => c.isPlayer)
      .map((c) => {
        const ls = live.get(c.driverId) ?? sim.liveState(c, clock);
        const row = posOf.get(c.driverId);
        const upcoming = c.visits.find((v) => v.entry > clock);
        const prog = sim.progressAt(c, clock);
        const lapsLeft = Math.max(0, sim.totalLaps - prog);
        const k = Math.max(0, Math.min(c.laps.length - 1, Math.floor(prog) - 1));
        const rec = c.laps[k];
        const prev = k > 0 ? c.laps[k - 1] : undefined;
        const wearRate = rec ? Math.max(0, rec.wear - (prev && !prev.pitCompound ? prev.wear : 0)) / (prev && !prev.pitCompound ? 1 : Math.max(1, ls.tyreAge)) : 0;
        const fuelPerLap = rec && prev ? Math.max(0, prev.fuel - rec.fuel) : 1;
        const behindRow = row ? rows[row.pos] : undefined;
        return {
          id: c.driverId,
          code: c.code,
          name: c.name,
          last: c.last,
          number: c.number,
          color: c.color,
          accent: c.accent,
          pos: row?.pos ?? 0,
          out: row?.out ?? false,
          dnfReason: c.dnfReason,
          finished: row?.finished ?? false,
          style: c.style,
          engine: c.engine,
          ers: c.ers,
          auto: c.auto,
          // Parada pendiente: pedida y aún sin calcular, o ya calculada para una vuelta en la que todavía no ha entrado.
          pitRequest: c.pitRequest ?? (upcoming ? c.laps[upcoming.lap - 1]?.pitCompound ?? null : null),
          pitLap: upcoming && !c.pitRequest ? upcoming.lap : c.laps.length + 1,
          compound: ls.compound,
          wear: ls.wear,
          wearRate,
          temp: ls.temp,
          tyreAge: ls.tyreAge,
          fuelMargin: ls.fuel - lapsLeft,
          fuelPerLap,
          battery: ls.battery,
          // Vueltas completadas en la línea de meta (un coche parado en parrilla tras la meta ya completó la suya).
          currentLap: Math.max(1, Math.min(sim.totalLaps, sim.completedAt(c, clock).k + 1)),
          lapProgress: Math.max(0, prog - Math.floor(prog)),
          lastLap: row?.lastLap ?? 0,
          bestLap: c.bestLap,
          ahead: row && row.pos > 1 ? neighbour(row.pos - 1, row.interval) : null,
          behind: behindRow ? neighbour(behindRow.pos, behindRow.interval) : null,
          pits: row?.pits ?? 0,
          penalty: c.penalty,
          aeroDamage: c.damage,
          floorDamage: c.floorDamage,
          powerLoss: c.powerLoss,
          needsOther: sim.cfg.mustTwo && !c.usedWet && new Set(c.usedDry).size < 2,
          radio: lastRadio(c.driverId),
          spareSets: c.sets ? c.sets.map((s) => ({ compound: s.compound, wear: s.wear })) : null,
        };
      });
    const events = sim.events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.time <= clock)
      .sort((a, b) => b.e.time - a.e.time || b.i - a.i)
      .slice(0, 80)
      .map(({ e }) => e);
    const radar: number[] = [];
    for (let k = 0; k < 10; k++) radar.push(rainAt(sim.cfg.weather, (lap + k - 0.5) / sim.totalLaps));
    const wIdx = Math.max(0, Math.min(sim.wetByLap.length - 1, lap - 1));
    const fastestCar = sim.fastest ? sim.cars.find((c) => c.driverId === sim.fastest?.driverId) : undefined;
    const fastestVisible = sim.fastest && fastestCar && (fastestCar.laps[sim.fastest.lap - 1]?.end ?? Infinity) <= clock;
    return {
      key: this.key,
      name: sim.cfg.name,
      series: sim.series,
      kind: sim.cfg.kind,
      circuitId: sim.circuit.id,
      clock,
      speed: this.speed,
      playing: this.playing,
      finished: this.finished,
      computedAll: sim.done,
      lap,
      totalLaps: sim.totalLaps,
      baseLap: sim.base,
      status: this.finished ? "green" : sim.redFlagAt(clock) ? "red" : sim.statusAt(clock),
      wet: sim.wetByLap[wIdx] ?? sim.wet,
      rain: sim.rainByLap[wIdx] ?? 0,
      trackTemp: Math.round(sim.cfg.weather.trackTemp - (sim.rainByLap[wIdx] ?? 0) * 10),
      airTemp: sim.cfg.weather.airTemp,
      hasErs: sim.hasErs,
      tower: rows,
      dots,
      players,
      events,
      radar,
      fastest:
        fastestVisible && sim.fastest && fastestCar ? { id: fastestCar.driverId, code: fastestCar.code, time: sim.fastest.time, lap: sim.fastest.lap } : null,
      pauseReason: this.pauseReason,
      result: this.finished && sim.done ? scoreResult(sim.toResult()) : null,
      redFlag: (() => {
        const r = sim.redFlagAt(clock);
        return r ? { restartIn: r.restart - clock } : null;
      })(),
      teamOrder: sim.teamOrders.get(sim.cars.find((c) => c.isPlayer)?.teamId ?? "") ?? "free",
      replaying: this.replaying,
      highlights: sim.done && (this.finished || this.replaying) ? this.highlights(sim) : [],
    };
  }

  /** Momentos clave: neutralizaciones, abandonos, luchas por el podio y lo que les pasa a los pilotos del jugador. */
  private highlights(sim: RaceSim): RaceEvent[] {
    const mine = new Set(sim.cars.filter((c) => c.isPlayer).map((c) => c.driverId));
    const podium = new Set(sim.classification().slice(0, 3).map((e) => e.driverId));
    return sim.events.filter((e) => {
      const isMine = e.drivers.some((d) => mine.has(d));
      if (e.type === "radio" || e.type === "info" || e.type === "restart" || e.type === "order") return false;
      if (e.type === "sc" || e.type === "vsc" || e.type === "red" || e.type === "dnf") return true;
      if (e.type === "overtake") return isMine || e.drivers.some((d) => podium.has(d)) && /P[123]\b/.test(e.text);
      if (e.type === "weather") return e.text.includes("llover") || e.text.includes("mojada");
      return isMine && e.type !== "fastest";
    });
  }
}

export const liveRace = new LiveRaceStore();

export function useLiveRace(): LiveSnapshot | null {
  return useSyncExternalStore(liveRace.subscribe, liveRace.getSnapshot, () => null);
}
