import { useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { BROKEN, canFitComponents, COMPONENTS, fitComponent, penaltyFor } from "@/lib/game/components";
import { teamDrivers } from "@/lib/game/format";
import { availableCompounds } from "@/lib/game/tyres";
import { CIRCUITS } from "@/lib/game/data/circuits";
import type { ComponentKind, GameState, WeekendState } from "@/lib/game/types";
import { Btn, cx, Meter, Tyre } from "../ui";

/** Juegos de neumáticos que le quedan a cada piloto del jugador. */
export function TyreAllocation({ state, ws }: { state: GameState; ws: WeekendState }) {
  const mine = teamDrivers(state, state.player.teamId);
  const compounds = availableCompounds(ws.series, CIRCUITS[state.calendar[ws.weekendIndex].circuitId]);
  return (
    <div className="space-y-3 overflow-y-auto">
      {mine.map((d) => {
        const sets = ws.tyres?.[d.id] ?? [];
        return (
          <div key={d.id}>
            <div className="mb-1 text-xs font-bold">{d.last}</div>
            <div className="space-y-1">
              {compounds.map((c) => {
                const of = sets.filter((s) => s.compound === c);
                if (of.length === 0) return null;
                return (
                  <div key={c} className="flex items-center gap-2">
                    <Tyre c={c} size={16} />
                    <div className="flex flex-wrap gap-1">
                      {of.map((s) => (
                        <span
                          key={s.id}
                          title={`${s.used ? "Usado" : "Nuevo"} · ${Math.round(s.wear)} % de desgaste`}
                          className={cx("h-3 w-5 rounded-sm border", s.used ? "border-line-2" : "border-white/60")}
                          style={{ background: `linear-gradient(90deg, #3a3f4b ${s.wear}%, ${s.used ? "#64748b" : "#e5e7eb"} ${s.wear}%)` }}
                        />
                      ))}
                    </div>
                    <span className="ml-auto text-[10px] text-muted">{of.filter((s) => !s.used).length} nuevos</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-dim">Cada rectángulo es un juego; la parte oscura es lo gastado. Guarda juegos nuevos para la clasificación y la carrera.</p>
    </div>
  );
}

/** Estado de los componentes de la unidad de potencia (F1) y montaje de unidades nuevas. */
export function ComponentsPanel({ state, ws }: { state: GameState; ws?: WeekendState }) {
  const [confirm, setConfirm] = useState<{ id: string; kind: ComponentKind } | null>(null);
  const mine = teamDrivers(state, state.player.teamId);
  const canFit = !!ws && canFitComponents(ws);
  if (state.player.series !== "f1") return <p className="text-sm text-muted">Solo la F1 limita los componentes de la unidad de potencia.</p>;
  return (
    <div className="space-y-4 overflow-y-auto">
      {mine.map((d) => {
        const comps = state.components?.[d.id];
        if (!comps) return null;
        const pen = ws?.gridPenalty?.[d.id];
        return (
          <div key={d.id}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <b>{d.last}</b>
              {pen && <span className="text-bad">Sanción: {pen.places} puestos</span>}
            </div>
            <div className="space-y-1.5">
              {COMPONENTS.map((c) => {
                const st = comps[c.kind];
                const broken = st.wear >= BROKEN;
                const next = penaltyFor(c.kind, st.used + 1);
                return (
                  <div key={c.kind} className="grid grid-cols-[34px_minmax(0,1fr)_44px_auto] items-center gap-2 text-[11px]">
                    <span className="font-bold" title={c.label}>
                      {c.short}
                    </span>
                    <Meter value={Math.min(100, st.wear)} color={broken ? "#ef4444" : st.wear > 90 ? "#f97316" : st.wear > 70 ? "#f59e0b" : "#22c55e"} />
                    <span className={cx("tabular", st.used > c.limit ? "text-bad" : "text-muted")} title="Unidades usadas / cupo de la temporada">
                      {st.used}/{c.limit}
                    </span>
                    {canFit ? (
                      confirm?.id === d.id && confirm.kind === c.kind ? (
                        <span className="flex gap-1">
                          <Btn
                            size="xs"
                            variant={next ? "danger" : "good"}
                            onClick={() => {
                              updateWeekend((w, s) => void fitComponent(s, w, d.id, c.kind));
                              setConfirm(null);
                            }}
                          >
                            {next ? `+${next} pos.` : "Montar"}
                          </Btn>
                          <Btn size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                            ✕
                          </Btn>
                        </span>
                      ) : (
                        <Btn size="xs" onClick={() => setConfirm({ id: d.id, kind: c.kind })} title={next ? `Superas el cupo: ${next} puestos de sanción en la parrilla del GP` : "Dentro del cupo: sin sanción"}>
                          Nueva
                        </Btn>
                      )
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-dim">
        La barra es el desgaste de la unidad montada. Por encima del 75 % aumenta el riesgo de avería y una avería rompe la unidad. Superar el cupo de la temporada se castiga con puestos en la parrilla del Gran Premio (10 la primera vez, 5 después; 5 por cada caja de cambios).
        {!canFit && " Las unidades nuevas se montan durante un fin de semana, antes del Gran Premio."}
      </p>
    </div>
  );
}
