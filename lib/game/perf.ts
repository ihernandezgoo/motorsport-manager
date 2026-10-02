import type { Circuit, Driver, PowerUnit, SeriesId, Team } from "./types";

export interface SeriesConfig {
  /** Factor sobre el tiempo de vuelta de F1. */
  lapFactor: number;
  /** % de tiempo por cada punto de coche por debajo de 100. */
  carK: number;
  /** % de tiempo por cada punto de piloto por debajo de 100. */
  drvK: number;
  raceNoise: number;
  qualiNoise: number;
  pitStationary: number;
  /** Penalización (%) con el depósito lleno respecto a vacío. */
  fuelEffect: number;
  hasErs: boolean;
  hasDrs: boolean;
  /** Temperatura de los neumáticos al salir de boxes (mantas calefactoras). */
  blanketTemp: number;
  pointsMoney: number;
  runningCost: number;
  currency: string;
}

export const SERIES_CFG: Record<SeriesId, SeriesConfig> = {
  f1: { lapFactor: 1, carK: 0.09, drvK: 0.035, raceNoise: 0.15, qualiNoise: 0.1, pitStationary: 2.4, fuelEffect: 2.0, hasErs: true, hasDrs: false, blanketTemp: 70, pointsMoney: 0.08, runningCost: 4, currency: "M€" },
  f2: { lapFactor: 1.11, carK: 0.045, drvK: 0.04, raceNoise: 0.2, qualiNoise: 0.13, pitStationary: 3.4, fuelEffect: 1.6, hasErs: false, hasDrs: true, blanketTemp: 55, pointsMoney: 0.004, runningCost: 0.16, currency: "M€" },
  f3: { lapFactor: 1.22, carK: 0.045, drvK: 0.04, raceNoise: 0.22, qualiNoise: 0.14, pitStationary: 3.8, fuelEffect: 1.1, hasErs: false, hasDrs: true, blanketTemp: 50, pointsMoney: 0.002, runningCost: 0.08, currency: "M€" },
};

export function engineRating(team: Team, pus: Record<string, PowerUnit>): number {
  return team.pu ? pus[team.pu].power : team.car.engine;
}

export function reliabilityRating(team: Team, pus: Record<string, PowerUnit>): number {
  return team.pu ? (team.car.reliability + pus[team.pu].reliability) / 2 : team.car.reliability;
}

export function carScore(team: Team, pus: Record<string, PowerUnit>, power = 0.5, downforce = 0.5): number {
  const wE = 0.2 + 0.35 * power;
  const rest = 1 - wE;
  const wA = rest * (0.45 + 0.3 * downforce);
  const wC = rest - wA;
  return wA * team.car.aero + wE * engineRating(team, pus) + wC * team.car.chassis;
}

export function carScoreAt(team: Team, pus: Record<string, PowerUnit>, circuit: Circuit): number {
  return carScore(team, pus, circuit.power, circuit.downforce);
}

export function effectivePace(d: Driver, wet: number): number {
  const k = Math.min(1, wet) * 0.6;
  return d.pace * (1 - k) + d.wet * k;
}

export function driverOverall(d: Driver): number {
  return Math.round(d.pace * 0.4 + d.racecraft * 0.2 + d.consistency * 0.15 + d.tyre * 0.1 + d.wet * 0.1 + d.feedback * 0.05);
}

/** Desfase de rendimiento (en % del tiempo de vuelta) por coche, piloto y reglaje. */
export function basePct(series: SeriesId, team: Team, d: Driver, pus: Record<string, PowerUnit>, circuit: Circuit, wet: number, setupQ: number): number {
  const cfg = SERIES_CFG[series];
  return (
    (100 - carScoreAt(team, pus, circuit)) * cfg.carK +
    (100 - effectivePace(d, wet)) * cfg.drvK +
    (1 - setupQ) * 0.5
  );
}

export function baseLap(series: SeriesId, circuit: Circuit): number {
  return circuit.lap * SERIES_CFG[series].lapFactor;
}

export function formatLap(t: number | null | undefined): string {
  if (t == null || !isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function formatRaceTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}` : `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function formatMoney(m: number): string {
  if (Math.abs(m) >= 10) return `${m.toFixed(1)} M€`;
  if (Math.abs(m) >= 1) return `${m.toFixed(2)} M€`;
  return `${Math.round(m * 1000)} k€`;
}
