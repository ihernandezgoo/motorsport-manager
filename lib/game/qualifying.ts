import { basePct, baseLap, SERIES_CFG } from "./perf";
import { gauss, range, type Rng } from "./rng";
import { dryCompounds, isWetTyre, spec, wetPenalty } from "./tyres";
import type { Circuit, Compound, Driver, PowerUnit, QualiEntry, QualiResult, SeriesId, Team, WeatherPlan } from "./types";
import { rainAt, wetnessAt } from "./weather";

export interface QualiCtx {
  series: SeriesId;
  circuit: Circuit;
  drivers: Record<string, Driver>;
  teams: Record<string, Team>;
  pus: Record<string, PowerUnit>;
  setupQ: Record<string, number>;
  weather: WeatherPlan;
  sprint: boolean;
}

export type Risk = 0 | 1 | 2;

export interface QualiChoice {
  compound: Compound;
  risk: Risk;
}

export interface SegmentDef {
  name: string;
  keep: number;
}

export const RISK_LABELS = ["Seguro", "Normal", "Al límite"] as const;

export function qualiSegments(series: SeriesId, entrants: number, sprint: boolean): SegmentDef[] {
  if (series !== "f1") return [{ name: "Clasificación", keep: entrants }];
  const p = sprint ? "SQ" : "Q";
  return [
    { name: `${p}1`, keep: entrants - 6 },
    { name: `${p}2`, keep: 10 },
    { name: `${p}3`, keep: 10 },
  ];
}

/** Minuto de inicio y duración (min) de cada tanda dentro de la sesión, con las pausas entre tandas. */
export function segmentTiming(series: SeriesId, sprint: boolean): { start: number; minutes: number }[] {
  if (series !== "f1") return [{ start: 0, minutes: 30 }];
  return sprint
    ? [
        { start: 0, minutes: 12 },
        { start: 19, minutes: 10 },
        { start: 36, minutes: 8 },
      ]
    : [
        { start: 0, minutes: 18 },
        { start: 25, minutes: 15 },
        { start: 47, minutes: 12 },
      ];
}

function segmentFrac(idx: number, n: number) {
  return n === 1 ? 0.5 : [0.2, 0.55, 0.85][idx] ?? 0.5;
}

export function segmentConditions(plan: WeatherPlan, idx: number, n: number) {
  const f = segmentFrac(idx, n);
  return { wet: wetnessAt(plan, f), rain: rainAt(plan, f) };
}

/** Compuesto obligatorio (en seco) en la clasificación sprint de F1. */
export function forcedCompound(series: SeriesId, sprint: boolean, segIdx: number, wet: number): Compound | null {
  if (series === "f1" && sprint && wet < 0.18) return segIdx < 2 ? "M" : "S";
  return null;
}

export function aiQualiChoice(series: SeriesId, circuit: Circuit, wet: number, sprint: boolean, segIdx: number): QualiChoice {
  if (wet >= 0.85) return { compound: "W", risk: 1 };
  if (wet >= 0.18) return { compound: "I", risk: 1 };
  return { compound: forcedCompound(series, sprint, segIdx, wet) ?? dryCompounds(series, circuit)[0], risk: 1 };
}

/** Desfase (%) de una vuelta lanzada sin azar: coche, piloto, reglaje, compuesto, humedad y riesgo. */
export function qualiPct(ctx: QualiCtx, id: string, choice: QualiChoice, wet: number): number {
  const d = ctx.drivers[id];
  const team = ctx.teams[d.teamId];
  const c = choice.compound;
  let pct = basePct(ctx.series, team, d, ctx.pus, ctx.circuit, wet, ctx.setupQ[id] ?? 0.8);
  pct += isWetTyre(c) ? 0 : spec(ctx.series, c).pace * 1.2;
  pct += wetPenalty(c, wet) + wet * 6;
  pct += [0.15, 0, -0.2][choice.risk];
  return pct;
}

/** Ruido de una vuelta lanzada (% del tiempo), mayor en pilotos poco regulares. */
export function qualiNoise(ctx: QualiCtx, id: string, rng: Rng): number {
  return gauss(rng) * (SERIES_CFG[ctx.series].qualiNoise + (100 - ctx.drivers[id].consistency) * 0.006);
}

/** Probabilidad de cometer un error en una vuelta lanzada. */
export function mistakeChance(choice: QualiChoice, wet: number): number {
  const slick = isWetTyre(choice.compound) ? 0 : wetPenalty(choice.compound, wet);
  return [0.02, 0.05, 0.11][choice.risk] * (1 + wet * 2) * (1 + slick / 5);
}

function qualiLap(ctx: QualiCtx, id: string, choice: QualiChoice, wet: number, segIdx: number, rng: Rng) {
  let pct = qualiPct(ctx, id, choice, wet) - segIdx * 0.15;
  pct += qualiNoise(ctx, id, rng);
  let note: string | undefined;
  if (rng() < mistakeChance(choice, wet)) {
    if (rng() < 0.5) return { time: null, note: "Vuelta anulada por límites de pista" };
    pct += range(rng, 0.6, 3);
    note = "Error en la vuelta rápida";
  }
  return { time: baseLap(ctx.series, ctx.circuit) * (1 + pct / 100), note };
}

/** Simula una tanda de clasificación: cada piloto hace dos intentos y cuenta el mejor. */
export function runSegment(
  ctx: QualiCtx,
  participants: string[],
  segIdx: number,
  nSeg: number,
  choices: Record<string, QualiChoice>,
  rng: Rng,
): QualiEntry[] {
  const { wet } = segmentConditions(ctx.weather, segIdx, nSeg);
  const forced = forcedCompound(ctx.series, ctx.sprint, segIdx, wet);
  const out: QualiEntry[] = participants.map((id) => {
    const base = choices[id] ?? aiQualiChoice(ctx.series, ctx.circuit, wet, ctx.sprint, segIdx);
    const choice = forced && !isWetTyre(base.compound) ? { ...base, compound: forced } : base;
    const a = qualiLap(ctx, id, choice, wet, segIdx, rng);
    const b = qualiLap(ctx, id, choice, wet * (0.97 + rng() * 0.06), segIdx, rng);
    const best = a.time === null ? b : b.time === null ? a : a.time <= b.time ? a : b;
    return {
      driverId: id,
      teamId: ctx.drivers[id].teamId,
      time: best.time,
      segment: segIdx,
      compound: choice.compound,
      note: best.time === null ? "Sin tiempo" : best.note,
    };
  });
  out.sort((x, y) => (x.time ?? Infinity) - (y.time ?? Infinity));
  return out;
}

/** Une los resultados de Q1/Q2/Q3 en una parrilla. */
export function assembleQuali(key: string, segs: QualiEntry[][]): QualiResult {
  const order: QualiEntry[] = [];
  const seen = new Set<string>();
  for (let s = segs.length - 1; s >= 0; s--) {
    for (const e of segs[s]) {
      if (seen.has(e.driverId)) continue;
      seen.add(e.driverId);
      order.push(e);
    }
  }
  return { key, order };
}

export function runFullQuali(ctx: QualiCtx, key: string, participants: string[], rng: Rng): QualiResult {
  const segs = qualiSegments(ctx.series, participants.length, ctx.sprint);
  const results: QualiEntry[][] = [];
  let current = participants;
  segs.forEach((seg, i) => {
    const r = runSegment(ctx, current, i, segs.length, {}, rng);
    results.push(r);
    current = r.slice(0, seg.keep).map((e) => e.driverId);
  });
  return assembleQuali(key, results);
}
