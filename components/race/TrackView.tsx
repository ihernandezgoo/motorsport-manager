import { memo, useEffect, useId, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type WheelEvent as RWheelEvent } from "react";
import { pitLaneOffset, scenePointAt, trackScene } from "@/lib/game/geo";
import { hashString } from "@/lib/game/rng";
import type { PathLayer } from "@/lib/game/sceneryGen";
import { COMPOUND_INFO } from "@/lib/game/tyres";
import type { LiveDot } from "@/lib/liveRace";
import { textOn } from "../ui";

export type CameraMode = { kind: "follow"; id: string } | { kind: "overview" } | { kind: "free"; x: number; y: number };

/** Zoom = log2(píxeles por metro). */
export const FOLLOW_ZOOM = 1.25;
const MIN_ZOOM = -4;
const MAX_ZOOM = 3.5;
const DEFAULT_GARAGES = "#e10600,#27f4d2,#ff8000,#3671c6,#229971,#0093cc,#64c4ff,#6692ff,#b6babd,#5a5f66,#f2f2f2";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function Layer({ l }: { l: PathLayer }) {
  return <path d={l.d} fill={l.fill} opacity={l.opacity} stroke={l.stroke} strokeWidth={l.strokeWidth} strokeDasharray={l.dash} strokeLinejoin="round" />;
}

/** Monumento característico del circuito visto desde arriba. */
function LandmarkArt({ kind, x, y, uid }: { kind: string; x: number; y: number; uid: string }) {
  if (kind === "sphere") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <circle r={95} fill={`url(#sphereGlow-${uid})`} />
        <circle r={58} fill={`url(#sphere-${uid})`} stroke="#fde68a" strokeWidth={1.5} />
        <circle r={40} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 4" />
      </g>
    );
  }
  if (kind === "stadium") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx={5} cy={7} rx={82} ry={64} fill="#000" opacity={0.3} />
        <ellipse rx={82} ry={64} fill="#d5dae0" stroke="#9aa3ad" strokeWidth={2} />
        <ellipse rx={64} ry={47} fill={`url(#crowd-${uid})`} />
        <rect x={-45} y={-29} width={90} height={58} fill="#3f8f3a" stroke="#fff" strokeWidth={1} />
        <line x1={0} y1={-29} x2={0} y2={29} stroke="#fff" strokeWidth={0.8} />
        <circle r={8} fill="none" stroke="#fff" strokeWidth={0.8} />
      </g>
    );
  }
  if (kind === "wheel") {
    // Noria: la estructura se ve como una línea y su sombra dibuja la rueda en el suelo.
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx={28} cy={36} rx={44} ry={22} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={4} />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={28} y1={36} x2={28 + Math.cos((i * Math.PI) / 4) * 44} y2={36 + Math.sin((i * Math.PI) / 4) * 22} stroke="#000" strokeOpacity={0.25} strokeWidth={1.2} />
        ))}
        <rect x={-44} y={-3} width={88} height={6} rx={2} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.8} />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={-42 + i * 7.3} y={-4.5} width={4} height={9} rx={1} fill={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"][i % 4]} />
        ))}
        <rect x={-6} y={-10} width={12} height={20} fill="#9ca3af" />
      </g>
    );
  }
  // Torre mirador.
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L90 70" stroke="#000" strokeOpacity={0.3} strokeWidth={9} strokeLinecap="round" />
      <circle r={14} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={2} />
      <circle r={8} fill="#dc2626" />
    </g>
  );
}

/** Escenario estático del circuito (en metros). Se memoriza: solo cambia con el circuito. */
const Scene = memo(function Scene({ circuitId, garageKey }: { circuitId: string; garageKey: string }) {
  const s = trackScene(circuitId);
  const uid = useId().replace(/[:«»]/g, "");
  const colors = garageKey.split(",");
  const { minX, minY, maxX, maxY } = s.bbox;
  const sc = s.scenery;
  const env = s.env;
  const c = env.colors;
  const forest = sc.biome === "forest";
  const urban = sc.biome === "urban";
  const sandy = sc.biome === "desert" || sc.biome === "dunes";
  const baseFill = forest ? `url(#canopy-${uid})` : urban ? `url(#city-${uid})` : `url(#grass-${uid})`;
  const waterColor = sc.night ? "#123553" : "#2c6e9e";
  const shoreColor = urban || sc.street ? "#c6cad0" : "#d9c99a";
  return (
    <g>
      <defs>
        <pattern id={`grass-${uid}`} width={60} height={60} patternUnits="userSpaceOnUse" patternTransform={sandy ? "rotate(70)" : "rotate(35)"}>
          <rect width={60} height={60} fill={c.ground} />
          <rect width={30} height={60} fill={c.stripe} />
        </pattern>
        <pattern id={`canopy-${uid}`} width={44} height={44} patternUnits="userSpaceOnUse">
          <rect width={44} height={44} fill={c.tree[0]} />
          <circle cx={10} cy={11} r={10} fill={c.tree[1]} />
          <circle cx={32} cy={8} r={8} fill={c.tree[1]} />
          <circle cx={24} cy={30} r={12} fill={c.tree[1]} />
          <circle cx={6} cy={36} r={7} fill={c.treeHi} opacity={0.5} />
          <circle cx={21} cy={26} r={5} fill={c.treeHi} opacity={0.45} />
        </pattern>
        <pattern id={`city-${uid}`} width={64} height={64} patternUnits="userSpaceOnUse">
          <rect width={64} height={64} fill="#4a4f56" />
          <rect x={4} y={4} width={24} height={18} fill={sc.roofs[0]} />
          <rect x={33} y={4} width={27} height={24} fill={sc.roofs[1 % sc.roofs.length]} />
          <rect x={4} y={27} width={18} height={33} fill={sc.roofs[2 % sc.roofs.length]} />
          <rect x={26} y={33} width={34} height={27} fill={sc.roofs[3 % sc.roofs.length]} />
          <rect x={4} y={4} width={56} height={56} fill="#000" opacity={0.12} />
        </pattern>
        <pattern id={`waves-${uid}`} width={40} height={18} patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <path d="M0 9 Q10 5 20 9 T40 9" fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={1.2} />
        </pattern>
        <radialGradient id={`light-${uid}`}>
          <stop offset="0%" stopColor="#fff6d5" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#fff6d5" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`sphere-${uid}`} cx="40%" cy="35%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="45%" stopColor="#f97316" />
          <stop offset="80%" stopColor="#db2777" />
          <stop offset="100%" stopColor="#6d28d9" />
        </radialGradient>
        <radialGradient id={`sphereGlow-${uid}`}>
          <stop offset="55%" stopColor="#f472b6" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
        </radialGradient>
        <pattern id={`crowd-${uid}`} width={4} height={4} patternUnits="userSpaceOnUse">
          <rect width={4} height={4} fill="#39404c" />
          <circle cx={1} cy={1} r={0.75} fill="#e5484d" />
          <circle cx={3} cy={1.2} r={0.75} fill="#f4f4f5" />
          <circle cx={1.2} cy={3} r={0.75} fill="#3b82f6" />
          <circle cx={3.1} cy={3.1} r={0.75} fill="#facc15" />
        </pattern>
        <pattern id={`chk-${uid}`} width={2} height={2} patternUnits="userSpaceOnUse">
          <rect width={2} height={2} fill="#fff" />
          <rect width={1} height={1} fill="#111" />
          <rect x={1} y={1} width={1} height={1} fill="#111" />
        </pattern>
      </defs>
      <rect x={minX - 3000} y={minY - 3000} width={maxX - minX + 6000} height={maxY - minY + 6000} fill={baseFill} />
      {(forest || urban) && (
        <>
          <path d={s.d} fill="none" stroke={forest ? `url(#grass-${uid})` : c.ground} strokeOpacity={0.6} strokeWidth={env.near * 2 + 80} strokeLinejoin="round" />
          <path d={s.d} fill="none" stroke={forest ? `url(#grass-${uid})` : c.ground} strokeWidth={env.near * 2} strokeLinejoin="round" />
        </>
      )}
      {env.fields.map((l, i) => (
        <Layer key={i} l={l} />
      ))}
      <path d={s.d} fill="none" stroke={sc.street ? "#8e949c" : c.runoff} strokeOpacity={sc.street ? 1 : 0.5} strokeWidth={sc.street ? 40 : 95} strokeLinejoin="round" />
      {!sc.street &&
        s.gravel.map((d, i) => <path key={i} d={d} fill="none" stroke={c.gravel} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />)}
      {env.water && (
        <g>
          <path d={env.water.shore} fill={shoreColor} />
          <path d={env.water.d} fill={waterColor} />
          <path d={env.water.d} fill={`url(#waves-${uid})`} />
        </g>
      )}
      {env.decor.map((l, i) => (
        <Layer key={i} l={l} />
      ))}
      {sc.night && (
        <>
          <rect x={minX - 3000} y={minY - 3000} width={maxX - minX + 6000} height={maxY - minY + 6000} fill="#050d24" opacity={0.55} />
          <path d={s.d} fill="none" stroke="#fff1c1" strokeOpacity={0.07} strokeWidth={80} strokeLinejoin="round" />
          <path d={s.d} fill="none" stroke="#fff1c1" strokeOpacity={0.1} strokeWidth={40} strokeLinejoin="round" />
        </>
      )}
      {env.glow.map((l, i) => (
        <Layer key={i} l={l} />
      ))}
      {env.landmark && <LandmarkArt kind={env.landmark.kind} x={env.landmark.x} y={env.landmark.y} uid={uid} />}
      {s.motorhomes.map((m, i) => (
        <g key={i} transform={`translate(${m.x} ${m.y}) rotate(${m.angle})`}>
          <rect x={-m.w / 2 + 1.5} y={-m.h / 2 + 2} width={m.w} height={m.h} fill="#000" opacity={0.3} />
          <rect x={-m.w / 2} y={-m.h / 2} width={m.w} height={m.h} rx={1} fill="#e5e7eb" />
          <rect x={-m.w / 2 + 1} y={-m.h / 2 + 1} width={m.w - 2} height={m.h - 2} rx={0.8} fill={colors[i % colors.length]} opacity={0.85} />
          <rect x={-m.w / 2 + 3} y={-1} width={m.w - 6} height={2} fill="#fff" opacity={0.5} />
        </g>
      ))}
      <path d={s.d} fill="none" stroke={sc.street ? "#a3a9b1" : "#8a948f"} strokeWidth={27} strokeLinejoin="round" />
      <path d={s.pitLane} fill="none" stroke="#f1f1f1" strokeWidth={11.5} strokeLinejoin="round" />
      <path d={s.pitLane} fill="none" stroke="#4a4f57" strokeWidth={10} strokeLinejoin="round" />
      {s.kerbs.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#d62828" strokeWidth={19.5} strokeLinejoin="round" />
          <path d={d} fill="none" stroke="#f5f5f5" strokeWidth={19.5} strokeDasharray="3 3" strokeLinejoin="round" />
        </g>
      ))}
      <path d={s.d} fill="none" stroke="#f2f2f2" strokeWidth={15.4} strokeLinejoin="round" />
      <path d={s.d} fill="none" stroke="#3c4148" strokeWidth={14} strokeLinejoin="round" />
      <path d={s.d} fill="none" stroke="#2c3036" strokeOpacity={0.55} strokeWidth={4} strokeLinejoin="round" />
      {s.grid.map((g, i) => (
        <g key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.angle})`}>
          <rect x={-0.4} y={-1.4} width={0.8} height={2.8} fill="#fff" opacity={0.85} />
        </g>
      ))}
      <g transform={`translate(${s.sf.x} ${s.sf.y}) rotate(${s.sf.angle})`}>
        <rect x={-1.5} y={-7.7} width={3} height={15.4} fill={`url(#chk-${uid})`} />
      </g>
      <g transform={`translate(${s.pitBuilding.x} ${s.pitBuilding.y}) rotate(${s.pitBuilding.angle})`}>
        <rect x={-s.pitBuilding.w / 2} y={-s.pitBuilding.h / 2} width={s.pitBuilding.w} height={s.pitBuilding.h} fill="#5d6773" stroke="#d5dbe3" strokeWidth={1} />
        {Array.from({ length: Math.floor(s.pitBuilding.w / 20) }, (_, i) => (
          <rect key={i} x={-s.pitBuilding.w / 2 + 6 + i * 20} y={-s.pitBuilding.h / 2 + 4} width={12} height={s.pitBuilding.h - 8} fill="#6f7a87" />
        ))}
      </g>
      {s.garages.map((g, i) => (
        <g key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.angle})`}>
          <rect x={-g.w / 2} y={-g.h / 2} width={g.w} height={g.h} fill="#2b3038" stroke="#1b1e23" strokeWidth={0.6} />
          <rect x={-g.w / 2 + 1} y={-2} width={g.w - 2} height={4} fill={colors[Math.floor(i / 2) % colors.length]} />
        </g>
      ))}
      {s.stands.map((g, i) => (
        <g key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.angle})`}>
          <rect x={-g.w / 2 + 2} y={-g.h / 2 + 2} width={g.w} height={g.h} fill="#000" opacity={0.25} />
          <rect x={-g.w / 2} y={-g.h / 2} width={g.w} height={g.h} fill={`url(#crowd-${uid})`} stroke="#d5dbe3" strokeWidth={1.4} />
        </g>
      ))}
      {env.edge.map((l, i) => (
        <Layer key={i} l={l} />
      ))}
      {env.lights.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={20} fill={`url(#light-${uid})`} />
          <circle cx={x} cy={y} r={1.1} fill="#fffbe8" />
        </g>
      ))}
    </g>
  );
});

/**
 * Vista cenital dibujada del circuito real con los coches en pista.
 * Trabaja en metros; la cámara puede seguir a un coche, mostrar el trazado entero o moverse libremente.
 */
export function TrackView({
  circuitId,
  cars = [],
  camera,
  zoom = FOLLOW_ZOOM,
  onZoom,
  onCamera,
  onSelect,
  labelIds = [],
  interactive = true,
  garageColors,
  className,
  children,
}: {
  circuitId: string;
  cars?: LiveDot[];
  camera: CameraMode;
  zoom?: number;
  onZoom?: (z: number) => void;
  onCamera?: (c: CameraMode) => void;
  onSelect?: (id: string) => void;
  labelIds?: string[];
  interactive?: boolean;
  garageColors?: string[];
  className?: string;
  children?: ReactNode;
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; ppm: number; moved: boolean } | null>(null);
  const scene = trackScene(circuitId);
  const tx0 = scene.bbox.minX + 260;
  const ty0 = scene.bbox.minY + 260;
  const tx1 = scene.bbox.maxX - 260;
  const ty1 = scene.bbox.maxY - 260;
  const fit = w > 0 ? Math.min(w / ((tx1 - tx0) * 1.12), h / ((ty1 - ty0) * 1.12)) : 0.2;

  let camX = (tx0 + tx1) / 2;
  let camY = (ty0 + ty1) / 2;
  let ppm = 2 ** zoom;
  const followed = camera.kind === "follow" ? cars.find((c) => c.id === camera.id) : undefined;
  if (camera.kind === "overview" || (camera.kind === "follow" && !followed)) {
    ppm = fit;
  } else if (followed) {
    const p = scenePointAt(scene, followed.progress + 0.003);
    camX = p.x;
    camY = p.y;
  } else if (camera.kind === "free") {
    camX = camera.x;
    camY = camera.y;
  }
  const toScreen = (x: number, y: number) => [w / 2 + (x - camX) * ppm, h / 2 + (y - camY) * ppm] as const;
  const carR = Math.max(9, Math.min(14, 6 + ppm * 2.5));

  const onWheel = (e: RWheelEvent) => {
    if (!interactive || !onZoom) return;
    const current = camera.kind === "overview" ? Math.log2(fit) : zoom;
    onZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current - e.deltaY * 0.0015)));
  };
  const onPointerDown = (e: RPointerEvent) => {
    if (!interactive || !onCamera) return;
    drag.current = { sx: e.clientX, sy: e.clientY, cx: camX, cy: camY, ppm, moved: false };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !onCamera) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    onCamera({ kind: "free", x: d.cx - dx / d.ppm, y: d.cy - dy / d.ppm });
    if (camera.kind !== "free" && onZoom) onZoom(Math.log2(d.ppm));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const visible = cars
    .map((c) => {
      const p = scenePointAt(scene, c.progress);
      // En boxes el coche va por el carril (desplazado del eje de la pista) y se para frente a su garaje.
      let frac = c.progress % 1;
      if (frac < 0) frac += 1;
      if (frac > 0.5) frac -= 1;
      const lateral = c.inPit ? pitLaneOffset(scene, frac * scene.total, c.boxed) : ((hashString(c.id) % 5) - 2) * 1.5;
      const a = (p.angle * Math.PI) / 180;
      const [x, y] = toScreen(p.x - Math.sin(a) * lateral, p.y + Math.cos(a) * lateral);
      return { c, x, y, angle: p.angle };
    })
    .filter(({ x, y }) => x > -80 && y > -80 && x < w + 80 && y < h + 80)
    .sort((a, b) => Number(a.c.isPlayer) - Number(b.c.isPlayer) || b.c.pos - a.c.pos);

  return (
    <div
      ref={ref}
      style={{ background: scene.scenery.night ? "#0b1424" : scene.env.colors.ground }}
      className={`relative overflow-hidden ${interactive ? "cursor-grab active:cursor-grabbing" : ""} ${className ?? ""}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <svg className="pointer-events-none absolute inset-0" width={w} height={h}>
        {w > 0 && (
          <g transform={`translate(${w / 2} ${h / 2}) scale(${ppm}) translate(${-camX} ${-camY})`}>
            <Scene circuitId={circuitId} garageKey={(garageColors ?? []).join(",") || DEFAULT_GARAGES} />
          </g>
        )}
      </svg>
      <svg className="absolute inset-0" width={w} height={h} style={{ pointerEvents: "none" }}>
        {visible.map(({ c, x, y }) => {
          const r = c.isPlayer ? carR + 2 : carR;
          const fill = c.out ? "#4b5563" : c.color;
          return (
            <g
              key={c.id}
              transform={`translate(${x} ${y})`}
              opacity={c.out ? 0.5 : c.inPit ? 0.7 : 1}
              style={{ pointerEvents: interactive ? "auto" : "none", cursor: "pointer" }}
              onClick={() => onSelect?.(c.id)}
            >
              {followed?.id === c.id && <circle r={r + 7} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="5 4" />}
              <circle cy={1.5} r={r + 1} fill="#000" opacity={0.35} />
              <circle r={r} fill={fill} stroke={c.isPlayer ? "#fff" : "rgba(0,0,0,.65)"} strokeWidth={c.isPlayer ? 2.5 : 1.5} />
              <text y={r * 0.36} textAnchor="middle" fontSize={r * (String(c.number).length > 1 ? 0.95 : 1.1)} fontWeight={900} fill={c.out ? "#e5e7eb" : textOn(c.color)} className="tabular">
                {c.number}
              </text>
            </g>
          );
        })}
      </svg>
      {visible.map(({ c, x, y }) => {
        if (c.out) return null;
        const full = labelIds.includes(c.id) || followed?.id === c.id;
        if (full) {
          return (
            <div key={c.id} className="pointer-events-none absolute" style={{ left: x, top: y }}>
              <div className="absolute bottom-3 left-0 h-7 w-px bg-white/80" />
              <div className="absolute bottom-10 left-0 flex h-7 -translate-x-1/2 items-stretch whitespace-nowrap text-[13px] font-bold shadow-[0_2px_8px_rgba(0,0,0,.5)]">
                <span className="grid w-8 place-items-center bg-[#111827] text-white tabular">{c.pos}</span>
                <span className="w-1" style={{ background: c.color }} />
                <span className={`flex items-center px-2 uppercase tracking-wide ${c.isPlayer ? "bg-white text-black" : "bg-[#1f2937] text-white"}`}>{c.last}</span>
                <span className={`flex items-center gap-1 px-2 tabular ${c.isPlayer ? "bg-[#e5e7eb] text-black" : "bg-[#111827] text-white"}`}>
                  <span className="grid h-4 w-4 place-items-center rounded-full border-2 text-[8px] leading-none" style={{ borderColor: COMPOUND_INFO[c.compound].color }}>
                    {COMPOUND_INFO[c.compound].letter.charAt(0)}
                  </span>
                  {Math.round(100 - c.wear)}%{c.inPit && " · BOX"}
                </span>
              </div>
            </div>
          );
        }
        if (ppm < 0.9) return null;
        return (
          <div key={c.id} className="pointer-events-none absolute" style={{ left: x + carR * 0.8, top: y - carR * 0.8 - 18 }}>
            <span className="flex h-5 items-stretch text-[11px] font-bold shadow">
              <span className="grid min-w-5 place-items-center bg-[#111827]/90 px-1 text-white tabular">{c.pos}</span>
              <span className="w-1" style={{ background: c.color }} />
              <span className="flex items-center bg-[#111827]/80 px-1 text-white/90">{c.code}</span>
            </span>
          </div>
        );
      })}
      {children}
    </div>
  );
}
