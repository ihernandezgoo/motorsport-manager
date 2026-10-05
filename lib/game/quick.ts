import { CALENDAR_2026 } from "./data/calendar";
import { CIRCUITS } from "./data/circuits";
import { newGame } from "./season";
import type { GameState, QuickConfig } from "./types";
import { createWeekendState, skipAllPractice } from "./weekend";

/** Crea una partida desechable con un único fin de semana para probar cualquier categoría y circuito. */
export function newQuickWeekend(cfg: QuickConfig, seed: number): GameState {
  const state = newGame(cfg.series, cfg.teamId, "Director", seed);
  const c = CIRCUITS[cfg.circuitId];
  const real = CALENDAR_2026.find((w) => w.circuitId === cfg.circuitId);
  const name = real?.[cfg.series]?.name ?? (cfg.series === "f1" ? real?.f1?.name ?? `GP de ${c.country}` : `Ronda de ${c.city}`);
  const entry = { round: 1, name, sprint: cfg.series === "f1" ? cfg.sprint : undefined };
  state.calendar = [{ id: `quick-${cfg.circuitId}`, circuitId: cfg.circuitId, date: real?.date ?? "2026-06-07", [cfg.series]: entry }];
  state.news = [];
  state.quick = cfg;
  state.weekend = createWeekendState(state, 0, cfg.series, cfg.teamId, cfg.weather);
  if (cfg.skipPractice) skipAllPractice(state, state.weekend);
  return state;
}
