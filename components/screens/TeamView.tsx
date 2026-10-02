import { helmetOf } from "@/lib/game/data/liveries";
import { teamDrivers, teamOverall } from "@/lib/game/format";
import { driverOverall, engineRating, reliabilityRating } from "@/lib/game/perf";
import type { Driver, GameState } from "@/lib/game/types";
import { DriverPortrait, TeamCar } from "../art/Photos";
import { Nat, Panel, RatingBar } from "../ui";

export function TeamView({ state }: { state: GameState }) {
  const team = state.teams[state.player.teamId];
  const series = team.series;
  const rivals = Object.values(state.teams).filter((t) => t.series === series);
  const best = {
    aero: Math.max(...rivals.map((t) => t.car.aero)),
    chassis: Math.max(...rivals.map((t) => t.car.chassis)),
    engine: Math.max(...rivals.map((t) => engineRating(t, state.pus))),
    reliability: Math.max(...rivals.map((t) => reliabilityRating(t, state.pus))),
    pitCrew: Math.max(...rivals.map((t) => t.pitCrew)),
    engineering: Math.max(...rivals.map((t) => t.engineering)),
    factory: Math.max(...rivals.map((t) => t.factory)),
  };
  const ranking = rivals.map((t) => ({ t, s: teamOverall(state, t) })).sort((a, b) => b.s - a.s);
  const min = Math.min(...ranking.map((r) => r.s)) - 3;
  const max = ranking[0].s;
  const pu = team.pu ? state.pus[team.pu] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="carbon relative overflow-hidden rounded-2xl border border-line px-6 py-5">
        <div className="absolute inset-y-0 left-0 w-2" style={{ background: team.color }} />
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">{state.year} · {series.toUpperCase()}</div>
            <h1 className="text-3xl font-black">{team.name}</h1>
            <div className="text-sm text-muted">{pu ? `Motor ${pu.name}` : "Dallara · Mecachrome"}</div>
          </div>
          <TeamCar team={team} series={series} number={teamDrivers(state, team.id)[0]?.number} helmet={helmetOf(teamDrivers(state, team.id)[0] ?? { id: "x", nat: "GBR" }).base} className="ml-auto h-36 w-full max-w-2xl" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Coche">
          <div className="space-y-3">
            <RatingBar label={series === "f1" ? "Aerodinámica" : "Ingeniería aerodinámica"} value={team.car.aero} compare={best.aero} />
            <RatingBar label={series === "f1" ? "Chasis y suspensión" : "Mecánica"} value={team.car.chassis} compare={best.chassis} />
            <RatingBar label={pu ? `Unidad de potencia (${pu.name})` : "Motor Mecachrome (monomarca)"} value={engineRating(team, state.pus)} compare={best.engine} />
            <RatingBar label="Fiabilidad" value={reliabilityRating(team, state.pus)} compare={best.reliability} />
          </div>
          {pu && (
            <p className="mt-4 text-xs text-muted">
              {pu.worksTeam === team.id
                ? "Equipo oficial del motorista: puedes invertir en desarrollar la unidad de potencia."
                : `Cliente de ${state.teams[pu.worksTeam].short}: la unidad de potencia evoluciona según el desarrollo del fabricante.`}
            </p>
          )}
        </Panel>
        <Panel title="Personal e instalaciones">
          <div className="space-y-3">
            <RatingBar label="Equipo de boxes" value={team.pitCrew} compare={best.pitCrew} />
            <RatingBar label="Ingeniería de pista" value={team.engineering} compare={best.engineering} />
            <RatingBar label="Fábrica" value={team.factory} compare={best.factory} />
          </div>
          <p className="mt-4 text-xs text-muted">La marca blanca en cada barra indica el mejor valor de la parrilla.</p>
        </Panel>
        <Panel title="Rendimiento global de la parrilla">
          <ul className="space-y-1.5">
            {ranking.map(({ t, s }) => (
              <li key={t.id} className="grid grid-cols-[90px_1fr_32px] items-center gap-2 text-xs">
                <span className={t.id === team.id ? "truncate font-bold" : "truncate text-muted"}>{t.short}</span>
                <div className="h-3 overflow-hidden rounded-sm bg-panel-3">
                  <div className="h-full rounded-sm" style={{ width: `${((s - min) / (max - min)) * 100}%`, background: t.color, opacity: t.id === team.id ? 1 : 0.65 }} />
                </div>
                <span className="text-right font-bold tabular">{s}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {teamDrivers(state, team.id).map((d) => (
          <DriverCard key={d.id} d={d} color={team.color} />
        ))}
      </div>
    </div>
  );
}

function DriverCard({ d, color }: { d: Driver; color: string }) {
  return (
    <section className="flex overflow-hidden rounded-xl border border-line bg-panel">
      <DriverPortrait driver={d} color={color} kind="full" rounded="" className="w-36 shrink-0 sm:w-44" />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="font-mono">#{d.number}</span> <Nat code={d.nat} /> {d.age} años
            </div>
            <div className="truncate text-lg font-black">
              {d.first} <span className="uppercase">{d.last}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black tabular">{driverOverall(d)}</div>
            <div className="text-[9px] uppercase tracking-wider text-dim">Media</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
          <RatingBar label="Ritmo" value={d.pace} />
          <RatingBar label="Lucha en carrera" value={d.racecraft} />
          <RatingBar label="Regularidad" value={d.consistency} />
          <RatingBar label="Gestión de neumáticos" value={d.tyre} />
          <RatingBar label="Lluvia" value={d.wet} />
          <RatingBar label="Feedback técnico" value={d.feedback} />
          <RatingBar label="Salidas" value={d.start} />
          <RatingBar label="Agresividad" value={d.aggression} />
        </div>
      </div>
    </section>
  );
}
