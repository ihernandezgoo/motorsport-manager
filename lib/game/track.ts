export interface TrackGeometry {
  d: string;
  pts: [number, number][];
  cum: number[];
  total: number;
}

type P = [number, number];

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Catmull-Rom centrípeta (alpha = 0.5): evita bucles y picos en curvas cerradas.
function crPoint(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const k = (a: P, b: P) => Math.max(1e-4, Math.sqrt(dist(a, b)));
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a: P, b: P, ta: number, tb: number): P => {
    const wa = (tb - tt) / (tb - ta);
    const wb = (tt - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Suaviza una polilínea cerrada con Catmull-Rom centrípeta. */
export function smoothClosed(norm: P[], steps: number): P[] {
  const n = norm.length;
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = norm[(i - 1 + n) % n];
    const p1 = norm[i];
    const p2 = norm[(i + 1) % n];
    const p3 = norm[(i + 2) % n];
    for (let s = 0; s < steps; s++) pts.push(crPoint(p0, p1, p2, p3, s / steps));
  }
  return pts;
}

export function buildTrack(shape: P[], size = 100, pad = 7, steps = 12): TrackGeometry {
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const scale = (size - pad * 2) / Math.max(w, h);
  const offX = (size - w * scale) / 2;
  const offY = (size - h * scale) / 2;
  const norm: P[] = shape.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale]);

  const n = norm.length;
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = norm[(i - 1 + n) % n];
    const p1 = norm[i];
    const p2 = norm[(i + 1) % n];
    const p3 = norm[(i + 2) % n];
    for (let s = 0; s < steps; s++) pts.push(crPoint(p0, p1, p2, p3, s / steps));
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i % pts.length]));
  const total = cum[pts.length];
  const d = "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L") + " Z";
  return { d, pts, cum, total };
}

export function pointAt(g: TrackGeometry, frac: number): { x: number; y: number; angle: number } {
  let f = frac % 1;
  if (f < 0) f += 1;
  const target = f * g.total;
  let lo = 0;
  let hi = g.pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid + 1] < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.min(lo, g.pts.length - 1);
  const a = g.pts[i];
  const b = g.pts[(i + 1) % g.pts.length];
  const segLen = g.cum[i + 1] - g.cum[i] || 1;
  const t = (target - g.cum[i]) / segLen;
  return {
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
    angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  };
}
