import { BIOME_COLORS, type BiomeColors, type Scenery } from "./data/scenery";
import { hashString, mulberry32 } from "./rng";

type P = [number, number];

/** Capa del escenario: muchas formas con el mismo estilo en un único <path>, para que dibujar sea barato. */
export interface PathLayer {
  d: string;
  fill: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
}

export interface Landmark {
  kind: NonNullable<Scenery["landmark"]>;
  x: number;
  y: number;
}

export interface SceneryOut {
  colors: BiomeColors;
  fields: PathLayer[];
  water: { shore: string; d: string } | null;
  decor: PathLayer[];
  glow: PathLayer[];
  edge: PathLayer[];
  lights: P[];
  landmark: Landmark | null;
  /** Distancia hasta la que se generan árboles y edificios sueltos (m). */
  near: number;
}

export interface SceneryInput {
  circuitId: string;
  scenery: Scenery;
  pts: P[];
  cum: number[];
  total: number;
  heading: number[];
  windowTurn: number[];
  /** Puntos de boxes, paddock y gradas: ahí no se coloca nada. */
  blockers: P[];
  /** Tramo de boxes [-pitHalf, pitHalf] desde la meta y lado (+1/-1) donde está. */
  pitHalf: number;
  side: number;
}

const CELL = 30;
const MARGIN = 750;
const NEAR = 330;
const SPONSORS = ["#e10600", "#ffd200", "#0a58ca", "#ffffff", "#00a651", "#111111", "#ff7a00", "#00b4e6"];
const CAR_COLORS = ["#e5e7eb", "#111827", "#9ca3af", "#b91c1c", "#1d4ed8", "#f8fafc", "#4b5563"];
const NEON = ["#ff2bd6", "#22d3ee", "#facc15", "#a855f7", "#34d399"];
const BOAT_HULL = "#f4f6f8";
const FIELDS: Record<string, string[]> = {
  fields: ["#6f9c45", "#7aa64e", "#8fae55", "#a9b464", "#c2b46a", "#5f8f3e", "#94a35a", "#b7a560"],
  dry: ["#9aa45c", "#a9ab66", "#b9ad6e", "#c4b277", "#8e9a52", "#a39a5c", "#c9b98a"],
  park: ["#55933f", "#5c9a45", "#4f8c3b"],
  tropical: ["#46933f", "#3f8a37", "#4f9a46"],
};

const f = (n: number) => n.toFixed(1);

function circleD(x: number, y: number, r: number) {
  return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
}

/** Polígono local (centrado en 0,0) rotado y desplazado. */
function polyD(local: P[], x: number, y: number, angleRad: number) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return "M" + local.map(([px, py]) => `${f(x + px * c - py * s)} ${f(y + px * s + py * c)}`).join("L") + "Z";
}

function rectD(x: number, y: number, w: number, h: number, angleRad: number) {
  return polyD(
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ],
    x,
    y,
    angleRad,
  );
}

/** Ruido de valor 2D suave (0..1). */
function makeNoise(seed: number) {
  const h = (ix: number, iy: number) => {
    let t = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number, scale: number) => {
    const gx = x / scale;
    const gy = y / scale;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx;
    const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}

class Layers {
  private map = new Map<string, PathLayer & { parts: string[] }>();
  define(key: string, style: Omit<PathLayer, "d">) {
    this.map.set(key, { ...style, d: "", parts: [] });
  }
  add(key: string, d: string) {
    this.map.get(key)?.parts.push(d);
  }
  list(): PathLayer[] {
    const out: PathLayer[] = [];
    for (const l of this.map.values()) {
      if (!l.parts.length) continue;
      const { parts, ...rest } = l;
      out.push({ ...rest, d: parts.join("") });
    }
    return out;
  }
}

export function buildScenery(inp: SceneryInput): SceneryOut {
  const { scenery: sc, pts, cum, total, heading, windowTurn, blockers, pitHalf, side } = inp;
  const colors = BIOME_COLORS[sc.biome];
  const rng = mulberry32(hashString(inp.circuitId + "-scenery"));
  const noise = makeNoise(hashString(inp.circuitId) % 100000);
  const n = pts.length;

  // Muestras del trazado cada ~10 m, repartidas en cubetas para buscar la distancia rápido.
  const samples: { x: number; y: number; i: number }[] = [];
  let last = -Infinity;
  for (let i = 0; i < n; i++) {
    if (cum[i] - last >= 10) {
      samples.push({ x: pts[i][0], y: pts[i][1], i });
      last = cum[i];
    }
  }
  const B = 60;
  const buckets = new Map<number, number[]>();
  const bkey = (bx: number, by: number) => (bx + 2000) * 8192 + (by + 2000);
  samples.forEach((p, k) => {
    const key = bkey(Math.floor(p.x / B), Math.floor(p.y / B));
    const arr = buckets.get(key);
    if (arr) arr.push(k);
    else buckets.set(key, [k]);
  });
  const CAP = NEAR + 60;
  /** Distancia a la pista (limitada a CAP) y muestra más cercana. */
  const nearest = (x: number, y: number): [number, number] => {
    if (Math.hypot(Math.max(tMinX - x, 0, x - tMaxX), Math.max(tMinY - y, 0, y - tMaxY)) > CAP) return [CAP, -1];
    const bx = Math.floor(x / B);
    const by = Math.floor(y / B);
    let best = CAP * CAP;
    let bestK = -1;
    const maxRing = Math.ceil(CAP / B) + 1;
    for (let r = 0; r <= maxRing; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const arr = buckets.get(bkey(bx + dx, by + dy));
          if (!arr) continue;
          for (const k of arr) {
            const d2 = (samples[k].x - x) ** 2 + (samples[k].y - y) ** 2;
            if (d2 < best) {
              best = d2;
              bestK = k;
            }
          }
        }
      }
      if (bestK >= 0 && Math.sqrt(best) < (r - 1) * B) break;
    }
    return [Math.sqrt(best), bestK];
  };
  const blockedNear = (x: number, y: number, r: number) => {
    for (const b of blockers) if ((b[0] - x) ** 2 + (b[1] - y) ** 2 < r * r) return true;
    return false;
  };
  const poly = samples.filter((_, k) => k % 2 === 0);
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };

  let tMinX = Infinity,
    tMinY = Infinity,
    tMaxX = -Infinity,
    tMaxY = -Infinity;
  for (const p of pts) {
    tMinX = Math.min(tMinX, p[0]);
    tMinY = Math.min(tMinY, p[1]);
    tMaxX = Math.max(tMaxX, p[0]);
    tMaxY = Math.max(tMaxY, p[1]);
  }
  const ccx = (tMinX + tMaxX) / 2;
  const ccy = (tMinY + tMaxY) / 2;
  const ext = Math.hypot(tMaxX - tMinX, tMaxY - tMinY) / 2;
  // Con mar o isla el agua llega más lejos para que no se vea el borde al alejar la cámara.
  const margin = sc.water?.kind === "sea" || sc.water?.kind === "island" ? MARGIN * 2.6 : MARGIN;
  const gx0 = tMinX - margin;
  const gy0 = tMinY - margin;
  const cols = Math.ceil((tMaxX - tMinX + 2 * margin) / CELL);
  const rows = Math.ceil((tMaxY - tMinY + 2 * margin) / CELL);

  // 1) Clasificación de celdas: distancia a la pista y agua.
  const dist = new Float32Array(cols * rows);
  const near = new Int32Array(cols * rows);
  const water = new Uint8Array(cols * rows);
  const blocked = new Uint8Array(cols * rows);
  const w = sc.water;
  const waterMin = (w?.min ?? 70) + CELL * 0.72 + 5;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const k = iy * cols + ix;
      const x = gx0 + (ix + 0.5) * CELL;
      const y = gy0 + (iy + 0.5) * CELL;
      const [d, s] = nearest(x, y);
      dist[k] = d;
      near[k] = s;
      if (d < 200 && blockedNear(x, y, 42)) blocked[k] = 1;
      if (!w || d <= waterMin || blocked[k]) continue;
      const nz = noise(x, y, 240) - 0.5;
      let wet = false;
      if (w.kind === "sea") {
        const [dx, dy] = w.dir ?? [0, 1];
        const len = Math.hypot(dx, dy) || 1;
        wet = (((x - ccx) / ext) * dx + ((y - ccy) / ext) * dy) / len + nz * 0.3 > (w.offset ?? 0.2);
      } else if (w.kind === "island") {
        wet = d > waterMin + 30 + nz * 90;
      } else if (w.kind === "lake") {
        wet = inside(x, y) && noise(x, y, 160) > 0.22;
      } else if (w.kind === "marina") {
        wet = inside(x, y) && noise(x, y, 200) > 0.42;
      }
      if (wet) water[k] = 1;
    }
  }

  // 2) Agua: celdas interiores como franjas y bordes como círculos, para una orilla orgánica.
  let waterOut: SceneryOut["water"] = null;
  const shoreCells: number[] = [];
  if (w) {
    const isW = (ix: number, iy: number) => ix < 0 || iy < 0 || ix >= cols || iy >= rows || water[iy * cols + ix] === 1;
    const fill: string[] = [];
    const shore: string[] = [];
    for (let iy = 0; iy < rows; iy++) {
      let run = -1;
      for (let ix = 0; ix <= cols; ix++) {
        const k = iy * cols + ix;
        const interior = ix < cols && water[k] === 1 && isW(ix - 1, iy) && isW(ix + 1, iy) && isW(ix, iy - 1) && isW(ix, iy + 1);
        if (ix < cols && water[k] === 1 && !interior) {
          const x = gx0 + (ix + 0.5) * CELL;
          const y = gy0 + (iy + 0.5) * CELL;
          fill.push(circleD(x, y, CELL * 0.72));
          shore.push(circleD(x, y, CELL * 0.72 + 5));
          shoreCells.push(k);
        }
        if (interior && run < 0) run = ix;
        if (!interior && run >= 0) {
          fill.push(`M${f(gx0 + run * CELL - 0.5)} ${f(gy0 + iy * CELL - 0.5)}h${f((ix - run) * CELL + 1)}v${CELL + 1}h${f(-(ix - run) * CELL - 1)}Z`);
          run = -1;
        }
      }
    }
    if (fill.length) waterOut = { shore: shore.join(""), d: fill.join("") };
  }

  const fields = new Layers();
  const decor = new Layers();
  const glow = new Layers();
  const edge = new Layers();

  // 3) Parcelas de cultivo o césped en mosaico.
  const fieldPalette = FIELDS[sc.biome];
  if (fieldPalette) {
    fieldPalette.forEach((c, i) => fields.define(`f${i}`, { fill: c }));
    const FC = sc.biome === "fields" || sc.biome === "dry" ? 150 : 220;
    for (let y = gy0; y < gy0 + rows * CELL; y += FC) {
      for (let x = gx0; x < gx0 + cols * CELL; x += FC) {
        const ix = Math.min(cols - 1, Math.floor((x + FC / 2 - gx0) / CELL));
        const iy = Math.min(rows - 1, Math.floor((y + FC / 2 - gy0) / CELL));
        if (water[iy * cols + ix]) continue;
        const pick = Math.floor(noise(x * 7.3, y * 7.3, 50) * fieldPalette.length * 0.999);
        const jw = FC * (0.45 + rng() * 0.55);
        fields.add(`f${pick}`, `M${f(x + 3)} ${f(y + 3)}h${f(jw - 6)}v${f(FC - 6)}h${f(-(jw - 6))}Z`);
        if (jw < FC - 20) {
          const pick2 = (pick + 1 + Math.floor(rng() * 3)) % fieldPalette.length;
          fields.add(`f${pick2}`, `M${f(x + jw + 3)} ${f(y + 3)}h${f(FC - jw - 6)}v${f(FC - 6)}h${f(-(FC - jw - 6))}Z`);
        }
      }
    }
  }

  // Capas de decorado en orden de dibujo.
  decor.define("park", { fill: "#6b7078" });
  decor.define("parkLines", { fill: "none", stroke: "#e5e7eb", strokeWidth: 0.4, opacity: 0.6 });
  CAR_COLORS.forEach((c, i) => decor.define(`car${i}`, { fill: c }));
  decor.define("treeShadow", { fill: "#000", opacity: 0.22 });
  decor.define("bShadow", { fill: "#000", opacity: sc.tall ? 0.32 : 0.25 });
  decor.define("tree0", { fill: colors.tree[0] });
  decor.define("tree1", { fill: colors.tree[1] });
  decor.define("treeHi", { fill: colors.treeHi, opacity: 0.55 });
  decor.define("palm", { fill: sc.biome === "desert" ? "#5d8a3a" : "#3f8f3a" });
  decor.define("palmHi", { fill: "#86c25a", opacity: 0.7 });
  sc.roofs.forEach((c, i) => decor.define(`roof${i}`, { fill: c }));
  decor.define("roofDetail", { fill: "#fff", opacity: 0.16 });
  decor.define("pool", { fill: "#38bdf8" });
  decor.define("wake", { fill: "#fff", opacity: 0.35 });
  decor.define("hull", { fill: BOAT_HULL });
  decor.define("deck", { fill: "#c9b48f" });
  decor.define("cabin", { fill: "#cbd5e1" });
  NEON.forEach((c, i) => glow.define(`neon${i}`, { fill: "none", stroke: c, strokeWidth: 1.3 }));
  glow.define("windows", { fill: "#ffd98a", opacity: 0.75 });

  const cellXY = (k: number): P => [gx0 + ((k % cols) + 0.5) * CELL, gy0 + (Math.floor(k / cols) + 0.5) * CELL];
  const used = new Uint8Array(cols * rows);
  const claim = (x: number, y: number, r: number) => {
    const ix0 = Math.max(0, Math.floor((x - r - gx0) / CELL));
    const ix1 = Math.min(cols - 1, Math.floor((x + r - gx0) / CELL));
    const iy0 = Math.max(0, Math.floor((y - r - gy0) / CELL));
    const iy1 = Math.min(rows - 1, Math.floor((y + r - gy0) / CELL));
    for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) used[iy * cols + ix] = 1;
  };
  const free = (k: number, minD: number, maxD: number) => !water[k] && !blocked[k] && !used[k] && dist[k] >= minD && dist[k] <= maxD;
  const trackAngle = (k: number) => (near[k] >= 0 ? heading[samples[near[k]].i] : 0);

  // 4) Monumento característico.
  let landmark: Landmark | null = null;
  if (sc.landmark) {
    const cands: number[] = [];
    for (let k = 0; k < dist.length; k++) if (free(k, 120, 240)) cands.push(k);
    if (cands.length) {
      const k = cands[Math.floor(rng() * cands.length)];
      const [x, y] = cellXY(k);
      landmark = { kind: sc.landmark, x, y };
      claim(x, y, 90);
    }
  }

  // 5) Aparcamientos con coches (circuitos permanentes).
  if (!sc.street) {
    const cands: number[] = [];
    for (let k = 0; k < dist.length; k++) if (free(k, 110, 230)) cands.push(k);
    for (let p = 0; p < 3 && cands.length; p++) {
      const k = cands.splice(Math.floor(rng() * cands.length), 1)[0];
      if (used[k]) continue;
      const [x, y] = cellXY(k);
      const a = trackAngle(k);
      const W = 96;
      const H = 58;
      decor.add("park", rectD(x, y, W, H, a));
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (let row = 0; row < 4; row++) {
        const ly = -H / 2 + 7 + row * 14.5;
        decor.add("parkLines", `M${f(x - (W / 2 - 4) * c - ly * s)} ${f(y - (W / 2 - 4) * s + ly * c)}L${f(x + (W / 2 - 4) * c - ly * s)} ${f(y + (W / 2 - 4) * s + ly * c)}`);
        for (let slot = 0; slot < 18; slot++) {
          if (rng() < 0.22) continue;
          const lx = -W / 2 + 5 + slot * 5.1;
          for (const off of [-2.6, 2.6]) {
            if (rng() < 0.15) continue;
            decor.add(`car${Math.floor(rng() * CAR_COLORS.length)}`, rectD(x + lx * c - (ly + off) * s, y + lx * s + (ly + off) * c, 2, 4.2, a));
          }
        }
      }
      claim(x, y, 70);
    }
  }

  // 6) Edificios, árboles y palmeras celda a celda.
  const urban = sc.biome === "urban";
  const landMin = sc.street ? 24 : 44;
  const cityAngle = heading[0];
  const forest = sc.biome === "forest";
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const k = iy * cols + ix;
      if (!free(k, landMin, NEAR)) continue;
      const x0 = gx0 + ix * CELL;
      const y0 = gy0 + iy * CELL;
      const d = dist[k];
      const cluster = noise(x0, y0, 170);
      const village = noise(x0 + 911, y0 - 377, 260);

      let building = false;
      if (urban || sc.street) {
        const street = ix % 4 === 0 || iy % 5 === 0;
        building = !street && rng() < sc.buildings * (urban ? 0.95 : 0.55 + village * 0.6);
      } else {
        building = d > 80 && village > 0.62 && rng() < sc.buildings * 2.2;
      }

      if (building) {
        const bw = CELL * (0.45 + rng() * 0.5);
        const bh = CELL * (0.45 + rng() * 0.5);
        const x = x0 + CELL / 2 + (rng() - 0.5) * (CELL - bw) * 0.6;
        const y = y0 + CELL / 2 + (rng() - 0.5) * (CELL - bh) * 0.6;
        const a = d < 110 ? trackAngle(k) : urban ? cityAngle : trackAngle(k);
        const height = sc.tall ? 3 + rng() * (6 + Math.min(1, (d - 40) / 200) * 16) : 2 + rng() * 4;
        decor.add("bShadow", rectD(x + height * 0.55, y + height * 0.75, bw, bh, a));
        const roof = Math.floor(rng() * sc.roofs.length);
        decor.add(`roof${roof}`, rectD(x, y, bw, bh, a));
        if (bw > 15 && bh > 15 && rng() < 0.6) decor.add("roofDetail", rectD(x + bw * 0.12, y - bh * 0.1, bw * 0.35, bh * 0.3, a));
        if (!sc.street && !urban && rng() < 0.25) decor.add("pool", rectD(x + bw * 0.5 + 5, y, 6, 4, a));
        if (sc.neon && rng() < 0.45) glow.add(`neon${Math.floor(rng() * NEON.length)}`, rectD(x, y, bw - 2, bh - 2, a));
        if (sc.night && rng() < 0.5) {
          for (let q = 0; q < 3; q++) glow.add("windows", rectD(x + (rng() - 0.5) * bw * 0.6, y + (rng() - 0.5) * bh * 0.6, 1.6, 1.6, a));
        }
        continue;
      }

      const density = forest ? (cluster > 0.32 ? 0.95 : 0.25) * sc.trees : Math.max(0, Math.min(1, (cluster - 0.3) * 2.2)) * sc.trees;
      if (rng() >= density) continue;
      const count = forest ? 2 : 1 + (rng() < 0.3 ? 1 : 0);
      for (let t = 0; t < count; t++) {
        const x = x0 + 4 + rng() * (CELL - 8);
        const y = y0 + 4 + rng() * (CELL - 8);
        const palm = sc.palms && (rng() < (urban || sc.biome === "desert" || sc.biome === "tropical" ? 0.85 : 0.3));
        if (palm) {
          const r = 3.5 + rng() * 2.5;
          const rot = rng() * Math.PI;
          decor.add("treeShadow", circleD(x + 2, y + 2, r * 0.7));
          const frond: P[] = [];
          for (let q = 0; q < 14; q++) {
            const ang = rot + (q * Math.PI) / 7;
            const rr = q % 2 === 0 ? r : r * 0.32;
            frond.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
          }
          decor.add("palm", polyD(frond, x, y, 0));
          decor.add("palmHi", circleD(x, y, r * 0.22));
        } else {
          const r = forest ? 6 + rng() * 6 : sc.biome === "dunes" ? 2 + rng() * 2.5 : 4 + rng() * 5;
          decor.add("treeShadow", circleD(x + r * 0.35, y + r * 0.35, r));
          decor.add(rng() < 0.5 ? "tree0" : "tree1", circleD(x, y, r));
          decor.add("treeHi", circleD(x - r * 0.3, y - r * 0.3, r * 0.55));
        }
      }
    }
  }

  // 7) Barcos: amarrados junto a la orilla y algunos navegando con estela.
  if (w?.boats && waterOut) {
    const waterCells: number[] = [];
    for (let k = 0; k < water.length; k++) if (water[k] && dist[k] < NEAR + 200) waterCells.push(k);
    const shoreSet = new Set(shoreCells);
    for (let b = 0; b < w.boats && waterCells.length; b++) {
      const k = waterCells[Math.floor(rng() * waterCells.length)];
      const [cx0, cy0] = cellXY(k);
      const moored = shoreSet.has(k) || rng() < 0.4;
      const L = moored ? 9 + rng() * 16 : 7 + rng() * 10;
      const W = L * 0.32;
      const x = cx0 + (rng() - 0.5) * CELL * 0.5;
      const y = cy0 + (rng() - 0.5) * CELL * 0.5;
      const a = moored ? trackAngle(k) + Math.PI / 2 : rng() * Math.PI * 2;
      if (!moored) {
        decor.add(
          "wake",
          polyD(
            [
              [-L * 0.45, -W * 0.3],
              [-L * 2.6, -W * 1.8],
              [-L * 2.6, -W * 1.2],
              [-L * 0.45, 0],
              [-L * 2.6, W * 1.2],
              [-L * 2.6, W * 1.8],
              [-L * 0.45, W * 0.3],
            ],
            x,
            y,
            a,
          ),
        );
      }
      decor.add(
        "hull",
        polyD(
          [
            [-L / 2, -W / 2],
            [L * 0.18, -W / 2],
            [L / 2, 0],
            [L * 0.18, W / 2],
            [-L / 2, W / 2],
          ],
          x,
          y,
          a,
        ),
      );
      decor.add(L > 16 ? "cabin" : "deck", rectD(x - L * 0.08 * Math.cos(a), y - L * 0.08 * Math.sin(a), L * 0.38, W * 0.55, a));
    }
  }

  // 8) Muros y vallas (urbanos) y vallas publicitarias junto a las rectas.
  const offsetPath = (off: number, s0: number, s1: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      if (cum[i] < s0 || cum[i] > s1) continue;
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      out.push(`${f(pts[i][0] - ((b[1] - a[1]) / len) * off)} ${f(pts[i][1] + ((b[0] - a[0]) / len) * off)}`);
    }
    return out.length > 1 ? "M" + out.join("L") : "";
  };
  if (sc.street) {
    edge.define("wall", { fill: "none", stroke: "#d6dae0", strokeWidth: 1.1 });
    edge.define("fence", { fill: "none", stroke: "#2b3038", strokeWidth: 0.5, dash: "1.2 0.8", opacity: 0.9 });
    for (const sgn of [1, -1]) {
      edge.add("wall", offsetPath(10.3 * sgn, 0, total) + "Z");
      edge.add("fence", offsetPath(11.4 * sgn, 0, total) + "Z");
    }
  } else {
    edge.define("tyres", { fill: "none", stroke: "#1f2329", strokeWidth: 1.6, dash: "1.4 0.5" });
  }
  SPONSORS.forEach((c, i) => edge.define(`board${i}`, { fill: c, stroke: "#0b0d10", strokeWidth: 0.3 }));
  const indexAt = (s: number) => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid + 1] < s) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let flip = 1;
  for (let s = 60; s < total - 40; s += 95) {
    const i = indexAt(s);
    if (windowTurn[i] > 9) continue;
    flip = -flip;
    const nearPit = s < pitHalf + 70 || s > total - pitHalf - 70;
    if (nearPit && flip === side) continue;
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const off = (sc.street ? 11.6 : 19.5) * flip;
    const color = Math.floor(rng() * SPONSORS.length);
    edge.add(`board${color}`, rectD(pts[i][0] + nx * off, pts[i][1] + ny * off, 24, 1.6, heading[i]));
  }
  // Barreras de neumáticos en el exterior de las curvas fuertes.
  if (!sc.street) {
    for (let i = 0; i < n; i += 3) {
      if (windowTurn[i] < 40) continue;
      let dh = heading[(i + 2) % n] - heading[(i - 2 + n) % n];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const out = dh > 0 ? -1 : 1;
      const s = cum[i];
      if (s < pitHalf + 80 || s > total - pitHalf - 80) continue;
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / len;
      const ny = (b[0] - a[0]) / len;
      const x = pts[i][0] + nx * 31 * out;
      const y = pts[i][1] + ny * 31 * out;
      edge.add("tyres", `M${f(x - Math.cos(heading[i]) * 4)} ${f(y - Math.sin(heading[i]) * 4)}L${f(x + Math.cos(heading[i]) * 4)} ${f(y + Math.sin(heading[i]) * 4)}`);
    }
  }

  // 9) Focos (carreras nocturnas).
  const lights: P[] = [];
  if (sc.night) {
    let alt = 1;
    for (let s = 0; s < total; s += 42) {
      const i = indexAt(s);
      alt = -alt;
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const off = (sc.street ? 12.5 : 18) * alt;
      lights.push([pts[i][0] - ((b[1] - a[1]) / len) * off, pts[i][1] + ((b[0] - a[0]) / len) * off]);
    }
  }

  return {
    colors,
    fields: fields.list(),
    water: waterOut,
    decor: decor.list(),
    glow: glow.list(),
    edge: edge.list(),
    lights,
    landmark,
    near: NEAR,
  };
}
