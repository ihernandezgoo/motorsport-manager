import { circuitOf, formatDate } from "@/lib/game/format";
import type { GameState, SeriesId } from "@/lib/game/types";
import { weekendSeries } from "@/lib/game/weekend";
import { TrackMap } from "../TrackMap";
import { cx, Panel, SeriesBadge, Stripe } from "../ui";

export function CalendarView({ state, onShowResults }: { state: GameState; onShowResults: (idx: number) => void }) {
  return (
    <div className="mx-auto max-w-6xl">
      <Panel title={`Calendario ${state.year}`} bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-dim">
                <th className="px-4 py-2">Fecha</th>
                <th className="py-2" />
                <th className="py-2 pr-3">Evento</th>
                <th className="py-2 pr-3">Categorías</th>
                <th className="py-2 pr-4">Ganadores</th>
              </tr>
            </thead>
            <tbody>
              {state.calendar.map((wk, idx) => {
                const c = circuitOf(wk);
                const done = idx < state.nextWeekend;
                const next = idx === state.nextWeekend;
                const series = weekendSeries(wk).slice().reverse();
                const mine = !!wk[state.player.series];
                return (
                  <tr
                    key={wk.id}
                    onClick={() => done && onShowResults(idx)}
                    className={cx("border-b border-line/60", done && "cursor-pointer hover:bg-panel-2", next && "bg-accent/10", !done && !next && "opacity-80")}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs tabular text-muted">
                      {formatDate(wk.date)}
                      {next && <div className="text-[10px] font-bold uppercase text-accent">Próximo</div>}
                    </td>
                    <td className="py-1">
                      <TrackMap circuitId={c.id} className="h-10 w-10" />
                    </td>
                    <td className="py-2 pr-3">
                      <div className={cx("font-semibold", mine ? "text-fg" : "text-muted")}>{wk.f1?.name ?? wk.f2?.name ?? wk.f3?.name}</div>
                      <div className="text-xs text-dim">
                        {c.name} · {c.city}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {series.map((s) => (
                          <span key={s} className={cx("flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]", s === state.player.series ? "border-line-2" : "border-transparent")}>
                            <SeriesBadge s={s} />
                            <span className="tabular text-muted">R{wk[s]?.round}</span>
                            {s === "f1" && wk.f1?.sprint && <span className="text-[10px] font-bold text-warn">S</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {done ? <Winners state={state} weekendId={wk.id} series={series} /> : <span className="text-xs text-dim">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Winners({ state, weekendId, series }: { state: GameState; weekendId: string; series: SeriesId[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => {
        const r = state.results.find((x) => x.weekendId === weekendId && x.series === s && x.kind !== "sprint");
        const w = r?.entries[0];
        if (!w) return null;
        const d = state.drivers[w.driverId];
        return (
          <span key={s} className="flex items-center gap-1.5 text-xs">
            <SeriesBadge s={s} />
            <Stripe color={state.teams[w.teamId].color} className="h-3.5" />
            <b>{d.code}</b>
          </span>
        );
      })}
    </div>
  );
}
