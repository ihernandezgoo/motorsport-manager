import { sponsorName } from "./names";
import { addNews, currentDate } from "./news";
import { pick, range, type Rng } from "./rng";
import { expectedRank, seriesTeamCount, teamStandings } from "./standings";
import type { ClassEntry, GameState, RaceResult, Sponsor, SponsorGoal, SponsorTier } from "./types";

export const SPONSOR_SLOTS: SponsorTier[] = ["title", "major", "major", "minor", "minor"];

export const TIER_LABEL: Record<SponsorTier, string> = {
  title: "Patrocinador principal",
  major: "Patrocinador oficial",
  minor: "Proveedor oficial",
};

/** Parte del valor comercial del equipo (`team.sponsor`) que aporta cada tipo de patrocinador. */
const TIER_SHARE: Record<SponsorTier, number> = { title: 0.45, major: 0.2, minor: 0.075 };

export const GOAL_LABEL: Record<SponsorGoal, string> = {
  bothFinish: "Los dos coches terminan",
  points: "Al menos un coche en los puntos",
  doublePoints: "Los dos coches en los puntos",
  beatRival: "Acabar por delante del rival directo",
  podium: "Un podio",
  win: "Una victoria",
};

const GOAL_MULT: Record<SponsorGoal, number> = { bothFinish: 0.35, points: 0.6, beatRival: 0.8, doublePoints: 1.0, podium: 2.2, win: 4.5 };

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Objetivos que tienen sentido para el nivel del coche del jugador. */
function goalsFor(state: GameState): SponsorGoal[] {
  const n = seriesTeamCount(state, state.player.series);
  const rel = n > 1 ? (expectedRank(state, state.player.teamId) - 1) / (n - 1) : 0;
  if (rel <= 0.2) return ["podium", "win", "doublePoints"];
  if (rel <= 0.45) return ["points", "doublePoints", "podium", "beatRival"];
  if (rel <= 0.75) return ["points", "beatRival", "doublePoints", "bothFinish"];
  return ["bothFinish", "points", "beatRival"];
}

/**
 * Oferta de patrocinio. `style` 0 = fijo alto y prima baja, 1 = equilibrada, 2 = fijo bajo y prima alta.
 * La confianza de la junta (la imagen del equipo) mueve el valor un ±20 %.
 */
function makeSponsor(state: GameState, rng: Rng, tier: SponsorTier, style: 0 | 1 | 2, years?: number): Sponsor {
  const team = state.teams[state.player.teamId];
  const image = 1 + ((state.board?.confidence ?? 50) - 50) / 250;
  const base = team.sponsor * TIER_SHARE[tier] * image * range(rng, 0.92, 1.08);
  const goal = pick(rng, goalsFor(state));
  const [fixed, prize] = [
    [1, 0.5],
    [0.85, 1],
    [0.65, 1.7],
  ][style];
  state.uid = (state.uid ?? 0) + 1;
  return {
    id: `sp-${state.uid}`,
    name: sponsorName(rng),
    tier,
    perRace: round2(base * fixed),
    goal,
    bonus: round2(base * GOAL_MULT[goal] * prize * 0.5),
    until: state.year + (years ?? Math.floor(rng() * 3)),
  };
}

export function initSponsors(state: GameState, rng: Rng) {
  state.sponsors = SPONSOR_SLOTS.map((tier) => makeSponsor(state, rng, tier, 1));
  state.sponsorOffers = [];
}

/** Huecos libres por tipo de patrocinador. */
export function emptySlots(state: GameState): SponsorTier[] {
  const left = [...SPONSOR_SLOTS];
  for (const s of state.sponsors) {
    const i = left.indexOf(s.tier);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

/** Tres ofertas por cada tipo de hueco libre (y ninguna de los tipos que ya están cubiertos). */
export function refreshSponsorOffers(state: GameState, rng: Rng) {
  const empty = new Set(emptySlots(state));
  state.sponsorOffers = state.sponsorOffers.filter((o) => empty.has(o.tier));
  for (const tier of empty) {
    const have = state.sponsorOffers.filter((o) => o.tier === tier).length;
    for (let i = have; i < 3; i++) state.sponsorOffers.push(makeSponsor(state, rng, tier, i as 0 | 1 | 2, 1 + Math.floor(rng() * 3)));
  }
}

export function signSponsor(state: GameState, id: string): string | null {
  const offer = state.sponsorOffers.find((o) => o.id === id);
  if (!offer) return "Oferta no disponible";
  if (!emptySlots(state).includes(offer.tier)) return "No tienes hueco libre para este tipo de patrocinador";
  state.sponsors.push(offer);
  state.sponsorOffers = state.sponsorOffers.filter((o) => o.id !== id);
  if (!emptySlots(state).includes(offer.tier)) state.sponsorOffers = state.sponsorOffers.filter((o) => o.tier !== offer.tier);
  addNews(state, { date: currentDate(state), series: state.player.series, title: `🤝 ${offer.name}, nuevo ${TIER_LABEL[offer.tier].toLowerCase()} de ${state.teams[state.player.teamId].short}`, body: `Acuerdo hasta ${offer.until}.` });
  return null;
}

/** Rompe un acuerdo: el patrocinador se va sin más pagos, pero la junta lo nota. */
export function dropSponsor(state: GameState, id: string) {
  const s = state.sponsors.find((x) => x.id === id);
  if (!s) return;
  state.sponsors = state.sponsors.filter((x) => x.id !== id);
  state.board.confidence = Math.max(0, state.board.confidence - 3);
}

function goalMet(state: GameState, goal: SponsorGoal, entries: ClassEntry[]): boolean {
  const teamId = state.player.teamId;
  const mine = entries.filter((e) => e.teamId === teamId);
  const fin = mine.filter((e) => e.status === "FIN");
  switch (goal) {
    case "bothFinish":
      return mine.length >= 2 && fin.length === mine.length;
    case "points":
      return mine.some((e) => e.points > 0);
    case "doublePoints":
      return mine.filter((e) => e.points > 0).length >= 2;
    case "podium":
      return fin.some((e) => e.pos <= 3);
    case "win":
      return fin.some((e) => e.pos === 1);
    case "beatRival": {
      const ts = teamStandings(state, state.player.series);
      const i = ts.findIndex((t) => t.teamId === teamId);
      const rival = ts[i > 0 ? i - 1 : 1]?.teamId;
      const best = (id: string) => Math.min(...entries.filter((e) => e.teamId === id).map((e) => (e.status === "FIN" ? e.pos : 99)), 99);
      return !!rival && best(teamId) < best(rival);
    }
  }
}

/** Ingresos de patrocinio de un fin de semana: fijos más primas por objetivos cumplidos en la carrera principal. */
export function sponsorIncome(state: GameState, results: RaceResult[], city: string): { label: string; amount: number }[] {
  const main = results.find((r) => r.series === state.player.series && r.kind !== "sprint");
  const out: { label: string; amount: number }[] = [];
  const fixed = state.sponsors.reduce((a, s) => a + s.perRace, 0);
  if (fixed > 0) out.push({ label: `Patrocinadores · ${city}`, amount: round2(fixed) });
  if (main) {
    for (const s of state.sponsors) {
      if (goalMet(state, s.goal, main.entries)) out.push({ label: `Prima de ${s.name}: ${GOAL_LABEL[s.goal].toLowerCase()}`, amount: s.bonus });
    }
  }
  return out;
}

/** Cambio de temporada: se van los patrocinadores cuyo acuerdo ha vencido y llegan ofertas. */
export function sponsorsNewSeason(state: GameState, rng: Rng) {
  const gone = state.sponsors.filter((s) => s.until < state.year);
  state.sponsors = state.sponsors.filter((s) => s.until >= state.year);
  if (gone.length > 0) {
    addNews(state, {
      date: currentDate(state),
      series: state.player.series,
      title: `Terminan ${gone.length === 1 ? "el acuerdo" : "los acuerdos"} con ${gone.map((s) => s.name).join(", ")}`,
      body: "Revisa las ofertas de patrocinio en el despacho.",
    });
  }
  state.sponsorOffers = [];
  refreshSponsorOffers(state, rng);
}
