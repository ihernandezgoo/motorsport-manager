import { ChevronsRight, Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { formatLap } from "@/lib/game/perf";
import { wearRate } from "@/lib/game/strategy";
import { COMPOUND_INFO, dryCompounds, idealForWetness } from "@/lib/game/tyres";
import type { Compound, GameState, TyreSet, WeekendState } from "@/lib/game/types";
import { wetnessLabel } from "@/lib/game/weather";
import { estimateLap, wearMultFor } from "@/lib/game/weekend";
import { DriverPortrait } from "../art/Photos";
import { Btn, cx, Meter, Modal, Tyre } from "../ui";

type Group = "dry" | "I" | "W";
const GROUPS: { id: Group; label: string; range: string }[] = [
  { id: "dry", label: "Pista seca", range: "humedad < 18 %" },
  { id: "I", label: "Pista mojada", range: "18–85 %" },
  { id: "W", label: "Muy mojada", range: "≥ 85 %" },
];
const groupOf = (c: Compound): Group => (c === "I" ? "I" : c === "W" ? "W" : "dry");

/** Fondo de la casilla según el compuesto (el duro, que es blanco, se ve gris). */
function tileColor(c: Compound) {
  return c === "H" ? "#94a3b8" : COMPOUND_INFO[c].color;
}

/** Casilla de un juego de neumáticos. */
export function TyreTile({ set, selected, fitted, locked, onClick, size = "md" }: { set: TyreSet; selected?: boolean; fitted?: boolean; locked?: string | null; onClick?: () => void; size?: "sm" | "md" }) {
  const color = tileColor(set.compound);
  const dim = set.used || !!locked;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={locked ?? `${COMPOUND_INFO[set.compound].name} ${set.used ? `usado · ${Math.round(100 - set.wear)} % de vida` : "nuevo"}`}
      className={cx(
        "relative grid place-items-center overflow-hidden rounded-md border-2 transition",
        size === "sm" ? "h-9 w-11" : "h-12 w-14",
        selected ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,.25)]" : "border-transparent",
        onClick && !locked && "hover:brightness-125",
      )}
      style={{ background: `linear-gradient(180deg, ${color}${dim ? "40" : "70"}, ${color}${dim ? "20" : "38"})` }}
    >
      <span className={cx("grid h-7 w-7 place-items-center rounded-full border-[3px] bg-[#0b0b0b] text-[10px] font-black", dim && "opacity-50")} style={{ borderColor: COMPOUND_INFO[set.compound].color, color: COMPOUND_INFO[set.compound].color }}>
        {COMPOUND_INFO[set.compound].letter}
      </span>
      {set.used && (
        <span className="absolute inset-x-1 bottom-0.5 h-1 overflow-hidden rounded bg-black/60">
          <span className="block h-full bg-white/80" style={{ width: `${Math.max(0, 100 - set.wear)}%` }} />
        </span>
      )}
      {locked && <Lock className="absolute left-0.5 top-0.5 h-3 w-3 text-white/80" />}
      {fitted && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[#22c55e]" title="Montado" />}
    </button>
  );
}

/** Rejilla de juegos agrupados por condiciones de pista. */
export function TyreSetGrid({
  sets,
  selectedId,
  fittedId,
  wet,
  locked,
  onSelect,
}: {
  sets: TyreSet[];
  selectedId?: string;
  fittedId?: string;
  wet: number;
  locked?: (s: TyreSet) => string | null;
  onSelect: (s: TyreSet) => void;
}) {
  const ideal = idealForWetness(wet);
  const idealGroup: Group = ideal === "dry" ? "dry" : ideal;
  const order = (c: Compound) => ["SS", "S", "M", "H", "I", "W"].indexOf(c);
  return (
    <div className="space-y-3">
      {GROUPS.map((g) => {
        const of = sets.filter((s) => groupOf(s.compound) === g.id).sort((a, b) => order(a.compound) - order(b.compound) || Number(a.used) - Number(b.used) || a.wear - b.wear);
        if (of.length === 0) return null;
        return (
          <div key={g.id}>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
              <span className={cx("flex items-center gap-1", g.id === idealGroup ? "text-[#7dd3fc]" : "text-muted")}>
                {g.id === idealGroup && <ChevronsRight className="h-3.5 w-3.5" />}
                {g.label}
              </span>
              <span className="font-normal normal-case text-dim">{g.range}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {of.map((s) => {
                const why = s.wear >= 100 ? "Juego gastado" : locked?.(s) ?? null;
                return <TyreTile key={s.id} set={s} selected={s.id === selectedId} fitted={s.id === fittedId} locked={why} onClick={why ? undefined : () => onSelect(s)} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function rubberLabel(r: number) {
  return r < 0.25 ? "Muy baja" : r < 0.5 ? "Baja" : r < 0.75 ? "Media" : "Alta";
}

/** Detalles del juego montado frente al seleccionado y estado de la pista. */
export function CompoundDetails({ state, ws, driverId, fitted, selected, wet, rubber }: { state: GameState; ws: WeekendState; driverId: string; fitted?: TyreSet; selected?: TyreSet; wet: number; rubber: number }) {
  const circuit = CIRCUITS[state.calendar[ws.weekendIndex].circuitId];
  const d = state.drivers[driverId];
  const life = (s?: TyreSet) => {
    if (!s) return "—";
    const rate = wearRate(ws.series, circuit, s.compound, d.tyre) * wearMultFor(ws, driverId);
    return `~${Math.max(0, Math.floor((75 - s.wear) / rate))}`;
  };
  const cell = (s: TyreSet | undefined, f: (s: TyreSet) => ReactNode) => <td className="py-1 text-right tabular">{s ? f(s) : "—"}</td>;
  const rows: [string, (s: TyreSet) => ReactNode][] = [
    [
      "Compuesto",
      (s) => (
        <span className="inline-flex items-center gap-1">
          <Tyre c={s.compound} size={15} /> {Math.round(100 - s.wear)} %
        </span>
      ),
    ],
    ["Vida útil (vueltas)", (s) => life(s)],
    ["Tiempo por vuelta", (s) => formatLap(estimateLap(state, ws, driverId, s, wet))],
  ];
  return (
    <div className="space-y-4 text-sm">
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wider text-dim">
          <tr>
            <th className="text-left font-semibold">Detalles</th>
            <th className="text-right font-semibold">Montado</th>
            <th className="text-right font-semibold">Seleccionado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-t border-line/60">
              <td className="py-1 text-muted">{label}</td>
              {cell(fitted, f)}
              {cell(selected, f)}
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-dim">Estado de la pista</div>
        <div className="grid grid-cols-[1fr_auto] gap-y-1 text-xs">
          <span className="text-muted">Agarre</span>
          <span>{wet > 0.18 ? "Bajo" : rubber > 0.6 ? "Alto" : "Normal"}</span>
          <span className="text-muted">Goma en la trazada</span>
          <span className={rubber < 0.25 ? "text-bad" : undefined}>{rubberLabel(rubber)}</span>
          <span className="text-muted">Agua</span>
          <span>
            {wetnessLabel(wet)} · {Math.round(wet * 100)} %
          </span>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-dim">Compuestos recomendados</div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-y-1 text-xs">
          <span className="text-muted">Pista seca</span>
          <span className="flex gap-1">
            {dryCompounds(ws.series, circuit).map((c) => (
              <Tyre key={c} c={c} size={16} />
            ))}
          </span>
          <span className="text-muted">Pista mojada</span>
          <Tyre c="I" size={16} />
          <span className="text-muted">Muy mojada</span>
          <Tyre c="W" size={16} />
        </div>
      </div>
    </div>
  );
}

/** Ventana de elección de neumáticos: rejilla, detalles y preparación del piloto. */
export function TyreModal({
  state,
  ws,
  driverId,
  title,
  fittedId,
  initialId,
  wet,
  locked,
  confirmLabel = "Montar",
  onPick,
  onClose,
}: {
  state: GameState;
  ws: WeekendState;
  driverId: string;
  title: string;
  fittedId?: string;
  initialId?: string;
  wet: number;
  locked?: (s: TyreSet) => string | null;
  confirmLabel?: string;
  onPick: (s: TyreSet) => void;
  onClose: () => void;
}) {
  const sets = ws.tyres?.[driverId] ?? [];
  const [sel, setSel] = useState<string | undefined>(initialId ?? fittedId);
  const selected = sets.find((s) => s.id === sel);
  const fitted = sets.find((s) => s.id === fittedId);
  const d = state.drivers[driverId];
  const team = state.teams[d.teamId];
  const setup = ws.setup[driverId];
  const lrLaps = (ws.longRuns?.[driverId] ?? []).reduce((a, r) => a + r.laps, 0);
  const rubber = Math.min(1, (ws.step + 0.5) / ws.sessions.length);
  return (
    <Modal open wide onClose={onClose} title={title}>
      <div className="grid min-h-0 gap-5 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
        <TyreSetGrid sets={sets} selectedId={sel} fittedId={fittedId} wet={wet} locked={locked} onSelect={(s) => setSel(s.id)} />
        <CompoundDetails state={state} ws={ws} driverId={driverId} fitted={fitted} selected={selected} wet={wet} rubber={rubber} />
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-line-2 bg-panel-2 p-2">
            <DriverPortrait driver={d} color={team.color} className="h-14 w-14" />
            <div className="min-w-0">
              <div className="text-xs text-muted">#{d.number}</div>
              <div className="truncate font-black uppercase">{d.last}</div>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <div className="flex justify-between">
                <span className="text-muted">Reglaje</span>
                <b>{setup ? `${Math.round(setup.quality * 100)} %` : "?"}</b>
              </div>
              <Meter value={(setup?.quality ?? 0) * 100} color="#22c55e" />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted">Conocimiento de neumáticos</span>
                <b>{Math.round(Math.min(1, lrLaps / 20) * 100)} %</b>
              </div>
              <Meter value={Math.min(1, lrLaps / 20) * 100} color="#38bdf8" />
            </div>
          </div>
          <Btn variant="primary" className="w-full" disabled={!selected} onClick={() => selected && onPick(selected)}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
