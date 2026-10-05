import { carScore, SERIES_CFG } from "./perf";
import type { GameState, RaceKind, SeriesId, Team } from "./types";

/** Déficit de ritmo esperado (en % de vuelta) de un equipo por su coche y la media de sus pilotos. */
function teamDeficit(state: GameState, team: Team): number {
  const cfg = SERIES_CFG[team.series];
  const ds = Object.values(state.drivers).filter((d) => d.teamId === team.id);
  const pace = ds.length ? ds.reduce((a, d) => a + d.pace, 0) / ds.length : 75;
  return (100 - carScore(team, state.pus)) * cfg.carK + (100 - pace) * cfg.drvK;
}

/** Puesto que se espera de un equipo por su coche y sus pilotos (1 = el mejor de su categoría). */
export function expectedRank(state: GameState, teamId: string): number {
  const team = state.teams[teamId];
  if (!team) return 1;
  const mine = teamDeficit(state, team);
  return Object.values(state.teams).filter((t) => t.series === team.series && t.id !== team.id && teamDeficit(state, t) < mine).length + 1;
}

export function seriesTeamCount(state: GameState, series: SeriesId): number {
  return Object.values(state.teams).filter((t) => t.series === series).length;
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
    if (d.series !== series || !d.teamId) continue;
    map.set(d.id, { driverId: d.id, teamId: d.teamId, points: 0, wins: 0, podiums: 0, poles: 0, dnfs: 0, best: 99, cells: [] });
  }
  for (const r of seriesResults(state, series)) {
    for (const e of r.entries) {
      let s = map.get(e.driverId);
      if (!s) {
        // Piloto que ha corrido esta temporada pero ya no está en la categoría (no debería pasar en mitad de temporada).
        if (!state.drivers[e.driverId]) continue;
        s = { driverId: e.driverId, teamId: e.teamId, points: 0, wins: 0, podiums: 0, poles: 0, dnfs: 0, best: 99, cells: [] };
        map.set(e.driverId, s);
      }
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

/** Puesto (1..n) de un piloto en el campeonato, o 0 si no ha puntuado nunca en esa categoría. */
export function driverRank(state: GameState, driverId: string): number {
  const d = state.drivers[driverId];
  if (!d) return 0;
  const i = driverStandings(state, d.series).findIndex((s) => s.driverId === driverId);
  return i + 1;
}
