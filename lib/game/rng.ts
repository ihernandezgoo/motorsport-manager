export type Rng = () => number;

/** Generador cuyo estado se puede guardar y restaurar (para rebobinar una simulación). */
export interface StatefulRng extends Rng {
  getState(): number;
  setState(s: number): void;
}

export function mulberry32(seed: number): StatefulRng {
  let a = seed >>> 0;
  const rng = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as StatefulRng;
  rng.getState = () => a;
  rng.setState = (s) => {
    a = s >>> 0;
  };
  return rng;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(...parts: (string | number)[]): Rng {
  return mulberry32(hashString(parts.join("|")));
}

/** Normal estándar (Box-Muller). */
export function gauss(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function range(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng();
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
