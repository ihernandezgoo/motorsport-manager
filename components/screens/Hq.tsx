import { CarFront, Flag, Mail, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { enterWeekend, nextSeason, simulateNextWeekend, simulateRestOfSeason } from "@/lib/actions";
import { SERIES_NAMES, SERIES_SHORT } from "@/lib/game/data/teams";
import { circuitOf, driverName, formatDate, formatDateLong, teamDrivers, teamOverall } from "@/lib/game/format";
import { driverOverall, formatMoney } from "@/lib/game/perf";
import { helmetOf } from "@/lib/game/data/liveries";
import { driverStandings, isSeasonOver, teamStandings } from "@/lib/game/season";
import type { GameState, SeriesId } from "@/lib/game/types";
import { weekendSeries } from "@/lib/game/weekend";
import { DriverPortrait, TeamCar } from "../art/Photos";
import { TrackView } from "../race/TrackView";
import { Btn, cx, Meter, Nat, Panel, SeriesBadge, Stat, Stripe } from "../ui";

export function Hq({ state, onEnterWeekend, onShowResults }: { state: GameState; onEnterWeekend: () => void; onShowResults: (idx: number) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const over = isSeasonOver(state);
  const series = state.player.series;
  const team = state.teams[state.player.teamId];
  const ds = driverStandings(state, series);
  const ts = teamStandings(state, series);
  const started = state.results.some((r) => r.series === series);
  const teamPos = started ? ts.findIndex((t) => t.teamId === team.id) + 1 : 0;
  const teamPts = ts.find((t) => t.teamId === team.id)?.points ?? 0;
  const myDrivers = teamDrivers(state, team.id);
  const rankCar = Object.values(state.teams)
    .filter((t) => t.series === series)
    .map((t) => ({ id: t.id, s: teamOverall(state, t) }))
    .sort((a, b) => b.s - a.s);
  const carRank = rankCar.findIndex((x) => x.id === team.id) + 1;
  const lastIdx = state.nextWeekend - 1;

  const simRest = async () => {
    if (!window.confirm("Se simularán todas las carreras restantes de F1, F2 y F3 (incluidas las de tu equipo, gestionadas por tu ingeniero). ¿Continuar?")) return;
    await simulateRestOfSeason((done, total, label) => setBusy(done < total ? `Simulando ${label} (${done + 1}/${total})…` : null));
    setBusy(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-xl border border-line-2 bg-panel px-6 py-4 font-semibold">{busy}</div>
        </div>
      )}
      {over ? <SeasonOver state={state} /> : <NextEvent state={state} onEnter={onEnterWeekend} onSimulated={onShowResults} onSimRest={simRest} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Estado del equipo" icon={CarFront}>
            <TeamCar team={team} series={series} number={myDrivers[0]?.number} helmet={myDrivers[0] ? helmetOf(myDrivers[0]).base : undefined} className="mx-auto mb-3 h-28 w-full max-w-xl" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Campeonato" value={teamPos ? `P${teamPos}` : "—"} sub={`${teamPts} puntos`} />
              <Stat label="Rendimiento coche" value={`${teamOverall(state, team)}`} sub={`${carRank}º de ${rankCar.length}`} />
              <Stat label="Presupuesto" value={formatMoney(team.budget)} sub={`+${formatMoney(team.sponsor)} / carrera`} />
              <Stat label="Proyectos activos" value={state.projects.length} sub={state.projects.length ? "En la fábrica" : "Ninguno"} />
            </div>
          </Panel>

          <div className={cx("grid gap-4", myDrivers.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {myDrivers.map((d) => {
              const st = ds.find((x) => x.driverId === d.id);
              const pos = ds.findIndex((x) => x.driverId === d.id) + 1;
              return (
                <div key={d.id} className="mm-panel relative overflow-hidden rounded-xl p-4">
                  <div className="absolute right-3 top-0 text-7xl font-black italic opacity-25" style={{ color: team.color }}>
                    {d.number}
                  </div>
                  <div className="flex items-center gap-3">
                    <DriverPortrait driver={d} color={team.color} className="h-20 w-20" />
                    <div>
                      <div className="text-xs text-muted">
                        {d.first} <Nat code={d.nat} />
                      </div>
                      <div className="text-lg font-black uppercase">{d.last}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Stat label="Posición" value={started ? `P${pos}` : "—"} />
                    <Stat label="Puntos" value={st?.points ?? 0} />
                    <Stat label="Media" value={driverOverall(d)} />
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {st?.wins ?? 0} victorias · {st?.podiums ?? 0} podios · {st?.poles ?? 0} poles · {st?.dnfs ?? 0} abandonos
                  </div>
                </div>
              );
            })}
          </div>

          <Panel title="Noticias del paddock" icon={Mail} bodyClass="p-0">
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {state.news.slice(0, 25).map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-2.5">
                  <div className="w-12 shrink-0 pt-0.5 text-[11px] text-dim">{formatDate(n.date)}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {n.series && <SeriesBadge s={n.series} />}
                      <span>{n.title}</span>
                    </div>
                    {n.body && <div className="mt-0.5 text-xs text-muted">{n.body}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={`Pilotos · ${SERIES_NAMES[series]}`} icon={Users} bodyClass="p-0">
            <MiniTable
              rows={ds.slice(0, 10).map((s, i) => ({
                key: s.driverId,
                pos: i + 1,
                color: state.teams[s.teamId].color,
                label: driverName(state.drivers[s.driverId]),
                value: s.points,
                mine: s.teamId === team.id,
              }))}
            />
          </Panel>
          <Panel title="Equipos" icon={Trophy} bodyClass="p-0">
            <MiniTable
              rows={ts.map((s, i) => ({
                key: s.teamId,
                pos: i + 1,
                color: state.teams[s.teamId].color,
                label: state.teams[s.teamId].short,
                value: s.points,
                mine: s.teamId === team.id,
              }))}
            />
          </Panel>
          {lastIdx >= 0 && (
            <Panel title="Última jornada" icon={Flag} right={<Btn size="xs" variant="ghost" onClick={() => onShowResults(lastIdx)}>Ver resultados</Btn>}>
              <LastWinners state={state} idx={lastIdx} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniTable({ rows }: { rows: { key: string; pos: number; color: string; label: string; value: number; mine: boolean }[] }) {
  return (
    <ul className="divide-y divide-line/60">
      {rows.map((r) => (
        <li key={r.key} className={cx("flex items-center gap-2 px-4 py-1.5 text-sm", r.mine && "bg-accent/10")}>
          <span className="w-5 text-right text-xs font-bold tabular text-muted">{r.pos}</span>
          <Stripe color={r.color} className="h-4" />
          <span className={cx("truncate", r.mine && "font-semibold")}>{r.label}</span>
          <span className="ml-auto font-bold tabular">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function LastWinners({ state, idx }: { state: GameState; idx: number }) {
  const wk = state.calendar[idx];
  const res = state.results.filter((r) => r.weekendId === wk.id && r.kind !== "sprint");
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">
        {circuitOf(wk).city} · {formatDateLong(wk.date)}
      </div>
      {res.length === 0 && <div className="text-xs text-muted">Sin resultados</div>}
      {res.map((r) => {
        const w = r.entries[0];
        return (
          <div key={r.series} className="flex items-center gap-2 text-sm">
            <SeriesBadge s={r.series} />
            <Stripe color={state.teams[w.teamId].color} className="h-4" />
            <span className="truncate">{driverName(state.drivers[w.driverId])}</span>
            <span className="ml-auto text-xs text-muted">{state.teams[w.teamId].short}</span>
          </div>
        );
      })}
    </div>
  );
}

function NextEvent({ state, onEnter, onSimulated, onSimRest }: { state: GameState; onEnter: () => void; onSimulated: (idx: number) => void; onSimRest: () => void }) {
  const wk = state.calendar[state.nextWeekend];
  const c = circuitOf(wk);
  const series = weekendSeries(wk).slice().reverse();
  const mine = !!wk[state.player.series];
  const entry = wk[state.player.series];
  const total = state.calendar.filter((w) => w[state.player.series]).length;
  const title = wk.f1?.name ?? wk.f2?.name ?? wk.f3?.name ?? c.name;
  return (
    <section className="mm-panel relative overflow-hidden rounded-2xl">
      <header className="flex items-center gap-2.5 border-b border-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.08em]">
        <Flag className="h-5 w-5 text-[#7aa2ff]" strokeWidth={2.2} /> Próximo evento
        <span className="ml-auto text-xs font-semibold normal-case tracking-normal text-muted">{formatDateLong(wk.date)}</span>
      </header>
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="text-sm font-bold uppercase tracking-wider text-muted">
            {c.country} <span className="font-semibold normal-case">· {title}</span>
          </div>
          <h2 className="mt-1 text-4xl font-light uppercase tracking-[0.12em] lg:text-5xl">{c.city}</h2>
          <div className="mt-1 text-sm text-muted">{c.name}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {series.map((s) => (
              <span key={s} className="flex items-center gap-1.5 rounded-md border border-line-2 bg-panel-2 px-2 py-1 text-xs">
                <SeriesBadge s={s} /> Ronda {wk[s]?.round}
                {s === "f1" && wk.f1?.sprint && <b className="text-warn">· Sprint</b>}
              </span>
            ))}
          </div>
          <div className="mt-4 grid max-w-lg grid-cols-3 gap-3">
            <Stat label="Longitud" value={`${c.lengthKm.toFixed(3)} km`} />
            <Stat label="Vueltas GP" value={c.laps} />
            <Stat label="Adelantar" value={c.overtaking > 0.45 ? "Fácil" : c.overtaking > 0.25 ? "Medio" : "Difícil"} />
          </div>
          <div className="mt-3 grid max-w-lg grid-cols-2 gap-x-6 gap-y-2">
            <Characteristic label="Desgaste de neumáticos" value={c.wear / 1.4} />
            <Characteristic label="Sensibilidad a potencia" value={c.power} />
            <Characteristic label="Carga aerodinámica" value={c.downforce} />
            <Characteristic label="Probabilidad de lluvia" value={c.rain / 0.6} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {mine ? (
              <Btn
                variant="primary"
                size="lg"
                onClick={() => {
                  enterWeekend();
                  onEnter();
                }}
              >
                {state.weekend ? "Continuar fin de semana" : `Ir al fin de semana (${SERIES_SHORT[state.player.series]} ronda ${entry?.round}/${total})`}
              </Btn>
            ) : (
              <Btn
                variant="primary"
                size="lg"
                onClick={() => {
                  const idx = simulateNextWeekend();
                  if (idx !== null) onSimulated(idx);
                }}
              >
                Simular fin de semana
              </Btn>
            )}
            <Btn variant="ghost" onClick={onSimRest}>
              Simular resto de temporada
            </Btn>
          </div>
          {!mine && <p className="mt-2 text-xs text-muted">Tu categoría no compite aquí: se simularán las carreras de {series.map((s) => SERIES_SHORT[s]).join(" y ")}.</p>}
        </div>
        <TrackView circuitId={c.id} camera={{ kind: "overview" }} interactive={false} className="h-56 w-full rounded-xl md:h-full md:min-h-64" />
      </div>
    </section>
  );
}

function Characteristic({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">{label}</div>
      <Meter value={Math.min(1, value) * 100} color="#e10600" height={5} />
    </div>
  );
}

function SeasonOver({ state }: { state: GameState }) {
  const rec = state.history[state.history.length - 1];
  const myPos = teamStandings(state, state.player.series).findIndex((t) => t.teamId === state.player.teamId) + 1;
  return (
    <section className="mm-panel rounded-2xl p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Temporada {state.year} terminada</div>
      <h2 className="mt-1 text-3xl font-black">¡Campeones {state.year}!</h2>
      <p className="mt-1 text-sm text-muted">Tu equipo ha terminado {myPos}º en el campeonato de equipos.</p>
      {rec && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(["f1", "f2", "f3"] as SeriesId[]).map((s) => (
            <div key={s} className="rounded-xl border border-line-2 bg-panel-2 p-4">
              <SeriesBadge s={s} />
              <div className="mt-2 flex items-center gap-2 text-lg font-black">
                <Trophy className="h-5 w-5 text-[#fcd34d]" /> {rec[s].driver}
              </div>
              <div className="text-xs text-muted">Equipos: {rec[s].team}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5">
        <Btn variant="primary" size="lg" onClick={nextSeason}>
          Comenzar temporada {state.year + 1}
        </Btn>
      </div>
    </section>
  );
}
