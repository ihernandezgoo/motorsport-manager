import { CALENDAR_2026 } from "./data/calendar";
import { CIRCUITS } from "./data/circuits";
import { ALL_DRIVERS, ALL_TEAMS, POWER_UNITS, SERIES_SHORT } from "./data/teams";
import { aiDevelopment, progressProjects } from "./development";
import { SERIES_CFG } from "./perf";
import { clamp, gauss, rngFor } from "./rng";
import type { GameState, NewsItem, RaceKind, RaceResult, SeriesId } from "./types";
import { simulateSeriesWeekend, weekendSeries } from "./weekend";

export const SAVE_VERSION = 1;

export const POINTS: Record<SeriesId, Partial<Record<RaceKind, number[]>>> = {
  f1: { race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1] },
  f2: { feature: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [10, 8, 6, 5, 4, 3, 2, 1] },
  f3: { feature: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
};

const PRIZE_F1 = [30, 27, 24, 21, 18, 15, 12, 10, 8, 6, 5];

/** Asigna los puntos (incluidos pole y vuelta rápida en F2/F3). Es idempotente. */
export function scoreResult(r: RaceResult): RaceResult {
  const table = POINTS[r.series][r.kind] ?? [];
  for (const e of r.entries) {
    e.points = e.status === "FIN" ? table[e.pos - 1] ?? 0 : 0;
    e.pole = false;
    e.fastest = r.fastestLap?.driverId === e.driverId;
  }
  const pole = r.entries.find((e) => e.driverId === r.poleId);
  if (pole && (r.kind === "race" || r.kind === "feature")) {
    pole.pole = true;
    if (r.series !== "f1" && r.kind === "feature") pole.points += 2;
  }
  if (r.series !== "f1" && r.fastestLap) {
    const fl = r.entries.find((e) => e.driverId === r.fastestLap?.driverId);
    if (fl && fl.status === "FIN" && fl.pos <= 10) fl.points += 1;
  }
  return r;
}

export function newGame(series: SeriesId, teamId: string, manager: string, seed: number): GameState {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const team = ALL_TEAMS.find((t) => t.id === teamId);
  return {
    version: SAVE_VERSION,
    year: 2026,
    seed,
    manager,
    player: { series, teamId },
    teams: Object.fromEntries(ALL_TEAMS.map((t) => [t.id, clone(t)])),
    drivers: Object.fromEntries(ALL_DRIVERS.map((d) => [d.id, clone(d)])),
    pus: Object.fromEntries(POWER_UNITS.map((p) => [p.id, clone(p)])),
    calendar: clone(CALENDAR_2026),
    nextWeekend: 0,
    results: [],
    projects: [],
    finance: [],
    news: [
      {
        id: "welcome",
        date: "2026-03-01",
        series,
        title: `${manager} toma el mando de ${team?.name ?? "su equipo"}`,
        body: "Arranca la temporada 2026. La afición espera resultados desde la primera carrera en Melbourne.",
      },
    ],
    weekend: null,
    history: [],
    settings: { autoPause: true, defaultSpeed: 10 },
  };
}

export interface RaceCell {
  weekendId: string;
  kind: RaceKind;
  pos: number;
  status: "FIN" | "DNF";
  points: number;
  pole?: boolean;
  fastest?: boolean;
}

export interface DriverStanding {
  driverId: string;
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  best: number;
  cells: RaceCell[];
}

export function seriesResults(state: GameState, series: SeriesId) {
  return state.results.filter((r) => r.series === series);
}

export function driverStandings(state: GameState, series: SeriesId): DriverStanding[] {
  const map = new Map<string, DriverStanding>();
  for (const d of Object.values(state.drivers)) {
    if (d.series !== series) continue;
    map.set(d.id, { driverId: d.id, teamId: d.teamId, points: 0, wins: 0, podiums: 0, poles: 0, dnfs: 0, best: 99, cells: [] });
  }
  for (const r of seriesResults(state, series)) {
    for (const e of r.entries) {
      const s = map.get(e.driverId);
      if (!s) continue;
      s.points += e.points;
      if (e.status === "FIN") {
        s.best = Math.min(s.best, e.pos);
        if (e.pos === 1 && r.kind !== "sprint") s.wins++;
        if (e.pos <= 3 && r.kind !== "sprint") s.podiums++;
      } else s.dnfs++;
      if (e.pole) s.poles++;
      s.cells.push({ weekendId: r.weekendId, kind: r.kind, pos: e.pos, status: e.status, points: e.points, pole: e.pole, fastest: e.fastest });
    }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.best - b.best);
}

export interface TeamStanding {
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
}

export function teamStandings(state: GameState, series: SeriesId): TeamStanding[] {
  const map = new Map<string, TeamStanding>();
  for (const t of Object.values(state.teams)) if (t.series === series) map.set(t.id, { teamId: t.id, points: 0, wins: 0, podiums: 0 });
  for (const r of seriesResults(state, series)) {
    for (const e of r.entries) {
      const s = map.get(e.teamId);
      if (!s) continue;
      s.points += e.points;
      if (e.status === "FIN" && r.kind !== "sprint") {
        if (e.pos === 1) s.wins++;
        if (e.pos <= 3) s.podiums++;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums);
}

export function isSeasonOver(state: GameState) {
  return state.nextWeekend >= state.calendar.length;
}

function news(state: GameState, item: Omit<NewsItem, "id">) {
  state.news.unshift({ ...item, id: `${state.year}-${state.news.length}-${item.title.length}` });
  if (state.news.length > 60) state.news.length = 60;
}

function driverName(state: GameState, id: string) {
  const d = state.drivers[id];
  return d ? `${d.first} ${d.last}` : id;
}

/**
 * Cierra un fin de semana: guarda los resultados del jugador, simula el resto de categorías,
 * actualiza finanzas, proyectos, desarrollo rival y noticias, y avanza el calendario.
 */
export function completeWeekend(state: GameState, weekendIndex: number, playerResults: RaceResult[] | null) {
  const wk = state.calendar[weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const rng = rngFor(state.seed, state.year, wk.id, "complete");
  const player = state.player;

  for (const series of weekendSeries(wk)) {
    const res = series === player.series && playerResults ? playerResults : simulateSeriesWeekend(state, weekendIndex, series);
    for (const r of res) {
      scoreResult(r);
      state.results.push(r);
    }
    const main = res.find((r) => r.kind !== "sprint");
    const winner = main?.entries[0];
    if (main && winner) {
      const team = state.teams[winner.teamId];
      news(state, {
        date: wk.date,
        series,
        title: `${SERIES_SHORT[series]} · ${driverName(state, winner.driverId)} gana en ${circuit.city}`,
        body: `${team.short} se lleva la ${series === "f1" ? "victoria del " + (wk.f1?.name ?? "GP") : "carrera principal"}. Condiciones: ${main.weather.toLowerCase()}${main.scLaps > 0 ? `, ${main.scLaps} vueltas neutralizadas` : ""}.`,
      });
    }
    aiDevelopment(state, series, rng);
  }

  const team = state.teams[player.teamId];
  if (wk[player.series]) {
    const cfg = SERIES_CFG[player.series];
    const pts = state.results
      .filter((r) => r.weekendId === wk.id && r.series === player.series)
      .flatMap((r) => r.entries)
      .filter((e) => e.teamId === team.id)
      .reduce((a, e) => a + e.points, 0);
    const entries = [
      { label: `Patrocinadores · ${circuit.city}`, amount: team.sponsor },
      { label: `Premios por puntos (${pts} pts)`, amount: pts * cfg.pointsMoney },
      { label: `Costes operativos · ${circuit.city}`, amount: -team.sponsor * 0.6 },
    ];
    for (const e of entries) {
      if (e.amount === 0) continue;
      team.budget += e.amount;
      state.finance.push({ weekendIndex, ...e });
    }
  }

  for (const msg of progressProjects(state, rng)) news(state, { date: wk.date, series: player.series, title: `🔧 ${msg}` });

  state.nextWeekend = weekendIndex + 1;
  state.weekend = null;
  if (isSeasonOver(state)) closeSeason(state);
}

function closeSeason(state: GameState) {
  const champ = (s: SeriesId) => {
    const d = driverStandings(state, s)[0];
    const t = teamStandings(state, s)[0];
    return { driver: d ? driverName(state, d.driverId) : "—", team: t ? state.teams[t.teamId].name : "—" };
  };
  const rec = { year: state.year, f1: champ("f1"), f2: champ("f2"), f3: champ("f3") };
  state.history.push(rec);
  const last = state.calendar[state.calendar.length - 1].date;
  for (const s of ["f1", "f2", "f3"] as SeriesId[]) {
    news(state, { date: last, series: s, title: `🏆 ${rec[s].driver} campeón de ${SERIES_SHORT[s]} ${state.year}`, body: `Campeón de equipos: ${rec[s].team}.` });
  }
  const ts = teamStandings(state, state.player.series);
  const pos = ts.findIndex((t) => t.teamId === state.player.teamId);
  const prize = (PRIZE_F1[pos] ?? 4) * ({ f1: 1, f2: 0.05, f3: 0.025 } as const)[state.player.series];
  state.teams[state.player.teamId].budget += prize;
  state.finance.push({ weekendIndex: state.calendar.length - 1, label: `Premio final: P${pos + 1} en el campeonato de equipos`, amount: prize });
}

/** Prepara la siguiente temporada con la misma parrilla, envejeciendo pilotos y reequilibrando coches. */
export function startNextSeason(state: GameState) {
  const rng = rngFor(state.seed, state.year, "next-season");
  const year = state.year + 1;
  state.year = year;
  state.results = [];
  state.nextWeekend = 0;
  state.weekend = null;
  state.calendar = state.calendar.map((w) => ({ ...w, date: `${year}${w.date.slice(4)}` }));
  for (const t of Object.values(state.teams)) {
    for (const k of ["aero", "chassis", "reliability"] as const) {
      t.car[k] = clamp(t.car[k] + (82 - t.car[k]) * 0.2 + gauss(rng) * 1.5, 50, 98);
    }
    t.budget += t.sponsor * 4;
  }
  for (const pu of Object.values(state.pus)) {
    pu.power = clamp(pu.power + (85 - pu.power) * 0.15 + gauss(rng), 60, 98);
    pu.reliability = clamp(pu.reliability + (82 - pu.reliability) * 0.2 + gauss(rng), 60, 98);
  }
  for (const d of Object.values(state.drivers)) {
    d.age++;
    const delta = d.age <= 22 ? 1.5 : d.age <= 29 ? 0.4 : d.age <= 33 ? 0 : -1;
    for (const k of ["pace", "racecraft", "consistency", "tyre", "wet"] as const) {
      d[k] = Math.round(clamp(d[k] + delta + gauss(rng) * 0.8, 60, 99));
    }
  }
  news(state, { date: `${year}-02-20`, series: state.player.series, title: `Comienza la temporada ${year}`, body: "Los equipos presentan sus nuevos coches tras el invierno." });
}
