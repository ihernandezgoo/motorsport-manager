import { baseLap, formatLap } from "./perf";
import { aiQualiChoice, forcedCompound, mistakeChance, qualiNoise, qualiPct, type QualiCtx, type Risk } from "./qualifying";
import { pitLaneGeometry } from "./race";
import { clamp, mulberry32, range, type StatefulRng } from "./rng";
import { wearRate } from "./strategy";
import { freshestSet, usedSetPenalty } from "./tyreSets";
import { dryCompounds, isWetTyre } from "./tyres";
import type { Compound, QualiEntry, TyreSet } from "./types";
import { rainAt, wetnessAt } from "./weather";

/** Vuelta de salida, de enfriamiento y de entrada, en múltiplos de la vuelta lanzada. */
const OUT_LAP = 1.4;
const COOL_LAP = 1.3;
const IN_LAP = 1.3;
/** Tiempo de pista parada por una bandera roja (segundos de sesión que no corren). */
const RED_PAUSE = 150;

export interface QualiLiveConfig {
  ctx: QualiCtx;
  segIdx: number;
  nSeg: number;
  segName: string;
  participants: string[];
  /** Pilotos que pasan a la siguiente tanda (o todos, en la última). */
  keep: number;
  /** Minuto de la sesión en que empieza la tanda y su duración (min). */
  startMinute: number;
  minutes: number;
  /** Duración total de la sesión (min): marca la evolución de la pista. */
  sessionMinutes: number;
  playerTeamId?: string;
  /** Juegos de neumáticos de los pilotos del jugador. La simulación trabaja sobre esta copia. */
  sets: Record<string, TyreSet[]>;
  seed: number;
  /** Pilotos del jugador gestionados por el ingeniero. */
  auto?: Record<string, boolean>;
}

/** Orden para una tanda: compuesto (y juego concreto), riesgo y número de vueltas lanzadas. */
export interface QualiOrder {
  compound: Compound;
  setId?: string;
  risk: Risk;
  laps: number;
}

export type QPhase = "garage" | "out" | "push" | "cool" | "in";

export interface QCar {
  id: string;
  teamId: string;
  code: string;
  last: string;
  number: number;
  color: string;
  accent: string;
  isPlayer: boolean;
  auto: boolean;
  phase: QPhase;
  phaseStart: number;
  phaseEnd: number;
  /** Instante a partir del cual puede volver a salir del garaje. */
  readyAt: number;
  order: QualiOrder | null;
  /** Orden del jugador pendiente de ejecutar (sale en cuanto pueda). */
  queued: QualiOrder | null;
  pushLeft: number;
  setId: string | null;
  setWear: number;
  setUsed: boolean;
  /** Resultado de la vuelta lanzada en curso, que se conoce al cruzar la meta. */
  pending: { time: number | null; note?: string; crash?: boolean } | null;
  best: number | null;
  bestCompound: Compound | null;
  bestNote?: string;
  lastLap: number | null;
  lastNote?: string;
  /** Vueltas lanzadas completadas. */
  laps: number;
  plan: number[];
  crashed: boolean;
  crashFrac: number;
  boxFrac: number;
  /** Entra a boxes al acabar la vuelta en curso. */
  abort: boolean;
}

export type QEventKind = "top" | "best" | "crash" | "red" | "deleted" | "info" | "flag";

export interface QEvent {
  time: number;
  text: string;
  drivers: string[];
  kind: QEventKind;
}

export class QualiSim {
  readonly cfg: QualiLiveConfig;
  readonly base: number;
  readonly duration: number;
  readonly cars: QCar[];
  readonly events: QEvent[] = [];
  readonly sets: Record<string, TyreSet[]>;
  clock = 0;
  sessionEnd: number;
  redUntil = 0;
  finished = false;
  private rng: StatefulRng;
  /** F2 y F3 encadenan vueltas lanzadas; en F1 se intercala una de enfriamiento. */
  private readonly consecutive: boolean;
  private chequeredLogged = false;

  constructor(cfg: QualiLiveConfig) {
    this.cfg = cfg;
    this.base = baseLap(cfg.ctx.series, cfg.ctx.circuit);
    this.duration = cfg.minutes * 60;
    this.sessionEnd = this.duration;
    this.rng = mulberry32(cfg.seed);
    this.consecutive = cfg.ctx.series !== "f1";
    this.sets = structuredClone(cfg.sets);
    const geo = pitLaneGeometry({ circuit: cfg.ctx.circuit, teams: cfg.ctx.teams, series: cfg.ctx.series });
    this.cars = cfg.participants.map((id) => {
      const d = cfg.ctx.drivers[id];
      const t = cfg.ctx.teams[d.teamId];
      const isPlayer = t.id === cfg.playerTeamId;
      const auto = !isPlayer || !!cfg.auto?.[id];
      const car: QCar = {
        id,
        teamId: t.id,
        code: d.code,
        last: d.last,
        number: d.number,
        color: t.color,
        accent: t.accent,
        isPlayer,
        auto,
        phase: "garage",
        phaseStart: 0,
        phaseEnd: 0,
        readyAt: 0,
        order: null,
        queued: null,
        pushLeft: 0,
        setId: null,
        setWear: 0,
        setUsed: false,
        pending: null,
        best: null,
        bestCompound: null,
        lastLap: null,
        laps: 0,
        plan: [],
        crashed: false,
        crashFrac: 0,
        boxFrac: geo.box.get(t.id) ?? 0,
        abort: false,
      };
      if (auto) car.plan = this.planRuns();
      return car;
    });
  }

  // ───────────────────────────── utilidades ─────────────────────────────

  /** Vueltas lanzadas por tanda que haría un piloto normal. */
  defaultLaps(): number {
    return this.consecutive ? 3 : 1;
  }

  private minuteAt(t: number) {
    return this.cfg.startMinute + t / 60;
  }

  /** Humedad de la pista en el instante `t` de la tanda. */
  wetAt(t: number): number {
    const plan = this.cfg.ctx.weather;
    return wetnessAt(plan, clamp(this.minuteAt(t) / plan.minutes, 0, 1));
  }

  rainNow(): number {
    const plan = this.cfg.ctx.weather;
    return rainAt(plan, clamp(this.minuteAt(this.clock) / plan.minutes, 0, 1));
  }

  /** Tiempo que queda (el reloj se para durante una bandera roja). */
  remaining(): number {
    if (this.clock < this.redUntil) return Math.max(0, this.sessionEnd - this.redUntil);
    return Math.max(0, this.sessionEnd - this.clock);
  }

  redActive(t = this.clock): boolean {
    return t < this.redUntil;
  }

  chequered(t = this.clock): boolean {
    return t >= this.sessionEnd;
  }

  private log(time: number, kind: QEventKind, text: string, drivers: string[] = []) {
    this.events.push({ time, kind, text, drivers });
  }

  private car(id: string): QCar {
    const c = this.cars.find((x) => x.id === id);
    if (!c) throw new Error(`Piloto desconocido ${id}`);
    return c;
  }

  /** Clasificación provisional: mejores tiempos, y sin tiempo al final en el orden de salida. */
  order(): QCar[] {
    const idx = new Map(this.cars.map((c, i) => [c, i]));
    return [...this.cars].sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity) || (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
  }

  private planRuns(): number[] {
    const D = this.duration;
    const b = this.base;
    const n = this.defaultLaps();
    const between = this.consecutive ? b : b * (1 + COOL_LAP);
    const late = D - b * OUT_LAP - (n - 1) * between - range(this.rng, 12, 70);
    const runTotal = b * OUT_LAP + n * b + (n - 1) * (between - b) + b * IN_LAP + 100;
    const early = Math.min(range(this.rng, 0.03, 0.3) * D, late - runTotal);
    return early > 0 ? [early, late] : [Math.max(0, late)];
  }

  // ───────────────────────────── órdenes del jugador ─────────────────────────────

  /** Manda salir a pista a un piloto del jugador. Devuelve un error o null. */
  sendOut(id: string, order: QualiOrder): string | null {
    const car = this.car(id);
    if (car.crashed) return "El coche está dañado: no puede volver a salir";
    if (this.chequered()) return "Ya ha caído la bandera a cuadros";
    if (car.phase !== "garage") return "Ya está en pista";
    if (this.setFor(car, order.compound, order.setId) === undefined) return "No te quedan juegos de ese compuesto";
    car.queued = { ...order, laps: clamp(Math.round(order.laps), 1, 4) };
    return null;
  }

  /** Cancela la salida pendiente o hace entrar al piloto al acabar la vuelta en curso. */
  boxNow(id: string) {
    const car = this.car(id);
    if (car.phase === "garage") car.queued = null;
    else car.abort = true;
  }

  setAuto(id: string, auto: boolean) {
    const car = this.car(id);
    car.auto = auto;
    car.queued = null;
    car.plan = auto ? this.planRuns().filter((t) => t >= this.clock) : [];
    if (auto && car.plan.length === 0 && !this.chequered()) car.plan = [this.clock];
  }

  // ───────────────────────────── simulación ─────────────────────────────

  /** Avanza `dt` segundos de sesión. */
  advance(dt: number) {
    const target = this.clock + dt;
    let guard = 0;
    while (this.clock < target && !this.finished && guard++ < 100000) {
      this.clock = Math.min(target, this.clock + 1);
      this.update();
    }
  }

  /** Simula hasta el final de la tanda. */
  runToEnd() {
    let guard = 0;
    while (!this.finished && guard++ < 20000) this.advance(10);
  }

  private update() {
    const t = this.clock;
    for (const car of this.cars) {
      let g = 0;
      while (car.phase !== "garage" && t >= car.phaseEnd && g++ < 10) this.endPhase(car);
    }
    if (this.chequered(t) && !this.chequeredLogged) {
      this.chequeredLogged = true;
      this.log(this.sessionEnd, "flag", "🏁 Bandera a cuadros: solo cuentan las vueltas ya iniciadas");
    }
    if (!this.chequered(t) && !this.redActive(t)) {
      for (const car of this.cars) {
        if (car.phase !== "garage" || car.crashed || t < car.readyAt) continue;
        if (car.queued) {
          const o = car.queued;
          car.queued = null;
          this.depart(car, o, t);
        } else if (car.auto && car.plan.length > 0 && t >= car.plan[0]) {
          car.plan.shift();
          this.depart(car, this.aiOrder(car, t), t);
        }
      }
    }
    if (this.chequered(t) && this.cars.every((c) => c.phase === "garage")) this.finished = true;
  }

  /** Juego de neumáticos para una salida: undefined si el jugador no tiene ninguno de ese compuesto. */
  private setFor(car: QCar, c: Compound, setId?: string): TyreSet | null | undefined {
    const sets = this.sets[car.id];
    if (!car.isPlayer || !sets) return null;
    if (setId) {
      const s = sets.find((x) => x.id === setId && x.compound === c);
      if (s) return s;
    }
    return freshestSet(sets, c) ?? undefined;
  }

  private aiOrder(car: QCar, t: number): QualiOrder {
    const { ctx } = this.cfg;
    let { compound, risk } = aiQualiChoice(ctx.series, ctx.circuit, this.wetAt(t), ctx.sprint, this.cfg.segIdx);
    if (car.isPlayer && this.setFor(car, compound) === undefined) {
      const alt = [...dryCompounds(ctx.series, ctx.circuit), "I", "W"].find((c) => this.setFor(car, c as Compound) !== undefined);
      if (alt) compound = alt as Compound;
    }
    return { compound, risk, laps: this.defaultLaps() };
  }

  private depart(car: QCar, order: QualiOrder, t: number) {
    const { ctx } = this.cfg;
    const forced = forcedCompound(ctx.series, ctx.sprint, this.cfg.segIdx, this.wetAt(t));
    const compound = forced && !isWetTyre(order.compound) ? forced : order.compound;
    const set = this.setFor(car, compound, order.setId);
    if (set === undefined) return;
    car.order = { ...order, compound };
    car.setId = set?.id ?? null;
    car.setWear = set?.wear ?? 0;
    car.setUsed = set?.used ?? false;
    car.pushLeft = order.laps;
    car.abort = false;
    this.wearSet(car, 0.4);
    this.setPhase(car, "out", t, this.base * OUT_LAP * (1 + this.wetAt(t) * 0.08) * (1 + this.rng() * 0.04));
  }

  private setPhase(car: QCar, phase: QPhase, start: number, dur: number) {
    car.phase = phase;
    car.phaseStart = start;
    car.phaseEnd = start + Math.max(1, dur);
  }

  /** Desgasta el juego montado (solo se sigue en los coches del jugador). */
  private wearSet(car: QCar, lapsEq: number) {
    const { ctx } = this.cfg;
    const compound = car.order?.compound;
    if (!compound) return;
    const rate = wearRate(ctx.series, ctx.circuit, compound, ctx.drivers[car.id].tyre) * (car.order?.risk === 2 ? 1.15 : 1);
    car.setWear = Math.min(100, car.setWear + lapsEq * rate);
    const s = car.setId ? this.sets[car.id]?.find((x) => x.id === car.setId) : undefined;
    if (s) {
      s.wear = car.setWear;
      s.used = true;
    }
  }

  private canPushAgain(car: QCar, t: number) {
    return car.pushLeft > 0 && !car.abort && !this.chequered(t) && !this.redActive(t);
  }

  private endPhase(car: QCar) {
    const t = car.phaseEnd;
    switch (car.phase) {
      case "out":
        if (this.chequered(t) || this.redActive(t) || car.abort) this.setPhase(car, "in", t, this.base * IN_LAP);
        else this.startPush(car, t);
        return;
      case "push": {
        this.revealLap(car, t);
        if (car.crashed) return;
        this.wearSet(car, 1);
        if (this.canPushAgain(car, t)) {
          if (this.consecutive) this.startPush(car, t);
          else {
            this.wearSet(car, 0.4);
            this.setPhase(car, "cool", t, this.base * COOL_LAP);
          }
        } else {
          this.wearSet(car, 0.4);
          this.setPhase(car, "in", t, this.base * IN_LAP);
        }
        return;
      }
      case "cool":
        if (this.canPushAgain(car, t)) this.startPush(car, t);
        else this.setPhase(car, "in", t, this.base * 0.6);
        return;
      case "in":
        car.phase = "garage";
        car.phaseStart = t;
        car.readyAt = t + range(this.rng, 55, 105);
        car.order = null;
        car.setId = null;
        return;
    }
  }

  private startPush(car: QCar, t: number) {
    const { ctx } = this.cfg;
    const order = car.order;
    if (!order) return;
    const wet = this.wetAt(t + this.base * 0.5);
    const choice = { compound: order.compound, risk: order.risk };
    let pct = qualiPct(ctx, car.id, choice, wet);
    pct -= 0.5 * clamp(this.minuteAt(t) / this.cfg.sessionMinutes, 0, 1);
    pct += usedSetPenalty({ wear: car.setWear, used: car.setUsed || car.laps > 0 });
    pct += qualiNoise(ctx, car.id, this.rng);
    let note: string | undefined;

    // Tráfico: coches lentos en pista (vueltas de salida, de enfriamiento o de entrada).
    const slow = this.cars.filter((c) => c !== car && (c.phase === "out" || c.phase === "cool" || c.phase === "in")).length;
    if (this.rng() < clamp(0.012 * slow, 0, 0.35)) {
      pct += range(this.rng, 0.15, 0.7);
      note = "Tráfico en la vuelta lanzada";
    }

    car.pending = null;
    if (this.rng() < mistakeChance(choice, wet)) {
      const r = this.rng();
      if (r < 0.12 * (1 + wet)) {
        const frac = range(this.rng, 0.25, 0.9);
        car.pending = { time: null, note: "Accidente", crash: true };
        car.crashFrac = frac;
        this.setPhase(car, "push", t, this.base * frac);
        return;
      }
      if (r < 0.55) car.pending = { time: null, note: "Vuelta anulada por límites de pista" };
      else {
        pct += range(this.rng, 0.6, 3);
        note = "Error en la vuelta lanzada";
      }
    }
    const time = this.base * (1 + pct / 100);
    car.pending ??= { time, note };
    this.setPhase(car, "push", t, time);
  }

  private revealLap(car: QCar, t: number) {
    const p = car.pending;
    car.pending = null;
    car.pushLeft--;
    if (!p) return;
    if (p.crash) {
      car.crashed = true;
      car.plan = [];
      car.queued = null;
      car.phase = "garage";
      car.lastNote = "Accidente";
      this.log(t, "crash", `💥 ¡Accidente de ${car.code}! Su sesión ha terminado`, [car.id]);
      this.redFlag(t);
      return;
    }
    car.laps++;
    car.lastLap = p.time;
    car.lastNote = p.note;
    if (p.time === null) {
      this.log(t, "deleted", `${car.code}: ${p.note ?? "vuelta anulada"}`, [car.id]);
      return;
    }
    const prevTop = this.cars.reduce((m, c) => (c !== car && c.best !== null && c.best < m ? c.best : m), Infinity);
    if (car.best === null || p.time < car.best) {
      car.best = p.time;
      car.bestCompound = car.order?.compound ?? null;
      car.bestNote = p.note;
      const pos = this.order().indexOf(car) + 1;
      if (p.time < prevTop) this.log(t, "top", `⏱️ ${car.code} se pone primero: ${formatLap(p.time)}`, [car.id]);
      else if (car.isPlayer) this.log(t, "best", `${car.code} mejora: ${formatLap(p.time)} (P${pos})${p.note ? ` · ${p.note.toLowerCase()}` : ""}`, [car.id]);
    } else if (car.isPlayer) {
      this.log(t, "info", `${car.code} no mejora: ${formatLap(p.time)}${p.note ? ` · ${p.note.toLowerCase()}` : ""}`, [car.id]);
    }
  }

  /** Bandera roja: todos a boxes, las vueltas en curso se pierden y el reloj se detiene. */
  private redFlag(t: number) {
    if (this.chequered(t)) return;
    this.redUntil = t + RED_PAUSE;
    this.sessionEnd += RED_PAUSE;
    this.log(t + 1, "red", "🟥 Bandera roja: sesión detenida, todos a boxes");
    for (const c of this.cars) {
      if (c.crashed || c.phase === "garage") continue;
      if (c.phase === "push" && c.pending) this.log(t + 2, "deleted", `${c.code} pierde su vuelta por la bandera roja`, [c.id]);
      c.pending = null;
      c.pushLeft = 0;
      this.setPhase(c, "in", t, this.base * 0.6);
    }
    for (const c of this.cars) if (c.auto && !c.crashed && c.plan.length === 0) c.plan = [this.redUntil + range(this.rng, 5, 60)];
    this.log(this.redUntil, "info", "🟢 Se reanuda la sesión: semáforo verde al final del pit lane");
  }

  // ───────────────────────────── visualización y resultado ─────────────────────────────

  /** Fracción de vuelta en el instante actual y si está en el pit lane. */
  position(car: QCar): { progress: number; inPit: boolean; boxed: boolean } {
    if (car.crashed) return { progress: car.crashFrac, inPit: false, boxed: false };
    if (car.phase === "garage") return { progress: car.boxFrac, inPit: true, boxed: true };
    const f = clamp((this.clock - car.phaseStart) / Math.max(1, car.phaseEnd - car.phaseStart), 0, 1);
    if (car.phase === "out") return { progress: car.boxFrac + (1 - car.boxFrac) * f, inPit: f < 0.08, boxed: false };
    if (car.phase === "in") return { progress: f * (1 + car.boxFrac), inPit: f > 0.92, boxed: false };
    return { progress: f, inPit: false, boxed: false };
  }

  results(): QualiEntry[] {
    const { ctx, segIdx } = this.cfg;
    const fallback = dryCompounds(ctx.series, ctx.circuit)[0];
    return this.order().map((c) => ({
      driverId: c.id,
      teamId: c.teamId,
      time: c.best,
      segment: segIdx,
      compound: c.bestCompound ?? fallback,
      note: c.best === null ? (c.crashed ? "Accidente" : c.laps > 0 ? "Sin tiempo válido" : "Sin tiempo") : c.bestNote,
    }));
  }
}
