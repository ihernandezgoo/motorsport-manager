import { resetComponents } from "./components";
import { SERIES_SHORT } from "./data/teams";
import { LEVEL, teamAppeal } from "./market";
import { addNews, currentDate } from "./news";
import { clamp, type Rng } from "./rng";
import { initSponsors, refreshSponsorOffers } from "./sponsors";
import { initStaff } from "./staff";
import { expectedRank, seriesTeamCount, teamStandings } from "./standings";
import type { BoardState, GameState, JobOffer } from "./types";

/** Confianza por debajo de la cual la junta despide al mánager a mitad de temporada. */
export const SACK_MIDSEASON = 10;
/** Confianza mínima al final de la temporada para conservar el puesto. */
export const SACK_SEASON_END = 25;

/** Objetivo de la junta: el puesto esperado por el coche, con un margen para los equipos medianos. */
export function seasonTarget(state: GameState): number {
  const exp = expectedRank(state, state.player.teamId);
  const n = seriesTeamCount(state, state.player.series);
  // Los grandes deben cumplir; los medianos tienen un puesto de margen; nadie puede aspirar a ser último.
  return clamp(exp <= 2 ? exp : exp <= n / 2 ? exp + 1 : exp, 1, n - 1);
}

export function targetText(target: number): string {
  if (target === 1) return "Ganar el campeonato de equipos";
  if (target <= 3) return `Terminar entre los ${target} primeros del campeonato de equipos`;
  return `Terminar entre los ${target} primeros`;
}

export function initBoard(state: GameState, confidence = 60): BoardState {
  return { confidence, target: seasonTarget(state), expected: expectedRank(state, state.player.teamId), lastDelta: 0, warned: false };
}

/** Nuevo objetivo de temporada (tras el mercado y el reequilibrio de coches). */
export function newSeasonBoard(state: GameState) {
  const b = state.board;
  b.target = seasonTarget(state);
  b.expected = expectedRank(state, state.player.teamId);
  b.lastDelta = 0;
  b.warned = false;
  b.confidence = Math.round(b.confidence * 0.7 + 55 * 0.3);
}

export function boardMood(confidence: number): string {
  if (confidence >= 80) return "Encantada";
  if (confidence >= 60) return "Satisfecha";
  if (confidence >= 40) return "Expectante";
  if (confidence >= SACK_SEASON_END) return "Preocupada";
  return "Furiosa";
}

/**
 * Tras cada fin de semana: la junta compara los puntos del equipo con los de los rivales. Rendir
 * por encima del coche sube la confianza y por debajo la baja.
 */
export function boardWeekend(state: GameState, weekendId: string, rng: Rng) {
  if (state.quick || state.sacked) return;
  const series = state.player.series;
  const teams = Object.values(state.teams).filter((t) => t.series === series);
  const pts = new Map(teams.map((t) => [t.id, 0]));
  const best = new Map(teams.map((t) => [t.id, 99]));
  const races = state.results.filter((r) => r.weekendId === weekendId && r.series === series);
  if (races.length === 0) return;
  for (const r of races) {
    for (const e of r.entries) {
      pts.set(e.teamId, (pts.get(e.teamId) ?? 0) + e.points);
      if (e.status === "FIN") best.set(e.teamId, Math.min(best.get(e.teamId) ?? 99, e.pos));
    }
  }
  const order = teams.map((t) => t.id).sort((a, b) => (pts.get(b) ?? 0) - (pts.get(a) ?? 0) || (best.get(a) ?? 99) - (best.get(b) ?? 99));
  const actual = order.indexOf(state.player.teamId) + 1;
  const b = state.board;
  b.expected ??= expectedRank(state, state.player.teamId);
  // Repartido por carreras: una temporada de 24 fines de semana no pesa el doble que una de 12.
  const rounds = Math.max(1, state.calendar.filter((w) => w[series]).length);
  let delta = clamp((b.expected - actual) * (12 / rounds), -4, 4);
  if (state.teams[state.player.teamId].budget < 0) delta -= 1.5;
  delta += (55 - b.confidence) * 0.04;
  b.confidence = clamp(b.confidence + delta, 0, 100);
  b.lastDelta = delta;

  const date = state.calendar.find((w) => w.id === weekendId)?.date ?? currentDate(state);
  if (b.confidence < SACK_SEASON_END + 5 && !b.warned) {
    b.warned = true;
    addNews(state, { date, series, title: "⚠️ La junta directiva pierde la paciencia", body: "Los resultados no acompañan: si no mejoran, tu puesto corre peligro." });
  }
  if (b.confidence >= SACK_SEASON_END + 15) b.warned = false;
  const third = Math.floor(state.calendar.length / 3);
  if (b.confidence < SACK_MIDSEASON && state.nextWeekend >= third) sack(state, rng, date);
}

/** Fin de temporada: veredicto de la junta, prima por superar el objetivo y ofertas de otros equipos. */
export function boardSeasonEnd(state: GameState, rng: Rng) {
  if (state.quick || state.sacked) return;
  const series = state.player.series;
  const pos = teamStandings(state, series).findIndex((t) => t.teamId === state.player.teamId) + 1;
  const b = state.board;
  const team = state.teams[state.player.teamId];
  state.career.push({ year: state.year, teamId: team.id, teamName: team.name, series, pos, target: b.target });
  const delta = clamp((b.target - pos) * 5, -25, 20) + (pos <= b.target ? 8 : -8);
  b.confidence = clamp(b.confidence + delta, 0, 100);
  b.lastDelta = delta;
  const date = state.calendar[state.calendar.length - 1].date;
  if (pos < b.target) {
    const bonus = Math.round((b.target - pos) * team.sponsor * 0.8 * 100) / 100;
    team.budget += bonus;
    state.finance.push({ weekendIndex: state.calendar.length - 1, label: `Prima de la junta: objetivo superado (P${pos})`, amount: bonus });
  }
  if (b.confidence < SACK_SEASON_END) {
    sack(state, rng, date);
    return;
  }
  addNews(state, {
    date,
    series,
    title: pos <= b.target ? `✅ La junta celebra la temporada: P${pos} (objetivo P${b.target})` : `La junta te mantiene pese a no cumplir el objetivo (P${pos} de P${b.target})`,
  });
  state.offers = pos <= b.target ? makeOffers(state, rng, true, b.target - pos) : [];
  for (const o of state.offers) {
    addNews(state, { date, series: state.teams[o.teamId].series, title: `📨 Oferta de ${state.teams[o.teamId].name}`, body: o.reason });
  }
}

function sack(state: GameState, rng: Rng, date: string) {
  const team = state.teams[state.player.teamId];
  state.sacked = true;
  state.weekend = null;
  state.offers = makeOffers(state, rng, false);
  addNews(state, {
    date,
    series: team.series,
    title: `❌ ${team.name} despide a ${state.manager}`,
    body: state.offers.length ? `Tienes ${state.offers.length} ${state.offers.length === 1 ? "oferta" : "ofertas"} de equipos más modestos.` : "Ningún equipo te ha ofrecido trabajo.",
  });
}

/**
 * Ofertas de trabajo. Tras una buena temporada llegan de equipos más atractivos (mejor coche o
 * categoría superior); tras un despido, de equipos menos atractivos que el que te ha echado.
 */
function makeOffers(state: GameState, rng: Rng, better: boolean, over = 0): JobOffer[] {
  const cur = state.player.teamId;
  const appeal = teamAppeal(state, cur);
  const curLevel = LEVEL[state.player.series];
  // Cuanto más se supera el objetivo, mayor es el salto que se ofrece.
  const maxJump = 3 + 4 * over;
  const cands = Object.values(state.teams).filter((t) => {
    if (t.id === cur) return false;
    const a = teamAppeal(state, t.id);
    const lvl = LEVEL[t.series];
    return better ? a > appeal + 1 && a <= appeal + maxJump && lvl <= curLevel + 1 : a < appeal - 1 && lvl >= curLevel - 1;
  });
  const n = better ? (rng() < state.board.confidence / 100 ? 1 + (rng() < 0.4 ? 1 : 0) : 0) : Math.min(cands.length, 1 + Math.floor(rng() * 3));
  const out: JobOffer[] = [];
  while (out.length < n && cands.length > 0) {
    const t = cands.splice(Math.floor(rng() * cands.length), 1)[0];
    const reason = better
      ? LEVEL[t.series] > curLevel
        ? `Quieren que des el salto a la ${SERIES_SHORT[t.series]} con ellos.`
        : `Buscan un director que les lleve más arriba en la ${SERIES_SHORT[t.series]}.`
      : `Te ofrecen un proyecto para reconstruirte en la ${SERIES_SHORT[t.series]}.`;
    out.push({ teamId: t.id, reason });
  }
  return out;
}

/** Acepta una oferta: el mánager pasa a dirigir otro equipo (con su personal y sus patrocinadores). */
export function acceptOffer(state: GameState, teamId: string, rng: Rng): string | null {
  if (!state.offers.some((o) => o.teamId === teamId)) return "Oferta no disponible";
  const team = state.teams[teamId];
  const old = state.teams[state.player.teamId];
  state.player = { series: team.series, teamId };
  state.projects = [];
  state.weekend = null;
  state.sacked = false;
  state.offers = [];
  initStaff(state, rng);
  initSponsors(state, rng);
  refreshSponsorOffers(state, rng);
  resetComponents(state);
  state.board = initBoard(state, 55);
  addNews(state, { date: currentDate(state), series: team.series, title: `🏁 ${state.manager} es el nuevo director de ${team.name}`, body: `Deja ${old?.name ?? "su anterior equipo"}. Objetivo: ${targetText(state.board.target).toLowerCase()}.` });
  return null;
}

export function declineOffers(state: GameState) {
  state.offers = [];
}
