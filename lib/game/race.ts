import { basePct, baseLap, reliabilityRating, SERIES_CFG } from "./perf";
import { clamp, gauss, mulberry32, pick, range, type Rng } from "./rng";
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
  Team,
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

export type LapStatus = "green" | "sc" | "vsc";

export interface LapRecord {
  lap: number;
  time: number;
  end: number;
  compound: Compound;
  wear: number;
  temp: number;
  fuel: number;
  battery: number;
  pos: number;
  pitTime: number;
  pitCompound?: Compound;
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
  damage: number;
  powerLoss: number;
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
}

export type RaceEventType = "overtake" | "pit" | "dnf" | "sc" | "vsc" | "restart" | "weather" | "incident" | "penalty" | "fastest" | "info";

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
  private rng: Rng;
  private startFuel: number;
  private pendingSc: { kind: "sc" | "vsc"; time: number } | null = null;
  private trackLimits = new Map<string, number>();
  private maxRain = 0;
  private maxWet = 0;

  constructor(cfg: RaceConfig) {
    this.cfg = cfg;
    this.series = cfg.series;
    this.circuit = cfg.circuit;
    this.totalLaps = cfg.laps;
    this.base = baseLap(cfg.series, cfg.circuit);
    this.dry = dryCompounds(cfg.series, cfg.circuit);
    this.hasErs = SERIES_CFG[cfg.series].hasErs;
    this.rng = mulberry32(cfg.seed);
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
  }

  // ───────────────────────────── preparación ─────────────────────────────

  private makeCar(id: string, idx: number): CarState {
    const d = this.cfg.drivers[id];
    const team = this.cfg.teams[d.teamId];
    const isPlayer = this.cfg.playerTeamId === team.id;
    const chosen = this.cfg.startCompounds?.[id];
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
      wear: 0,
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
      powerLoss: 0,
      bestLap: Infinity,
      bestLapNo: 0,
      plan,
      wetThreshold: range(this.rng, 0.16, 0.3),
      dryThreshold: range(this.rng, 0.07, 0.16),
      startOffset: idx * 0.22,
      setupQ: this.cfg.setupQ[id] ?? 0.8,
      liftCoast: false,
    };
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
    for (const c of this.dry) {
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

  private pitTime(car: CarState, status: LapStatus): number {
    const team = this.cfg.teams[car.teamId];
    const cfgS = SERIES_CFG[this.series];
    const lossFactor = status === "sc" ? 0.55 : status === "vsc" ? 0.65 : 1;
    let stationary = cfgS.pitStationary + (100 - team.pitCrew) * 0.025 + Math.abs(gauss(this.rng)) * 0.25;
    if (this.rng() < 0.03 + (100 - team.pitCrew) * 0.002) {
      const extra = range(this.rng, 2, 7);
      stationary += extra;
      this.log(car.cum, this.lap, "pit", `Parada lenta para ${car.code}: ${stationary.toFixed(1)} s`, [car.driverId]);
    }
    if (car.damage > 0) stationary += 6;
    return this.circuit.pitLoss * lossFactor + stationary;
  }

  private retire(car: CarState, L: number, reason: string, lapTimeGuess: number, important = true) {
    car.status = "dnf";
    car.dnfReason = reason;
    car.dnfLap = L;
    const part = range(this.rng, 0.15, 0.9);
    car.dnfTime = car.cum + lapTimeGuess * part;
    car.dnfProgress = L - 1 + part;
    if (important) this.log(car.dnfTime, L, "dnf", `${car.code} abandona: ${reason}`, [car.driverId]);
  }

  private triggerNeutralisation(kind: "sc" | "vsc", time: number) {
    if (this.pendingSc?.kind === "sc") return;
    this.pendingSc = { kind, time };
  }

  step(): void {
    if (this.done) return;
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

    if (this.rain > 0.05 && prevRain <= 0.05) this.log(leaderStart, L, "weather", "🌧️ Empieza a llover sobre el circuito", []);
    if (this.rain <= 0.05 && prevRain > 0.05) this.log(leaderStart, L, "weather", "🌤️ Deja de llover", []);
    if (this.wet >= 0.18 && prevWet < 0.18) this.log(leaderStart, L, "weather", "💧 La pista ya está mojada: hora de los intermedios", []);
    if (this.wet < 0.18 && prevWet >= 0.18) this.log(leaderStart, L, "weather", "☀️ Se forma una línea seca: los neumáticos de seco vuelven a ser opción", []);
    if (this.wet >= 0.85 && prevWet < 0.85) this.log(leaderStart, L, "weather", "🌊 Pista encharcada: neumáticos de lluvia extrema", []);

    // Estado de neutralización de esta vuelta.
    let status: LapStatus = "green";
    if (this.sc.kind !== "none") {
      if (this.sc.lapsLeft > 0) {
        status = this.sc.kind;
        this.sc.lapsLeft--;
      } else {
        this.log(leaderStart, L, "restart", this.sc.kind === "sc" ? "🟢 El coche de seguridad entra: ¡relanzamiento!" : "🟢 Fin del VSC: bandera verde", []);
        this.sc = { kind: "none", lapsLeft: 0 };
      }
    }
    if (status !== "green") this.scLaps++;
    this.statusByLap.push(status);
    const restart = status === "green" && L > 1 && this.statusByLap[L - 2] !== "green";

    // Decisiones.
    order.forEach((car, idx) => {
      if (car.auto) this.aiDecide(car, L, order, idx);
      else if (this.hasErs && car.ers === 2 && car.battery < 8) car.ers = 1;
      if (L === N) car.pitRequest = null;
    });

    // Tiempos naturales.
    const nat = new Map<CarState, number>();
    const expected = new Map<CarState, number>();
    const pitting = new Map<CarState, number>();
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
      let fuelUse = ENGINE_FUEL[engine] * (status === "sc" ? 0.5 : status === "vsc" ? 0.6 : 1);
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
      pct += car.damage + car.powerLoss;
      if (car.liftCoast) pct += 1.2;
      pct -= evolution;
      expected.set(car, this.base * (1 + pct / 100));
      pct += gauss(rng) * (cfgS.raceNoise + (100 - d.consistency) * 0.008);
      let t = car.cum + this.base * (1 + pct / 100);

      if (L === 1) {
        t += car.startOffset;
        if (!this.startUnderSc) t += this.base * 0.035 + gauss(rng) * (0.12 + (100 - d.start) * 0.01) + (this.wet > 0.3 ? gauss(rng) * 0.4 : 0);
      }

      // Neumáticos: desgaste y temperatura.
      const isW = isWetTyre(car.compound);
      let target = 70 + 8 * car.style + (this.trackTemp - 30) * 0.6 + (engine - 1) * 1.5 - this.wet * 25;
      if (isW && this.wet < 0.3) target += (0.3 - this.wet) * 80;
      if (status === "sc") target -= 25;
      if (status === "vsc") target -= 18;
      car.temp += (target - car.temp) * 0.55;
      let rate = sp.wear * this.circuit.wear * STYLE_WEAR[car.style] * (1 + (80 - d.tyre) * 0.008) * tempWearFactor(car.compound, car.temp);
      if (isW && this.wet < 0.25) rate *= 1 + (0.25 - this.wet) * 12;
      if (status === "sc") rate *= 0.25;
      if (status === "vsc") rate *= 0.4;
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
      if (status !== "sc") {
        const lapGuess = t - car.cum;
        const calm = status === "vsc" ? 0.3 : 1;
        const rel = reliabilityRating(team, this.cfg.pus);
        const pMech = Math.pow(Math.max(0, 100 - rel), 1.5) * 1.6e-5 * ENGINE_REL[engine] * calm;
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
        }

        const slickPen = isW ? 0 : wetPenalty(car.compound, this.wet);
        const cold = car.temp < TEMP_WINDOW[car.compound][0] - 10 ? 1.5 : 1;
        const errMult = STYLE_ERR[car.style] * (1 + (100 - d.consistency) / 30) * (1 + slickPen / 6) * (car.wear > 80 ? 1.6 : 1) * (1 + this.wet * 1.5) * cold;
        if (rng() < 0.004 * errMult * calm) {
          const r = rng();
          if (r < 0.04 * (1 + this.wet)) {
            this.retire(car, L, "Accidente", lapGuess);
            this.triggerNeutralisation(rng() < (this.circuit.street ? 0.75 : 0.5) + this.circuit.sc * 0.2 ? "sc" : "vsc", car.dnfTime ?? car.cum);
            continue;
          } else if (r < 0.22) {
            t += range(rng, 6, 16);
            car.wear = Math.min(100, car.wear + 6);
            this.log(car.cum + lapGuess * 0.5, L, "incident", `Trompo de ${car.code}`, [car.driverId]);
          } else {
            t += range(rng, 0.8, 3.5);
            if (car.isPlayer) this.log(car.cum + lapGuess * 0.5, L, "incident", `${car.code} se pasa de frenada y pierde tiempo`, [car.driverId]);
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
          if (L < N && !car.pitRequest) car.pitRequest = isW ? car.compound : this.dryChoice(car, L);
        }

        if (L === 1 && !this.startUnderSc && idx > 2 && rng() < 0.03 + this.wet * 0.03) {
          const r = rng();
          if (r < 0.1) {
            this.retire(car, L, "Colisión en la salida", lapGuess);
            this.triggerNeutralisation("sc", car.dnfTime ?? car.cum);
            continue;
          }
          t += range(rng, 1, 5);
          if (r < 0.4) car.damage += range(rng, 0.4, 1.2);
          this.log(lapGuess * 0.2, L, "incident", `Toque en la salida: ${car.code} pierde posiciones${r < 0.4 ? " y daña el alerón" : ""}`, [car.driverId]);
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

      if (car.pitRequest && L < N) {
        const pt = this.pitTime(car, status);
        pitting.set(car, pt);
        t += pt;
      } else {
        car.pitRequest = L < N ? car.pitRequest : null;
      }
      nat.set(car, t);
    }

    if (status === "green" && rng() < this.circuit.sc * 0.0008) {
      this.triggerNeutralisation(rng() < 0.5 ? "vsc" : "sc", leaderStart + this.base * 0.5);
      if (this.pendingSc) this.pendingSc.time = leaderStart + this.base * 0.5;
    }
    if (status === "green" && this.wet > 0.92 && this.rain > 0.75 && rng() < 0.4) this.triggerNeutralisation("sc", leaderStart + this.base * 0.3);

    const alive = order.filter((c) => c.status === "run" && nat.has(c));
    let final: { car: CarState; t: number }[];
    const fights: { att: CarState; def: CarState }[] = [];

    if (status === "sc") {
      const scLap = this.base * 1.45;
      const items = alive.map((car, i) => ({ car, i, earliest: car.cum + scLap * 0.72 + (pitting.get(car) ?? 0) }));
      items.sort((a, b) => a.earliest - b.earliest || a.i - b.i);
      final = [];
      let prev = -Infinity;
      items.forEach((it, i) => {
        let t = Math.max(it.earliest, prev + 0.6);
        if (i === 0) t = Math.max(t, it.car.cum + scLap + (pitting.get(it.car) ?? 0));
        prev = t;
        final.push({ car: it.car, t });
      });
    } else if (status === "vsc") {
      const vscLap = this.base * 1.32;
      final = alive.map((car) => ({ car, t: car.cum + vscLap + (pitting.get(car) ?? 0) + (L === 1 ? car.startOffset : 0) }));
      final.sort((a, b) => a.t - b.t);
    } else {
      final = this.resolveGreenLap(alive, nat, expected, pitting, L, restart, fights);
    }

    for (let i = 1; i < final.length; i++) {
      if (final[i].t < final[i - 1].t + 0.08) final[i].t = final[i - 1].t + 0.08;
    }

    final.forEach(({ car, t }, i) => {
      const lapTime = t - car.cum;
      car.cum = t;
      const pt = pitting.get(car) ?? 0;
      const rec: LapRecord = {
        lap: L,
        time: lapTime,
        end: t,
        compound: car.compound,
        wear: car.wear,
        temp: car.temp,
        fuel: car.fuel,
        battery: car.battery,
        pos: i + 1,
        pitTime: pt,
      };
      if (pt === 0 && lapTime < car.bestLap) {
        car.bestLap = lapTime;
        car.bestLapNo = L;
        if (!this.fastest || lapTime < this.fastest.time) {
          this.fastest = { driverId: car.driverId, time: lapTime, lap: L };
          if (L > 3) this.log(t, L, "fastest", `⏱️ Vuelta rápida de ${car.code}`, [car.driverId]);
        }
      }
      if (pt > 0 && car.pitRequest) {
        const nc = car.pitRequest;
        rec.pitCompound = nc;
        this.log(t - pt * 0.5, L, "pit", `${car.code} para en boxes → ${nc} (P${i + 1})`, [car.driverId]);
        car.compound = nc;
        car.wear = 0;
        car.tyreAge = 0;
        car.temp = SERIES_CFG[this.series].blanketTemp;
        car.pits++;
        car.damage = 0;
        if (isWetTyre(nc)) car.usedWet = true;
        else if (!car.usedDry.includes(nc)) car.usedDry.push(nc);
        car.pitRequest = null;
        if (car.auto && !isWetTyre(nc)) car.plan = car.plan.filter((s) => s.lap > L);
        if (this.rng() < 0.004) {
          car.penalty += 5;
          this.log(t, L, "penalty", `${car.code}: 5 s de penalización por salida insegura de boxes`, [car.driverId]);
        }
      }
      car.laps.push(rec);
    });

    for (const f of fights) {
      if (f.att.status !== "run") continue;
      const pos = final.findIndex((x) => x.car === f.att) + 1;
      const aRec = f.att.laps[f.att.laps.length - 1];
      this.log(aRec.end - aRec.time * 0.4, L, "overtake", `${f.att.code} adelanta a ${f.def.code} por P${pos}`, [f.att.driverId, f.def.driverId]);
    }

    if (this.pendingSc && this.sc.kind === "none" && L < N - 1) {
      const kind = this.pendingSc.kind;
      this.sc = { kind, lapsLeft: kind === "sc" ? 3 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2) };
      this.log(this.pendingSc.time + 2, L, kind, kind === "sc" ? "🟡 ¡COCHE DE SEGURIDAD en pista!" : "🟡 Coche de seguridad virtual (VSC)", []);
    }
    this.pendingSc = null;

    if (L >= N || this.running().length === 0) this.finish();
  }

  private resolveGreenLap(
    alive: CarState[],
    nat: Map<CarState, number>,
    expected: Map<CarState, number>,
    pitting: Map<CarState, number>,
    L: number,
    restart: boolean,
    fights: { att: CarState; def: CarState }[],
  ) {
    const rng = this.rng;
    const placed: { car: CarState; t: number }[] = [];
    const collisions: { att: CarState; def: CarState }[] = [];
    for (const car of alive) {
      let t = nat.get(car) ?? car.cum + this.base;
      const lapT = t - car.cum;
      let k = placed.length;
      let fought = 0;
      while (k > 0) {
        const ahead = placed[k - 1];
        if (t >= ahead.t + 0.2) break;
        const aheadLap = ahead.t - ahead.car.cum;
        if (pitting.has(ahead.car) || aheadLap - lapT > 2.5) {
          k--;
          continue;
        }
        if (pitting.has(car)) {
          t = ahead.t + 0.2;
          break;
        }
        if (fought >= (L === 1 ? 3 : 2)) {
          t = ahead.t + range(rng, 0.2, 0.5);
          break;
        }
        fought++;
        const startGap = car.cum - ahead.car.cum;
        const expAdv = (expected.get(ahead.car) ?? aheadLap) - (expected.get(car) ?? lapT);
        const p = this.overtakeProb(car, ahead.car, expAdv, startGap, L, restart);
        const attD = this.cfg.drivers[car.driverId];
        const pCol = 0.008 * (1 + (attD.aggression - 60) / 40) * (1 + this.wet) * (L === 1 ? 2 : 1);
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
        if (rng() < 0.5) {
          att.penalty += 10;
          this.log(when + 30, L, "penalty", `${att.code}: 10 s de penalización por provocar una colisión`, [att.driverId]);
        }
      } else {
        tAtt.t += range(rng, 1, 4);
        tDef.t += range(rng, 1, 5);
        if (r < 0.45) def.damage += range(rng, 0.3, 1.0);
        if (r < 0.3) att.damage += range(rng, 0.3, 1.0);
        this.log(when, L, "incident", `Toque entre ${att.code} y ${def.code}`, [att.driverId, def.driverId]);
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
  private overtakeProb(att: CarState, def: CarState, paceAdv: number, startGap: number, L: number, restart: boolean): number {
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
    if (L === 1) adv += 0.45;
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

  /** Vueltas recorridas (con fracción) por un coche en el instante `clock`. */
  progressAt(car: CarState, clock: number): number {
    if (car.status === "dnf" && car.dnfTime !== undefined && clock >= car.dnfTime) return car.dnfProgress ?? 0;
    if (car.finishTime !== undefined && clock >= car.finishTime) return car.flagLap ?? this.totalLaps;
    const laps = car.laps;
    if (laps.length === 0) return -car.startOffset / this.base;
    let lo = 0;
    let hi = laps.length - 1;
    if (clock >= laps[hi].end) return laps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (laps[mid].end <= clock) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) {
      const off = car.startOffset / this.base;
      return -off + (Math.max(0, clock) / laps[0].end) * (1 + off);
    }
    const start = laps[lo - 1].end;
    return lo + (clock - start) / (laps[lo].end - start);
  }

  /** ¿Está el coche en el carril de boxes en el instante `clock`? */
  inPitAt(car: CarState, clock: number): boolean {
    for (let i = car.laps.length - 1; i >= 0; i--) {
      const r = car.laps[i];
      if (r.end < clock) return false;
      if (r.pitTime > 0 && clock >= r.end - r.pitTime && clock <= r.end) return true;
    }
    return false;
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
    const startWear = prev ? (prev.pitCompound ? 0 : prev.wear) : 0;
    const startFuel = prev ? prev.fuel : this.startFuel;
    const startBat = prev ? prev.battery : 60;
    const startTemp = prev ? (prev.pitCompound ? SERIES_CFG[this.series].blanketTemp : prev.temp) : SERIES_CFG[this.series].blanketTemp;
    let age = 0;
    for (let i = idx; i >= 0; i--) {
      age++;
      if (i > 0 && car.laps[i - 1].pitCompound) break;
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
