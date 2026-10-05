import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatRaceTime } from "@/lib/game/perf";
import { DROP_OFF_WEAR, evaluatePlan, planStrategy, sanitizeStops, type PlanEval, type StratCtx } from "@/lib/game/strategy";
import { COMPOUND_INFO, isWetTyre } from "@/lib/game/tyres";
import type { Compound, StrategyPlan } from "@/lib/game/types";
import { Btn, cx, Segmented, Tyre } from "../ui";

const MAX_PLANS = 5;
const PIT_WINDOW = 3;

function stintColor(c: Compound) {
  return c === "H" ? "#cbd5e1" : COMPOUND_INFO[c].color;
}

/** Resumen del plan: "2 paradas", "Sin paradas"... */
export function stopsLabel(n: number) {
  return n === 0 ? "Sin paradas" : n === 1 ? "1 parada" : `${n} paradas`;
}

/** Gráfica del plan: vida del neumático por relevo, caída de rendimiento, ventanas de parada y lluvia. */
export function StrategyChart({ ctx, ev, stops, currentLap, rain }: { ctx: StratCtx; ev: PlanEval; stops: { lap: number }[]; currentLap?: number; rain?: number[] }) {
  const W = 1000;
  const H = 210;
  const top = 26;
  const bottom = 178;
  const x = (lap: number) => (lap / ctx.laps) * W;
  const y = (life: number) => bottom - (Math.max(0, Math.min(100, life)) / 100) * (bottom - top);
  const ticks: number[] = [];
  for (let l = 10; l < ctx.laps; l += 10) ticks.push(l);
  const weatherCells = 25;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none">
      <defs>
        <pattern id="dropoff" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(0,0,0,.35)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,.18)" strokeWidth="3" />
        </pattern>
      </defs>
      {/* Previsión de lluvia por tramos de carrera */}
      {rain &&
        Array.from({ length: weatherCells }, (_, i) => {
          const r = rain[Math.min(rain.length - 1, Math.floor((i / weatherCells) * rain.length))] ?? 0;
          const cx0 = ((i + 0.5) / weatherCells) * W;
          return r > 0.05 ? (
            <g key={i}>
              <ellipse cx={cx0} cy={10} rx={11} ry={6} fill="#94a3b8" />
              {r > 0.3 && <line x1={cx0 - 4} y1={17} x2={cx0 - 6} y2={22} stroke="#60a5fa" strokeWidth={2} />}
              {r > 0.3 && <line x1={cx0 + 4} y1={17} x2={cx0 + 2} y2={22} stroke="#60a5fa" strokeWidth={2} />}
            </g>
          ) : (
            <circle key={i} cx={cx0} cy={10} r={2.5} fill="#64748b" />
          );
        })}
      <rect x={0} y={top} width={W} height={bottom - top} fill="rgba(255,255,255,.03)" />
      {[25, 50, 75].map((v) => (
        <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.06)" />
      ))}
      {/* Relevos */}
      {ev.stints.map((s, i) => {
        const pts = [`${x(s.from)},${bottom}`, `${x(s.from)},${y(100 - s.startWear)}`, `${x(s.to)},${y(100 - s.endWear)}`, `${x(s.to)},${bottom}`].join(" ");
        const col = stintColor(s.compound);
        const dropX = s.dropLap !== null ? x(s.dropLap) : null;
        return (
          <g key={i}>
            <polygon points={pts} fill={col} opacity={0.42} />
            <line x1={x(s.from)} y1={y(100 - s.startWear)} x2={x(s.to)} y2={y(100 - s.endWear)} stroke={col} strokeWidth={3} />
            {dropX !== null && <rect x={dropX} y={top} width={Math.max(0, x(s.to) - dropX)} height={bottom - top} fill="url(#dropoff)" />}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={y(100 - DROP_OFF_WEAR)} y2={y(100 - DROP_OFF_WEAR)} stroke="rgba(255,255,255,.25)" strokeDasharray="6 6" />
      {/* Ventanas de parada */}
      {stops.map((s, i) => (
        <g key={i}>
          <rect x={x(Math.max(0, s.lap - PIT_WINDOW))} y={top} width={x(PIT_WINDOW * 2)} height={bottom - top} fill="rgba(45,212,191,.18)" />
          <line x1={x(s.lap)} x2={x(s.lap)} y1={top} y2={bottom} stroke="#2dd4bf" strokeWidth={3} />
        </g>
      ))}
      {currentLap !== undefined && <line x1={x(currentLap - 1)} x2={x(currentLap - 1)} y1={top - 4} y2={bottom} stroke="#fff" strokeWidth={2} />}
      {/* Eje de vueltas */}
      <text x={4} y={bottom + 16} fontSize={14} fill="#94a3b8">
        V
      </text>
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={bottom + 16} fontSize={14} fill="#94a3b8" textAnchor="middle">
          {t}
        </text>
      ))}
      <text x={W - 4} y={bottom + 16} fontSize={14} fill="#94a3b8" textAnchor="end">
        {ctx.laps}
      </text>
    </svg>
  );
}

/** Línea de tiempo compacta de un plan: un trazo por relevo con el compuesto al inicio. */
export function PlanTimeline({ laps, plan }: { laps: number; plan: StrategyPlan }) {
  const stops = sanitizeStops(plan.stops, laps);
  const seq = [plan.start, ...stops.map((s) => s.compound)];
  const bounds = [0, ...stops.map((s) => s.lap), laps];
  return (
    <div className="relative h-6 w-full">
      {seq.map((c, i) => {
        const l = (bounds[i] / laps) * 100;
        const w = ((bounds[i + 1] - bounds[i]) / laps) * 100;
        return (
          <div key={i} className="absolute top-1/2 flex -translate-y-1/2 items-center" style={{ left: `${l}%`, width: `${w}%` }}>
            <span className="z-10 -ml-2">
              <Tyre c={c} size={18} />
            </span>
            <span className="h-1 flex-1 rounded" style={{ background: stintColor(c) }} />
          </div>
        );
      })}
      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px]">🏁</span>
    </div>
  );
}

/**
 * Editor de estrategias: gráfica del plan activo, lista de planes (elegir, editar, borrar, añadir)
 * y editor de paradas. En carrera (`currentLap`) las paradas ya pasadas no se pueden tocar.
 */
export function StrategyEditor({
  ctx,
  plans,
  active,
  compounds,
  sets,
  currentLap,
  rain,
  onChange,
}: {
  ctx: StratCtx;
  plans: StrategyPlan[];
  active: number;
  compounds: Compound[];
  sets?: Partial<Record<Compound, number>>;
  currentLap?: number;
  rain?: number[];
  onChange: (plans: StrategyPlan[], active: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const plan = plans[active] ?? plans[0];
  const ev = evaluatePlan(ctx, plan, currentLap ? undefined : sets);
  const stops = sanitizeStops(plan.stops, ctx.laps);

  const remove = (i: number) => {
    if (plans.length <= 1) return;
    const next = plans.filter((_, k) => k !== i);
    onChange(next, Math.min(next.length - 1, i < active ? active - 1 : i === active ? 0 : active));
    setEditing(null);
  };
  const add = () => {
    const used = new Set(plans.map((p) => p.name));
    const name = "ABCDEFGH".split("").find((n) => !used.has(n)) ?? "?";
    const copy: StrategyPlan = { ...structuredClone(plan), name };
    onChange([...plans, copy], active);
    setEditing(plans.length);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-line bg-[#11151c] p-3">
        <StrategyChart ctx={ctx} ev={ev} stops={stops} currentLap={currentLap} rain={rain} />
        <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-line pt-2 text-xs">
          <span className="font-black">ESTRATEGIA {plan.name}</span>
          <span className="text-muted">{stopsLabel(stops.length)}</span>
          <span className="text-muted">Tiempo estimado: {formatRaceTime(ev.est)}</span>
          <span className="ml-auto flex items-center gap-3 text-[10px] text-dim">
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-4 bg-white/70" /> Vida del neumático
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-3 bg-[repeating-linear-gradient(45deg,#ffffff30_0_2px,transparent_2px_5px)]" /> Caída de rendimiento
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-3 bg-[#2dd4bf55]" /> Ventana de parada
            </span>
          </span>
        </div>
        {ev.issues.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[11px] text-warn">
            {ev.issues.map((i) => (
              <li key={i}>⚠ {i}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        {plans.map((p, i) => {
          const e = evaluatePlan(ctx, p);
          return (
            <div key={`${p.name}-${i}`}>
              <div className={cx("grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-2 py-1.5", i === active ? "border-white/70 bg-white/5" : "border-line")}>
                <button
                  type="button"
                  onClick={() => onChange(plans, i)}
                  className={cx("flex h-8 w-14 items-center justify-center gap-1.5 rounded-md text-sm font-black", i === active ? "bg-white text-black" : "bg-panel-3 text-muted hover:text-fg")}
                  title="Usar este plan"
                >
                  <span className={cx("h-2.5 w-2.5 rounded-full border-2", i === active ? "border-black bg-black" : "border-current")} />
                  {p.name}
                </button>
                <span className="flex gap-1">
                  <button type="button" className="rounded p-1 text-muted hover:bg-panel-3 hover:text-fg" onClick={() => setEditing(editing === i ? null : i)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded p-1 text-muted hover:bg-panel-3 hover:text-bad disabled:opacity-30" disabled={plans.length <= 1} onClick={() => remove(i)} title="Borrar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
                <PlanTimeline laps={ctx.laps} plan={p} />
                <span className="w-24 text-right text-[11px] text-muted">
                  {stopsLabel(sanitizeStops(p.stops, ctx.laps).length)}
                  <br />
                  <span className="text-dim">{formatRaceTime(e.est)}</span>
                </span>
              </div>
              {editing === i && (
                <PlanForm
                  key={`${i}-${p.name}`}
                  ctx={ctx}
                  plan={p}
                  compounds={compounds}
                  currentLap={currentLap}
                  onCancel={() => setEditing(null)}
                  onSave={(np) => {
                    onChange(
                      plans.map((x, k) => (k === i ? np : x)),
                      active,
                    );
                    setEditing(null);
                  }}
                />
              )}
            </div>
          );
        })}
        {plans.length < MAX_PLANS && (
          <button type="button" onClick={add} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 py-1.5 text-xs text-muted hover:text-fg">
            <Plus className="h-4 w-4" /> Nuevo plan (copia del activo)
          </button>
        )}
      </div>
    </div>
  );
}

/** Formulario de un plan: compuesto de salida y paradas (vuelta y compuesto). */
function PlanForm({
  ctx,
  plan,
  compounds,
  currentLap,
  onSave,
  onCancel,
}: {
  ctx: StratCtx;
  plan: StrategyPlan;
  compounds: Compound[];
  currentLap?: number;
  onSave: (p: StrategyPlan) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<StrategyPlan>(() => ({ ...plan, stops: sanitizeStops(plan.stops, ctx.laps) }));
  const locked = (lap: number) => currentLap !== undefined && lap < currentLap;
  const ev = evaluatePlan(ctx, draft);
  const setStop = (i: number, patch: Partial<{ lap: number; compound: Compound }>) => setDraft((d) => ({ ...d, stops: d.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const addStop = () =>
    setDraft((d) => {
      const bounds = [0, ...d.stops.map((s) => s.lap), ctx.laps];
      // Nueva parada a mitad del relevo más largo que quede por delante.
      let best = 0;
      for (let k = 0; k < bounds.length - 1; k++) if (bounds[k + 1] - bounds[k] > bounds[best + 1] - bounds[best]) best = k;
      const lap = Math.max(currentLap ?? 1, Math.round((bounds[best] + bounds[best + 1]) / 2));
      const compound = ctx.dry.find((c) => c !== (d.stops.at(-1)?.compound ?? d.start)) ?? ctx.dry[0];
      return { ...d, stops: sanitizeStops([...d.stops, { lap, compound }], ctx.laps) };
    });
  const engineer = () => {
    const start = currentLap ? undefined : isWetTyre(draft.start) ? undefined : draft.start;
    const p = planStrategy(ctx, undefined, start);
    setDraft((d) => ({ ...d, start: start ?? p.start, stops: [...d.stops.filter((s) => locked(s.lap)), ...p.stops.filter((s) => !locked(s.lap))] }));
  };

  return (
    <div className="mt-1 space-y-2 rounded-lg border border-line-2 bg-panel-2 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 font-semibold">Salida</span>
        <Segmented
          size="xs"
          value={draft.start}
          disabled={currentLap !== undefined && currentLap > 1}
          onChange={(c) => setDraft((d) => ({ ...d, start: c }))}
          options={compounds.map((c) => ({ value: c, label: <Tyre c={c} size={16} />, activeColor: "#2f3a4a" }))}
        />
      </div>
      {draft.stops.map((s, i) => {
        const fixed = locked(s.lap);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-semibold">
              Parada {i + 1} {fixed && <span className="text-dim">(hecha)</span>}
            </span>
            <input
              type="range"
              min={Math.max(1, currentLap ?? 1)}
              max={ctx.laps - 1}
              value={s.lap}
              disabled={fixed}
              onChange={(e) => setStop(i, { lap: Number(e.target.value) })}
              className="min-w-24 flex-1"
            />
            <span className="w-12 tabular">V{s.lap}</span>
            <Segmented size="xs" value={s.compound} disabled={fixed} onChange={(c) => setStop(i, { compound: c })} options={compounds.map((c) => ({ value: c, label: <Tyre c={c} size={16} />, activeColor: "#2f3a4a" }))} />
            <button type="button" disabled={fixed} className="rounded p-1 text-muted hover:text-bad disabled:opacity-30" onClick={() => setDraft((d) => ({ ...d, stops: d.stops.filter((_, k) => k !== i) }))} title="Quitar parada">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Btn size="xs" onClick={addStop} disabled={draft.stops.length >= 4}>
          <Plus className="h-3.5 w-3.5" /> Añadir parada
        </Btn>
        <Btn size="xs" onClick={engineer} title="El ingeniero calcula las paradas más rápidas para el compuesto de salida">
          <Sparkles className="h-3.5 w-3.5" /> Propuesta del ingeniero
        </Btn>
        <span className="text-muted">Estimado: {formatRaceTime(ev.est)}</span>
        <span className="ml-auto flex gap-2">
          <Btn size="xs" variant="ghost" onClick={onCancel}>
            Cancelar
          </Btn>
          <Btn size="xs" variant="primary" onClick={() => onSave({ ...draft, stops: sanitizeStops(draft.stops, ctx.laps) })}>
            Guardar plan
          </Btn>
        </span>
      </div>
      {ev.issues.length > 0 && <div className="text-warn">⚠ {ev.issues.join(" · ")}</div>}
    </div>
  );
}
