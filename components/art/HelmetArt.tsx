import { useId } from "react";
import type { HelmetDesign } from "@/lib/game/data/liveries";

const SHELL = "M14,66 C10,40 28,14 60,12 C86,11 106,28 108,50 L108,66 C108,76 100,82 90,82 L34,84 C22,84 15,77 14,66 Z";
const VISOR = "M62,38 C74,34 96,35 108,42 L108,58 L66,58 C59,58 56,52 57,46 C57,42 59,39 62,38 Z";

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(" ");
}

function Pattern({ d }: { d: HelmetDesign }) {
  switch (d.pattern) {
    case "stripes":
      return (
        <>
          <polygon points="0,80 30,80 92,0 62,0" fill={d.second} />
          <polygon points="36,80 46,80 108,0 98,0" fill={d.accent} />
        </>
      );
    case "chevron":
      return (
        <>
          <polygon points="0,20 40,20 70,50 40,80 0,80 30,50" fill={d.second} />
          <polygon points="44,20 52,20 82,50 52,80 44,80 74,50" fill={d.accent} />
        </>
      );
    case "split":
      return (
        <>
          <rect x={0} y={0} width={120} height={44} fill={d.second} />
          <rect x={0} y={44} width={120} height={4} fill={d.accent} />
        </>
      );
    case "band":
      return (
        <>
          <rect x={0} y={60} width={120} height={14} fill={d.second} />
          <rect x={0} y={56} width={120} height={3} fill={d.accent} />
          <rect x={0} y={75} width={120} height={3} fill={d.accent} />
          <rect x={40} y={0} width={14} height={60} fill={d.second} opacity={0.9} />
        </>
      );
    case "flames":
      return (
        <>
          <path d="M0,84 C20,70 18,56 34,52 C30,62 42,62 46,50 C52,58 60,54 62,44 C68,54 78,56 84,46 C86,62 70,78 60,86 Z" fill={d.second} />
          <path d="M0,86 C18,78 24,68 34,66 C34,72 44,72 48,64 C52,70 60,70 62,62 C64,72 56,82 48,88 Z" fill={d.accent} />
        </>
      );
    case "stars":
      return (
        <>
          <path d="M0,0 L120,0 L120,30 C80,40 40,40 0,30 Z" fill={d.second} />
          <polygon points={star(36, 22, 7)} fill={d.accent} />
          <polygon points={star(58, 18, 5)} fill={d.accent} />
          <polygon points={star(24, 48, 5)} fill={d.second} />
        </>
      );
    case "halo":
      return (
        <>
          <path d={VISOR} fill="none" stroke={d.second} strokeWidth={16} strokeLinejoin="round" />
          <path d={VISOR} fill="none" stroke={d.accent} strokeWidth={5} strokeLinejoin="round" />
        </>
      );
    case "diagonal":
      return (
        <>
          <polygon points="0,0 120,0 120,10 0,74" fill={d.second} />
          <polygon points="0,74 120,10 120,16 0,80" fill={d.accent} />
        </>
      );
  }
}

/** Casco visto de perfil (mirando a la derecha) con el diseño del piloto. */
export function HelmetArt({ design, number, size = 64, className, fill }: { design: HelmetDesign; number?: number; size?: number; className?: string; fill?: boolean }) {
  const uid = useId().replace(/[:«»]/g, "");
  return (
    <svg
      viewBox="0 0 120 96"
      width={fill ? "100%" : size}
      height={fill ? "100%" : size * 0.8}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <clipPath id={`shell-${uid}`}>
          <path d={SHELL} />
        </clipPath>
        <linearGradient id={`gloss-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.45} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0.05} />
          <stop offset="1" stopColor="#000" stopOpacity={0.35} />
        </linearGradient>
        <linearGradient id={`visor-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={design.visor} />
          <stop offset="1" stopColor="#05070a" />
        </linearGradient>
      </defs>
      <ellipse cx={60} cy={90} rx={44} ry={4} fill="#000" opacity={0.25} />
      <g clipPath={`url(#shell-${uid})`}>
        <rect x={0} y={0} width={120} height={96} fill={design.base} />
        <Pattern d={design} />
        <rect x={0} y={0} width={120} height={96} fill={`url(#gloss-${uid})`} />
      </g>
      <path d={SHELL} fill="none" stroke="#0b0b0b" strokeOpacity={0.55} strokeWidth={1.5} />
      <path d={VISOR} fill={`url(#visor-${uid})`} stroke="#0b0b0b" strokeWidth={1.5} />
      <path d="M66,41 C80,38 96,39 106,44" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} fill="none" />
      <path d="M50,13 L74,12 L72,18 L52,19 Z" fill="#1f2328" />
      <path d="M30,85 L92,82 C98,82 102,86 100,90 L30,92 C24,92 24,85 30,85 Z" fill="#16181c" />
      <ellipse cx={44} cy={26} rx={20} ry={7} fill="#fff" opacity={0.18} transform="rotate(-18 44 26)" />
      {number !== undefined && (
        <text x={34} y={70} fontSize={15} fontWeight={900} fill={design.accent} stroke="#000" strokeOpacity={0.6} strokeWidth={0.8} fontFamily="sans-serif" textAnchor="middle">
          {number}
        </text>
      )}
    </svg>
  );
}
