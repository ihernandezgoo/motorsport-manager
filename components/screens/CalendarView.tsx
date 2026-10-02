import { circuitOf, formatDate } from "@/lib/game/format";
import type { GameState, SeriesId } from "@/lib/game/types";
import { weekendSeries } from "@/lib/game/weekend";
import { TrackMap } from "../TrackMap";
import { cx, Pager, Panel, SeriesBadge, Stripe, useRowPager } from "../ui";

const ROW = 52;
const HEAD = 34;

export function CalendarView({ state, onShowResults }: { state: GameState; onShowResults: (idx: number) => void }) {
  const { ref, pager } = useRowPager(state.calendar.length, ROW, HEAD, state.nextWeekend);
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col">
      <Panel fill title={`Calendario ${state.year}`} bodyClass="p-0" className="flex-1" right={<Pager pager={pager} />}>
        <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-dim" style={{ height: HEAD }}>
                <th className="px-4">Fecha</th>
                <th />
                <th className="pr-3">Evento</th>
                <th className="pr-3">Categorías</th>
                <th className="pr-4">Ganadores</th>
              </tr>
            </thead>
            <tbody>
              {state.calendar.slice(pager.start, pager.end).map((wk, i) => {
                const idx = pager.start + i;
                const c = circuitOf(wk);
                const done = idx < state.nextWeekend;
                const next = idx === state.nextWeekend;
                const series = weekendSeries(wk).slice().reverse();
                const mine = !!wk[state.player.series];
                return (
                  <tr
                    key={wk.id}
                    onClick={() => done && onShowResults(idx)}
                    style={{ height: ROW }}
                    className={cx("border-b border-line/60", done && "cursor-pointer hover:bg-panel-2", next && "bg-accent/10", !done && !next && "opacity-80")}
                  >
                    <td className="whitespace-nowrap px-4 text-xs tabular text-muted">
                      {formatDate(wk.date)}
                      {next && <div className="text-[10px] font-bold uppercase text-accent">Próximo</div>}
                    </td>
                    <td>
                      <TrackMap circuitId={c.id} className="h-10 w-10" />
                    </td>
                    <td className="max-w-0 pr-3">
                      <div className={cx("truncate font-semibold", mine ? "text-fg" : "text-muted")}>{wk.f1?.name ?? wk.f2?.name ?? wk.f3?.name}</div>
                      <div className="truncate text-xs text-dim">
                        {c.name} · {c.city}
                      </div>
                    </td>
                    <td className="pr-3">
                      <div className="flex gap-1">
                        {series.map((s) => (
                          <span key={s} className={cx("flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]", s === state.player.series ? "border-line-2" : "border-transparent")}>
                            <SeriesBadge s={s} />
                            <span className="tabular text-muted">R{wk[s]?.round}</span>
                            {s === "f1" && wk.f1?.sprint && <span className="text-[10px] font-bold text-warn">S</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="pr-4">{done ? <Winners state={state} weekendId={wk.id} series={series} /> : <span className="text-xs text-dim">—</span>}</td>
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
    <div className="flex gap-x-4">
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
