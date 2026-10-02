import type { Circuit, Compound, SeriesId } from "./types";

export const COMPOUND_INFO: Record<Compound, { name: string; letter: string; color: string }> = {
  SS: { name: "Superblando", letter: "SS", color: "#d946ef" },
  S: { name: "Blando", letter: "S", color: "#ef4444" },
  M: { name: "Medio", letter: "M", color: "#facc15" },
  H: { name: "Duro", letter: "H", color: "#f1f5f9" },
  I: { name: "Intermedio", letter: "I", color: "#22c55e" },
  W: { name: "Lluvia", letter: "W", color: "#3b82f6" },
};

interface Spec {
  /** Ritmo relativo al medio, en % del tiempo por vuelta (negativo = más rápido). */
  pace: number;
  /** Desgaste base por vuelta, en %. */
  wear: number;
}

const SPECS: Record<SeriesId, Partial<Record<Compound, Spec>>> = {
  f1: {
    S: { pace: -0.65, wear: 3.0 },
    M: { pace: 0, wear: 2.0 },
    H: { pace: 0.55, wear: 1.4 },
    I: { pace: 0, wear: 1.8 },
    W: { pace: 0, wear: 1.5 },
  },
  f2: {
    SS: { pace: -1.1, wear: 4.6 },
    S: { pace: -0.55, wear: 3.4 },
    M: { pace: 0, wear: 2.5 },
    H: { pace: 0.55, wear: 1.8 },
    I: { pace: 0, wear: 2.0 },
    W: { pace: 0, wear: 1.7 },
  },
  f3: {
    M: { pace: 0, wear: 2.0 },
    I: { pace: 0, wear: 2.0 },
    W: { pace: 0, wear: 1.7 },
  },
};

/** Ventana de temperatura óptima (°C). */
export const TEMP_WINDOW: Record<Compound, [number, number]> = {
  SS: [75, 95],
  S: [80, 100],
  M: [85, 105],
  H: [90, 110],
  I: [55, 85],
  W: [45, 80],
};

export const isWetTyre = (c: Compound) => c === "I" || c === "W";

export function spec(series: SeriesId, c: Compound): Spec {
  return SPECS[series][c] ?? SPECS[series].M ?? { pace: 0, wear: 2 };
}

/** Compuestos de seco disponibles en un fin de semana (del más blando al más duro). */
export function dryCompounds(series: SeriesId, circuit: Circuit): Compound[] {
  if (series === "f1") return ["S", "M", "H"];
  if (series === "f3") return ["M"];
  if (circuit.wear <= 0.9) return ["SS", "M"];
  if (circuit.wear <= 1.15) return ["S", "M"];
  return ["M", "H"];
}

export function availableCompounds(series: SeriesId, circuit: Circuit): Compound[] {
  return [...dryCompounds(series, circuit), "I", "W"];
}

/** Penalización (en %) por usar un compuesto con una humedad de pista dada (0..1). */
export function wetPenalty(c: Compound, w: number): number {
  if (c === "I") return 3 + 18 * Math.max(0, 0.3 - w) + 20 * Math.pow(Math.max(0, w - 0.65), 1.2);
  if (c === "W") return 6.5 + 14 * Math.max(0, 0.7 - w);
  return w <= 0.05 ? 0 : 55 * Math.pow(w - 0.05, 1.2);
}

/** Penalización (en %) por desgaste (0..100). Caída brusca a partir del 60 %. */
export function wearPenalty(wear: number): number {
  const cliff = wear > 60 ? Math.pow((wear - 60) / 10, 2) * 0.25 : 0;
  return wear * 0.012 + cliff;
}

/** Penalización (en %) por estar fuera de la ventana de temperatura. */
export function tempPenalty(c: Compound, temp: number): number {
  const [lo, hi] = TEMP_WINDOW[c];
  if (temp < lo) return (lo - temp) * 0.03;
  if (temp > hi) return (temp - hi) * 0.015;
  return 0;
}

/** Multiplicador de desgaste por sobrecalentamiento. */
export function tempWearFactor(c: Compound, temp: number): number {
  const hi = TEMP_WINDOW[c][1];
  return temp > hi ? 1 + (temp - hi) * 0.03 : 1;
}

/** El mejor neumático teórico para una humedad dada. */
export function idealForWetness(w: number): "dry" | "I" | "W" {
  if (w >= 0.85) return "W";
  if (w >= 0.18) return "I";
  return "dry";
}
