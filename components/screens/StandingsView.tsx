import { useState } from "react";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { driverStandings, teamStandings } from "@/lib/game/season";
import type { GameState, SeriesId } from "@/lib/game/types";
import { cx, Nat, Panel, posColor, SeriesBadge, Stripe, Tabs } from "../ui";

export function StandingsView({ state }: { state: GameState }) {
  const [series, setSeries] = useState<SeriesId>(state.player.series);
  const [mode, setMode] = useState<"drivers" | "teams">("drivers");
  const rounds = state.calendar.filter((w) => w[series]);
  const ds = driverStandings(state, series);
  const ts = teamStandings(state, series);
  const leader = mode === "drivers" ? ds[0]?.points ?? 0 : ts[0]?.points ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      <Panel bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-dim">
                <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-center">Pos</th>
                <th className="sticky left-12 z-10 min-w-48 bg-panel py-2 pr-3">{mode === "drivers" ? "Piloto" : "Equipo"}</th>
                <th className="py-2 pr-3 text-right">Pts</th>
                <th className="py-2 pr-3 text-right">Dif.</th>
                <th className="py-2 pr-3 text-center">V</th>
                <th className="py-2 pr-3 text-center">Pod.</th>
                {mode === "drivers" && <th className="py-2 pr-3 text-center">Poles</th>}
                {rounds.map((w) => (
                  <th key={w.id} className="px-0.5 py-2 text-center font-mono" title={w[series]?.name}>
                    {w.id.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mode === "drivers"
                ? ds.map((s, i) => {
                    const d = state.drivers[s.driverId];
                    const t = state.teams[s.teamId];
                    const mine = t.id === state.player.teamId;
                    return (
                      <tr key={s.driverId} className={cx("border-b border-line/60", mine && "bg-accent/10")}>
                        <td className={cx("sticky left-0 px-3 py-1.5 text-center font-bold tabular", mine ? "bg-[#231419]" : "bg-panel")}>{i + 1}</td>
                        <td className={cx("sticky left-12 py-1.5 pr-3", mine ? "bg-[#231419]" : "bg-panel")}>
                          <div className="flex items-center gap-2">
                            <Stripe color={t.color} className="h-5" />
                            <span className="truncate font-semibold">
                              {d.first.charAt(0)}. {d.last}
                            </span>
                            <Nat code={d.nat} />
                            <span className="truncate text-xs text-dim">{t.short}</span>
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-black tabular">{s.points}</td>
                        <td className="py-1.5 pr-3 text-right text-xs tabular text-muted">{i === 0 ? "" : `-${leader - s.points}`}</td>
                        <td className="py-1.5 pr-3 text-center tabular">{s.wins || ""}</td>
                        <td className="py-1.5 pr-3 text-center tabular">{s.podiums || ""}</td>
                        <td className="py-1.5 pr-3 text-center tabular">{s.poles || ""}</td>
                        {rounds.map((w) => {
                          const cells = s.cells.filter((c) => c.weekendId === w.id).sort((a, b) => Number(b.kind === "sprint") - Number(a.kind === "sprint"));
                          return (
                            <td key={w.id} className="px-0.5 py-1">
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
                : ts.map((s, i) => {
                    const t = state.teams[s.teamId];
                    const mine = t.id === state.player.teamId;
                    return (
                      <tr key={s.teamId} className={cx("border-b border-line/60", mine && "bg-accent/10")}>
                        <td className={cx("sticky left-0 px-3 py-1.5 text-center font-bold tabular", mine ? "bg-[#231419]" : "bg-panel")}>{i + 1}</td>
                        <td className={cx("sticky left-12 py-1.5 pr-3", mine ? "bg-[#231419]" : "bg-panel")}>
                          <div className="flex items-center gap-2">
                            <Stripe color={t.color} className="h-5" />
                            <span className="truncate font-semibold">{t.name}</span>
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-black tabular">{s.points}</td>
                        <td className="py-1.5 pr-3 text-right text-xs tabular text-muted">{i === 0 ? "" : `-${leader - s.points}`}</td>
                        <td className="py-1.5 pr-3 text-center tabular">{s.wins || ""}</td>
                        <td className="py-1.5 pr-3 text-center tabular">{s.podiums || ""}</td>
                        {rounds.map((w) => {
                          const pts = state.results
                            .filter((r) => r.weekendId === w.id && r.series === series)
                            .flatMap((r) => r.entries)
                            .filter((e) => e.teamId === t.id)
                            .reduce((a, e) => a + e.points, 0);
                          const ran = state.results.some((r) => r.weekendId === w.id && r.series === series);
                          return (
                            <td key={w.id} className={cx("px-1 py-1.5 text-center text-xs tabular", pts > 0 ? "font-bold text-good" : "text-dim")}>
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
      <p className="text-xs text-dim">
        Celdas: la pequeña es la sprint y la grande la carrera principal. R = abandono. Contorno morado = vuelta rápida.
        {series !== "f1" && " En F2 y F3 la pole suma 2 puntos y la vuelta rápida 1 (si se acaba en el top 10)."}
      </p>
    </div>
  );
}
