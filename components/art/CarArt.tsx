import { useId } from "react";
import type { Livery } from "@/lib/game/data/liveries";
import type { SeriesId } from "@/lib/game/types";

const BODY =
  "M40,74 L60,70 C90,64 120,52 150,44 L178,30 L196,28 C204,28 208,32 210,40 L216,46 L262,48 C300,52 330,62 360,72 L420,82 L422,88 L380,90 L300,84 L250,92 L120,94 L60,90 L40,86 Z";

function LiveryPattern({ l }: { l: Livery }) {
  switch (l.pattern) {
    case "upper":
      return (
        <>
          <path d="M120,0 L262,0 L262,50 C220,52 170,54 120,60 Z" fill={l.second} />
          <path d="M120,60 C170,54 220,52 262,50 L262,53 C220,55 170,57 120,63 Z" fill={l.accent} />
        </>
      );
    case "lower":
      return (
        <>
          <rect x={0} y={72} width={440} height={40} fill={l.second} />
          <path d="M0,70 L440,70 L440,73 L0,73 Z" fill={l.accent} />
          <path d="M360,72 L440,80 L440,90 L340,90 Z" fill={l.base} />
        </>
      );
    case "swoosh":
      return (
        <>
          <path d="M70,100 C150,92 230,70 330,52 L360,60 C260,80 170,98 90,108 Z" fill={l.second} />
          <path d="M80,104 C160,96 240,76 344,56 L350,58 C246,78 166,100 86,108 Z" fill={l.accent} />
        </>
      );
    case "split":
      return (
        <>
          <rect x={150} y={0} width={110} height={120} fill={l.second} />
          <rect x={148} y={0} width={5} height={120} fill={l.accent} />
          <rect x={262} y={0} width={5} height={120} fill={l.accent} />
        </>
      );
    case "stripe":
      return (
        <>
          <path d="M40,64 C150,56 280,58 420,80 L420,86 C280,66 150,66 40,72 Z" fill={l.second} />
          <path d="M40,74 C150,68 280,70 420,88 L420,90 C280,74 150,74 40,77 Z" fill={l.accent} />
          <path d="M150,20 L210,20 L210,46 L150,50 Z" fill={l.second} />
        </>
      );
  }
}

function Wheel({ cx, cy, r, rim }: { cx: number; cy: number; r: number; rim: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#111214" />
      <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke="#2a2c30" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#1c1d20" stroke={rim} strokeWidth={3} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line
          key={a}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos((a * Math.PI) / 180) * r * 0.55}
          y2={cy + Math.sin((a * Math.PI) / 180) * r * 0.55}
          stroke="#3a3c42"
          strokeWidth={2.4}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.16} fill={rim} />
      <text x={cx} y={cy - r + 7} fontSize={5} fill="#d1d5db" textAnchor="middle" fontWeight={700} letterSpacing={1}>
        P ZERO
      </text>
    </g>
  );
}

/** Monoplaza de perfil (mirando a la derecha) con la decoración del equipo. */
export function CarSide({ livery, number, series = "f1", helmet, className }: { livery: Livery; number?: number; series?: SeriesId; helmet?: string; className?: string }) {
  const uid = useId().replace(/[:«»]/g, "");
  const rim = livery.rim ?? "#6b7280";
  const spec = series !== "f1";
  return (
    <svg viewBox="0 0 440 120" className={className} aria-hidden>
      <defs>
        <clipPath id={`body-${uid}`}>
          <path d={BODY} />
          {spec && <path d="M178,30 L44,22 L44,32 L150,44 Z" />}
        </clipPath>
        <linearGradient id={`shade-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="0.35" stopColor="#fff" stopOpacity={0.04} />
          <stop offset="1" stopColor="#000" stopOpacity={0.4} />
        </linearGradient>
      </defs>
      <ellipse cx={220} cy={112} rx={200} ry={5} fill="#000" opacity={0.35} />
      {/* alerón trasero */}
      <path d={spec ? "M6,12 L62,12 L62,26 L20,28 L20,84 L6,86 Z" : "M8,16 L60,16 L60,26 L18,28 L18,84 L8,86 Z"} fill={livery.base} />
      <path d={spec ? "M6,12 L62,12 L62,18 L6,18 Z" : "M8,16 L60,16 L60,21 L8,21 Z"} fill="#16181b" />
      <path d="M16,27 L60,25 L60,30 L16,31 Z" fill="#16181b" />
      <path d="M8,62 L18,60 L18,84 L8,86 Z" fill="#16181b" opacity={0.7} />
      <path d="M9,40 L17,39 L17,44 L9,45 Z" fill={livery.second} />
      {/* suelo */}
      <path d="M48,96 L384,96 L384,104 L48,104 Z" fill="#141518" />
      {/* carrocería con decoración */}
      <g clipPath={`url(#body-${uid})`}>
        <rect x={0} y={0} width={440} height={120} fill={livery.base} />
        <LiveryPattern l={livery} />
        <path d="M110,95 L250,93 L262,86 L262,76 C220,82 170,88 110,90 Z" fill="#000" opacity={0.28} />
        <rect x={0} y={0} width={440} height={120} fill={`url(#shade-${uid})`} />
      </g>
      <path d={BODY} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={1.2} />
      <ellipse cx={203} cy={35} rx={3.5} ry={5} fill="#0d0e10" />
      <path d="M262,39 L277,37 L277,42 L262,44 Z" fill="#1b1c1f" />
      {/* entrada del pontón */}
      <path d="M246,56 L262,54 L262,82 L246,84 C240,74 240,64 246,56 Z" fill="#0d0e10" />
      {/* piloto y halo */}
      {helmet && <circle cx={230} cy={37} r={9} fill={helmet} stroke="#000" strokeWidth={1} />}
      {helmet && <path d="M233,33 C237,33 239,36 239,39 L231,39 Z" fill="#0b0b0b" />}
      <path d="M212,46 C222,26 252,26 264,46" fill="none" stroke="#1b1c1f" strokeWidth={4.5} strokeLinecap="round" />
      <line x1={262} y1={46} x2={270} y2={52} stroke="#1b1c1f" strokeWidth={4} />
      <rect x={270} y={46} width={8} height={3} rx={1} fill="#1b1c1f" />
      {/* alerón delantero */}
      <path d="M350,95 L432,93 L436,101 L350,103 Z" fill="#16181b" />
      <path d="M412,82 L431,84 L436,101 L416,101 Z" fill={livery.base} stroke="#000" strokeOpacity={0.4} strokeWidth={0.8} />
      <path d="M356,90 L412,88 L412,92 L356,94 Z" fill={livery.accent} />
      <Wheel cx={84} cy={82} r={31} rim={rim} />
      <Wheel cx={350} cy={84} r={28} rim={rim} />
      {number !== undefined && (
        <text x={124} y={66} fontSize={20} fontWeight={900} fontStyle="italic" fill={livery.accent === livery.base ? "#ffffff" : livery.accent} stroke="#000" strokeOpacity={0.35} strokeWidth={0.8} fontFamily="sans-serif">
          {number}
        </text>
      )}
    </svg>
  );
}

/** Monoplaza visto desde arriba, apuntando hacia +x, centrado en el origen (56 × 22 unidades). */
export function CarTop({ livery, helmet, highlight }: { livery: Livery; helmet?: string; highlight?: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={0} rx={30} ry={12} fill="#000" opacity={0.35} />
      <rect x={-29} y={-10} width={6} height={20} rx={1.5} fill={livery.second} />
      <rect x={-27} y={-10} width={2} height={20} fill={livery.accent} opacity={0.8} />
      <rect x={-21} y={-12} width={10} height={5} rx={1.5} fill="#121214" />
      <rect x={-21} y={7} width={10} height={5} rx={1.5} fill="#121214" />
      <rect x={13} y={-11} width={8} height={4.5} rx={1.4} fill="#121214" />
      <rect x={13} y={6.5} width={8} height={4.5} rx={1.4} fill="#121214" />
      <path d="M-23,-6 L-4,-7.5 L6,-4.5 L22,-2.2 L27,-1.4 L27,1.4 L22,2.2 L6,4.5 L-4,7.5 L-23,6 Z" fill={livery.base} stroke={highlight ? "#ffffff" : "#000"} strokeWidth={highlight ? 1.4 : 0.6} />
      <path d="M-14,-7 L3,-7.2 L6,-4.5 L-14,-4 Z" fill={livery.second} />
      <path d="M-14,7 L3,7.2 L6,4.5 L-14,4 Z" fill={livery.second} />
      <rect x={-21} y={-1.1} width={20} height={2.2} fill={livery.accent} />
      <ellipse cx={0} cy={0} rx={4.6} ry={2.8} fill="#0b0b0c" />
      <circle cx={-0.6} cy={0} r={2} fill={helmet ?? "#e5e7eb"} />
      <path d="M-4,-3 C1,-4.5 5,-3 6,0 C5,3 1,4.5 -4,3" fill="none" stroke="#1b1c1f" strokeWidth={1.2} />
      <rect x={25} y={-10} width={4} height={20} rx={1} fill={livery.second} />
      <rect x={26.5} y={-10} width={1.5} height={20} fill={livery.accent} />
    </g>
  );
}
