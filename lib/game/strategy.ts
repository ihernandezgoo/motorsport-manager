import { gauss, type Rng } from "./rng";
import { spec, wearPenalty } from "./tyres";
import type { Circuit, Compound, SeriesId } from "./types";

export interface PlannedStop {
  lap: number;
  compound: Compound;
}

export interface Plan {
  start: Compound;
  stops: PlannedStop[];
  est: number;
}

export interface StratCtx {
  series: SeriesId;
  circuit: Circuit;
  base: number;
  laps: number;
  dry: Compound[];
  mustTwo: boolean;
  tyreSkill: number;
  pitLoss: number;
  /** Desgaste del neumático que ya lleva montado (solo si se fija `fixedStart`). */
  startWear?: number;
}

const MAX_WEAR = 88;

export function wearRate(series: SeriesId, circuit: Circuit, c: Compound, tyreSkill: number): number {
  return spec(series, c).wear * circuit.wear * (1 + (80 - tyreSkill) * 0.008);
}

/** Vueltas que aguanta un compuesto hasta el desgaste indicado. */
export function tyreLife(series: SeriesId, circuit: Circuit, c: Compound, tyreSkill: number, upTo = 75): number {
  return Math.floor(upTo / wearRate(series, circuit, c, tyreSkill));
}

/**
 * Busca la estrategia de paradas más rápida (0 a 3 paradas) con un modelo simplificado
 * de degradación. `noise` añade variabilidad para que la IA no sea idéntica.
 */
export function planStrategy(ctx: StratCtx, rng?: Rng, fixedStart?: Compound, noise = 0): Plan {
  const { laps, dry, base } = ctx;
  // build(c)[n] = segundos perdidos en un relevo de n vueltas con c (respecto al medio nuevo).
  const build = (c: Compound, startWear: number) => {
    const rate = wearRate(ctx.series, ctx.circuit, c, ctx.tyreSkill);
    const pace = spec(ctx.series, c).pace;
    const arr = [0];
    let acc = 0;
    for (let n = 1; n <= laps; n++) {
      acc += ((pace + wearPenalty(startWear + rate * (n - 0.5))) * base) / 100;
      arr.push(startWear + rate * n > MAX_WEAR ? Infinity : acc);
    }
    return arr;
  };
  const costs = new Map<Compound, number[]>(dry.map((c) => [c, build(c, 0)]));
  const startWear = ctx.startWear ?? 0;
  const firstCost = fixedStart && startWear > 0 ? build(fixedStart, startWear) : null;
  const stint = (c: Compound, n: number, first: boolean) =>
    ((first && firstCost && c === fixedStart ? firstCost : costs.get(c)) ?? [])[n] ?? Infinity;
  const stopCost = ctx.pitLoss + 3 + base * 0.006;
  const jitter = () => (rng && noise > 0 ? gauss(rng) * noise : 0);

  let best: Plan = { start: fixedStart ?? dry[Math.min(1, dry.length - 1)], stops: [], est: Infinity };
  const consider = (seq: Compound[], laps0: number[], total: number) => {
    if (!isFinite(total)) return;
    if (ctx.mustTwo && new Set(seq).size < 2) return;
    const score = total + jitter();
    if (score < best.est) {
      best = { start: seq[0], stops: seq.slice(1).map((c, i) => ({ lap: laps0[i], compound: c })), est: score };
    }
  };
  const starts = fixedStart ? [fixedStart] : dry;
  const minStint = Math.max(3, Math.floor(laps * 0.08));

  for (const a of starts) consider([a], [], stint(a, laps, true));

  for (const a of starts)
    for (const b of dry)
      for (let l1 = minStint; l1 <= laps - minStint; l1++) consider([a, b], [l1], stint(a, l1, true) + stint(b, laps - l1, false) + stopCost);

  if (best.stops.length > 0 || !isFinite(best.est) || laps > 25) {
    const step = laps > 50 ? 2 : 1;
    for (const a of starts)
      for (const b of dry)
        for (const c of dry)
          for (let l1 = minStint; l1 <= laps - 2 * minStint; l1 += step)
            for (let l2 = l1 + minStint; l2 <= laps - minStint; l2 += step)
              consider([a, b, c], [l1, l2], stint(a, l1, true) + stint(b, l2 - l1, false) + stint(c, laps - l2, false) + 2 * stopCost);
  }

  if (!isFinite(best.est)) {
    // Degradación extrema: tres paradas repartidas.
    const a = starts[0];
    const b = dry[dry.length - 1];
    const q = Math.round(laps / 4);
    best = { start: a, stops: [{ lap: q, compound: b }, { lap: 2 * q, compound: b }, { lap: 3 * q, compound: b }], est: Infinity };
  }
  return best;
}

export function describePlan(p: Plan): string {
  if (p.stops.length === 0) return `${p.start} sin paradas`;
  return [p.start, ...p.stops.map((s) => `v${s.lap} → ${s.compound}`)].join("  ·  ");
}
