import { boardSeasonEnd, boardWeekend, initBoard, newSeasonBoard } from "./board";
import { accrueComponentWear, applyFailures, resetComponents, tracksComponents } from "./components";
import { CALENDAR_2026 } from "./data/calendar";
import { CIRCUITS } from "./data/circuits";
import { ALL_DRIVERS, ALL_TEAMS, POWER_UNITS, SERIES_SHORT } from "./data/teams";
import { aiDevelopment, progressProjects } from "./development";
import { developDriver, initContracts, marketTick, runOffseason } from "./market";
import { addNews, fullName } from "./news";
import { SERIES_CFG } from "./perf";
import { clamp, gauss, rngFor, type Rng } from "./rng";
import { autoSignSponsors, initSponsors, refreshSponsorOffers, sponsorIncome, sponsorsNewSeason } from "./sponsors";
import { initStaff, staffNewSeason, staffWage } from "./staff";
import { driverStandings, teamStandings } from "./standings";
import type { GameState, RaceKind, RaceResult, SeriesId } from "./types";
import { simulateSeriesWeekend, weekendSeries } from "./weekend";

export { driverStandings, seriesResults, teamStandings, type DriverStanding, type RaceCell, type TeamStanding } from "./standings";

export const SAVE_VERSION = 2;

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

/**
 * Prepara la parte de "carrera de mánager" de una partida: contratos y potencial de los pilotos,
 * personal, patrocinadores, componentes y la junta directiva. Sirve para partidas nuevas y migradas.
 */
export function initCareer(state: GameState, rng: Rng) {
  state.uid ??= 0;
  state.marketYear ??= 0;
  state.offers ??= [];
  state.sacked ??= false;
  state.career ??= [];
  initContracts(state, rng);
  initStaff(state, rng);
  state.board = initBoard(state);
  initSponsors(state, rng);
  refreshSponsorOffers(state, rng);
  resetComponents(state);
}

export function newGame(series: SeriesId, teamId: string, manager: string, seed: number): GameState {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const team = ALL_TEAMS.find((t) => t.id === teamId);
  const state = {
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
    news: [],
    weekend: null,
    history: [],
    settings: { autoPause: true, defaultSpeed: 10 },
    offers: [],
    sacked: false,
    career: [],
    sponsorOffers: [],
    staffMarket: [],
    components: {},
    uid: 0,
    marketYear: 0,
  } as unknown as GameState;
  initCareer(state, rngFor(seed, "career"));
  addNews(state, {
    date: "2026-03-01",
    series,
    title: `${manager} toma el mando de ${team?.name ?? "su equipo"}`,
    body: `Arranca la temporada 2026. Objetivo de la junta: ${state.board.target === 1 ? "ganar el campeonato" : `terminar entre los ${state.board.target} primeros`}.`,
  });
  return state;
}

export function isSeasonOver(state: GameState) {
  return state.nextWeekend >= state.calendar.length;
}

/** Fines de semana que disputa una categoría en la temporada (para repartir salarios por carrera). */
export function roundsOf(state: GameState, series: SeriesId) {
  return Math.max(1, state.calendar.filter((w) => w[series]).length);
}

/** Movimientos económicos del equipo del jugador en un fin de semana en que compite. */
function weekendFinances(state: GameState, weekendIndex: number, results: RaceResult[]) {
  const wk = state.calendar[weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const player = state.player;
  const team = state.teams[player.teamId];
  const cfg = SERIES_CFG[player.series];
  const rounds = roundsOf(state, player.series);
  const pts = results.flatMap((r) => r.entries).filter((e) => e.teamId === team.id).reduce((a, e) => a + e.points, 0);
  const drivers = Object.values(state.drivers).filter((d) => d.teamId === team.id);
  const wages = drivers.reduce((a, d) => a + d.salary, 0) / rounds;
  const entries = [
    ...sponsorIncome(state, results, circuit.city),
    { label: `Premios por puntos (${pts} pts)`, amount: pts * cfg.pointsMoney },
    { label: `Costes operativos · ${circuit.city}`, amount: -team.sponsor * 0.6 },
    { label: wages >= 0 ? "Salarios de los pilotos" : "Aportación de patrocinio de los pilotos", amount: -wages },
    { label: "Salarios del personal técnico", amount: -staffWage(state) / rounds },
  ];
  for (const e of entries) {
    const amount = Math.round(e.amount * 1000) / 1000;
    if (amount === 0) continue;
    team.budget += amount;
    state.finance.push({ weekendIndex, label: e.label, amount });
  }
  if (state.finance.length > 400) state.finance.splice(0, state.finance.length - 400);
}

/**
 * Cierra un fin de semana: guarda los resultados del jugador, simula el resto de categorías,
 * actualiza finanzas, proyectos, desarrollo rival, componentes, junta, mercado y noticias.
 */
export function completeWeekend(state: GameState, weekendIndex: number, playerResults: RaceResult[] | null) {
  const wk = state.calendar[weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const rng = rngFor(state.seed, state.year, wk.id, "complete");
  const player = state.player;
  let mine: RaceResult[] = [];

  for (const series of weekendSeries(wk)) {
    const res = series === player.series && playerResults ? playerResults : simulateSeriesWeekend(state, weekendIndex, series);
    for (const r of res) {
      scoreResult(r);
      state.results.push(r);
    }
    if (series === player.series) mine = res;
    const main = res.find((r) => r.kind !== "sprint");
    const winner = main?.entries[0];
    if (main && winner) {
      const team = state.teams[winner.teamId];
      addNews(state, {
        date: wk.date,
        series,
        title: `${SERIES_SHORT[series]} · ${fullName(state, winner.driverId)} gana en ${circuit.city}`,
        body: `${team.short} se lleva la ${series === "f1" ? "victoria del " + (wk.f1?.name ?? "GP") : "carrera principal"}. Condiciones: ${main.weather.toLowerCase()}${main.scLaps > 0 ? `, ${main.scLaps} vueltas neutralizadas` : ""}.`,
      });
    }
    aiDevelopment(state, series, rng);
  }

  if (wk[player.series] && !state.quick) {
    weekendFinances(state, weekendIndex, mine);
    if (tracksComponents(state)) {
      applyFailures(state, mine);
      accrueComponentWear(state, !!wk.f1?.sprint, rng);
    }
  }

  for (const msg of progressProjects(state, rng)) addNews(state, { date: wk.date, series: player.series, title: `🔧 ${msg}` });

  state.nextWeekend = weekendIndex + 1;
  state.weekend = null;
  if (!state.quick) {
    if (wk[player.series]) boardWeekend(state, wk.id, rng);
    marketTick(state, rng);
    if (!state.sacked) autoSignSponsors(state, rng);
  }
  if (isSeasonOver(state)) closeSeason(state, rng);
}

function closeSeason(state: GameState, rng: Rng) {
  const champ = (s: SeriesId) => {
    const d = driverStandings(state, s)[0];
    const t = teamStandings(state, s)[0];
    return { driver: d ? fullName(state, d.driverId) : "—", team: t ? state.teams[t.teamId].name : "—" };
  };
  const rec = { year: state.year, f1: champ("f1"), f2: champ("f2"), f3: champ("f3") };
  state.history.push(rec);
  const last = state.calendar[state.calendar.length - 1].date;
  for (const s of ["f1", "f2", "f3"] as SeriesId[]) {
    addNews(state, { date: last, series: s, title: `🏆 ${rec[s].driver} campeón de ${SERIES_SHORT[s]} ${state.year}`, body: `Campeón de equipos: ${rec[s].team}.` });
  }
  if (state.quick || state.sacked) return;
  const ts = teamStandings(state, state.player.series);
  const pos = ts.findIndex((t) => t.teamId === state.player.teamId);
  const prize = (PRIZE_F1[pos] ?? 4) * ({ f1: 1, f2: 0.05, f3: 0.025 } as const)[state.player.series];
  state.teams[state.player.teamId].budget += prize;
  state.finance.push({ weekendIndex: state.calendar.length - 1, label: `Premio final: P${pos + 1} en el campeonato de equipos`, amount: prize });
  boardSeasonEnd(state, rng);
}

/**
 * Prepara la siguiente temporada: mercado de invierno (con las clasificaciones del año que acaba),
 * progresión de los pilotos, reequilibrio de coches, personal, patrocinadores, componentes y objetivo.
 */
export function startNextSeason(state: GameState) {
  const rng = rngFor(state.seed, state.year, "next-season");
  const moves = runOffseason(state, rng);
  const year = state.year + 1;
  state.year = year;
  state.results = [];
  state.nextWeekend = 0;
  state.weekend = null;
  state.offers = [];
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
  for (const d of Object.values(state.drivers)) developDriver(d, rng);
  staffNewSeason(state, rng);
  sponsorsNewSeason(state, rng);
  resetComponents(state);
  newSeasonBoard(state);

  const team = state.teams[state.player.teamId];
  addNews(state, {
    date: `${year}-02-20`,
    series: state.player.series,
    title: `Comienza la temporada ${year}`,
    body: `Objetivo de la junta: ${state.board.target === 1 ? "ganar el campeonato" : `terminar entre los ${state.board.target} primeros`}.${moves.arrived.length ? ` Llegan: ${moves.arrived.join(", ")}.` : ""}`,
  });
  if (moves.left.length) addNews(state, { date: `${year}-02-20`, series: state.player.series, title: `Dejan ${team.short}: ${moves.left.join(", ")}` });
}
