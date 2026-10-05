import { CarFront, Flag, Mail, Trophy, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { enterWeekend, nextSeason, simulateNextWeekend, simulateRestOfSeason } from "@/lib/actions";
import { SERIES_SHORT } from "@/lib/game/data/teams";
import { circuitOf, driverName, formatDate, formatDateLong, teamDrivers, teamOverall } from "@/lib/game/format";
import { driverOverall, formatMoney } from "@/lib/game/perf";
import { helmetOf } from "@/lib/game/data/liveries";
import { driverStandings, isSeasonOver, teamStandings } from "@/lib/game/season";
import type { GameState, SeriesId } from "@/lib/game/types";
import { weekendSeries } from "@/lib/game/weekend";
import { boardMood } from "@/lib/game/board";
import { marketIsOpen, nextSeasonLineup, SEATS } from "@/lib/game/market";
import { emptySlots } from "@/lib/game/sponsors";
import { confidenceColor } from "./OfficeView";
import { DriverPortrait, TeamCar } from "../art/Photos";
import { TrackView } from "../race/TrackView";
import { Btn, cx, Meter, Nat, Pager, Panel, SeriesBadge, Stat, Stripe, Tabs, useRowPager } from "../ui";

type HqTab = "summary" | "team" | "news";

export function Hq({ state, onEnterWeekend, onShowResults }: { state: GameState; onEnterWeekend: () => void; onShowResults: (idx: number) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<HqTab>("summary");
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
    <div className="mx-auto flex h-full w-full max-w-[1500px] min-h-0 flex-col gap-3">
      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-xl border border-line-2 bg-panel px-6 py-4 font-semibold">{busy}</div>
        </div>
      )}
      <Tabs
        className="shrink-0 self-start"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "summary", label: "Resumen" },
          { id: "team", label: "Mi equipo" },
          { id: "news", label: "Noticias" },
        ]}
      />

      {tab === "summary" && (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {over ? <SeasonOver state={state} /> : <NextEvent state={state} onEnter={onEnterWeekend} onSimulated={onShowResults} onSimRest={simRest} />}
          <div className="hidden min-h-0 flex-col gap-4 lg:flex">
            <Alerts state={state} />
            <Top10
              title={`Top 10 pilotos ${SERIES_SHORT[series]}`}
              icon={Users}
              rows={ds.slice(0, 10).map((s, i) => ({
                key: s.driverId,
                pos: i + 1,
                color: state.teams[s.teamId].color,
                label: driverName(state.drivers[s.driverId]),
                value: s.points,
                mine: s.teamId === team.id,
              }))}
            />
            <Top10
              title="Top 10 equipos"
              icon={Trophy}
              rows={ts.slice(0, 10).map((s, i) => ({
                key: s.teamId,
                pos: i + 1,
                color: state.teams[s.teamId].color,
                label: state.teams[s.teamId].short,
                value: s.points,
                mine: s.teamId === team.id,
              }))}
            />
          </div>
        </div>
      )}

      {tab === "team" && (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Panel fill title="Estado del equipo" icon={CarFront} className="h-full">
            <TeamCar team={team} series={series} number={myDrivers[0]?.number} helmet={myDrivers[0] ? helmetOf(myDrivers[0]).base : undefined} className="mx-auto mb-3 min-h-0 w-full max-w-xl flex-1" />
            <div className="grid shrink-0 grid-cols-2 gap-4">
              <Stat label="Campeonato" value={teamPos ? `P${teamPos}` : "—"} sub={`${teamPts} puntos`} />
              <Stat label="Rendimiento coche" value={`${teamOverall(state, team)}`} sub={`${carRank}º de ${rankCar.length}`} />
              <Stat label="Presupuesto" value={formatMoney(team.budget)} sub={`+${formatMoney(team.sponsor)} / carrera`} />
              <Stat label="Proyectos activos" value={state.projects.length} sub={state.projects.length ? "En la fábrica" : "Ninguno"} />
            </div>
          </Panel>
          <div className="flex min-h-0 flex-col gap-4">
            {myDrivers.map((d) => {
              const st = ds.find((x) => x.driverId === d.id);
              const pos = ds.findIndex((x) => x.driverId === d.id) + 1;
              return (
                <div key={d.id} className="mm-panel relative flex min-h-0 flex-1 items-center gap-4 overflow-hidden rounded-xl p-4">
                  <div className="absolute right-3 top-0 text-7xl font-black italic opacity-25" style={{ color: team.color }}>
                    {d.number}
                  </div>
                  <DriverPortrait driver={d} color={team.color} className="aspect-square h-full max-h-24 min-h-12" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">
                      {d.first} <Nat code={d.nat} />
                    </div>
                    <div className="truncate text-lg font-black uppercase">{d.last}</div>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      <Stat label="Posición" value={started ? `P${pos}` : "—"} />
                      <Stat label="Puntos" value={st?.points ?? 0} />
                      <Stat label="Media" value={driverOverall(d)} />
                    </div>
                    <div className="mt-1 truncate text-xs text-muted">
                      {st?.wins ?? 0} victorias · {st?.podiums ?? 0} podios · {st?.poles ?? 0} poles · {st?.dnfs ?? 0} abandonos
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "news" && (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <News state={state} />
          {lastIdx >= 0 && (
            <Panel className="hidden self-start lg:block" title="Última jornada" icon={Flag} right={<Btn size="xs" variant="ghost" onClick={() => onShowResults(lastIdx)}>Ver resultados</Btn>}>
              <LastWinners state={state} idx={lastIdx} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

const NEWS_ROW = 56;

function News({ state }: { state: GameState }) {
  const { ref, pager } = useRowPager(state.news.length, NEWS_ROW);
  return (
    <Panel fill title="Noticias del paddock" icon={Mail} bodyClass="p-0" className="min-h-0 flex-1" right={<Pager pager={pager} />}>
      <ul ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {state.news.slice(pager.start, pager.end).map((n) => (
          <li key={n.id} className="flex gap-3 border-b border-line px-4 py-2" style={{ height: NEWS_ROW }}>
            <div className="w-12 shrink-0 pt-0.5 text-[11px] text-dim">{formatDate(n.date)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {n.series && <SeriesBadge s={n.series} />}
                <span className="truncate">{n.title}</span>
              </div>
              {n.body && (
                <div className="mt-0.5 truncate text-xs text-muted" title={n.body}>
                  {n.body}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Top 10 sin paginar: las diez filas se reparten el alto del panel. */
function Top10({ title, icon, rows }: { title: string; icon: LucideIcon; rows: { key: string; pos: number; color: string; label: string; value: number; mine: boolean }[] }) {
  return (
    <Panel fill title={title} icon={icon} bodyClass="p-0" className="flex-1">
      <ol className="flex min-h-0 flex-1 flex-col py-1">
        {rows.map((r) => (
          <li key={r.key} className={cx("flex min-h-0 max-h-8 flex-1 items-center gap-2 px-4 text-sm", r.mine && "bg-accent/10")}>
            <span className="w-5 text-right text-xs font-bold tabular text-muted">{r.pos}</span>
            <Stripe color={r.color} className="h-4 self-center" />
            <span className={cx("truncate", r.mine && "font-semibold")}>{r.label}</span>
            <span className="ml-auto font-bold tabular">{r.value}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** Ficha del equipo del jugador dentro del próximo evento: coche, campeonato, presupuesto y pilotos. */
function TeamSnapshot({ state }: { state: GameState }) {
  const series = state.player.series;
  const team = state.teams[state.player.teamId];
  const ds = driverStandings(state, series);
  const ts = teamStandings(state, series);
  const started = state.results.some((r) => r.series === series);
  const teamPos = ts.findIndex((t) => t.teamId === team.id) + 1;
  const teamPts = ts.find((t) => t.teamId === team.id)?.points ?? 0;
  const drivers = teamDrivers(state, team.id);
  const rank = Object.values(state.teams)
    .filter((t) => t.series === series)
    .map((t) => ({ id: t.id, s: teamOverall(state, t) }))
    .sort((a, b) => b.s - a.s);
  const carRank = rank.findIndex((x) => x.id === team.id) + 1;
  return (
    <div
      className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-white/10 p-3"
      style={{ background: `linear-gradient(135deg, ${team.color}44 0%, #161a21 60%)` }}
    >
      <div className="flex min-h-[60px] flex-1 gap-4">
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className="absolute left-0 top-0 z-10 flex items-center gap-2">
            <Stripe color={team.color} className="h-4" />
            <span className="truncate text-sm font-black uppercase tracking-wide">{team.name}</span>
          </div>
          <TeamCar team={team} series={series} number={drivers[0]?.number} helmet={drivers[0] ? helmetOf(drivers[0]).base : undefined} className="h-full w-full" />
        </div>
        <div className="flex w-[48%] shrink-0 flex-col justify-center gap-0.5">
          {drivers.map((d) => {
            const pos = ds.findIndex((x) => x.driverId === d.id) + 1;
            const pts = ds.find((x) => x.driverId === d.id)?.points ?? 0;
            return (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <DriverPortrait driver={d} color={team.color} className="h-5 w-5" rounded="rounded-full" />
                <span className="w-5 text-right font-mono text-xs text-muted">{d.number}</span>
                <span className="truncate font-semibold">{d.last}</span>
                <span className="ml-auto shrink-0 text-xs tabular text-muted">
                  {started ? `P${pos}` : "—"} · <b className="text-fg">{pts}</b> pts
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-4 gap-3 border-t border-white/10 pt-2">
        <Stat label="Campeonato" value={started ? `P${teamPos}` : "—"} sub={`${teamPts} pts`} />
        <Stat label="Coche" value={teamOverall(state, team)} sub={`${carRank}º de ${rank.length}`} />
        <Stat label="Presupuesto" value={formatMoney(team.budget)} sub={`+${formatMoney(team.sponsor)}/carrera`} />
        <Stat
          label="Junta"
          value={<span style={{ color: confidenceColor(state.board.confidence) }}>{Math.round(state.board.confidence)}%</span>}
          sub={`${boardMood(state.board.confidence)} · objetivo P${state.board.target}`}
        />
      </div>
    </div>
  );
}

/** Avisos de gestión pendientes. */
function Alerts({ state }: { state: GameState }) {
  const team = state.teams[state.player.teamId];
  const items: { text: string; bad?: boolean }[] = [];
  if (state.board.confidence < 35) items.push({ text: `La junta está ${boardMood(state.board.confidence).toLowerCase()}: tu puesto peligra`, bad: true });
  if (team.budget < 0) items.push({ text: "Presupuesto en negativo", bad: true });
  if (marketIsOpen(state)) {
    const expiring = Object.values(state.drivers).filter((d) => d.teamId === team.id && d.contractUntil <= state.year && !d.next);
    if (expiring.length) items.push({ text: `Contratos por decidir: ${expiring.map((d) => d.last).join(", ")}` });
    const lineup = nextSeasonLineup(state, team.id).length;
    if (lineup < SEATS[team.series]) items.push({ text: `Asientos libres para ${state.year + 1}: ${SEATS[team.series] - lineup}` });
  }
  const empty = emptySlots(state).length;
  if (empty) items.push({ text: `${empty} ${empty === 1 ? "hueco" : "huecos"} de patrocinio sin cubrir` });
  for (const [id, comps] of Object.entries(state.components ?? {})) {
    const worn = Object.values(comps).some((c) => c.wear > 85);
    if (worn) items.push({ text: `${state.drivers[id]?.last}: componentes de motor al límite` });
  }
  if (items.length === 0) return null;
  return (
    <Panel title="Avisos" icon={Mail} className="shrink-0">
      <ul className="space-y-1 text-xs">
        {items.map((i) => (
          <li key={i.text} className={i.bad ? "text-bad" : "text-warn"}>
            • {i.text}
          </li>
        ))}
      </ul>
    </Panel>
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
    <section className="mm-panel relative flex min-h-0 flex-col overflow-hidden rounded-2xl">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.08em]">
        <Flag className="h-5 w-5 text-[#7aa2ff]" strokeWidth={2.2} /> Próximo evento
        <span className="ml-auto text-xs font-semibold normal-case tracking-normal text-muted">{formatDateLong(wk.date)}</span>
      </header>
      <div className="grid min-h-0 flex-1 gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="shrink-0">
          <div className="text-sm font-bold uppercase tracking-wider text-muted">
            {c.country} <span className="font-semibold normal-case">· {title}</span>
          </div>
          <h2 className="mt-1 truncate text-4xl font-light uppercase tracking-[0.12em] lg:text-5xl [@media(max-height:860px)]:text-4xl">{c.city}</h2>
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
          {/* En pantallas bajas se ocultan para dejar sitio a la ficha del equipo. */}
          <div className="mt-3 grid max-w-lg grid-cols-2 gap-x-6 gap-y-2 [@media(max-height:860px)]:hidden">
            <Characteristic label="Desgaste de neumáticos" value={c.wear / 1.4} />
            <Characteristic label="Sensibilidad a potencia" value={c.power} />
            <Characteristic label="Carga aerodinámica" value={c.downforce} />
            <Characteristic label="Probabilidad de lluvia" value={c.rain / 0.6} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
          <TeamSnapshot state={state} />
        </div>
        <TrackView circuitId={c.id} camera={{ kind: "overview" }} interactive={false} className="hidden h-full min-h-0 w-full rounded-xl md:block" />
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
    <section className="mm-panel flex min-h-0 flex-col justify-center overflow-hidden rounded-2xl p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Temporada {state.year} terminada</div>
      <h2 className="mt-1 text-3xl font-black">¡Campeones {state.year}!</h2>
      <p className="mt-1 text-sm text-muted">
        Tu equipo ha terminado {myPos}º en el campeonato de equipos (objetivo: P{state.board.target}). Confianza de la junta: {Math.round(state.board.confidence)}%.
      </p>
      <p className="mt-1 text-xs text-muted">Al empezar la nueva temporada se cierra el mercado: se aplican los fichajes, se retiran los veteranos y llegan canteranos a F3 y F2.</p>
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
