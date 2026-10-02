import { useId, useMemo } from "react";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { buildTrack, pointAt } from "@/lib/game/track";

export interface MapDot {
  id: string;
  code: string;
  color: string;
  accent: string;
  progress: number;
  inPit: boolean;
  out: boolean;
  isPlayer: boolean;
  pos: number;
}

export function TrackMap({
  circuitId,
  dots = [],
  labels = "player",
  wet = 0,
  className,
}: {
  circuitId: string;
  dots?: MapDot[];
  labels?: "none" | "player" | "top" | "all";
  wet?: number;
  className?: string;
}) {
  const geo = useMemo(() => buildTrack(CIRCUITS[circuitId].shape, 100, 6, 2), [circuitId]);
  const uid = useId().replace(/:/g, "");
  const start = pointAt(geo, 0);
  const asphalt = wet > 0.5 ? "#22324a" : wet > 0.15 ? "#2c394b" : "#3a4252";
  const ordered = [...dots].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || b.pos - a.pos);
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`Trazado de ${CIRCUITS[circuitId].name}`}>
      <defs>
        <pattern id={`chk-${uid}`} width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="0.5" height="0.5" fill="#fff" />
          <rect x="0.5" y="0.5" width="0.5" height="0.5" fill="#fff" />
          <rect x="0.5" width="0.5" height="0.5" fill="#111" />
          <rect y="0.5" width="0.5" height="0.5" fill="#111" />
        </pattern>
      </defs>
      <path d={geo.d} fill="none" stroke="#151a22" strokeWidth={4.6} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke="#2a313d" strokeWidth={3.6} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke={asphalt} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke="#6b7486" strokeOpacity={0.5} strokeWidth={0.18} strokeDasharray="1 1.6" />
      <g transform={`translate(${start.x} ${start.y}) rotate(${start.angle})`}>
        <rect x={-0.6} y={-2} width={1.2} height={4} fill={`url(#chk-${uid})`} />
      </g>
      {ordered.map((d) => {
        const p = pointAt(geo, ((d.progress % 1) + 1) % 1);
        if (d.out) {
          return (
            <g key={d.id} opacity={0.6}>
              <circle cx={p.x} cy={p.y} r={1.2} fill="#3b3f47" stroke="#ef4444" strokeWidth={0.3} />
            </g>
          );
        }
        const r = d.isPlayer ? 1.9 : 1.4;
        const showLabel = labels === "all" || (labels === "player" && d.isPlayer) || (labels === "top" && (d.isPlayer || d.pos <= 3));
        return (
          <g key={d.id} opacity={d.inPit ? 0.45 : 1}>
            {d.isPlayer && <circle cx={p.x} cy={p.y} r={r + 0.9} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.3} />}
            <circle cx={p.x} cy={p.y} r={r} fill={d.color} stroke={d.isPlayer ? "#fff" : d.accent} strokeWidth={d.isPlayer ? 0.45 : 0.3} />
            {showLabel && (
              <text
                x={p.x + r + 0.8}
                y={p.y + 0.9}
                fontSize={d.isPlayer ? 2.6 : 2.2}
                fontWeight={700}
                fill="#fff"
                stroke="#000"
                strokeWidth={0.5}
                paintOrder="stroke"
                className="font-mono"
              >
                {d.pos <= 30 ? `${d.pos} ` : ""}
                {d.code}
                {d.inPit ? " ·BOX" : ""}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
