import { useState } from "react";
import { helmetOf } from "@/lib/game/data/liveries";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { teamDrivers, teamOverall } from "@/lib/game/format";
import { driverOverall } from "@/lib/game/perf";
import type { GameState, SeriesId } from "@/lib/game/types";
import { DriverPortrait, TeamCar } from "../art/Photos";
import { cx, Nat, SeriesBadge, Tabs } from "../ui";

export function GridsView({ state }: { state: GameState }) {
  const [series, setSeries] = useState<SeriesId>(state.player.series);
  const teams = Object.values(state.teams)
    .filter((t) => t.series === series)
    .sort((a, b) => teamOverall(state, b) - teamOverall(state, a));
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Tabs
        value={series}
        onChange={setSeries}
        tabs={(["f1", "f2", "f3"] as SeriesId[]).map((s) => ({ id: s, label: <span className="flex items-center gap-2"><SeriesBadge s={s} />{SERIES_NAMES[s]}</span> }))}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => {
          const drivers = teamDrivers(state, t.id);
          return (
            <div
              key={t.id}
              className={cx("relative overflow-hidden rounded-2xl border", t.id === state.player.teamId ? "border-accent" : "border-line")}
              style={{ background: `linear-gradient(135deg, ${t.color}cc 0%, ${t.color}55 38%, #0e1218 75%)` }}
            >
              <div className="relative p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-2xl font-black leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">{t.short}</div>
                    <div className="truncate text-xs text-white/75">{t.name}</div>
                  </div>
                  <div className="rounded-lg bg-black/35 px-3 py-1 text-right">
                    <div className="text-xl font-black tabular text-white">{teamOverall(state, t)}</div>
                    <div className="text-[9px] uppercase tracking-wider text-white/60">Coche</div>
                  </div>
                </div>
                <div className={cx("mt-3 grid gap-2", drivers.length > 2 ? "grid-cols-3" : "grid-cols-2")}>
                  {drivers.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-lg bg-black/30 p-2">
                      <DriverPortrait driver={d} color={t.color} className="h-14 w-14" rounded="rounded-full" />
                      <div className="min-w-0">
                        <div className="truncate text-[11px] text-white/70">
                          {d.first} <Nat code={d.nat} />
                        </div>
                        <div className="truncate text-sm font-black uppercase text-white">{d.last}</div>
                        <div className="text-[10px] text-white/60">
                          #{d.number} · {d.age} años · {driverOverall(d)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <TeamCar team={t} series={series} number={drivers[0]?.number} helmet={drivers[0] ? helmetOf(drivers[0]).base : undefined} className="mt-3 h-28 w-full" />
                <div className="text-right text-[10px] text-white/50">{t.pu ? state.pus[t.pu].name : "Dallara · Mecachrome"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
