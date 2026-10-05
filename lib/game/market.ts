import { SERIES_SHORT } from "./data/teams";
import { driverCode, personName, pickNat } from "./names";
import { addNews, currentDate, fullName } from "./news";
import { carScore, driverOverall, formatMoney } from "./perf";
import { clamp, gauss, type Rng } from "./rng";
import { driverStandings, type DriverStanding } from "./standings";
import type { Driver, GameState, SeriesId, Team } from "./types";

/** Asientos por equipo. */
export const SEATS: Record<SeriesId, number> = { f1: 2, f2: 2, f3: 3 };
/** Escalón de cada categoría en la escalera FIA. */
export const LEVEL: Record<SeriesId, number> = { f1: 3, f2: 2, f3: 1 };
const BY_LEVEL: Record<number, SeriesId> = { 1: "f3", 2: "f2", 3: "f1" };
/** Fracción de la temporada a partir de la cual se abre el mercado de fichajes. */
export const MARKET_OPENS = 0.4;
/** Nivel mínimo (valoración) para que un equipo de F1 suba a un piloto de F2. */
const F1_PROMOTION = 78;

const round2 = (x: number) => Math.round(x * 100) / 100;

export function marketIsOpen(state: GameState): boolean {
  if (state.quick) return false;
  return state.nextWeekend >= Math.floor(state.calendar.length * MARKET_OPENS);
}

/** Valoración de mercado: la media actual más lo que se espera que progrese (o decaiga). */
export function rating(d: Driver): number {
  const ovr = driverOverall(d);
  const growth = d.age <= 23 ? Math.max(0, d.potential - d.pace) * 0.35 : d.age >= 33 ? -(d.age - 32) * 0.8 : 0;
  return ovr + growth;
}

/**
 * Salario de mercado por temporada en una categoría. En F2 y F3 es negativo: el piloto aporta
 * patrocinio, y cuanto menos talento tiene, más dinero tiene que traer para conseguir un asiento.
 */
export function marketValue(d: Driver, series: SeriesId): number {
  const r = rating(d);
  if (series === "f1") return round2(0.5 + Math.max(0, r - 72) ** 2 * 0.025);
  const k = series === "f2" ? 0.7 : 0.35;
  return -round2(k * clamp(1.45 - (r - 70) / 25, 0.35, 1.6));
}

/** Atractivo de un equipo para un piloto: categoría y competitividad del coche. */
export function teamAppeal(state: GameState, teamId: string): number {
  const t = state.teams[teamId];
  if (!t) return 0;
  const rivals = Object.values(state.teams).filter((x) => x.series === t.series);
  const mine = carScore(t, state.pus);
  const better = rivals.filter((x) => carScore(x, state.pus) > mine).length;
  const rel = rivals.length > 1 ? 1 - better / (rivals.length - 1) : 1;
  return LEVEL[t.series] * 10 + rel * 8;
}

/** Pilotos que correrán con un equipo la próxima temporada (contratos vigentes y fichajes cerrados). */
export function nextSeasonLineup(state: GameState, teamId: string): Driver[] {
  return Object.values(state.drivers).filter((d) => (d.next ? d.next.teamId === teamId : d.teamId === teamId && d.contractUntil > state.year));
}

/** ¿Puede negociar para la próxima temporada? Agentes libres y contratos que acaban este año. */
export function isAvailable(state: GameState, d: Driver): boolean {
  return !d.next && (d.teamId === "" || d.contractUntil <= state.year);
}

/** Lo que pide un piloto para firmar con un equipo (con signo: negativo = lo que aporta). */
export function askingSalary(state: GameState, d: Driver, teamId: string): number {
  const team = state.teams[teamId];
  const base = marketValue(d, team.series);
  let adj = 0;
  if (d.teamId === teamId) adj -= 0.05;
  else {
    if (!d.teamId) adj -= 0.15;
    if (LEVEL[team.series] > LEVEL[d.series]) adj -= 0.3;
    else if (d.teamId) adj -= (teamAppeal(state, teamId) - teamAppeal(state, d.teamId)) * 0.04;
  }
  return round2(base + Math.abs(base) * clamp(adj, -0.6, 0.8));
}

export type OfferVerdict = { ok: boolean; msg: string; ask?: number };

/** Respuesta de un piloto a una oferta del jugador. No modifica el estado. */
export function evaluateOffer(state: GameState, driverId: string, teamId: string, salary: number, years: number): OfferVerdict {
  const d = state.drivers[driverId];
  const team = state.teams[teamId];
  if (!d || !team) return { ok: false, msg: "Piloto o equipo desconocido" };
  if (!marketIsOpen(state)) return { ok: false, msg: `El mercado abre a partir de la ronda ${Math.floor(state.calendar.length * MARKET_OPENS) + 1}` };
  if (!isAvailable(state, d)) {
    if (d.next) return { ok: false, msg: `Ya ha firmado con ${state.teams[d.next.teamId]?.short ?? "otro equipo"} para ${state.year + 1}` };
    return { ok: false, msg: `Tiene contrato hasta ${d.contractUntil}` };
  }
  const renewing = d.teamId === teamId;
  if (!renewing && nextSeasonLineup(state, teamId).length >= SEATS[team.series]) return { ok: false, msg: "No te quedan asientos libres para la próxima temporada" };
  if (d.age >= 38) return { ok: false, msg: "Ha decidido colgar el casco al final de la temporada" };
  if (LEVEL[team.series] < LEVEL[d.series] && rating(d) > 76) return { ok: false, msg: "No quiere bajar de categoría" };
  if (LEVEL[team.series] > LEVEL[d.series] + 1) return { ok: false, msg: "No puede saltarse una categoría: aún no tiene los puntos de superlicencia" };
  if (team.series === "f1" && d.series !== "f1" && rating(d) < F1_PROMOTION - 2) return { ok: false, msg: "Todavía no tiene el nivel ni los puntos de superlicencia para la F1" };
  if (years < 1 || years > 3) return { ok: false, msg: "Los contratos son de 1 a 3 temporadas" };
  const ask = askingSalary(state, d, teamId);
  if (salary + 1e-9 < ask) {
    return { ok: false, ask, msg: ask < 0 ? `Solo puede aportar ${formatMoney(-ask)} por temporada` : `Pide al menos ${formatMoney(ask)} por temporada` };
  }
  if (salary > 0 && salary > team.budget) return { ok: false, msg: "No tienes presupuesto para pagar ese salario" };
  return { ok: true, msg: `${d.first} ${d.last} acepta: ${renewing ? "renueva" : "firma"} hasta ${state.year + years}` };
}

/** El jugador cierra un fichaje o una renovación para la próxima temporada. */
export function signDriver(state: GameState, driverId: string, teamId: string, salary: number, years: number): OfferVerdict {
  const v = evaluateOffer(state, driverId, teamId, salary, years);
  if (!v.ok) return v;
  const d = state.drivers[driverId];
  const team = state.teams[teamId];
  d.next = { teamId, salary: round2(salary), until: state.year + years };
  addNews(state, {
    date: currentDate(state),
    series: team.series,
    title: d.teamId === teamId ? `✍️ ${fullName(state, d.id)} renueva con ${team.short}` : `✍️ ${fullName(state, d.id)} firma con ${team.short} para ${state.year + 1}`,
    body: `Contrato hasta ${state.year + years}.`,
  });
  return v;
}

/** Coste de rescindir el contrato de un piloto del jugador (las temporadas que le quedan después de esta). */
export function terminationCost(state: GameState, d: Driver): number {
  return round2(Math.max(0, d.salary) * Math.max(0, d.contractUntil - state.year) * 0.5);
}

/** Rescinde el contrato: el piloto termina la temporada y se marcha. */
export function terminateContract(state: GameState, driverId: string): string | null {
  const d = state.drivers[driverId];
  const team = state.teams[state.player.teamId];
  if (!d || d.teamId !== team.id) return "No es piloto de tu equipo";
  if (d.contractUntil <= state.year && !d.next) return "Su contrato ya termina esta temporada";
  const cost = terminationCost(state, d);
  if (team.budget < cost) return "Presupuesto insuficiente para la indemnización";
  team.budget -= cost;
  if (cost > 0) state.finance.push({ weekendIndex: state.nextWeekend, label: `Rescisión de ${d.first} ${d.last}`, amount: -cost });
  d.contractUntil = state.year;
  if (d.next?.teamId === team.id) delete d.next;
  addNews(state, { date: currentDate(state), series: team.series, title: `${team.short} rescinde el contrato de ${fullName(state, d.id)}`, body: `Correrá hasta final de temporada.` });
  return null;
}

// ───────────────────────────── generación ─────────────────────────────

/** Rellena potencial y contratos de los pilotos reales al empezar una partida. */
export function initContracts(state: GameState, rng: Rng) {
  for (const d of Object.values(state.drivers)) {
    const extra = d.age <= 19 ? 6 + rng() * 10 : d.age <= 22 ? 3 + rng() * 7 : d.age <= 25 ? 1 + rng() * 3 : 0;
    d.potential = Math.round(clamp(d.pace + extra, d.pace, 99));
    d.salary = marketValue(d, d.series);
    if (d.series === "f1") d.contractUntil = state.year + (rating(d) > 88 ? 1 + Math.floor(rng() * 2) : Math.floor(rng() * 3));
    else d.contractUntil = state.year + (rng() < 0.25 ? 1 : 0);
    delete d.next;
  }
}

/** Crea un piloto nuevo (canterano o reserva) sin equipo. */
export function generateDriver(state: GameState, rng: Rng, series: SeriesId): Driver {
  state.uid = (state.uid ?? 0) + 1;
  const nat = pickNat(rng);
  const { first, last } = personName(rng, nat);
  const age = series === "f3" ? 16 + Math.floor(rng() * 3) : series === "f2" ? 18 + Math.floor(rng() * 3) : 21 + Math.floor(rng() * 4);
  const lvl = { f3: 72, f2: 77, f1: 81 }[series];
  const pace = Math.round(clamp(lvl + gauss(rng) * 3, 62, 92));
  const skill = (off = 0) => Math.round(clamp(pace - 2 + off + gauss(rng) * 3, 55, 95));
  const d: Driver = {
    id: `gen-${state.uid}`,
    series,
    teamId: "",
    first,
    last,
    code: driverCode(last),
    number: 0,
    nat,
    age,
    pace,
    racecraft: skill(),
    consistency: skill(-1),
    tyre: skill(),
    wet: skill(),
    feedback: skill(-3),
    aggression: Math.round(clamp(62 + gauss(rng) * 8, 40, 90)),
    start: skill(1),
    potential: Math.round(clamp(pace + 2 + rng() * 12 - (age - 16) * 0.8, pace, 95)),
    salary: 0,
    contractUntil: state.year,
  };
  d.salary = marketValue(d, series);
  state.drivers[d.id] = d;
  return d;
}

/** Progresión anual: los jóvenes se acercan a su potencial y los veteranos pierden ritmo. */
export function developDriver(d: Driver, rng: Rng) {
  d.age++;
  const gap = Math.max(0, d.potential - d.pace);
  let dp = d.age <= 22 ? gap * 0.25 : d.age <= 26 ? gap * 0.1 : d.age <= 30 ? 0 : d.age <= 33 ? -0.9 : -1.8;
  dp += gauss(rng) * 0.8;
  d.pace = Math.round(clamp(d.pace + dp, 55, 99));
  const exp = d.age <= 24 ? 0.8 : d.age <= 30 ? 0.2 : d.age <= 33 ? -0.5 : -1.2;
  for (const k of ["racecraft", "consistency", "tyre", "wet", "feedback", "start"] as const) {
    d[k] = Math.round(clamp(d[k] + exp + gauss(rng) * 0.8, 55, 99));
  }
  d.potential = Math.max(d.potential, d.pace);
}

// ───────────────────────────── IA del mercado ─────────────────────────────

type StandingsCache = Partial<Record<SeriesId, DriverStanding[]>>;

function rankIn(cache: StandingsCache, state: GameState, d: Driver): number {
  const s = (cache[d.series] ??= driverStandings(state, d.series));
  const i = s.findIndex((x) => x.driverId === d.id);
  return i < 0 ? 99 : i + 1;
}

function aiTeams(state: GameState, series?: SeriesId): Team[] {
  return Object.values(state.teams)
    .filter((t) => t.id !== state.player.teamId && (!series || t.series === series))
    .sort((a, b) => teamAppeal(state, b.id) - teamAppeal(state, a.id));
}

/** Probabilidad de que un equipo rival renueve a un piloto cuyo contrato termina. */
function renewChance(state: GameState, cache: StandingsCache, d: Driver): number {
  const rank = rankIn(cache, state, d);
  if (d.series === "f1") {
    if (d.age >= 37) return 0;
    const mates = Object.values(state.drivers).filter((x) => x.teamId === d.teamId && x.id !== d.id);
    const beat = mates.every((m) => rank <= rankIn(cache, state, m));
    return clamp(0.55 + (rating(d) - 82) * 0.04 + (beat ? 0.15 : -0.1) - (d.age >= 34 ? 0.25 : 0), 0.05, 0.95);
  }
  // En F2 y F3 los mejores buscan el ascenso; los demás repiten si son jóvenes.
  if (rank <= 3) return 0.05;
  const young = d.series === "f2" ? d.age <= 21 : d.age <= 19;
  return young ? 0.55 : 0.2;
}

/**
 * Al abrirse el mercado, los equipos rivales deciden qué pilotos renuevan. Los que no, quedan
 * disponibles para el jugador y para los demás equipos.
 */
export function openMarket(state: GameState, rng: Rng) {
  if (state.quick || state.marketYear >= state.year || !marketIsOpen(state)) return;
  state.marketYear = state.year;
  const cache: StandingsCache = {};
  for (const t of aiTeams(state)) {
    for (const d of Object.values(state.drivers)) {
      if (d.teamId !== t.id || d.contractUntil > state.year || d.next) continue;
      if (rng() < renewChance(state, cache, d)) {
        d.next = { teamId: t.id, salary: marketValue(d, t.series), until: state.year + 1 + (t.series === "f1" && rng() < 0.5 ? 1 : 0) };
      }
    }
  }
  const mine = Object.values(state.drivers).filter((d) => d.teamId === state.player.teamId && d.contractUntil <= state.year);
  addNews(state, {
    date: currentDate(state),
    series: state.player.series,
    title: `🔄 Se abre el mercado de fichajes para ${state.year + 1}`,
    body: mine.length
      ? `Contratos que vencen en tu equipo: ${mine.map((d) => d.last).join(", ")}. Renueva o busca sustitutos en el mercado.`
      : "Todos tus pilotos tienen contrato para la próxima temporada.",
  });
}

/** Mejor candidato disponible para un asiento de un equipo, o null. */
function bestCandidate(state: GameState, cache: StandingsCache, team: Team, offseason: boolean): Driver | null {
  const lvl = LEVEL[team.series];
  let best: Driver | null = null;
  let bestScore = -Infinity;
  for (const d of Object.values(state.drivers)) {
    if (!isAvailable(state, d) || d.teamId === team.id) continue;
    const dl = LEVEL[d.series];
    if (dl !== lvl && dl !== lvl - 1) continue;
    if (d.age >= 37) continue;
    const r = rating(d);
    if (team.series === "f1" && dl < lvl && r < (offseason ? F1_PROMOTION - 3 : F1_PROMOTION)) continue;
    // Un piloto puntero no se compromete pronto con un equipo de la zona baja.
    if (!offseason && r > 88 && teamAppeal(state, team.id) - lvl * 10 < 4) continue;
    const promo = dl < lvl ? Math.max(0, 6 - rankIn(cache, state, d)) * 0.8 : 0;
    const score = r + promo - (d.teamId ? 0 : 1);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function signForAi(state: GameState, d: Driver, team: Team, rng: Rng) {
  d.next = { teamId: team.id, salary: marketValue(d, team.series), until: state.year + 1 + (rng() < 0.4 ? 1 : 0) };
  const promoted = LEVEL[team.series] > LEVEL[d.series];
  addNews(state, {
    date: currentDate(state),
    series: team.series,
    title: `${promoted ? "⬆️" : "✍️"} ${fullName(state, d.id)} ficha por ${team.short} para ${state.year + 1}`,
    body: promoted ? `Da el salto desde la ${SERIES_SHORT[d.series]}.` : d.teamId ? `Deja ${state.teams[d.teamId]?.short ?? "su equipo"}.` : undefined,
  });
}

/** Tras cada fin de semana con el mercado abierto, algunos equipos rivales cierran fichajes. */
export function marketTick(state: GameState, rng: Rng) {
  if (state.quick || !marketIsOpen(state)) return;
  openMarket(state, rng);
  const cache: StandingsCache = {};
  for (const team of aiTeams(state)) {
    if (nextSeasonLineup(state, team.id).length >= SEATS[team.series]) continue;
    if (rng() > 0.2) continue;
    const c = bestCandidate(state, cache, team, false);
    if (c) signForAi(state, c, team, rng);
  }
}

/** Retirada: se elimina al piloto y, si es conocido, se da la noticia. */
function retire(state: GameState, d: Driver, date: string) {
  if (d.series === "f1" || driverOverall(d) >= 84) {
    addNews(state, { date, series: d.series, title: `👋 ${d.first} ${d.last} anuncia su retirada`, body: `Se despide a los ${d.age} años.` });
  }
  delete state.drivers[d.id];
}

function fixNumbers(state: GameState) {
  for (const s of ["f1", "f2", "f3"] as SeriesId[]) {
    const used = new Set<number>();
    const grid = Object.values(state.drivers)
      .filter((d) => d.series === s && d.teamId)
      .sort((a, b) => (a.number > 0 ? 0 : 1) - (b.number > 0 ? 0 : 1));
    for (const d of grid) {
      if (d.number > 0 && !used.has(d.number)) {
        used.add(d.number);
        continue;
      }
      let n = 2;
      while (used.has(n)) n++;
      d.number = n;
      used.add(n);
    }
  }
}

/**
 * Mercado de invierno (al empezar la nueva temporada, con las clasificaciones del año que acaba):
 * retiradas, vacantes cubiertas por orden de categoría (ascensos incluidos), canteranos nuevos en F3
 * y aplicación de todos los contratos. Devuelve los nombres de quienes llegan y se van del equipo del jugador.
 */
export function runOffseason(state: GameState, rng: Rng): { arrived: string[]; left: string[] } {
  openMarket(state, rng);
  const year = state.year;
  const date = `${year}-12-15`;
  const cache: StandingsCache = {};
  for (const s of ["f1", "f2", "f3"] as SeriesId[]) cache[s] = driverStandings(state, s);
  const playerTeam = state.player.teamId;
  const before = new Map(Object.values(state.drivers).filter((d) => d.teamId === playerTeam).map((d) => [d.id, `${d.first} ${d.last}`]));

  // 1. Retiradas de quien no tiene equipo para el año que viene.
  for (const d of Object.values(state.drivers)) {
    if (d.next || (d.teamId && d.contractUntil > year)) {
      if (d.age >= 40) retire(state, d, date);
      continue;
    }
    let p = 0;
    if (d.series === "f1") p = d.age >= 39 ? 1 : d.age >= 35 ? (d.age - 34) * 0.2 : rating(d) < 75 && d.age >= 30 ? 0.5 : 0;
    else if (d.series === "f2") p = d.age >= 24 ? 0.6 : 0;
    else p = d.age >= 21 ? 0.5 : 0;
    if (rng() < p) retire(state, d, date);
  }

  // 2. Vacantes de los equipos rivales, de la F1 hacia abajo.
  for (const s of ["f1", "f2", "f3"] as SeriesId[]) {
    for (const team of aiTeams(state, s)) {
      let guard = 0;
      while (nextSeasonLineup(state, team.id).length < SEATS[s] && guard++ < 5) {
        const c = bestCandidate(state, cache, team, true) ?? generateDriver(state, rng, s === "f1" ? "f2" : s);
        signForAi(state, c, team, rng);
      }
    }
  }

  // 3. El equipo del jugador: si quedan asientos vacíos, la junta ficha por su cuenta.
  const pTeam = state.teams[playerTeam];
  let guard = 0;
  while (pTeam && nextSeasonLineup(state, playerTeam).length < SEATS[pTeam.series] && guard++ < 5) {
    const c = bestCandidate(state, cache, pTeam, true) ?? generateDriver(state, rng, pTeam.series === "f1" ? "f2" : pTeam.series);
    c.next = { teamId: playerTeam, salary: askingSalary(state, c, playerTeam), until: year + 1 };
    addNews(state, { date, series: pTeam.series, title: `La junta ficha a ${fullName(state, c.id)} para completar la alineación`, body: "Quedaba un asiento libre al cerrarse el mercado." });
  }

  // 4. Se aplican los contratos. Quien no tiene equipo pasa a agente libre.
  for (const d of Object.values(state.drivers)) {
    if (d.next) {
      const t = state.teams[d.next.teamId];
      d.teamId = t.id;
      d.series = t.series;
      d.salary = d.next.salary;
      d.contractUntil = d.next.until;
      delete d.next;
    } else if (d.contractUntil <= year) {
      d.teamId = "";
    }
  }

  // 5. Agentes libres: los mayores dejan la escalera y la bolsa no crece sin límite.
  const free = Object.values(state.drivers).filter((d) => !d.teamId);
  for (const d of free) {
    const old = d.series === "f1" ? d.age >= 33 : d.series === "f2" ? d.age >= 23 : d.age >= 21;
    if (old && rng() < 0.7) retire(state, d, date);
  }
  const pool = Object.values(state.drivers).filter((d) => !d.teamId).sort((a, b) => rating(b) - rating(a));
  for (const d of pool.slice(36)) delete state.drivers[d.id];

  // 6. Cantera: algunos jóvenes nuevos esperan su oportunidad en F3 y F2.
  for (let i = 0; i < 6; i++) generateDriver(state, rng, i < 4 ? "f3" : "f2");

  fixNumbers(state);
  const after = Object.values(state.drivers).filter((d) => d.teamId === playerTeam);
  return {
    arrived: after.filter((d) => !before.has(d.id)).map((d) => `${d.first} ${d.last}`),
    left: [...before].filter(([id]) => !after.some((d) => d.id === id)).map(([, name]) => name),
  };
}

/** Nombre de la categoría siguiente en la escalera (o null si ya es la F1). */
export function seriesAbove(series: SeriesId): SeriesId | null {
  return BY_LEVEL[LEVEL[series] + 1] ?? null;
}
