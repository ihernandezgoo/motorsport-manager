import { useState } from "react";
import { SERIES_SHORT } from "@/lib/game/data/teams";
import { circuitOf, formatDateLong } from "@/lib/game/format";
import { formatLap, formatRaceTime } from "@/lib/game/perf";
import type { GameState, RaceResult, SeriesId } from "@/lib/game/types";
import { weekendSeries } from "@/lib/game/weekend";
import { cx, Modal, Nat, posColor, SeriesBadge, Stripe } from "../ui";

const KIND_LABEL: Record<string, string> = { race: "Gran Premio", sprint: "Sprint", feature: "Principal" };

export function ResultsTable({ state, result, compact }: { state: GameState; result: RaceResult; compact?: boolean }) {
  const bestLap = Math.min(...result.entries.map((e) => e.bestLap).filter((x) => isFinite(x)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-dim">
            <th className="py-2 pr-2 text-center">Pos</th>
            <th className="py-2 pr-2">Piloto</th>
            {!compact && <th className="py-2 pr-2">Equipo</th>}
            <th className="py-2 pr-2 text-center">Salida</th>
            <th className="py-2 pr-2 text-right">Tiempo / Dif.</th>
            <th className="py-2 pr-2 text-center">Paradas</th>
            <th className="py-2 pr-2 text-right">Mejor vuelta</th>
            <th className="py-2 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {result.entries.map((e) => {
            const d = state.drivers[e.driverId];
            const t = state.teams[e.teamId];
            const mine = e.teamId === state.player.teamId;
            const delta = e.status === "FIN" ? e.grid - e.pos : 0;
            return (
              <tr key={e.driverId} className={cx("border-b border-line/60", mine && "bg-accent/10")}>
                <td className="py-1.5 pr-2 text-center">
                  <span className={cx("inline-block min-w-7 rounded px-1.5 py-0.5 text-xs font-bold tabular", posColor(e.pos, e.status, e.points))}>
                    {e.status === "DNF" ? "AB" : e.pos}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-2">
                    <Stripe color={t.color} className="h-5" />
                    <span className="w-6 text-right font-mono text-xs text-muted">{d.number}</span>
                    <span className="truncate font-semibold">
                      {d.first.charAt(0)}. {d.last}
                    </span>
                    <Nat code={d.nat} />
                    {e.pole && <span className="rounded bg-panel-3 px-1 text-[9px] font-bold text-muted">POLE</span>}
                  </div>
                </td>
                {!compact && <td className="py-1.5 pr-2 text-muted">{t.short}</td>}
                <td className="py-1.5 pr-2 text-center tabular text-muted">
                  {e.grid}
                  {delta !== 0 && <span className={cx("ml-1 text-[10px]", delta > 0 ? "text-good" : "text-bad")}>{delta > 0 ? `▲${delta}` : `▼${-delta}`}</span>}
                </td>
                <td className="py-1.5 pr-2 text-right font-mono text-xs tabular">
                  {e.status === "DNF" ? <span className="text-bad">{e.reason ?? "Abandono"} (v{e.laps})</span> : e.pos === 1 ? formatRaceTime(e.time) : e.gap}
                  {e.penalty > 0 && <span className="ml-1 text-warn">(+{e.penalty}s)</span>}
                </td>
                <td className="py-1.5 pr-2 text-center tabular">{e.pits}</td>
                <td className={cx("py-1.5 pr-2 text-right font-mono text-xs tabular", e.bestLap === bestLap ? "font-bold text-purple" : "text-muted")}>{formatLap(e.bestLap)}</td>
                <td className="py-1.5 text-right font-bold tabular">{e.points > 0 ? e.points : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WeekendResults({ state, weekendIndex }: { state: GameState; weekendIndex: number }) {
  const wk = state.calendar[weekendIndex];
  const series = weekendSeries(wk).slice().reverse();
  const [sel, setSel] = useState<string>(() => `${series.includes(state.player.series) ? state.player.series : series[0]}-0`);
  const results = (s: SeriesId) =>
    state.results
      .filter((r) => r.weekendId === wk.id && r.series === s)
      .sort((a, b) => (a.kind === "sprint" ? -1 : 1) - (b.kind === "sprint" ? -1 : 1));
  const [selSeries, selIdxStr] = sel.split("-");
  const list = results(selSeries as SeriesId);
  const current = list[Number(selIdxStr)] ?? list[0];
  if (series.every((s) => results(s).length === 0)) return <p className="text-sm text-muted">Este fin de semana aún no se ha disputado.</p>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {series.map((s) =>
          results(s).map((r, i) => (
            <button
              type="button"
              key={`${s}-${i}`}
              onClick={() => setSel(`${s}-${i}`)}
              className={cx(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                sel === `${s}-${i}` ? "border-accent bg-accent/10 text-fg" : "border-line-2 text-muted hover:text-fg",
              )}
            >
              <SeriesBadge s={s} /> {KIND_LABEL[r.kind]}
            </button>
          )),
        )}
      </div>
      {current && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-semibold text-fg">
              {SERIES_SHORT[current.series]} · {current.name}
            </span>
            <span>{current.laps} vueltas</span>
            <span>Condiciones: {current.weather}</span>
            {current.scLaps > 0 && <span>{current.scLaps} vueltas neutralizadas</span>}
            {current.fastestLap && (
              <span className="text-purple">
                Vuelta rápida: {state.drivers[current.fastestLap.driverId].code} {formatLap(current.fastestLap.time)} (v{current.fastestLap.lap})
              </span>
            )}
          </div>
          <ResultsTable state={state} result={current} />
        </>
      )}
    </div>
  );
}

export function WeekendResultsModal({ state, weekendIndex, onClose }: { state: GameState; weekendIndex: number | null; onClose: () => void }) {
  if (weekendIndex === null) return null;
  const wk = state.calendar[weekendIndex];
  const c = circuitOf(wk);
  return (
    <Modal open wide onClose={onClose} title={`Resultados · ${c.city} (${formatDateLong(wk.date)})`}>
      <WeekendResults state={state} weekendIndex={weekendIndex} />
    </Modal>
  );
}
