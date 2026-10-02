import { CIRCUITS } from "./data/circuits";
import { carScore } from "./perf";
import type { Driver, GameState, SeriesId, Team, Weekend } from "./types";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const driverName = (d: Driver) => `${d.first} ${d.last}`;

export function teamDrivers(state: GameState, teamId: string): Driver[] {
  return Object.values(state.drivers)
    .filter((d) => d.teamId === teamId)
    .sort((a, b) => a.number - b.number);
}

export function seriesTeams(state: GameState, series: SeriesId): Team[] {
  return Object.values(state.teams).filter((t) => t.series === series);
}

export function circuitOf(wk: Weekend) {
  return CIRCUITS[wk.circuitId];
}

export function teamOverall(state: GameState, team: Team): number {
  return Math.round(carScore(team, state.pus));
}

export function ordinal(n: number): string {
  return `${n}º`;
}

export function signed(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}
