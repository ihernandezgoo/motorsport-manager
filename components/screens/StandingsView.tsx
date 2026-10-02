import { useState } from "react";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { driverStandings, teamStandings } from "@/lib/game/season";
import type { GameState, SeriesId } from "@/lib/game/types";
import { cx, fitCount, Nat, Pager, Panel, posColor, SeriesBadge, Stripe, Tabs, usePager, useSize } from "../ui";

const ROW = 30;
const HEAD = 34;
/** Anchura de las columnas fijas (posición, puntos, diferencia, victorias, podios, poles) y mínima del nombre. */
const FIXED = { pos: 48, pts: 52, diff: 56, wins: 36, pods: 44, poles: 48, name: 210 };
const ROUND_W = { drivers: 46, teams: 38 };

export function StandingsView({ state }: { state: GameState }) {
  const [series, setSeries] = useState<SeriesId>(state.player.series);
  const [mode, setMode] = useState<"drivers" | "teams">("drivers");
  return (
    <div className="mx-auto flex h-full w-full max-w-[1500px] min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Tabs
          value={series}
          onChange={setSeries}
          tabs={(["f1", "f2", "f3"] as SeriesId[]).map((s) => ({ id: s, label: <span className="flex items-center gap-2"><SeriesBadge s={s} />{SERIES_NAMES[s]}</span> }))}
        />
        <Tabs
          value={mode}
          onChange={setMode}
          tabs={[
            { id: "drivers", label: "Pilotos" },
            { id: "teams", label: "Equipos" },
          ]}
        />
      </div>
      <StandingsTable key={`${series}-${mode}`} state={state} series={series} mode={mode} />
      <p className="shrink-0 text-xs text-dim">
        Celdas: la pequeña es la sprint y la grande la carrera principal. R = abandono. Contorno morado = vuelta rápida.
        {series !== "f1" && " En F2 y F3 la pole suma 2 puntos y la vuelta rápida 1 (si se acaba en el top 10)."}
      </p>
    </div>
  );
}

function StandingsTable({ state, series, mode }: { state: GameState; series: SeriesId; mode: "drivers" | "teams" }) {
  const drivers = mode === "drivers";
  const rounds = state.calendar.filter((w) => w[series]);
  const ds = driverStandings(state, series);
  const ts = teamStandings(state, series);
  const rows = drivers ? ds.length : ts.length;
  const leader = drivers ? ds[0]?.points ?? 0 : ts[0]?.points ?? 0;
  const mineIdx = drivers ? ds.findIndex((s) => s.teamId === state.player.teamId) : ts.findIndex((s) => s.teamId === state.player.teamId);
  const lastDone = rounds.reduce((acc, w, i) => (state.results.some((r) => r.weekendId === w.id && r.series === series) ? i : acc), 0);

  const [ref, size] = useSize();
  const fixedW = FIXED.pos + FIXED.pts + FIXED.diff + FIXED.wins + FIXED.pods + (drivers ? FIXED.poles : 0) + FIXED.name;
  const roundW = drivers ? ROUND_W.drivers : ROUND_W.teams;
  const rowPager = usePager(rows, fitCount(size.h, ROW, 0, HEAD), mineIdx);
  const colPager = usePager(rounds.length, Math.min(rounds.length, fitCount(size.w, roundW, 0, fixedW)), lastDone);
  const shownRounds = rounds.slice(colPager.start, colPager.end);

  const head = (
    <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-dim" style={{ height: HEAD }}>
      <th className="px-3 text-center">Pos</th>
      <th className="pr-3">{drivers ? "Piloto" : "Equipo"}</th>
      <th className="pr-3 text-right">Pts</th>
      <th className="pr-3 text-right">Dif.</th>
      <th className="pr-3 text-center">V</th>
      <th className="pr-3 text-center">Pod.</th>
      {drivers && <th className="pr-3 text-center">Poles</th>}
      {shownRounds.map((w) => (
        <th key={w.id} className="px-0.5 text-center font-mono" title={w[series]?.name}>
          {w.id.toUpperCase()}
        </th>
      ))}
    </tr>
  );

  return (
    <Panel
      fill
      bodyClass="p-0"
      className="flex-1"
      title={drivers ? "Campeonato de pilotos" : "Campeonato de equipos"}
      right={
        <div className="flex items-center gap-4">
          <Pager pager={colPager} label="Rondas" />
          <Pager pager={rowPager} label="Pág." />
        </div>
      }
    >
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: FIXED.pos }} />
            <col />
            <col style={{ width: FIXED.pts }} />
            <col style={{ width: FIXED.diff }} />
            <col style={{ width: FIXED.wins }} />
            <col style={{ width: FIXED.pods }} />
            {drivers && <col style={{ width: FIXED.poles }} />}
            {shownRounds.map((w) => (
              <col key={w.id} style={{ width: roundW }} />
            ))}
          </colgroup>
          <thead>{head}</thead>
          <tbody>
            {drivers
              ? ds.slice(rowPager.start, rowPager.end).map((s, i) => {
                  const pos = rowPager.start + i + 1;
                  const d = state.drivers[s.driverId];
                  const t = state.teams[s.teamId];
                  const mine = t.id === state.player.teamId;
                  return (
                    <tr key={s.driverId} className={cx("border-b border-line/60", mine && "bg-accent/10")} style={{ height: ROW }}>
                      <td className="px-3 text-center font-bold tabular">{pos}</td>
                      <td className="pr-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Stripe color={t.color} className="h-5" />
                          <span className="truncate font-semibold">
                            {d.first.charAt(0)}. {d.last}
                          </span>
                          <Nat code={d.nat} />
                          <span className="truncate text-xs text-dim">{t.short}</span>
                        </div>
                      </td>
                      <td className="pr-3 text-right font-black tabular">{s.points}</td>
                      <td className="pr-3 text-right text-xs tabular text-muted">{pos === 1 ? "" : `-${leader - s.points}`}</td>
                      <td className="pr-3 text-center tabular">{s.wins || ""}</td>
                      <td className="pr-3 text-center tabular">{s.podiums || ""}</td>
                      <td className="pr-3 text-center tabular">{s.poles || ""}</td>
                      {shownRounds.map((w) => {
                        const cells = s.cells.filter((c) => c.weekendId === w.id).sort((a, b) => Number(b.kind === "sprint") - Number(a.kind === "sprint"));
                        return (
                          <td key={w.id} className="px-0.5">
                            <div className="flex justify-center gap-px">
                              {cells.map((c) => (
                                <span
                                  key={c.kind}
                                  title={`${c.kind === "sprint" ? "Sprint" : "Carrera"}: ${c.status === "DNF" ? "Abandono" : `P${c.pos}`} (${c.points} pts)`}
                                  className={cx(
                                    "inline-grid h-5 place-items-center rounded-sm font-mono text-[10px] font-bold tabular",
                                    c.kind === "sprint" ? "w-4 opacity-80" : "w-6",
                                    posColor(c.pos, c.status, c.points),
                                    c.fastest && "ring-1 ring-purple",
                                  )}
                                >
                                  {c.status === "DNF" ? "R" : c.pos}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              : ts.slice(rowPager.start, rowPager.end).map((s, i) => {
                  const pos = rowPager.start + i + 1;
                  const t = state.teams[s.teamId];
                  const mine = t.id === state.player.teamId;
                  return (
                    <tr key={s.teamId} className={cx("border-b border-line/60", mine && "bg-accent/10")} style={{ height: ROW }}>
                      <td className="px-3 text-center font-bold tabular">{pos}</td>
                      <td className="pr-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Stripe color={t.color} className="h-5" />
                          <span className="truncate font-semibold">{t.name}</span>
                        </div>
                      </td>
                      <td className="pr-3 text-right font-black tabular">{s.points}</td>
                      <td className="pr-3 text-right text-xs tabular text-muted">{pos === 1 ? "" : `-${leader - s.points}`}</td>
                      <td className="pr-3 text-center tabular">{s.wins || ""}</td>
                      <td className="pr-3 text-center tabular">{s.podiums || ""}</td>
                      {shownRounds.map((w) => {
                        const pts = state.results
                          .filter((r) => r.weekendId === w.id && r.series === series)
                          .flatMap((r) => r.entries)
                          .filter((e) => e.teamId === t.id)
                          .reduce((a, e) => a + e.points, 0);
                        const ran = state.results.some((r) => r.weekendId === w.id && r.series === series);
                        return (
                          <td key={w.id} className={cx("px-1 text-center text-xs tabular", pts > 0 ? "font-bold text-good" : "text-dim")}>
                            {ran ? pts : ""}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
