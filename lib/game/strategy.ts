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
  /** Multiplicador de desgaste (datos de tandas largas). */
  wearMult?: number;
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
    const rate = wearRate(ctx.series, ctx.circuit, c, ctx.tyreSkill) * (ctx.wearMult ?? 1);
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

/** Relevo de un plan evaluado. */
export interface StintInfo {
  compound: Compound;
  /** Vueltas completadas al empezar y al acabar el relevo. */
  from: number;
  to: number;
  startWear: number;
  endWear: number;
  /** Vuelta a partir de la cual el neumático cae de rendimiento (desgaste > 60 %), o null. */
  dropLap: number | null;
}

export interface PlanEval {
  stints: StintInfo[];
  /** Tiempo estimado de carrera (s), sin tráfico ni neutralizaciones. */
  est: number;
  issues: string[];
}

/** Desgaste a partir del cual el neumático pierde rendimiento de golpe (ver `wearPenalty`). */
export const DROP_OFF_WEAR = 60;

/** Ordena las paradas, las mete dentro de la carrera y quita las repetidas. */
export function sanitizeStops(stops: PlannedStop[], laps: number): PlannedStop[] {
  const out: PlannedStop[] = [];
  for (const s of [...stops].sort((a, b) => a.lap - b.lap)) {
    const lap = Math.max(1, Math.min(laps - 1, Math.round(s.lap)));
    if (out.some((o) => o.lap === lap)) continue;
    out.push({ lap, compound: s.compound });
  }
  return out;
}

/**
 * Evalúa un plan con el modelo de degradación del planificador: desgaste de cada relevo, vuelta
 * en que cae el rendimiento, tiempo estimado y avisos (normativa, neumáticos al límite, juegos).
 * `sets` es el número de juegos disponibles por compuesto (si se lleva la cuenta).
 */
export function evaluatePlan(ctx: StratCtx, plan: { start: Compound; stops: PlannedStop[] }, sets?: Partial<Record<Compound, number>>): PlanEval {
  const stops = sanitizeStops(plan.stops, ctx.laps);
  const seq = [plan.start, ...stops.map((s) => s.compound)];
  const bounds = [0, ...stops.map((s) => s.lap), ctx.laps];
  const stints: StintInfo[] = [];
  let est = stops.length * (ctx.pitLoss + 3 + ctx.base * 0.006);
  const issues: string[] = [];
  seq.forEach((c, i) => {
    const from = bounds[i];
    const to = bounds[i + 1];
    const startWear = i === 0 ? ctx.startWear ?? 0 : 0;
    const rate = wearRate(ctx.series, ctx.circuit, c, ctx.tyreSkill) * (ctx.wearMult ?? 1);
    const pace = spec(ctx.series, c).pace;
    for (let n = 0; n < to - from; n++) est += ctx.base * (1 + (pace + wearPenalty(startWear + rate * (n + 0.5))) / 100);
    const endWear = startWear + rate * (to - from);
    const dropAt = rate > 0 ? Math.ceil((DROP_OFF_WEAR - startWear) / rate) : Infinity;
    stints.push({ compound: c, from, to, startWear, endWear, dropLap: from + dropAt < to ? from + Math.max(0, dropAt) : null });
    if (endWear > 95) issues.push(`Relevo ${i + 1}: el ${c} no aguanta (${Math.round(endWear)} % de desgaste)`);
    else if (endWear > MAX_WEAR) issues.push(`Relevo ${i + 1}: el ${c} llega al límite (${Math.round(endWear)} %)`);
  });
  const dry = seq.filter((c) => c !== "I" && c !== "W");
  if (ctx.mustTwo && dry.length === seq.length && new Set(dry).size < 2) issues.push("En seco hay que usar dos compuestos distintos");
  if (sets) {
    const need: Partial<Record<Compound, number>> = {};
    for (const c of seq) need[c] = (need[c] ?? 0) + 1;
    for (const [c, n] of Object.entries(need)) {
      const have = sets[c as Compound] ?? 0;
      if (n > have) issues.push(`Necesitas ${n} juegos de ${c} y te quedan ${have}`);
    }
  }
  return { stints, est, issues };
}

/**
 * Planes que propone el ingeniero: el más rápido, el mejor con cada compuesto de salida y uno con
 * una parada más o menos, sin repetir. Se nombran A, B, C…
 */
export function suggestPlans(ctx: StratCtx, max = 3): { name: string; start: Compound; stops: PlannedStop[] }[] {
  const cands: Plan[] = [planStrategy(ctx)];
  for (const c of ctx.dry) cands.push(planStrategy(ctx, undefined, c));
  // Variante con una parada más que la mejor: reparte los relevos a partes iguales.
  const best = cands[0];
  const n = best.stops.length + 1;
  const alt = [best.start, ...best.stops.map((s) => s.compound), ctx.dry[Math.min(1, ctx.dry.length - 1)]];
  cands.push({ start: alt[0], stops: alt.slice(1, n + 1).map((c, i) => ({ lap: Math.round(((i + 1) * ctx.laps) / (n + 1)), compound: c })), est: Infinity });
  const seen = new Set<string>();
  const out: { name: string; start: Compound; stops: PlannedStop[] }[] = [];
  for (const p of cands) {
    const key = [p.start, ...p.stops.map((s) => s.compound)].join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: String.fromCharCode(65 + out.length), start: p.start, stops: p.stops });
    if (out.length >= max) break;
  }
  return out;
}

export function describePlan(p: Plan): string {
  if (p.stops.length === 0) return `${p.start} sin paradas`;
  return [p.start, ...p.stops.map((s) => `v${s.lap} → ${s.compound}`)].join("  ·  ");
}
