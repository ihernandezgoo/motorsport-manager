import { useState } from "react";
import { CALENDAR_2026 } from "@/lib/game/data/calendar";
import { helmetOf } from "@/lib/game/data/liveries";
import { ALL_DRIVERS, ALL_TEAMS, POWER_UNITS, SERIES_COLOR, SERIES_NAMES } from "@/lib/game/data/teams";
import { carScore, driverOverall, formatMoney } from "@/lib/game/perf";
import { newGame } from "@/lib/game/season";
import type { GameState, SeriesId } from "@/lib/game/types";
import { DriverPortrait, TeamCar } from "../art/Photos";
import { Btn, cx, Nat, PagedGrid, SeriesBadge, SeriesLogo } from "../ui";

const PUS = Object.fromEntries(POWER_UNITS.map((p) => [p.id, p]));

function objective(rank: number, total: number) {
  if (rank < 2) return { label: "Ganar el campeonato", color: "#22c55e" };
  if (rank < 4) return { label: "Victorias y podios", color: "#84cc16" };
  if (rank < Math.ceil(total * 0.6)) return { label: "Puntuar con regularidad", color: "#f59e0b" };
  return { label: "Crecer desde abajo", color: "#ef4444" };
}

export function NewGame({ onCancel, onCreate }: { onCancel: () => void; onCreate: (s: GameState) => void }) {
  const [series, setSeries] = useState<SeriesId | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [manager, setManager] = useState("Director");

  const seriesInfo: { id: SeriesId; desc: string }[] = [
    { id: "f1", desc: `11 equipos · 22 pilotos · ${CALENDAR_2026.filter((w) => w.f1).length} Grandes Premios · 6 sprints. Nueva era de motores híbridos 50/50 y modo adelantamiento.` },
    { id: "f2", desc: `11 equipos · 22 pilotos · ${CALENDAR_2026.filter((w) => w.f2).length} rondas con carrera sprint (parrilla invertida) y carrera principal con parada obligatoria.` },
    { id: "f3", desc: `10 equipos · 30 pilotos · ${CALENDAR_2026.filter((w) => w.f3).length} rondas. Parrillas enormes, un solo compuesto y carreras sin paradas.` },
  ];

  if (!series) {
    return (
      <div className="mx-auto flex h-dvh w-full max-w-5xl flex-col justify-center overflow-hidden px-4 py-6">
        <button type="button" onClick={onCancel} className="mb-6 self-start text-sm text-muted hover:text-fg">
          ← Volver
        </button>
        <h1 className="text-3xl font-black">Elige tu categoría</h1>
        <p className="mt-1 text-sm text-muted">Las otras dos categorías se simularán en paralelo durante toda la temporada.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {seriesInfo.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setSeries(s.id)}
              className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-6 text-left transition hover:border-line-2 hover:bg-panel-2"
            >
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: SERIES_COLOR[s.id] }} />
              <div className="flex h-12 items-center">
                <SeriesLogo s={s.id} className="h-full" textClass="text-5xl" />
              </div>
              <div className="mt-2 text-lg font-bold">{SERIES_NAMES[s.id]}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
              <div className="mt-5 text-sm font-semibold text-fg opacity-70 group-hover:opacity-100">Seleccionar →</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const pus = PUS;
  const teams = ALL_TEAMS.filter((t) => t.series === series)
    .map((t) => ({ t, score: carScore(t, pus) }))
    .sort((a, b) => b.score - a.score);
  const selected = teams.find((x) => x.t.id === teamId);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-7xl flex-col overflow-hidden px-4 pt-5">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => {
              setSeries(null);
              setTeamId(null);
            }}
            className="mb-2 text-sm text-muted hover:text-fg"
          >
            ← Cambiar categoría
          </button>
          <div className="flex items-center gap-2">
            <SeriesBadge s={series} />
            <span className="text-sm text-muted">{SERIES_NAMES[series]} 2026</span>
          </div>
          <h1 className="mt-1 text-3xl font-black">Elige tu equipo</h1>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Nombre del director
          <input
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            maxLength={28}
            className="h-10 w-64 rounded-lg border border-line-2 bg-panel-2 px-3 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
      </div>
      <PagedGrid
        className="mt-3"
        items={teams}
        minW={320}
        minH={series === "f3" ? 250 : 220}
        keyOf={(x) => x.t.id}
        header={<span className="text-xs text-muted">Ordenados por rendimiento del coche</span>}
        render={({ t, score }, rank) => {
          const drivers = ALL_DRIVERS.filter((d) => d.teamId === t.id).sort((a, b) => a.number - b.number);
          const obj = objective(rank, teams.length);
          return (
            <button
              type="button"
              onClick={() => setTeamId(t.id)}
              className={cx(
                "flex h-full w-full flex-col overflow-hidden rounded-xl border p-3 text-left transition hover:brightness-110",
                teamId === t.id ? "border-accent ring-1 ring-accent" : "border-line",
              )}
              style={{ background: `linear-gradient(135deg, ${t.color}55 0%, #0e1218 55%)` }}
            >
              <div className="flex shrink-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold">{t.name}</div>
                  <div className="truncate text-xs text-muted">{t.pu ? `Motor ${pus[t.pu].name}` : "Dallara · Mecachrome (monomarca)"}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black leading-none tabular">{score.toFixed(0)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-dim">Coche</div>
                </div>
              </div>
              <TeamCar team={t} series={series} number={drivers[0]?.number} helmet={drivers[0] ? helmetOf(drivers[0]).base : undefined} className="my-1 min-h-0 w-full flex-1" />
              <div className="shrink-0 space-y-1">
                {drivers.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <DriverPortrait driver={d} color={t.color} className="h-7 w-7" rounded="rounded-full" />
                    <span className="w-6 text-right font-mono text-xs text-muted">{d.number}</span>
                    <span className="truncate">
                      {d.first} <b>{d.last}</b>
                    </span>
                    <Nat code={d.nat} />
                    <span className="ml-auto text-xs tabular text-muted">{driverOverall(d)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex shrink-0 items-center justify-between gap-2 text-xs">
                <span className="truncate" style={{ color: obj.color }}>● {obj.label}</span>
                <span className="shrink-0 text-muted">Presupuesto {formatMoney(t.budget)}</span>
              </div>
            </button>
          );
        }}
      />
      <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-line py-3">
        <div className="text-sm text-muted">{selected ? <>Has elegido <b className="text-fg">{selected.t.name}</b></> : "Selecciona un equipo para empezar"}</div>
        <Btn
          variant="primary"
          size="lg"
          disabled={!selected || !manager.trim()}
          onClick={() => selected && onCreate(newGame(series, selected.t.id, manager.trim(), Math.floor(Math.random() * 2 ** 31)))}
        >
          Empezar temporada 2026
        </Btn>
      </div>
    </div>
  );
}
