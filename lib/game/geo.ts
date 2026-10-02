import { CIRCUIT_GEO } from "./data/geo";
import { sceneryOf, type Scenery } from "./data/scenery";
import { buildScenery, type SceneryOut } from "./sceneryGen";
import { smoothClosed } from "./track";

/** Proyección Web Mercator normalizada (0..256). */
function mercator(lon: number, lat: number): [number, number] {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256];
}

/** Forma del circuito en coordenadas planas (para los minimapas). */
export function circuitShape(circuitId: string): [number, number][] {
  const flat = CIRCUIT_GEO[circuitId];
  const out: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(mercator(flat[i], flat[i + 1]));
  return out;
}

type P = [number, number];

export interface Box {
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
}

/** Escenario del circuito en metros: trazado suavizado y elementos decorativos. */
export interface TrackScene {
  pts: P[];
  cum: number[];
  total: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  d: string;
  kerbs: string[];
  gravel: string[];
  pitLane: string;
  garages: Box[];
  pitBuilding: Box;
  stands: Box[];
  motorhomes: Box[];
  scenery: Scenery;
  /** Entorno: agua, edificios, árboles, vallas, focos... */
  env: SceneryOut;
  grid: { x: number; y: number; angle: number }[];
  sf: { x: number; y: number; angle: number };
  /** Medio carril de boxes (m) a cada lado de la meta y lado de la pista (+1/-1) donde está. */
  pitHalf: number;
  side: number;
}

/**
 * Desplazamiento lateral (m, con signo según el lado) del carril de boxes respecto al eje de la
 * pista a `s` metros de la meta. `boxed` acerca el coche a su garaje.
 */
export function pitLaneOffset(t: TrackScene, s: number, boxed = false): number {
  const edge = Math.min(1, Math.max(0, (t.pitHalf + 60 - Math.abs(s)) / 60));
  return (boxed ? 30 : 24 * edge) * t.side;
}

const cache = new Map<string, TrackScene>();

const path = (pts: P[], closed = false) => "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L") + (closed ? " Z" : "");

export function trackScene(circuitId: string): TrackScene {
  const hit = cache.get(circuitId);
  if (hit) return hit;
  const flat = CIRCUIT_GEO[circuitId];
  let lat = 0;
  for (let i = 1; i < flat.length; i += 2) lat += flat[i];
  lat /= flat.length / 2;
  const mpu = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 256;
  const merc = circuitShape(circuitId);
  const mx = Math.min(...merc.map((p) => p[0]));
  const my = Math.min(...merc.map((p) => p[1]));
  const raw: P[] = merc.map(([x, y]) => [(x - mx) * mpu, (y - my) * mpu]);
  const pts = smoothClosed(raw, 4);
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1];
    const b = pts[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[n];

  const heading = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    return Math.atan2(q[1] - p[1], q[0] - p[0]);
  });
  const normal = (i: number): P => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  const turnAt = (i: number) => {
    let d = heading[i] - heading[(i - 1 + n) % n];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };
  // Giro acumulado en una ventana de ±25 m alrededor de cada punto.
  const windowTurn = pts.map((_, i) => {
    let sum = 0;
    for (let k = -12; k <= 12; k++) {
      const j = (i + k + n) % n;
      const dist = Math.abs(cum[j] - cum[i]);
      if (dist <= 25 || total - dist <= 25) sum += turnAt(j);
    }
    return (sum * 180) / Math.PI;
  });
  const runs = (threshold: number, pad: number) => {
    const out: string[] = [];
    let i = 0;
    while (i < n) {
      if (windowTurn[i] < threshold) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && windowTurn[j] >= threshold) j++;
      const seg: P[] = [];
      for (let k = i - pad; k <= j - 1 + pad; k++) seg.push(pts[(k + n) % n]);
      if (seg.length > 1) out.push(path(seg));
      i = j;
    }
    return out;
  };
  const kerbs = runs(16, 1);
  const gravel = runs(38, 3);

  const cx = pts.reduce((a, p) => a + p[0], 0) / n;
  const cy = pts.reduce((a, p) => a + p[1], 0) / n;
  const n0 = normal(0);
  const side = n0[0] * (pts[0][0] - cx) + n0[1] * (pts[0][1] - cy) >= 0 ? 1 : -1;

  // Índice del punto a una distancia s (en metros) desde la meta, admitiendo valores negativos.
  const indexAt = (s: number) => {
    const t = ((s % total) + total) % total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid + 1] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const offsetPoint = (s: number, off: number): P => {
    const i = indexAt(s);
    const nn = normal(i);
    return [pts[i][0] + nn[0] * off * side, pts[i][1] + nn[1] * off * side];
  };
  const angleAt = (s: number) => (heading[indexAt(s)] * 180) / Math.PI;

  const pitHalf = Math.min(320, total * 0.07);
  const pitPts: P[] = [];
  for (let s = -pitHalf - 60; s <= pitHalf + 60; s += 8) {
    const edge = Math.min(1, Math.max(0, (pitHalf + 60 - Math.abs(s)) / 60));
    pitPts.push(offsetPoint(s, 24 * edge));
  }
  const garages: Box[] = [];
  for (let s = -pitHalf + 20, k = 0; s <= pitHalf - 20 && k < 24; s += 15, k++) {
    const p = offsetPoint(s, 37);
    garages.push({ x: p[0], y: p[1], angle: angleAt(s), w: 13, h: 14 });
  }
  const pb = offsetPoint(0, 56);
  const pitBuilding: Box = { x: pb[0], y: pb[1], angle: angleAt(0), w: pitHalf * 2, h: 20 };

  // En circuitos que vuelven sobre sí mismos (Mónaco, Bakú...) no se coloca nada encima de otro tramo.
  const clearOfTrack = (p: P, r: number) => {
    for (let i = 0; i < n; i += 2) if ((pts[i][0] - p[0]) ** 2 + (pts[i][1] - p[1]) ** 2 < r * r) return false;
    return true;
  };

  const stands: Box[] = [];
  const main =offsetPoint(-30, -30);
  stands.push({ x: main[0], y: main[1], angle: angleAt(-30), w: Math.min(220, pitHalf * 1.4), h: 22 });
  const cornerIdx = windowTurn
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t - a.t)
    .filter((c, k, arr) => arr.findIndex((o) => Math.abs(cum[o.i] - cum[c.i]) < 300) === k)
    .slice(0, 4);
  for (const { i } of cornerIdx) {
    const nn = normal(i);
    // Las gradas van por fuera de la curva: el lado opuesto al giro.
    let d = heading[(i + 2) % n] - heading[(i - 2 + n) % n];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const out = d > 0 ? -1 : 1;
    const p: P = [pts[i][0] + nn[0] * 62 * out, pts[i][1] + nn[1] * 62 * out];
    if (clearOfTrack(p, 45)) stands.push({ x: p[0], y: p[1], angle: (heading[i] * 180) / Math.PI, w: 90, h: 16 });
  }

  const grid: TrackScene["grid"] = [];
  for (let k = 0; k < 30; k++) {
    const s = -10 - k * 8;
    const p = offsetPoint(s, (k % 2 === 0 ? 3 : -3) * side);
    grid.push({ x: p[0], y: p[1], angle: angleAt(s) });
  }

  const minX = Math.min(...pts.map((p) => p[0])) - 260;
  const minY = Math.min(...pts.map((p) => p[1])) - 260;
  const maxX = Math.max(...pts.map((p) => p[0])) + 260;
  const maxY = Math.max(...pts.map((p) => p[1])) + 260;

  // Paddock: motorhomes de los equipos detrás del edificio de boxes.
  const motorhomes: Box[] = [];
  for (let s = -pitHalf + 25, k = 0; s <= pitHalf - 25 && k < 12; s += 36, k++) {
    const p = offsetPoint(s, 90);
    if (clearOfTrack(p, 55)) motorhomes.push({ x: p[0], y: p[1], angle: angleAt(s), w: 26, h: 11 });
  }

  const blockers: P[] = [...pitPts.filter((_, i) => i % 2 === 0), ...garages.map((g): P => [g.x, g.y]), [pb[0], pb[1]], ...stands.map((s): P => [s.x, s.y]), ...motorhomes.map((m): P => [m.x, m.y])];
  for (let s = -pitHalf; s <= pitHalf; s += 25) blockers.push(offsetPoint(s, 56), offsetPoint(s, 80));
  const scenery = sceneryOf(circuitId);
  const env = buildScenery({ circuitId, scenery, pts, cum, total, heading, windowTurn, blockers, pitHalf, side });

  const scene: TrackScene = {
    pts,
    cum,
    total,
    bbox: { minX, minY, maxX, maxY },
    d: path(pts, true),
    kerbs,
    gravel,
    pitLane: path(pitPts),
    garages,
    pitBuilding,
    stands,
    motorhomes,
    scenery,
    env,
    grid,
    sf: { x: pts[0][0], y: pts[0][1], angle: (heading[0] * 180) / Math.PI },
    pitHalf,
    side,
  };
  cache.set(circuitId, scene);
  return scene;
}

/** Punto del trazado a una fracción de vuelta (0..1), en metros. */
export function scenePointAt(t: TrackScene, frac: number): { x: number; y: number; angle: number } {
  let f = frac % 1;
  if (f < 0) f += 1;
  const target = f * t.total;
  let lo = 0;
  let hi = t.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid + 1] < target) lo = mid + 1;
    else hi = mid;
  }
  const a = t.pts[lo];
  const b = t.pts[(lo + 1) % t.pts.length];
  const seg = t.cum[lo + 1] - t.cum[lo] || 1;
  const k = (target - t.cum[lo]) / seg;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
}
