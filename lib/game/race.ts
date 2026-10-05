import { basePct, baseLap, reliabilityRating, SERIES_CFG } from "./perf";
import { clamp, gauss, hashString, mulberry32, pick, range, type StatefulRng } from "./rng";
import { planStrategy, wearRate, type PlannedStop } from "./strategy";
import { dryCompounds, isWetTyre, spec, TEMP_WINDOW, tempPenalty, tempWearFactor, wearPenalty, wetPenalty } from "./tyres";
import type {
  Circuit,
  ClassEntry,
  Compound,
  Driver,
  DrivingStyle,
  EngineMode,
  ErsMode,
  PowerUnit,
  RaceKind,
  RaceResult,
  SeriesId,
  StrategyPlan,
  Team,
  TyreSet,
  WeatherPlan,
} from "./types";
import { earlyRaceWetness, evolveWetness, rainAt, summarizeWeather } from "./weather";

export const STYLE_LABELS = ["Relajar", "Conservar", "Neutral", "Empujar", "Atacar"] as const;
export const ENGINE_LABELS = ["Ahorro", "Medio", "Alto", "Adelantar"] as const;
export const ERS_LABELS = ["Recargar", "Equilibrado", "Desplegar"] as const;

const STYLE_PACE = [0.9, 0.4, 0, -0.3, -0.55];
const STYLE_WEAR = [0.62, 0.8, 1, 1.22, 1.5];
const STYLE_ERR = [0.5, 0.7, 1, 1.4, 2.1];
const ENGINE_PACE = [0.35, 0, -0.2, -0.42];
const ENGINE_FUEL = [0.88, 1, 1.06, 1.15];
const ENGINE_REL = [0.6, 1, 1.4, 2.2];
const ERS_PACE = [0.3, 0, -0.35];
const ERS_CHARGE = [14, 3, -16];
const FUEL_MARGIN = 0.6;

const MECH_FAILURES = ["Fallo de motor", "Fallo hidráulico", "Caja de cambios", "Fallo eléctrico", "Problema de frenos", "Pérdida de presión de aceite"];
/** Separación (s) entre coches en una salida parada. */
const GRID_GAP = 0.22;
/** Duración de la suspensión por bandera roja (tiempo de carrera, s). */
const RED_FLAG_PAUSE = 75;

export type LapStatus = "green" | "sc" | "vsc" | "red";
export type TeamOrder = "free" | "hold" | "swap";

export interface LapRecord {
  lap: number;
  /** Instante en que el coche empieza la vuelta (tras una bandera roja, la reanudación). */
  start: number;
  time: number;
  end: number;
  compound: Compound;
  wear: number;
  temp: number;
  fuel: number;
  battery: number;
  pos: number;
  /** Tiempo perdido en el carril de boxes durante esta vuelta (entrada o salida). */
  pitTime: number;
  pitCompound?: Compound;
  /** Desgaste del juego montado en esa parada (0 si es nuevo). */
  pitWear?: number;
  /** Fracción de vuelta por detrás de la meta donde el coche queda parado al acabar la vuelta (parrilla tras bandera roja). */
  parkOff?: number;
}

/**
 * Paso por el carril de boxes. La meta está dentro del carril: la vuelta `lap` termina al cruzarla
 * y la siguiente empieza dentro del pit lane. Las posiciones son fracciones de vuelta respecto a la meta.
 */
export interface PitVisit {
  lap: number;
  entry: number;
  line: number;
  exit?: number;
  inFrac: number;
  outFrac: number;
  box: number;
  stationary: number;
  /** Tiempo de la parada que se pierde después de la meta (en la vuelta de salida). */
  tout: number;
  stopStart: number;
  stopEnd: number;
}

export interface CarState {
  driverId: string;
  teamId: string;
  code: string;
  name: string;
  last: string;
  number: number;
  color: string;
  accent: string;
  grid: number;
  isPlayer: boolean;
  auto: boolean;
  status: "run" | "dnf";
  dnfReason?: string;
  dnfLap?: number;
  dnfTime?: number;
  dnfProgress?: number;
  cum: number;
  laps: LapRecord[];
  compound: Compound;
  tyreAge: number;
  wear: number;
  temp: number;
  usedDry: Compound[];
  usedWet: boolean;
  fuel: number;
  battery: number;
  style: DrivingStyle;
  engine: EngineMode;
  ers: ErsMode;
  pitRequest: Compound | null;
  pits: number;
  penalty: number;
  /** Daño en el alerón delantero (% de ritmo). Se repara en boxes. */
  damage: number;
  /** Daño en el fondo plano (% de ritmo). No se puede reparar durante la carrera. */
  floorDamage: number;
  powerLoss: number;
  visits: PitVisit[];
  /** Tiempo de boxes pendiente de la vuelta de salida. */
  pitCarry: number;
  /** Vuelta a partir de la cual cada tipo de mensaje de radio se puede repetir. */
  radioCooldown: Record<string, number>;
  bestLap: number;
  bestLapNo: number;
  plan: PlannedStop[];
  wetThreshold: number;
  dryThreshold: number;
  startOffset: number;
  setupQ: number;
  liftCoast: boolean;
  flagLap?: number;
  finishTime?: number;
  /** Juegos de repuesto (solo coches del jugador; los rivales tienen neumáticos ilimitados). */
  sets?: TyreSet[];
  /** Juego montado y desgaste final de los ya usados en esta carrera. */
  setId?: string;
  setLog: { id: string; wear: number }[];
  /** Multiplicador de desgaste por lo aprendido en las tandas largas. */
  wearMult: number;
  /** Planes de estrategia del jugador, el activo y sus paradas pendientes. */
  stratPlans?: StrategyPlan[];
  stratActive?: number;
  strategy?: PlannedStop[];
}

export type RaceEventType =
  | "overtake"
  | "pit"
  | "dnf"
  | "sc"
  | "vsc"
  | "red"
  | "restart"
  | "weather"
  | "incident"
  | "penalty"
  | "fastest"
  | "info"
  | "radio"
  | "order";

export interface RaceEvent {
  time: number;
  lap: number;
  type: RaceEventType;
  text: string;
  drivers: string[];
}

export interface RaceConfig {
  series: SeriesId;
  circuit: Circuit;
  laps: number;
  kind: RaceKind;
  name: string;
  grid: string[];
  drivers: Record<string, Driver>;
  teams: Record<string, Team>;
  pus: Record<string, PowerUnit>;
  weather: WeatherPlan;
  setupQ: Record<string, number>;
  playerTeamId?: string;
  startCompounds?: Record<string, Compound>;
  /** Juego de salida de cada piloto del jugador (fija el compuesto y el desgaste inicial). */
  startSets?: Record<string, TyreSet>;
  /** Juegos de repuesto de los pilotos del jugador. */
  spareSets?: Record<string, TyreSet[]>;
  /** Multiplicador de desgaste de neumáticos por piloto. */
  wearMult?: Record<string, number>;
  /** Multiplicador de la probabilidad de avería por piloto (componentes gastados). */
  relMult?: Record<string, number>;
  /** Planes de estrategia de los pilotos del jugador. */
  strategies?: Record<string, { plans: StrategyPlan[]; active: number }>;
  mustTwo: boolean;
  seed: number;
  weekendId: string;
  round: number;
  poleId?: string;
}

export interface TowerRow {
  car: CarState;
  completed: number;
  lastT: number;
  inPit: boolean;
  finished: boolean;
  out: boolean;
  gapLeader: string;
  interval: string;
}

/** Estado mutable de la simulación al empezar una vuelta. */
interface SimSnapshot {
  scalars: {
    lap: number;
    done: boolean;
    wet: number;
    rain: number;
    trackTemp: number;
    scLaps: number;
    winnerTime: number | null;
    maxRain: number;
    maxWet: number;
    redLap: number;
    restartLap: number;
  };
  sc: RaceSim["sc"];
  fastest: RaceSim["fastest"];
  pendingSc: { kind: "sc" | "vsc" | "red"; time: number } | null;
  lens: { wet: number; rain: number; status: number; events: number; redFlags: number };
  teamOrders: [string, TeamOrder][];
  orderRefusals: [string, number][];
  trackLimits: [string, number][];
  rng: number;
  radioRng: number;
  /** Estado de cada coche; de su lista de vueltas solo se guarda la longitud (las vueltas ya cerradas no cambian). */
  cars: (Omit<CarState, "laps"> & { lapsLen: number })[];
}

/** Interpolación lineal por tramos de `points` ([tiempo, valor], ordenados por tiempo) en el instante `t`. */
function interpolate(points: [number, number][], t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    if (t <= t1) return t1 > t0 ? v0 + ((t - t0) / (t1 - t0)) * (v1 - v0) : v1;
  }
  return points[points.length - 1][1];
}

/**
 * Carril de boxes en fracciones de vuelta respecto a la meta, con la misma geometría que
 * `trackScene` (lib/game/geo.ts): el carril va de -(pitHalf + 60) m a +(pitHalf + 60) m y cada
 * equipo tiene dos garajes consecutivos, en el orden en que aparecen sus equipos.
 */
export function pitLaneGeometry(cfg: Pick<RaceConfig, "circuit" | "teams" | "series">) {
  const total = cfg.circuit.lengthKm * 1000;
  const pitHalf = Math.min(320, total * 0.07);
  const lane = (pitHalf + 60) / total;
  const box = new Map<string, number>();
  Object.values(cfg.teams)
    .filter((t) => t.series === cfg.series)
    .forEach((t, k) => {
      const s = Math.min(pitHalf - 20, -pitHalf + 20 + 15 * (2 * k + 0.5));
      box.set(t.id, s / total);
    });
  return { inFrac: lane, outFrac: lane, box };
}

export class RaceSim {
  readonly cfg: RaceConfig;
  readonly series: SeriesId;
  readonly circuit: Circuit;
  readonly totalLaps: number;
  readonly base: number;
  readonly dry: Compound[];
  readonly cars: CarState[];
  readonly events: RaceEvent[] = [];
  readonly hasErs: boolean;
  readonly startUnderSc: boolean;
  /** Humedad prevista en las primeras vueltas: decide el neumático de salida de la IA. */
  readonly startWet: number;
  lap = 0;
  done = false;
  wet: number;
  rain = 0;
  trackTemp: number;
  wetByLap: number[] = [];
  rainByLap: number[] = [];
  statusByLap: LapStatus[] = [];
  sc: { kind: "none" | "sc" | "vsc"; lapsLeft: number } = { kind: "none", lapsLeft: 0 };
  scLaps = 0;
  fastest: { driverId: string; time: number; lap: number } | null = null;
  winnerTime: number | null = null;
  /** Suspensiones por bandera roja: vuelta lenta, primera llegada a parrilla y reanudación. */
  redFlags: { lap: number; from: number; restart: number }[] = [];
  readonly teamOrders = new Map<string, TeamOrder>();
  private rng: StatefulRng;
  /** Generador aparte para la radio: los mensajes no alteran el resto de la simulación. */
  private radioRng: StatefulRng;
  /** Estado al empezar cada vuelta (índice = vueltas ya calculadas), para poder rebobinar. */
  private history: SimSnapshot[] = [];
  /** Guarda instantáneas al empezar cada vuelta. Solo hace falta en la carrera en directo. */
  keepHistory = false;
  private startFuel: number;
  private pendingSc: { kind: "sc" | "vsc" | "red"; time: number } | null = null;
  private redLap = 0;
  private restartLap = 0;
  private orderRefusals = new Map<string, number>();
  private trackLimits = new Map<string, number>();
  private maxRain = 0;
  private maxWet = 0;
  /** Geometría del pit lane en fracciones de vuelta (mismo modelo que el escenario dibujado). */
  private pitLane: { inFrac: number; outFrac: number; box: Map<string, number> };

  constructor(cfg: RaceConfig) {
    this.cfg = cfg;
    this.series = cfg.series;
    this.circuit = cfg.circuit;
    this.totalLaps = cfg.laps;
    this.base = baseLap(cfg.series, cfg.circuit);
    this.dry = dryCompounds(cfg.series, cfg.circuit);
    this.hasErs = SERIES_CFG[cfg.series].hasErs;
    this.rng = mulberry32(cfg.seed);
    this.radioRng = mulberry32(cfg.seed ^ 0x5bd1e995);
    this.pitLane = pitLaneGeometry(cfg);
    this.wet = cfg.weather.initialWetness;
    this.trackTemp = cfg.weather.trackTemp;
    this.startFuel = cfg.laps + FUEL_MARGIN;
    this.startUnderSc = this.wet > 0.75;
    this.startWet = earlyRaceWetness(cfg.weather, this.base, cfg.laps);
    if (this.startUnderSc) {
      this.sc = { kind: "sc", lapsLeft: 2 + Math.floor(this.rng() * 2) };
      this.log(0, 0, "sc", "Salida lanzada tras el coche de seguridad por la lluvia", []);
    }
    this.cars = cfg.grid.map((id, idx) => this.makeCar(id, idx));
    for (const c of this.cars) {
      const st = c.isPlayer ? cfg.strategies?.[c.driverId] : undefined;
      if (st) this.setPlans(c.driverId, st.plans, st.active, 1);
    }
  }

  /**
   * Planes de estrategia de un piloto del jugador. Las paradas del plan activo a partir de la vuelta
   * `fromLap` (incluida) quedan pendientes y se ejecutan solas mientras el coche no esté en manos de la IA.
   */
  setPlans(id: string, plans: StrategyPlan[], active: number, fromLap: number) {
    const car = this.car(id);
    car.stratPlans = structuredClone(plans);
    car.stratActive = Math.max(0, Math.min(plans.length - 1, active));
    car.strategy = (plans[car.stratActive]?.stops ?? []).filter((s) => s.lap >= fromLap).map((s) => ({ ...s }));
  }

  /** Pide la siguiente parada del plan cuando llega su vuelta (nunca slicks con la pista mojada). */
  private followStrategy(car: CarState, L: number) {
    const next = car.strategy?.[0];
    if (!next || car.pitRequest || L >= this.totalLaps || L < next.lap) return;
    if (!isWetTyre(next.compound) && this.wet > 0.18) return;
    car.pitRequest = next.compound;
  }

  // ───────────────────────────── preparación ─────────────────────────────

  private makeCar(id: string, idx: number): CarState {
    const d = this.cfg.drivers[id];
    const team = this.cfg.teams[d.teamId];
    const isPlayer = this.cfg.playerTeamId === team.id;
    const startSet = isPlayer ? this.cfg.startSets?.[id] : undefined;
    const chosen = startSet?.compound ?? this.cfg.startCompounds?.[id];
    let compound: Compound;
    let plan: PlannedStop[] = [];
    if (chosen) {
      compound = chosen;
      if (!isWetTyre(chosen)) plan = this.planFrom(d, 0, chosen, this.cfg.mustTwo, 0).stops;
    } else if (this.startWet >= 0.85) {
      compound = "W";
    } else if (this.startWet >= 0.2) {
      compound = "I";
    } else {
      const p = this.planFrom(d, 0, undefined, this.cfg.mustTwo, 0);
      compound = p.start;
      plan = p.stops;
    }
    const cfgS = SERIES_CFG[this.series];
    const spares = isPlayer ? this.cfg.spareSets?.[id] : undefined;
    return {
      driverId: id,
      teamId: team.id,
      code: d.code,
      name: `${d.first} ${d.last}`,
      last: d.last,
      number: d.number,
      color: team.color,
      accent: team.accent,
      grid: idx + 1,
      isPlayer,
      auto: !isPlayer,
      status: "run",
      cum: 0,
      laps: [],
      compound,
      tyreAge: 0,
      wear: startSet?.wear ?? 0,
      temp: cfgS.blanketTemp,
      usedDry: isWetTyre(compound) ? [] : [compound],
      usedWet: isWetTyre(compound),
      fuel: this.startFuel,
      battery: this.hasErs ? 60 : 0,
      style: 2,
      engine: 1,
      ers: 1,
      pitRequest: null,
      pits: 0,
      penalty: 0,
      damage: 0,
      floorDamage: 0,
      powerLoss: 0,
      visits: [],
      pitCarry: 0,
      radioCooldown: {},
      bestLap: Infinity,
      bestLapNo: 0,
      plan,
      wetThreshold: range(this.rng, 0.16, 0.3),
      dryThreshold: range(this.rng, 0.07, 0.16),
      startOffset: idx * 0.22,
      setupQ: this.cfg.setupQ[id] ?? 0.8,
      liftCoast: false,
      sets: spares ? structuredClone(spares) : undefined,
      setId: startSet?.id,
      setLog: [],
      wearMult: this.cfg.wearMult?.[id] ?? 1,
    };
  }

  /**
   * Monta el juego menos gastado que quede de `c`; si no queda ninguno, el menos gastado del mismo
   * tipo (seco o lluvia) y, en último caso, uno ya usado en esta carrera. Devuelve compuesto y desgaste.
   */
  private takeSet(car: CarState, c: Compound): { compound: Compound; wear: number } {
    if (!car.sets) return { compound: c, wear: 0 };
    if (car.setId) car.setLog.push({ id: car.setId, wear: car.wear });
    const pickFrom = (pred: (s: TyreSet) => boolean) => car.sets?.filter(pred).sort((a, b) => a.wear - b.wear)[0];
    const set = pickFrom((s) => s.compound === c) ?? pickFrom((s) => isWetTyre(s.compound) === isWetTyre(c));
    if (!set) {
      const old = [...car.setLog].sort((a, b) => a.wear - b.wear)[0];
      car.setId = old?.id;
      return { compound: c, wear: Math.max(old?.wear ?? 60, 30) };
    }
    car.sets = car.sets.filter((s) => s.id !== set.id);
    car.setId = set.id;
    return { compound: set.compound, wear: set.wear };
  }

  /** Compuestos de seco que todavía puede montar un coche (todos si no lleva la cuenta de juegos). */
  private availableDry(car: CarState): Compound[] {
    if (!car.sets) return this.dry;
    const have = this.dry.filter((c) => car.sets?.some((s) => s.compound === c));
    return have.length ? have : this.dry;
  }

  /** Desgaste final de cada juego usado por un piloto en esta carrera. */
  tyreUsage(driverId: string): { id: string; wear: number }[] {
    const car = this.car(driverId);
    const out = [...car.setLog];
    if (car.setId) out.push({ id: car.setId, wear: car.wear });
    return out;
  }

  private planFrom(d: Driver, offset: number, fixedStart: Compound | undefined, mustTwo: boolean, startWear: number, noisy = true) {
    const plan = planStrategy(
      {
        series: this.series,
        circuit: this.circuit,
        base: this.base,
        laps: this.totalLaps - offset,
        dry: this.dry,
        mustTwo,
        tyreSkill: d.tyre,
        pitLoss: this.circuit.pitLoss,
        startWear,
      },
      noisy ? this.rng : undefined,
      fixedStart,
      noisy ? 2.5 : 0,
    );
    return { ...plan, stops: plan.stops.map((s) => ({ lap: s.lap + offset, compound: s.compound })) };
  }

  /** Estrategia recomendada para un piloto desde la salida. */
  suggestPlan(driverId: string, start?: Compound) {
    const d = this.cfg.drivers[driverId];
    return this.planFrom(d, 0, start, this.cfg.mustTwo, 0, false);
  }

  /** Estrategia recomendada desde la vuelta actual, con el neumático que lleva montado. */
  suggestFromNow(driverId: string) {
    const car = this.car(driverId);
    if (car.status !== "run" || isWetTyre(car.compound) || this.lap >= this.totalLaps - 1) return null;
    const d = this.cfg.drivers[driverId];
    return this.planFrom(d, this.lap, car.compound, this.needsOtherCompound(car), car.wear, false);
  }

  // ───────────────────────────── órdenes del muro ─────────────────────────────

  private car(id: string) {
    const c = this.cars.find((x) => x.driverId === id);
    if (!c) throw new Error(`Coche desconocido ${id}`);
    return c;
  }
  setStyle(id: string, s: DrivingStyle) {
    this.car(id).style = s;
  }
  setEngine(id: string, e: EngineMode) {
    this.car(id).engine = e;
  }
  setErs(id: string, e: ErsMode) {
    this.car(id).ers = e;
  }
  requestPit(id: string, c: Compound | null) {
    this.car(id).pitRequest = c;
  }
  /** Orden de equipo: libre, mantener posiciones o que el de delante deje pasar al compañero. */
  setTeamOrder(teamId: string, order: TeamOrder) {
    this.teamOrders.set(teamId, order);
    this.orderRefusals.delete(teamId);
    if (order === "free") return;
    const cars = this.running()
      .filter((c) => c.teamId === teamId && c.isPlayer)
      .sort((a, b) => a.cum - b.cum);
    const time = Math.max(0, ...cars.map((c) => c.cum));
    if (order === "hold" && cars.length > 1) {
      this.log(time, this.lap, "order", `📻 Orden de equipo: mantened posiciones`, cars.map((c) => c.driverId));
      for (const c of cars) this.radio(c, "order", "Recibido, mantengo la posición", time, 0);
    }
  }
  // ───────────────────────────── rebobinado ─────────────────────────────

  /** Generador con semilla propia para un suceso concreto (parada, duelo...). */
  private localRng(...parts: (string | number)[]) {
    return mulberry32(hashString(`${this.cfg.seed}|${parts.join("|")}`));
  }

  private snapshot(): SimSnapshot {
    return {
      scalars: {
        lap: this.lap,
        done: this.done,
        wet: this.wet,
        rain: this.rain,
        trackTemp: this.trackTemp,
        scLaps: this.scLaps,
        winnerTime: this.winnerTime,
        maxRain: this.maxRain,
        maxWet: this.maxWet,
        redLap: this.redLap,
        restartLap: this.restartLap,
      },
      sc: { ...this.sc },
      fastest: this.fastest && { ...this.fastest },
      pendingSc: this.pendingSc && { ...this.pendingSc },
      lens: { wet: this.wetByLap.length, rain: this.rainByLap.length, status: this.statusByLap.length, events: this.events.length, redFlags: this.redFlags.length },
      teamOrders: [...this.teamOrders],
      orderRefusals: [...this.orderRefusals],
      trackLimits: [...this.trackLimits],
      rng: this.rng.getState(),
      radioRng: this.radioRng.getState(),
      cars: this.cars.map(({ laps, ...rest }) => ({ ...structuredClone(rest), lapsLen: laps.length })),
    };
  }

  private restore(s: SimSnapshot) {
    Object.assign(this, s.scalars);
    this.sc = { ...s.sc };
    this.fastest = s.fastest && { ...s.fastest };
    this.pendingSc = s.pendingSc && { ...s.pendingSc };
    this.wetByLap.length = s.lens.wet;
    this.rainByLap.length = s.lens.rain;
    this.statusByLap.length = s.lens.status;
    this.events.length = s.lens.events;
    this.redFlags.length = s.lens.redFlags;
    this.teamOrders.clear();
    for (const [k, v] of s.teamOrders) this.teamOrders.set(k, v);
    this.orderRefusals = new Map(s.orderRefusals);
    this.trackLimits = new Map(s.trackLimits);
    this.rng.setState(s.rng);
    this.radioRng.setState(s.radioRng);
    s.cars.forEach(({ lapsLen, ...saved }, i) => {
      const car = this.cars[i];
      const laps = car.laps;
      laps.length = lapsLen;
      Object.assign(car, structuredClone(saved), { laps });
    });
  }

  /**
   * Vuelve al principio de la vuelta `lap` (1..N) para recalcularla. Devuelve false si no hay
   * instantánea de esa vuelta.
   */
  rewindToLap(lap: number): boolean {
    const snap = this.history[lap - 1];
    if (!snap) return false;
    this.restore(snap);
    this.history.length = lap - 1;
    return true;
  }

  /**
   * ¿Puede el coche entrar a boxes en la vuelta que está dando ahora? Sí mientras no haya pasado la
   * entrada del pit lane. Devuelve la vuelta (1..N) o null.
   */
  pitThisLap(id: string, clock: number): number | null {
    const car = this.car(id);
    if (car.status !== "run" || this.laneAt(car, clock)) return null;
    const lap = this.completedAt(car, clock).k + 1;
    if (lap >= this.totalLaps || this.statusByLap[lap - 1] === "red" || lap === this.redLap) return null;
    // Margen para que la decisión llegue antes del desvío al pit lane.
    const entryAt = lap - this.pitLane.inFrac - 0.01;
    return this.progressAt(car, clock) < entryAt ? lap : null;
  }

  /** Estado del modo de carrera para la interfaz: suspensión por bandera roja en curso. */
  redFlagAt(clock: number) {
    return this.redFlags.find((r) => clock >= r.from && clock < r.restart) ?? null;
  }
  setAuto(id: string, auto: boolean) {
    const car = this.car(id);
    car.auto = auto;
    if (auto && !isWetTyre(car.compound)) {
      const d = this.cfg.drivers[id];
      const needOther = this.needsOtherCompound(car);
      car.plan = this.planFrom(d, this.lap, car.compound, needOther, car.wear).stops;
    }
  }

  // ───────────────────────────── utilidades ─────────────────────────────

  private log(time: number, lap: number, type: RaceEventType, text: string, drivers: string[]) {
    this.events.push({ time, lap, type, text, drivers });
  }

  /**
   * Mensaje de radio de un piloto del jugador. `cooldown` es el número de vueltas antes de que el
   * mismo tipo de mensaje (`key`) pueda repetirse.
   */
  private radio(car: CarState, key: string, text: string, time: number, cooldown = 6) {
    if (!car.isPlayer) return;
    if ((car.radioCooldown[key] ?? 0) > this.lap) return;
    car.radioCooldown[key] = this.lap + cooldown;
    this.log(time, Math.max(1, this.lap), "radio", `${car.code}: «${text}»`, [car.driverId]);
  }

  /** Una de varias frases al azar (con el generador de la radio). */
  private say(options: string[]) {
    return options[Math.floor(this.radioRng() * options.length)];
  }

  /**
   * Daños por contacto o salida de pista: alerón (reparable en boxes), fondo plano (permanente) o
   * pinchazo. `severity` va de 0 (roce) a 1 (golpe fuerte). Devuelve el tiempo perdido en la vuelta.
   */
  private applyDamage(car: CarState, severity: number, time: number, L: number, cause: string): number {
    const r = this.rng();
    if (r < 0.55) {
      const loss = range(this.rng, 0.3, 0.8) + severity * 0.9;
      car.damage += loss;
      this.log(time, L, "incident", `${car.code} daña el alerón delantero ${cause}`, [car.driverId]);
      this.radio(
        car,
        "wing",
        loss > 1
          ? this.say(["¡Se ha roto el alerón! No puedo girar", "¡Alerón destrozado, necesito entrar!"])
          : this.say(["Creo que el alerón está tocado", "El coche subvira mucho, revisad el alerón"]),
        time + 4,
        2,
      );
      if (loss > 1.2 && this.rng() < 0.35) this.triggerNeutralisation("vsc", time + 2);
      return 0;
    }
    if (r < 0.85) {
      const loss = range(this.rng, 0.15, 0.45) + severity * 0.4;
      car.floorDamage += loss;
      this.log(time, L, "incident", `${car.code} sufre daños en el fondo ${cause}`, [car.driverId]);
      this.radio(car, "floor", this.say(["Noto el coche raro, creo que hay daños en el fondo", "He perdido carga atrás, el coche no va igual"]), time + 4, 3);
      return 0;
    }
    this.log(time, L, "incident", `¡Pinchazo para ${car.code} ${cause}!`, [car.driverId]);
    this.radio(car, "puncture", this.say(["¡Pinchazo! Entro a boxes", "¡Se ha reventado una rueda!"]), time + 3, 2);
    car.wear = Math.max(car.wear, 90);
    if (L < this.totalLaps && !car.pitRequest) car.pitRequest = isWetTyre(car.compound) ? car.compound : this.dryChoice(car, L);
    return this.base * 0.25;
  }

  private needsOtherCompound(car: CarState) {
    return this.cfg.mustTwo && !car.usedWet && new Set(car.usedDry).size < 2;
  }

  private running() {
    return this.cars.filter((c) => c.status === "run");
  }

  private orderAtLapStart(): CarState[] {
    const run = this.running();
    if (this.lap === 0) return run.sort((a, b) => a.grid - b.grid);
    return run.sort((a, b) => a.cum - b.cum);
  }

  /** Combustible sobrante (en vueltas a ritmo medio) al llegar a meta, con `lapsLeft` vueltas por delante. */
  fuelMargin(car: CarState, lapsLeft: number): number {
    return car.fuel - lapsLeft;
  }

  // ───────────────────────────── IA ─────────────────────────────

  private dryChoice(car: CarState, L: number): Compound {
    const d = this.cfg.drivers[car.driverId];
    const mustOther = this.needsOtherCompound(car);
    let best: { start: Compound; stops: PlannedStop[]; est: number } | null = null;
    for (const c of this.availableDry(car)) {
      const needLater = mustOther && car.usedDry.length > 0 && car.usedDry.every((u) => u === c);
      const p = this.planFrom(d, L, c, needLater, 0);
      if (!best || p.est < best.est) best = p;
    }
    if (!best) return this.dry[0];
    car.plan = best.stops;
    return best.start;
  }

  private desiredPit(car: CarState, L: number, remaining: number): Compound | null {
    const w = this.wet;
    const onWet = isWetTyre(car.compound);
    if (!onWet && w > car.wetThreshold) {
      car.plan = [];
      return w > 0.82 ? "W" : "I";
    }
    if (car.compound === "I" && w > 0.9) return "W";
    if (car.compound === "W" && w < 0.6) return w < car.dryThreshold ? this.dryChoice(car, L) : "I";
    if (car.compound === "I" && w < car.dryThreshold) {
      let upcoming = 0;
      for (let k = 0; k < 8; k++) upcoming = Math.max(upcoming, rainAt(this.cfg.weather, (L + k) / this.totalLaps));
      if (upcoming < 0.08) return this.dryChoice(car, L);
    }
    // Alerón muy dañado: se entra a cambiarlo aprovechando para poner neumáticos.
    if (car.damage > 0.5 && remaining > 3) return onWet ? car.compound : this.dryChoice(car, L);
    if (onWet) return car.wear > 80 && remaining > 3 ? car.compound : null;

    const next = car.plan[0];
    const neutral = this.sc.kind !== "none";
    if ((car.wear > 80 && remaining > 6) || (car.wear > 93 && remaining > 1)) return this.dryChoice(car, L);
    if (next && L >= next.lap) return this.dryChoice(car, L);
    if (neutral && next && next.lap - L <= 12 && remaining > 4) return this.dryChoice(car, L);
    if (neutral && !next && car.wear > 55 && remaining > 8) return this.dryChoice(car, L);
    if (this.needsOtherCompound(car) && remaining <= 2) return this.dry.find((c) => !car.usedDry.includes(c)) ?? this.dry[0];
    return null;
  }

  private aiDecide(car: CarState, L: number, order: CarState[], idx: number) {
    const d = this.cfg.drivers[car.driverId];
    const remaining = this.totalLaps - L + 1;
    if (remaining > 1 && !car.pitRequest) {
      const want = this.desiredPit(car, L, remaining);
      if (want) car.pitRequest = want;
    }
    const gapAhead = idx > 0 ? car.cum - order[idx - 1].cum : 99;
    const gapBehind = idx < order.length - 1 ? order[idx + 1].cum - car.cum : 99;

    let style: DrivingStyle = 2;
    if (!isWetTyre(car.compound)) {
      const nextStop = car.plan[0]?.lap ?? this.totalLaps;
      const rate = wearRate(this.series, this.circuit, car.compound, d.tyre);
      if (car.wear + (nextStop - L + 1) * rate > 82) style = 1;
    }
    if (gapAhead < 1.0 && L > 1) style = Math.max(style, 3) as DrivingStyle;
    if (remaining <= 4 && car.wear < 70) style = 3;
    if (d.aggression > 72 && gapAhead < 0.8 && car.wear < 60) style = 4;
    if (this.sc.kind !== "none") style = 2;
    car.style = style;

    const margin = this.fuelMargin(car, remaining);
    let engine: EngineMode = margin > 0.06 * remaining + 0.2 ? 2 : margin < 0.15 ? 0 : 1;
    if (gapAhead < 0.8 && margin > 0.15 * remaining + 0.2) engine = 3;
    car.engine = engine;

    if (this.hasErs) {
      if (car.battery < 25) car.ers = 0;
      else if ((gapAhead < 1.0 || gapBehind < 0.8) && car.battery > 35) car.ers = 2;
      else car.ers = car.battery > 85 ? 2 : 1;
    }
  }

  // ───────────────────────────── simulación ─────────────────────────────

  /**
   * Tiempo de una parada: `drive` es lo que se pierde recorriendo el carril a velocidad limitada
   * frente a ir por la pista y `stationary` el tiempo parado en el garaje.
   */
  private pitTime(car: CarState, status: LapStatus): { drive: number; stationary: number; slow: boolean } {
    const team = this.cfg.teams[car.teamId];
    const cfgS = SERIES_CFG[this.series];
    const lossFactor = status === "sc" ? 0.55 : status === "vsc" ? 0.65 : 1;
    // Azar propio de cada parada: pedir boxes a mitad de vuelta no altera el resto de la carrera.
    const rng = this.localRng("pit", car.driverId, this.lap);
    let stationary = cfgS.pitStationary + (100 - team.pitCrew) * 0.025 + Math.abs(gauss(rng)) * 0.25;
    const slow = rng() < 0.03 + (100 - team.pitCrew) * 0.002;
    if (slow) stationary += range(rng, 2, 7);
    if (car.damage > 0) stationary += 6;
    return { drive: this.circuit.pitLoss * lossFactor, stationary, slow };
  }

  private retire(car: CarState, L: number, reason: string, lapTimeGuess: number, important = true) {
    car.status = "dnf";
    car.dnfReason = reason;
    car.dnfLap = L;
    const part = range(this.rng, 0.15, 0.9);
    car.dnfTime = car.cum + lapTimeGuess * part;
    car.dnfProgress = L - 1 + part;
    // Abandono en la vuelta de salida de boxes: se completa el paso por el carril antes de pararse.
    const v = car.visits[car.visits.length - 1];
    if (v && v.exit === undefined && v.lap === L - 1) {
      this.closeVisit(car, lapTimeGuess);
      car.pitCarry = 0;
      const lane = this.laneAt(car, car.dnfTime);
      if (lane) car.dnfProgress = lane.progress;
      else car.dnfProgress = Math.min(L - 0.01, L - 1 + v.outFrac + Math.max(0, car.dnfTime - (v.exit ?? car.dnfTime)) / lapTimeGuess);
    }
    if (important) this.log(car.dnfTime, L, "dnf", `${car.code} abandona: ${reason}`, [car.driverId]);
    this.radio(car, "dnf", this.say(["Se acabó, lo siento chicos", "¡No! El coche se ha parado", "Fin de la carrera para nosotros…"]), car.dnfTime + 3, 999);
  }

  /** Neutralización pendiente para el final de la vuelta. Prioridad: bandera roja > SC > VSC. */
  private triggerNeutralisation(kind: "sc" | "vsc" | "red", time: number) {
    const rank = { vsc: 0, sc: 1, red: 2 };
    if (this.pendingSc && rank[this.pendingSc.kind] >= rank[kind]) return;
    this.pendingSc = { kind, time };
  }

  /** Bandera roja con probabilidad `p` (como mucho una por carrera y nunca al final). */
  private maybeRedFlag(p: number, time: number) {
    if (this.redFlags.length > 0 || this.redLap > 0 || this.lap >= this.totalLaps - 3) return;
    if (this.rng() < p) this.triggerNeutralisation("red", time);
  }

  /** En la reanudación tras bandera roja todos montan neumáticos nuevos y reparan el alerón sin perder tiempo. */
  private freeTyreChange(order: CarState[], L: number) {
    for (const car of order) {
      let nc = car.pitRequest;
      if (!nc) nc = car.auto ? (this.wet >= 0.82 ? "W" : this.wet >= 0.2 ? "I" : this.dryChoice(car, L)) : car.compound;
      const fresh = this.takeSet(car, nc);
      nc = fresh.compound;
      car.compound = nc;
      car.wear = fresh.wear;
      car.tyreAge = 0;
      car.temp = SERIES_CFG[this.series].blanketTemp;
      car.damage = 0;
      car.pitRequest = null;
      if (isWetTyre(nc)) car.usedWet = true;
      else if (!car.usedDry.includes(nc)) car.usedDry.push(nc);
      if (car.auto && !isWetTyre(nc)) car.plan = this.planFrom(this.cfg.drivers[car.driverId], L - 1, nc, this.needsOtherCompound(car), 0).stops;
    }
  }

  /** Abre el paso por boxes de una vuelta que termina dentro del pit lane (en `line`). */
  private openVisit(car: CarState, L: number, line: number, pit: { tin: number; tout: number; stationary: number }, racing: number): PitVisit {
    const { inFrac, outFrac } = this.pitLane;
    const box = this.pitLane.box.get(car.teamId) ?? 0;
    const { tin, tout, stationary } = pit;
    const entry = line - tin - racing * inFrac;
    const v: PitVisit = { lap: L, entry, line, inFrac, outFrac, box, stationary, tout, stopStart: line, stopEnd: line + stationary };
    if (box < 0) {
      const drive = line - entry - stationary;
      v.stopStart = entry + drive * ((box + inFrac) / inFrac);
      v.stopEnd = v.stopStart + stationary;
    }
    car.visits.push(v);
    return v;
  }

  /** Cierra el paso por boxes en la vuelta de salida, cuando ya se conoce su tiempo. */
  private closeVisit(car: CarState, racing: number) {
    const v = car.visits[car.visits.length - 1];
    if (!v || v.exit !== undefined) return;
    v.exit = v.line + v.tout + racing * v.outFrac;
    if (v.box >= 0) {
      const drive = v.exit - v.line - v.stationary;
      v.stopStart = v.line + drive * (v.box / v.outFrac);
      v.stopEnd = v.stopStart + v.stationary;
    }
  }

  /** Mensajes de radio de los pilotos del jugador según cómo va su carrera. */
  private radioChecks(car: CarState, idx: number, order: CarState[], time: number) {
    const say = (o: string[]) => this.say(o);
    const isW = isWetTyre(car.compound);
    if (!car.pitRequest) {
      if (car.wear > 85) this.radio(car, "wear2", say(["¡No me quedan neumáticos!", "Las gomas están muertas, tengo que entrar"]), time, 4);
      else if (car.wear > 70) this.radio(car, "wear", say(["Los neumáticos se están acabando", "Estoy perdiendo agarre detrás", "Las ruedas ya no dan más de sí"]), time, 8);
    }
    const [lo, hi] = TEMP_WINDOW[car.compound];
    if (car.temp < lo - 8 && car.tyreAge > 1) this.radio(car, "cold", say(["No consigo meter temperatura en las ruedas", "Los neumáticos están helados"]), time, 8);
    if (car.temp > hi + 5) this.radio(car, "hot", say(["Los neumáticos se están sobrecalentando", "Las ruedas queman, tengo que aflojar"]), time, 8);
    if (!isW && this.wet > 0.22) this.radio(car, "slicks", say(["¡Esto es una pista de patinaje con slicks!", "No hay agarre, ¡necesito intermedios!"]), time, 3);
    if (isW && this.wet < 0.12) this.radio(car, "dry", say(["La pista se está secando, ¿ponemos slicks?", "Hay línea seca, creo que es hora de slicks"]), time, 5);
    if (car.liftCoast) this.radio(car, "fuel", say(["Estoy levantando y rodando, perdemos mucho tiempo", "¿Cuánto combustible tengo que ahorrar todavía?"]), time, 10);
    const ahead = order[idx - 1];
    const behind = order[idx + 1];
    if (ahead && car.cum - ahead.cum < 1.0 && car.style <= 1 && car.wear < 60) {
      this.radio(car, "push", say([`Soy más rápido que ${ahead.code}, déjame atacar`, "Puedo ir más rápido, ¿ataco?"]), time, 8);
    }
    if (behind && behind.cum - car.cum < 0.5 && behind.teamId !== car.teamId) {
      this.radio(car, "defend", say([`Tengo a ${behind.code} encima`, `${behind.code} me está apretando mucho`]), time, 7);
    }
  }

  /** Intercambio de posiciones entre compañeros ordenado desde el muro. */
  private applyTeamOrders(final: { car: CarState; t: number }[], L: number) {
    for (const [teamId, ord] of this.teamOrders) {
      if (ord !== "swap") continue;
      for (let i = 1; i < final.length; i++) {
        const front = final[i - 1];
        const back = final[i];
        if (front.car.teamId !== teamId || back.car.teamId !== teamId || back.t - front.t > 3) continue;
        const d = this.cfg.drivers[front.car.driverId];
        if (d.aggression > 78 && this.radioRng() < 0.4) {
          const n = (this.orderRefusals.get(teamId) ?? 0) + 1;
          this.orderRefusals.set(teamId, n);
          this.radio(front.car, "refuse", this.say(["No pienso dejarle pasar, soy más rápido", "¿En serio? ¡Estoy en carrera!", "Que se gane la posición en pista"]), front.t - 20, 1);
          if (n >= 3) {
            this.teamOrders.set(teamId, "free");
            this.log(front.t, L, "order", `${front.car.code} ignora la orden de equipo`, [front.car.driverId, back.car.driverId]);
          }
          break;
        }
        const tf = front.t;
        front.t = Math.max(back.t, tf) + 0.35;
        back.t = tf + 0.05;
        this.log(tf - 15, L, "order", `🔁 ${front.car.code} deja pasar a ${back.car.code} por orden de equipo`, [front.car.driverId, back.car.driverId]);
        this.radio(front.car, "obey", d.aggression > 65 ? this.say(["Vale… pero que conste en acta", "Entendido. No me gusta, pero entendido"]) : this.say(["Entendido, le dejo pasar", "Recibido, cedo la posición"]), tf - 25, 1);
        this.radio(back.car, "thanks", this.say(["Gracias, a por ellos", "Recibido, gracias"]), tf + 5, 1);
        this.teamOrders.set(teamId, "hold");
        break;
      }
    }
    final.sort((a, b) => a.t - b.t);
  }

  step(): void {
    if (this.done) return;
    if (this.keepHistory) this.history[this.lap] = this.snapshot();
    const L = ++this.lap;
    const N = this.totalLaps;
    const rng = this.rng;
    const cfgS = SERIES_CFG[this.series];
    const frac = (L - 0.5) / N;
    const prevWet = this.wet;
    const prevRain = this.rain;
    this.rain = rainAt(this.cfg.weather, frac);
    this.trackTemp = this.cfg.weather.trackTemp - this.rain * 10;
    this.wet = evolveWetness(this.wet, this.rain, this.trackTemp, (this.base * (1 + this.wet * 0.08)) / 60, true);
    this.maxRain = Math.max(this.maxRain, this.rain);
    this.maxWet = Math.max(this.maxWet, this.wet);
    this.wetByLap.push(this.wet);
    this.rainByLap.push(this.rain);

    const order = this.orderAtLapStart();
    const leaderStart = order[0]?.cum ?? 0;
    /** Salida parada: la de la carrera o la reanudación tras una bandera roja. */
    const standing = L === 1 || L === this.restartLap;
    if (L === this.restartLap) this.freeTyreChange(order, L);

    if (this.rain > 0.05 && prevRain <= 0.05) {
      this.log(leaderStart, L, "weather", "🌧️ Empieza a llover sobre el circuito", []);
      for (const c of order) if (!isWetTyre(c.compound)) this.radio(c, "rain", this.say(["Empieza a llover en el sector dos", "Caen gotas, la pista empieza a resbalar"]), leaderStart + 8, 4);
    }
    if (this.rain <= 0.05 && prevRain > 0.05) this.log(leaderStart, L, "weather", "🌤️ Deja de llover", []);
    if (this.wet >= 0.18 && prevWet < 0.18) this.log(leaderStart, L, "weather", "💧 La pista ya está mojada: hora de los intermedios", []);
    if (this.wet < 0.18 && prevWet >= 0.18) this.log(leaderStart, L, "weather", "☀️ Se forma una línea seca: los neumáticos de seco vuelven a ser opción", []);
    if (this.wet >= 0.85 && prevWet < 0.85) this.log(leaderStart, L, "weather", "🌊 Pista encharcada: neumáticos de lluvia extrema", []);

    // Estado de neutralización de esta vuelta.
    let status: LapStatus = "green";
    if (L === this.redLap) {
      status = "red";
    } else if (this.sc.kind !== "none") {
      if (this.sc.lapsLeft > 0) {
        status = this.sc.kind;
        this.sc.lapsLeft--;
      } else {
        this.log(leaderStart, L, "restart", this.sc.kind === "sc" ? "🟢 El coche de seguridad entra: ¡relanzamiento!" : "🟢 Fin del VSC: bandera verde", []);
        this.sc = { kind: "none", lapsLeft: 0 };
      }
    }
    if (status === "sc" || status === "vsc") this.scLaps++;
    this.statusByLap.push(status);
    const restart = status === "green" && L > 1 && !standing && this.statusByLap[L - 2] !== "green";

    // Decisiones.
    order.forEach((car, idx) => {
      if (car.auto) this.aiDecide(car, L, order, idx);
      else {
        if (this.hasErs && car.ers === 2 && car.battery < 8) car.ers = 1;
        this.followStrategy(car, L);
      }
      if (L === N) car.pitRequest = null;
    });

    // Tiempos naturales.
    const nat = new Map<CarState, number>();
    const expected = new Map<CarState, number>();
    /** Coches que entran al pit lane al final de esta vuelta. */
    const pitting = new Map<CarState, { tin: number; tout: number; stationary: number; slow: boolean }>();
    /** Coches en su vuelta de salida de boxes (tiempo pendiente de la parada anterior). */
    const outLap = new Map<CarState, number>();
    /** Tiempo total en el carril de boxes durante esta vuelta. */
    const laneTime = new Map<CarState, number>();
    const evolution = 0.4 * frac * (1 - this.wet);
    for (let idx = 0; idx < order.length; idx++) {
      const car = order[idx];
      const d = this.cfg.drivers[car.driverId];
      const team = this.cfg.teams[car.teamId];
      const sp = spec(this.series, car.compound);
      const remaining = N - L + 1;

      // Combustible.
      const margin = car.fuel - remaining;
      const forcedSave = margin < 0;
      const engine = forcedSave ? 0 : car.engine;
      car.liftCoast = margin < -remaining * 0.1;
      let fuelUse = ENGINE_FUEL[engine] * (status === "sc" ? 0.5 : status === "vsc" ? 0.6 : status === "red" ? 0.4 : 1);
      if (car.liftCoast) fuelUse *= 0.82;

      let pct = basePct(this.series, team, d, this.cfg.pus, this.circuit, this.wet, car.setupQ);
      pct += isWetTyre(car.compound) ? 0 : sp.pace;
      pct += wetPenalty(car.compound, this.wet);
      pct += this.wet * 6;
      pct += wearPenalty(car.wear);
      pct += tempPenalty(car.compound, car.temp);
      pct += cfgS.fuelEffect * clamp(car.fuel / this.startFuel, 0, 1.1);
      pct += STYLE_PACE[car.style] + ENGINE_PACE[engine];
      if (this.hasErs) pct += car.ers === 2 && car.battery < 8 ? 0 : ERS_PACE[car.ers];
      pct += car.damage + car.floorDamage + car.powerLoss;
      if (car.liftCoast) pct += 1.2;
      pct -= evolution;
      expected.set(car, this.base * (1 + pct / 100));
      pct += gauss(rng) * (cfgS.raceNoise + (100 - d.consistency) * 0.008);
      let t = car.cum + this.base * (1 + pct / 100);

      if (standing) {
        t += car.startOffset;
        if (!(L === 1 && this.startUnderSc)) t += this.base * 0.035 + gauss(rng) * (0.12 + (100 - d.start) * 0.01) + (this.wet > 0.3 ? gauss(rng) * 0.4 : 0);
      }

      // Neumáticos: desgaste y temperatura.
      const isW = isWetTyre(car.compound);
      let target = 70 + 8 * car.style + (this.trackTemp - 30) * 0.6 + (engine - 1) * 1.5 - this.wet * 25;
      if (isW && this.wet < 0.3) target += (0.3 - this.wet) * 80;
      if (status === "sc") target -= 25;
      if (status === "vsc") target -= 18;
      if (status === "red") target -= 30;
      car.temp += (target - car.temp) * 0.55;
      let rate = sp.wear * this.circuit.wear * STYLE_WEAR[car.style] * (1 + (80 - d.tyre) * 0.008) * tempWearFactor(car.compound, car.temp) * (1 + car.floorDamage * 0.15) * car.wearMult;
      if (isW && this.wet < 0.25) rate *= 1 + (0.25 - this.wet) * 12;
      if (status === "sc") rate *= 0.25;
      if (status === "vsc") rate *= 0.4;
      if (status === "red") rate *= 0.2;
      car.wear = Math.min(100, car.wear + rate);
      car.tyreAge++;

      car.fuel -= fuelUse;
      if (car.fuel < 0 && L === N) {
        // Llega a meta levantando el pie para no quedarse seco.
        t += -car.fuel * this.base * 0.1;
        car.fuel = 0;
      }
      if (this.hasErs) {
        const charge = status !== "green" ? 20 : car.ers === 2 && car.battery < 8 ? 3 : ERS_CHARGE[car.ers];
        car.battery = clamp(car.battery + charge, 0, 100);
      }

      // Incidentes (solo con bandera verde o VSC).
      if (status === "green" || status === "vsc") {
        const lapGuess = t - car.cum;
        const calm = status === "vsc" ? 0.3 : 1;
        const rel = reliabilityRating(team, this.cfg.pus);
        const pMech = Math.pow(Math.max(0, 100 - rel), 1.5) * 1.6e-5 * ENGINE_REL[engine] * calm * (this.cfg.relMult?.[car.driverId] ?? 1);
        if (rng() < pMech) {
          if (rng() < 0.7) {
            this.retire(car, L, pick(rng, MECH_FAILURES), lapGuess);
            const r = rng();
            if (r < 0.18) this.triggerNeutralisation("vsc", car.dnfTime ?? car.cum);
            else if (r < 0.22) this.triggerNeutralisation("sc", car.dnfTime ?? car.cum);
            continue;
          }
          const loss = range(rng, 0.6, 1.8);
          car.powerLoss += loss;
          this.log(car.cum + lapGuess * 0.5, L, "incident", `${car.code} reporta un problema técnico y pierde ritmo`, [car.driverId]);
          this.radio(car, "engine", this.say(["He perdido potencia, algo va mal en el motor", "El motor no tira, ¿qué veis en los datos?"]), car.cum + lapGuess * 0.55, 5);
        }

        const slickPen = isW ? 0 : wetPenalty(car.compound, this.wet);
        const cold = car.temp < TEMP_WINDOW[car.compound][0] - 10 ? 1.5 : 1;
        const errMult = STYLE_ERR[car.style] * (1 + (100 - d.consistency) / 30) * (1 + slickPen / 6) * (car.wear > 80 ? 1.6 : 1) * (1 + this.wet * 1.5) * cold;
        if (rng() < 0.004 * errMult * calm) {
          const r = rng();
          const when = car.cum + lapGuess * 0.5;
          if (r < 0.04 * (1 + this.wet)) {
            this.retire(car, L, "Accidente", lapGuess);
            this.triggerNeutralisation(rng() < (this.circuit.street ? 0.75 : 0.5) + this.circuit.sc * 0.2 ? "sc" : "vsc", car.dnfTime ?? car.cum);
            this.maybeRedFlag(0.1 + this.wet * 0.3 + (this.circuit.street ? 0.1 : 0), car.dnfTime ?? car.cum);
            continue;
          } else if (r < 0.22) {
            t += range(rng, 6, 16);
            car.wear = Math.min(100, car.wear + 6);
            this.log(when, L, "incident", `Trompo de ${car.code}`, [car.driverId]);
            this.radio(car, "spin", this.say(["¡Trompo! Sigo en pista", "Lo siento, se me ha ido la trasera"]), when + 4, 3);
            if (rng() < 0.3) t += this.applyDamage(car, 0.2, when + 1, L, "en la salida de pista");
          } else {
            t += range(rng, 0.8, 3.5);
            if (car.isPlayer) this.log(when, L, "incident", `${car.code} se pasa de frenada y pierde tiempo`, [car.driverId]);
          }
        }

        if (car.wear > 85 && rng() < (car.wear - 85) * 0.005 * (car.style >= 3 ? 1.4 : 1)) {
          if (car.wear > 95 && rng() < 0.2) {
            this.retire(car, L, "Pinchazo y daños en la suspensión", lapGuess);
            this.triggerNeutralisation("vsc", car.dnfTime ?? car.cum);
            continue;
          }
          t += this.base * 0.3;
          this.log(car.cum + lapGuess * 0.6, L, "incident", `¡Pinchazo para ${car.code}! Vuelve a boxes muy lento`, [car.driverId]);
          this.radio(car, "puncture", this.say(["¡Pinchazo! Entro a boxes", "¡Se ha reventado una rueda!"]), car.cum + lapGuess * 0.62, 2);
          if (L < N && !car.pitRequest) car.pitRequest = isW ? car.compound : this.dryChoice(car, L);
        }

        if (standing && !(L === 1 && this.startUnderSc) && idx > 2 && rng() < 0.03 + this.wet * 0.03) {
          const r = rng();
          if (r < 0.1) {
            this.retire(car, L, "Colisión en la salida", lapGuess);
            this.triggerNeutralisation("sc", car.dnfTime ?? car.cum);
            this.maybeRedFlag(0.25, car.dnfTime ?? car.cum);
            continue;
          }
          t += range(rng, 1, 5);
          this.log(car.cum + lapGuess * 0.2, L, "incident", `Toque en la salida: ${car.code} pierde posiciones`, [car.driverId]);
          if (r < 0.4) t += this.applyDamage(car, 0.5, car.cum + lapGuess * 0.2 + 1, L, "en la salida");
        }

        if (status === "green" && rng() < 0.0012 * (car.style >= 3 ? 2 : 1)) {
          const n = (this.trackLimits.get(car.driverId) ?? 0) + 1;
          this.trackLimits.set(car.driverId, n);
          if (n === 4 || n === 8) {
            car.penalty += 5;
            this.log(car.cum + lapGuess * 0.7, L, "penalty", `${car.code}: 5 s de penalización por exceder los límites de pista`, [car.driverId]);
          }
        }

        if (car.fuel <= 0 && L < N) {
          this.retire(car, L, "Sin combustible", lapGuess);
          continue;
        }
      }

      if (car.isPlayer && status === "green" && L > 1) this.radioChecks(car, idx, order, car.cum + (t - car.cum) * 0.4);

      // Boxes: la parada se reparte entre esta vuelta (hasta la meta) y la siguiente (hasta la salida).
      // Con bandera roja no se entra: el cambio es gratuito en la reanudación.
      let lane = 0;
      if (car.pitRequest && L < N && status !== "red") {
        const p = this.pitTime(car, status);
        const box = this.pitLane.box.get(car.teamId) ?? 0;
        const half = p.drive / 2;
        const tin = half + (box < 0 ? p.stationary : 0);
        pitting.set(car, { tin, tout: p.drive - half + (box >= 0 ? p.stationary : 0), stationary: p.stationary, slow: p.slow });
        lane += tin;
      } else if (L >= N) {
        car.pitRequest = null;
      }
      if (car.pitCarry > 0) {
        lane += car.pitCarry;
        outLap.set(car, car.pitCarry);
        car.pitCarry = 0;
      }
      if (lane > 0) laneTime.set(car, lane);
      nat.set(car, t + lane);
    }

    if (status === "green" && rng() < this.circuit.sc * 0.0008) {
      this.triggerNeutralisation(rng() < 0.5 ? "vsc" : "sc", leaderStart + this.base * 0.5);
      if (this.pendingSc) this.pendingSc.time = leaderStart + this.base * 0.5;
    }
    if (status === "green" && this.wet > 0.92 && this.rain > 0.75 && rng() < 0.4) {
      this.triggerNeutralisation("sc", leaderStart + this.base * 0.3);
      if (this.wet > 0.96 && this.rain > 0.88) this.maybeRedFlag(0.5, leaderStart + this.base * 0.3);
    }

    const alive = order.filter((c) => c.status === "run" && nat.has(c));
    let final: { car: CarState; t: number }[];
    const fights: { att: CarState; def: CarState }[] = [];

    if (status === "sc" || status === "red") {
      // Detrás del coche de seguridad (o rodando lento hacia la parrilla con bandera roja) no hay adelantamientos.
      const scLap = this.base * (status === "red" ? 1.6 : 1.45);
      const items = alive.map((car, i) => ({ car, i, earliest: car.cum + scLap * 0.72 + (laneTime.get(car) ?? 0) }));
      items.sort((a, b) => a.earliest - b.earliest || a.i - b.i);
      final = [];
      let prev = -Infinity;
      items.forEach((it, i) => {
        let t = Math.max(it.earliest, prev + 0.6);
        if (i === 0) t = Math.max(t, it.car.cum + scLap + (laneTime.get(it.car) ?? 0));
        prev = t;
        final.push({ car: it.car, t });
      });
    } else if (status === "vsc") {
      const vscLap = this.base * 1.32;
      final = alive.map((car) => ({ car, t: car.cum + vscLap + (laneTime.get(car) ?? 0) + (standing ? car.startOffset : 0) }));
      final.sort((a, b) => a.t - b.t);
    } else {
      final = this.resolveGreenLap(alive, nat, expected, new Set(laneTime.keys()), L, restart, standing, fights);
      this.applyTeamOrders(final, L);
    }

    for (let i = 1; i < final.length; i++) {
      if (final[i].t < final[i - 1].t + 0.08) final[i].t = final[i - 1].t + 0.08;
    }

    final.forEach(({ car, t }, i) => {
      const startT = car.cum;
      const lapTime = t - startT;
      car.cum = t;
      const pit = pitting.get(car);
      const carry = outLap.get(car) ?? 0;
      const tin = pit?.tin ?? 0;
      // Tiempo que habría hecho la vuelta entera por pista (sin el carril de boxes).
      const racing = Math.max(this.base * 0.5, lapTime - tin - carry);
      const rec: LapRecord = {
        lap: L,
        start: startT,
        time: lapTime,
        end: t,
        compound: car.compound,
        wear: car.wear,
        temp: car.temp,
        fuel: car.fuel,
        battery: car.battery,
        pos: i + 1,
        pitTime: tin + carry,
      };
      if (carry > 0) this.closeVisit(car, racing);
      if (rec.pitTime === 0 && lapTime < car.bestLap) {
        car.bestLap = lapTime;
        car.bestLapNo = L;
        if (!this.fastest || lapTime < this.fastest.time) {
          this.fastest = { driverId: car.driverId, time: lapTime, lap: L };
          if (L > 3) this.log(t, L, "fastest", `⏱️ Vuelta rápida de ${car.code}`, [car.driverId]);
        }
      }
      if (pit && car.pitRequest) {
        const fresh = this.takeSet(car, car.pitRequest);
        const nc = fresh.compound;
        const v = this.openVisit(car, L, t, pit, racing);
        // La parte de la parada que cae en la vuelta de salida (el garaje puede estar pasada la meta).
        car.pitCarry = pit.tout;
        rec.pitCompound = nc;
        if (fresh.wear > 0) rec.pitWear = fresh.wear;
        const stopAt = v.box < 0 ? v.stopStart : t + pit.tout * 0.5;
        const usedTag = fresh.wear > 1 ? " usados" : "";
        this.log(stopAt, L, "pit", `${car.code} para en boxes → ${nc}${usedTag} (P${i + 1}) · ${pit.stationary.toFixed(1)} s`, [car.driverId]);
        if (pit.slow) this.log(stopAt + pit.stationary, L, "pit", `Parada lenta para ${car.code}: ${pit.stationary.toFixed(1)} s`, [car.driverId]);
        car.compound = fresh.compound;
        car.wear = fresh.wear;
        car.tyreAge = 0;
        car.temp = SERIES_CFG[this.series].blanketTemp;
        car.pits++;
        car.damage = 0;
        if (isWetTyre(fresh.compound)) car.usedWet = true;
        else if (!car.usedDry.includes(fresh.compound)) car.usedDry.push(fresh.compound);
        car.pitRequest = null;
        if (car.auto && !isWetTyre(fresh.compound)) car.plan = car.plan.filter((s) => s.lap > L);
        // Una parada cercana del plan se da por hecha (también si se adelantó a mano).
        if (car.strategy?.length && car.strategy[0].lap <= L + 8) car.strategy.shift();
        if (this.localRng("release", car.driverId, L)() < 0.004) {
          car.penalty += 5;
          this.log(t + pit.tout, L, "penalty", `${car.code}: 5 s de penalización por salida insegura de boxes`, [car.driverId]);
        }
      }
      car.laps.push(rec);
    });

    // Bandera roja: los coches quedan parados en parrilla en el orden de carrera hasta la salida parada.
    if (status === "red" && final.length > 0) {
      const from = Math.min(...final.map((f) => f.t));
      const restartT = Math.max(...final.map((f) => f.t)) + RED_FLAG_PAUSE;
      final.forEach(({ car }, i) => {
        car.startOffset = i * GRID_GAP;
        car.laps[car.laps.length - 1].parkOff = car.startOffset / this.base;
        car.cum = restartT;
      });
      this.redFlags.push({ lap: L, from, restart: restartT });
      this.restartLap = L + 1;
      this.log(restartT, L, "restart", "🟢 Se reanuda la carrera con salida parada", []);
    }

    for (const f of fights) {
      if (f.att.status !== "run") continue;
      const pos = final.findIndex((x) => x.car === f.att) + 1;
      const aRec = f.att.laps[f.att.laps.length - 1];
      const when = aRec.end - aRec.time * 0.4;
      this.log(when, L, "overtake", `${f.att.code} adelanta a ${f.def.code} por P${pos}`, [f.att.driverId, f.def.driverId]);
      if (f.att.teamId !== f.def.teamId) {
        this.radio(f.att, "pass", this.say(["¡Vamos! A por el siguiente", "¡Adelantado!", "¡Qué maniobra! ¡Vamos!"]), when + 3, 4);
        this.radio(f.def, "passed", this.say([`Me ha pasado ${f.att.code}, no tengo ritmo`, `${f.att.code} me ha adelantado con mucha facilidad`]), when + 3, 5);
      }
    }

    const pend = this.pendingSc;
    if (pend && status !== "red" && L < N - 1) {
      if (pend.kind === "red" && this.redFlags.length === 0 && this.redLap === 0 && L < N - 3) {
        this.sc = { kind: "none", lapsLeft: 0 };
        this.redLap = L + 1;
        this.log(pend.time + 2, L, "red", "🟥 ¡BANDERA ROJA! Carrera suspendida: todos a parrilla", []);
        for (const c of this.running()) this.radio(c, "red", this.say(["Bandera roja, vuelvo despacio a parrilla", "Bandera roja. ¿Qué neumáticos ponemos para la salida?"]), pend.time + 6, 99);
      } else if (this.sc.kind === "none") {
        const kind = pend.kind === "red" ? "sc" : pend.kind;
        this.sc = { kind, lapsLeft: kind === "sc" ? 3 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2) };
        this.log(pend.time + 2, L, kind, kind === "sc" ? "🟡 ¡COCHE DE SEGURIDAD en pista!" : "🟡 Coche de seguridad virtual (VSC)", []);
        for (const c of this.running()) {
          if (c.wear > 35 && !c.pitRequest && N - L > 5) this.radio(c, "sc", this.say(["Safety car: ¿entramos a boxes?", "Es buen momento para parar, ¿no?"]), pend.time + 8, 10);
        }
      }
    }
    this.pendingSc = null;

    if (L >= N || this.running().length === 0) this.finish();
  }

  private resolveGreenLap(
    alive: CarState[],
    nat: Map<CarState, number>,
    expected: Map<CarState, number>,
    /** Coches que pasan por el carril de boxes en esta vuelta: no luchan por la posición. */
    inLane: Set<CarState>,
    L: number,
    restart: boolean,
    standing: boolean,
    fights: { att: CarState; def: CarState }[],
  ) {
    const placed: { car: CarState; t: number }[] = [];
    const collisions: { att: CarState; def: CarState }[] = [];
    for (const car of alive) {
      let t = nat.get(car) ?? car.cum + this.base;
      const lapT = t - car.cum;
      let k = placed.length;
      let fought = 0;
      while (k > 0) {
        const ahead = placed[k - 1];
        // Azar propio de cada duelo: recalcular una vuelta (al pedir boxes) no cambia los demás.
        const rng = this.localRng("fight", L, car.driverId, ahead.car.driverId);
        if (t >= ahead.t + 0.2) break;
        const aheadLap = ahead.t - ahead.car.cum;
        if (inLane.has(ahead.car) || aheadLap - lapT > 2.5) {
          k--;
          continue;
        }
        if (inLane.has(car)) {
          t = ahead.t + 0.2;
          break;
        }
        // Orden de mantener posiciones (o intercambio pendiente): no se atacan entre compañeros.
        const ord = car.teamId === ahead.car.teamId ? this.teamOrders.get(car.teamId) : undefined;
        if (ord === "hold" || ord === "swap") {
          t = ahead.t + range(rng, 0.3, 0.8);
          break;
        }
        if (fought >= (standing ? 3 : 2)) {
          t = ahead.t + range(rng, 0.2, 0.5);
          break;
        }
        fought++;
        const startGap = car.cum - ahead.car.cum;
        const expAdv = (expected.get(ahead.car) ?? aheadLap) - (expected.get(car) ?? lapT);
        const p = this.overtakeProb(car, ahead.car, expAdv, startGap, L, restart, standing);
        const attD = this.cfg.drivers[car.driverId];
        const pCol = 0.008 * (1 + (attD.aggression - 60) / 40) * (1 + this.wet) * (standing ? 2 : 1);
        if (rng() < pCol) collisions.push({ att: car, def: ahead.car });
        if (rng() < p) {
          ahead.t += range(rng, 0.05, 0.35);
          t = Math.min(t, ahead.t - range(rng, 0.1, 0.3));
          fights.push({ att: car, def: ahead.car });
          k--;
        } else {
          t = ahead.t + range(rng, 0.2, 0.55);
          break;
        }
      }
      placed.splice(k, 0, { car, t });
    }

    for (const { att, def } of collisions) {
      if (att.status !== "run" || def.status !== "run") continue;
      const rng = this.localRng("contact", L, att.driverId, def.driverId);
      const r = rng();
      const tAtt = placed.find((p) => p.car === att);
      const tDef = placed.find((p) => p.car === def);
      if (!tAtt || !tDef) continue;
      const when = (tAtt.t + att.cum) / 2;
      if (r < 0.12) {
        const victim = rng() < 0.5 ? att : def;
        this.retire(victim, L, "Colisión", tAtt.t - att.cum, false);
        this.log(when, L, "dnf", `¡Contacto entre ${att.code} y ${def.code}! ${victim.code} abandona`, [att.driverId, def.driverId]);
        this.triggerNeutralisation(rng() < 0.6 ? "sc" : "vsc", when);
        this.maybeRedFlag(0.08 + this.wet * 0.15, when);
        if (rng() < 0.5) {
          att.penalty += 10;
          this.log(when + 30, L, "penalty", `${att.code}: 10 s de penalización por provocar una colisión`, [att.driverId]);
        }
      } else {
        tAtt.t += range(rng, 1, 4);
        tDef.t += range(rng, 1, 5);
        this.log(when, L, "incident", `Toque entre ${att.code} y ${def.code}`, [att.driverId, def.driverId]);
        if (r < 0.45) tDef.t += this.applyDamage(def, 0.6, when + 1, L, `en el toque con ${att.code}`);
        if (r < 0.3) tAtt.t += this.applyDamage(att, 0.5, when + 1, L, `en el toque con ${def.code}`);
        if (rng() < 0.35) {
          att.penalty += 5;
          this.log(when + 30, L, "penalty", `${att.code}: 5 s de penalización por provocar una colisión`, [att.driverId]);
        }
      }
    }

    const survivors = placed.filter((p) => p.car.status === "run");
    if (collisions.length > 0) {
      // Los coches implicados en un toque se recolocan según su nuevo tiempo.
      const involved = new Set(collisions.flatMap((c) => [c.att, c.def]));
      const others = survivors.filter((p) => !involved.has(p.car));
      for (const p of survivors.filter((x) => involved.has(x.car))) {
        let i = others.findIndex((o) => o.t > p.t);
        if (i < 0) i = others.length;
        others.splice(i, 0, p);
      }
      return others;
    }
    return survivors;
  }

  /**
   * Probabilidad de completar un adelantamiento. `paceAdv` es la ventaja de ritmo esperada (s/vuelta);
   * DRS, modo adelantamiento del ERS y estilo de conducción la aumentan, y cada circuito exige un mínimo.
   */
  private overtakeProb(att: CarState, def: CarState, paceAdv: number, startGap: number, L: number, restart: boolean, standing: boolean): number {
    const ease = this.circuit.overtaking;
    const a = this.cfg.drivers[att.driverId];
    const d = this.cfg.drivers[def.driverId];
    let adv = paceAdv;
    if (SERIES_CFG[this.series].hasDrs && L > 2 && this.wet < 0.25 && startGap < 1.0 && !restart) adv += 0.35;
    if (this.hasErs) {
      if (att.ers === 2 && att.battery > 20) adv += 0.3;
      if (def.ers === 2 && def.battery > 20) adv -= 0.15;
    }
    adv += (att.style - 2) * 0.06 - (def.style - 2) * 0.03;
    adv += (def.wear - att.wear) * 0.004;
    if (standing) adv += 0.45;
    if (restart) adv += 0.15;
    if (this.wet > 0.3) adv += 0.15;
    const required = 0.3 + Math.pow(1 - ease, 1.3) * 1.5;
    const p = 1 / (1 + Math.exp(-(adv - required) / 0.18)) + (a.racecraft - d.racecraft) * 0.004;
    return clamp(p, 0.01, 0.9);
  }

  private finish() {
    this.done = true;
    const N = this.totalLaps;
    const leaders = this.cars.filter((c) => c.status === "run" && c.laps.length >= N);
    if (leaders.length === 0) return;
    const winner = leaders.reduce((a, b) => (a.laps[N - 1].end < b.laps[N - 1].end ? a : b));
    const tWin = winner.laps[N - 1].end;
    this.winnerTime = tWin;
    for (const c of this.cars) {
      const idx = c.laps.findIndex((r) => r.end >= tWin - 1e-9);
      if (c.status === "run" && idx >= 0) {
        c.flagLap = idx + 1;
        c.finishTime = c.laps[idx].end;
      } else if (c.status === "dnf" && idx >= 0) {
        // Abandonó después de recibir la bandera a cuadros.
        c.status = "run";
        c.flagLap = idx + 1;
        c.finishTime = c.laps[idx].end;
      }
    }
    for (const e of this.classification()) {
      const c = this.car(e.driverId);
      if (!c.isPlayer || e.status !== "FIN" || c.finishTime === undefined) continue;
      const msg =
        e.pos === 1
          ? ["¡¡Síííí!! ¡Ganamos! ¡Increíble, chicos!", "¡VICTORIA! ¡Gracias a todo el equipo!"]
          : e.pos <= 3
            ? ["¡Podio! ¡Gran trabajo, equipo!", "¡Al podio! Buen trabajo, chicos"]
            : e.pos <= 10
              ? ["Puntos. Buen trabajo de todos", "Algo es algo: sumamos puntos"]
              : ["No ha sido nuestro día", "Hoy no teníamos ritmo, a por la próxima"];
      this.radio(c, "finish", this.say(msg), c.finishTime + 3, 999);
    }
  }

  runToEnd() {
    let guard = 0;
    while (!this.done && guard++ < 500) this.step();
  }

  // ───────────────────────────── resultados ─────────────────────────────

  classification(): ClassEntry[] {
    const fin = this.cars.filter((c) => c.status === "run" && c.flagLap !== undefined);
    const dnf = this.cars.filter((c) => !(c.status === "run" && c.flagLap !== undefined));
    fin.sort((a, b) => (b.flagLap ?? 0) - (a.flagLap ?? 0) || (a.finishTime ?? 0) + a.penalty - ((b.finishTime ?? 0) + b.penalty));
    dnf.sort((a, b) => b.laps.length - a.laps.length || (b.dnfTime ?? 0) - (a.dnfTime ?? 0));
    const leader = fin[0];
    const leaderTotal = leader ? (leader.finishTime ?? 0) + leader.penalty : 0;
    const entries: ClassEntry[] = [];
    fin.forEach((c, i) => {
      const total = (c.finishTime ?? 0) + c.penalty;
      const down = (leader?.flagLap ?? 0) - (c.flagLap ?? 0);
      entries.push({
        driverId: c.driverId,
        teamId: c.teamId,
        pos: i + 1,
        grid: c.grid,
        status: "FIN",
        laps: c.flagLap ?? 0,
        time: total,
        gap: i === 0 ? "" : down > 0 ? `+${down} ${down === 1 ? "vuelta" : "vueltas"}` : `+${(total - leaderTotal).toFixed(3)} s`,
        points: 0,
        pits: c.pits,
        bestLap: c.bestLap,
        penalty: c.penalty,
        fastest: this.fastest?.driverId === c.driverId,
      });
    });
    dnf.forEach((c, i) => {
      entries.push({
        driverId: c.driverId,
        teamId: c.teamId,
        pos: fin.length + i + 1,
        grid: c.grid,
        status: "DNF",
        reason: c.dnfReason,
        laps: c.laps.length,
        time: 0,
        gap: c.dnfReason ?? "Abandono",
        points: 0,
        pits: c.pits,
        bestLap: c.bestLap,
        penalty: c.penalty,
      });
    });
    return entries;
  }

  toResult(): RaceResult {
    return {
      series: this.series,
      weekendId: this.cfg.weekendId,
      round: this.cfg.round,
      kind: this.cfg.kind,
      name: this.cfg.name,
      circuitId: this.circuit.id,
      laps: this.totalLaps,
      weather: summarizeWeather(this.maxRain, this.maxWet),
      entries: this.classification(),
      fastestLap: this.fastest ?? undefined,
      poleId: this.cfg.poleId,
      scLaps: this.scLaps,
    };
  }

  // ───────────────────────────── visualización ─────────────────────────────

  /**
   * Vueltas recorridas (con fracción) por un coche en el instante `clock`. Por pista el coche va a
   * ritmo de carrera; el tiempo de boxes solo se pierde dentro del carril, entre su entrada y su salida.
   */
  progressAt(car: CarState, clock: number): number {
    if (car.status === "dnf" && car.dnfTime !== undefined && clock >= car.dnfTime) return car.dnfProgress ?? 0;
    if (car.finishTime !== undefined && clock >= car.finishTime) return car.flagLap ?? this.totalLaps;
    const lane = this.laneAt(car, clock);
    if (lane) return lane.progress;
    const laps = car.laps;
    const gridOff = ((car.grid - 1) * GRID_GAP) / this.base;
    const lastEnd = laps.length ? laps[laps.length - 1].end : 0;
    if (clock >= lastEnd && car.status === "dnf" && car.dnfTime !== undefined && car.dnfProgress !== undefined) {
      // Vuelta en la que abandona: avanza hasta el punto donde se para.
      let s0 = laps.length ? laps.length - (laps[laps.length - 1].parkOff ?? 0) : -gridOff;
      let t0 = laps.length ? Math.max(lastEnd, car.cum) : 0;
      const out = car.visits.find((v) => v.lap === laps.length && v.exit !== undefined);
      if (out?.exit !== undefined) {
        s0 = laps.length + out.outFrac;
        t0 = out.exit;
      }
      if (clock < t0 || car.dnfTime <= t0) return s0;
      return s0 + ((clock - t0) / (car.dnfTime - t0)) * Math.max(0, car.dnfProgress - s0);
    }
    if (laps.length === 0) return -gridOff;
    let lo = 0;
    let hi = laps.length - 1;
    // Vuelta ya calculada por completo: el coche espera (p. ej. parado en parrilla) a que se calcule la siguiente.
    if (clock >= laps[hi].end) return laps.length - (laps[hi].parkOff ?? 0);
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (laps[mid].end <= clock) lo = mid + 1;
      else hi = mid;
    }
    const rec = laps[lo];
    const prev = lo > 0 ? laps[lo - 1] : undefined;
    let s0 = lo - (prev ? prev.parkOff ?? 0 : gridOff);
    let t0 = Math.max(0, rec.start);
    if (clock < t0) return s0;
    let s1 = lo + 1 - (rec.parkOff ?? 0);
    let t1 = rec.end;
    // Tramos de esta vuelta dentro del carril de boxes: salida al principio, entrada al final.
    const out = car.visits.find((v) => v.lap === lo && v.exit !== undefined);
    if (out?.exit !== undefined) {
      s0 = lo + out.outFrac;
      t0 = out.exit;
    }
    const enter = car.visits.find((v) => v.lap === lo + 1);
    if (enter) {
      s1 = lo + 1 - enter.inFrac;
      t1 = enter.entry;
    }
    if (t1 <= t0) return s0;
    return s0 + (clamp(clock, t0, t1) - t0) / (t1 - t0) * (s1 - s0);
  }

  /**
   * Posición dentro del carril de boxes, o null si el coche no está en él. `boxed` indica que está
   * parado en su garaje.
   */
  laneAt(car: CarState, clock: number): { progress: number; boxed: boolean } | null {
    for (let i = car.visits.length - 1; i >= 0; i--) {
      const v = car.visits[i];
      if (clock < v.entry) continue;
      const exit = v.exit ?? v.line + v.stationary + this.base * v.outFrac + 6;
      if (clock > exit) return null;
      const boxed = clock >= v.stopStart && clock <= v.stopEnd;
      const path: [number, number][] =
        clock <= v.line
          ? v.box < 0
            ? [[v.entry, -v.inFrac], [v.stopStart, v.box], [v.stopEnd, v.box], [v.line, 0]]
            : [[v.entry, -v.inFrac], [v.line, 0]]
          : v.box >= 0
            ? [[v.line, 0], [v.stopStart, v.box], [v.stopEnd, v.box], [exit, v.outFrac]]
            : [[v.line, 0], [exit, v.outFrac]];
      return { progress: v.lap + interpolate(path, clock), boxed };
    }
    return null;
  }

  /** ¿Está el coche en el carril de boxes en el instante `clock`? */
  inPitAt(car: CarState, clock: number): boolean {
    return this.laneAt(car, clock) !== null;
  }

  /** Vuelta del líder (1..N) en el instante `clock`. */
  leaderLapAt(clock: number): number {
    let best = 0;
    for (const c of this.cars) best = Math.max(best, Math.floor(this.progressAt(c, clock)) + 1);
    return Math.min(this.totalLaps, Math.max(1, best));
  }

  statusAt(clock: number): LapStatus {
    const lap = this.leaderLapAt(clock);
    return this.statusByLap[lap - 1] ?? "green";
  }

  completedAt(car: CarState, clock: number): { k: number; lastT: number } {
    let k = 0;
    const cap = car.flagLap ?? Infinity;
    while (k < car.laps.length && k < cap && car.laps[k].end <= clock) k++;
    return { k, lastT: k > 0 ? car.laps[k - 1].end : car.startOffset };
  }

  /** Clasificación en directo tal y como la marcan los cronos en la línea de meta. */
  towerAt(clock: number): TowerRow[] {
    const rows: TowerRow[] = this.cars.map((car) => {
      const { k, lastT } = this.completedAt(car, clock);
      const out = car.status === "dnf" && car.dnfTime !== undefined && clock >= car.dnfTime;
      return {
        car,
        completed: out ? -1 : k,
        lastT: out ? car.dnfTime ?? 0 : lastT,
        inPit: !out && this.inPitAt(car, clock),
        finished: car.finishTime !== undefined && clock >= car.finishTime,
        gapLeader: "",
        interval: "",
        out,
      };
    });
    rows.sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.out) return b.lastT - a.lastT;
      if (b.completed !== a.completed) return b.completed - a.completed;
      if (a.completed === 0) return a.car.grid - b.car.grid;
      return a.lastT - b.lastT;
    });
    const leader = rows[0];
    rows.forEach((r, i) => {
      if (r.out) {
        r.gapLeader = r.interval = "OUT";
        return;
      }
      if (i === 0 || r.completed === 0) {
        r.gapLeader = r.interval = i === 0 ? "Líder" : "";
        return;
      }
      const gap = (other: (typeof rows)[number]) => {
        let down = 0;
        for (let j = r.completed; j < other.car.laps.length && j < other.completed; j++) {
          if (other.car.laps[j].end <= r.lastT) down++;
        }
        if (down > 0) return `+${down} V`;
        const ref = other.car.laps[r.completed - 1]?.end ?? other.lastT;
        return `+${Math.max(0, r.lastT - ref).toFixed(3)}`;
      };
      r.gapLeader = gap(leader);
      r.interval = gap(rows[i - 1]);
    });
    return rows;
  }

  /** Estado interpolado del coche durante la vuelta en curso (para el panel del muro). */
  liveState(car: CarState, clock: number) {
    const prog = this.progressAt(car, clock);
    const idx = Math.max(0, Math.min(car.laps.length - 1, Math.floor(prog)));
    const rec = car.laps[idx];
    const prev = idx > 0 ? car.laps[idx - 1] : undefined;
    const f = clamp(prog - Math.floor(prog), 0, 1);
    if (!rec) {
      return { lap: 1, compound: car.compound, wear: car.wear, temp: car.temp, fuel: car.fuel, battery: car.battery, tyreAge: 0 };
    }
    // Neumáticos nuevos tras una parada o tras la bandera roja (vuelta que acaba parado en parrilla).
    const freshAfter = (r: LapRecord) => !!r.pitCompound || r.parkOff !== undefined;
    const startWear = prev ? (freshAfter(prev) ? prev.pitWear ?? 0 : prev.wear) : (this.cfg.startSets?.[car.driverId]?.wear ?? 0);
    const startFuel = prev ? prev.fuel : this.startFuel;
    const startBat = prev ? prev.battery : 60;
    const startTemp = prev ? (freshAfter(prev) ? SERIES_CFG[this.series].blanketTemp : prev.temp) : SERIES_CFG[this.series].blanketTemp;
    let age = 0;
    for (let i = idx; i >= 0; i--) {
      age++;
      if (i > 0 && freshAfter(car.laps[i - 1])) break;
    }
    return {
      lap: Math.min(this.totalLaps, idx + 1),
      compound: rec.compound,
      wear: startWear + (rec.wear - startWear) * f,
      temp: startTemp + (rec.temp - startTemp) * f,
      fuel: startFuel + (rec.fuel - startFuel) * f,
      battery: startBat + (rec.battery - startBat) * f,
      tyreAge: age,
    };
  }
}
