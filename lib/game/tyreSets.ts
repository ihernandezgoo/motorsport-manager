import { wearRate } from "./strategy";
import { COMPOUND_INFO, dryCompounds, wearPenalty } from "./tyres";
import type { Circuit, Compound, SeriesId, TyreSet } from "./types";

/**
 * Juegos de neumáticos por piloto y fin de semana, como en la normativa real (simplificada):
 * F1 13 juegos de seco (12 en formato sprint), F2 tres de cada compuesto y F3 cinco de su único compuesto.
 */
export function tyreAllocation(series: SeriesId, circuit: Circuit, sprint: boolean): [Compound, number][] {
  if (series === "f1") {
    return sprint
      ? [["S", 6], ["M", 4], ["H", 2], ["I", 5], ["W", 2]]
      : [["S", 8], ["M", 3], ["H", 2], ["I", 4], ["W", 3]];
  }
  if (series === "f2") {
    const [soft, hard] = dryCompounds(series, circuit);
    return [[soft, 3], [hard, 3], ["I", 2], ["W", 2]];
  }
  return [["M", 5], ["I", 2], ["W", 2]];
}

export function makeTyreSets(series: SeriesId, circuit: Circuit, sprint: boolean, driverId: string): TyreSet[] {
  const out: TyreSet[] = [];
  for (const [c, n] of tyreAllocation(series, circuit, sprint)) {
    for (let i = 1; i <= n; i++) out.push({ id: `${driverId}-${c}${i}`, compound: c, wear: 0, used: false });
  }
  return out;
}

/** El juego menos gastado de un compuesto (los nuevos primero), o null si no queda ninguno. */
export function freshestSet(sets: TyreSet[], c: Compound): TyreSet | null {
  let best: TyreSet | null = null;
  for (const s of sets) if (s.compound === c && s.wear < 100 && (!best || s.wear < best.wear)) best = s;
  return best;
}

export function newSetsLeft(sets: TyreSet[], c: Compound): number {
  return sets.filter((s) => s.compound === c && !s.used).length;
}

export function setLabel(s: TyreSet): string {
  return `${COMPOUND_INFO[s.compound].name} ${s.used ? `usado · ${Math.round(s.wear)}%` : "nuevo"}`;
}

/** Desgasta un juego `laps` vueltas (a ritmo neutral; `mult` > 1 al atacar). */
export function runOnSet(s: TyreSet, laps: number, series: SeriesId, circuit: Circuit, tyreSkill: number, mult = 1) {
  s.wear = Math.min(100, s.wear + laps * wearRate(series, circuit, s.compound, tyreSkill) * mult);
  s.used = true;
}

/** Pérdida (% del tiempo) en una vuelta lanzada con un juego ya usado: sin el pico de agarre y con desgaste. */
export function usedSetPenalty(s: Pick<TyreSet, "wear" | "used">): number {
  return s.used ? 0.15 + wearPenalty(s.wear) : 0;
}
