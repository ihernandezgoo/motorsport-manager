import { acceptOffer, declineOffers } from "./game/board";
import { rngFor } from "./game/rng";
import { completeWeekend, isSeasonOver, startNextSeason } from "./game/season";
import type { GameState, WeekendState } from "./game/types";
import { createWeekendState } from "./game/weekend";
import { liveRace } from "./liveRace";
import { gameStore } from "./store";

export function enterWeekend() {
  gameStore.update((d) => {
    if (d.weekend || isSeasonOver(d) || d.sacked) return;
    d.weekend = createWeekendState(d, d.nextWeekend, d.player.series, d.player.teamId);
  });
}

export function updateWeekend(fn: (ws: WeekendState, d: GameState) => void) {
  gameStore.update((d) => {
    if (d.weekend) fn(d.weekend, d);
  });
}

/** Simula el siguiente fin de semana completo sin intervención del jugador. */
export function simulateNextWeekend(): number | null {
  const s = gameStore.get();
  if (!s || isSeasonOver(s)) return null;
  const idx = s.nextWeekend;
  liveRace.dispose();
  gameStore.update((d) => {
    d.weekend = null;
    completeWeekend(d, idx, null);
  });
  return idx;
}

/** Cierra el fin de semana del jugador con sus resultados y simula el resto de categorías. */
export function finishPlayerWeekend(): number | null {
  const s = gameStore.get();
  if (!s?.weekend) return null;
  const idx = s.weekend.weekendIndex;
  liveRace.dispose();
  gameStore.update((d) => {
    if (!d.weekend) return;
    completeWeekend(d, d.weekend.weekendIndex, d.weekend.results);
  });
  return idx;
}

export async function simulateRestOfSeason(onProgress: (done: number, total: number, label: string) => void) {
  const s = gameStore.get();
  if (!s) return;
  const total = s.calendar.length - s.nextWeekend;
  let done = 0;
  while (true) {
    const cur = gameStore.get();
    if (!cur || isSeasonOver(cur)) break;
    const wk = cur.calendar[cur.nextWeekend];
    onProgress(done, total, wk.f1?.name ?? wk.f2?.name ?? wk.f3?.name ?? wk.id);
    await new Promise((r) => setTimeout(r, 0));
    simulateNextWeekend();
    done++;
  }
  onProgress(total, total, "");
}

/** Acepta la oferta de otro equipo (tras un despido o al acabar la temporada). */
export function acceptJob(teamId: string) {
  gameStore.update((d) => {
    acceptOffer(d, teamId, rngFor(d.seed, d.year, d.nextWeekend, "job", teamId));
  });
}

export function declineJobs() {
  gameStore.update((d) => {
    if (!d.sacked) declineOffers(d);
  });
}

export function nextSeason() {
  liveRace.dispose();
  gameStore.update((d) => {
    if (isSeasonOver(d)) startNextSeason(d);
  });
}
