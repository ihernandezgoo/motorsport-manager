import { describe, expect, it } from "vitest";
import { SEATS } from "../market";
import { completeWeekend, isSeasonOver, newGame, startNextSeason } from "../season";
import type { GameState, SeriesId } from "../types";
import { seriesDrivers } from "../weekend";

function simulateSeason(s: GameState) {
  while (!isSeasonOver(s)) completeWeekend(s, s.nextWeekend, null);
}

function checkGrids(s: GameState) {
  for (const series of ["f1", "f2", "f3"] as SeriesId[]) {
    const teams = Object.values(s.teams).filter((t) => t.series === series);
    for (const t of teams) {
      const n = Object.values(s.drivers).filter((d) => d.teamId === t.id).length;
      expect(n, `${t.id} en ${s.year}`).toBe(SEATS[series]);
    }
    const numbers = seriesDrivers(s, series).map((d) => d.number);
    expect(new Set(numbers).size, `dorsales únicos en ${series} ${s.year}`).toBe(numbers.length);
    for (const d of seriesDrivers(s, series)) {
      expect(d.series).toBe(series);
      expect(d.contractUntil).toBeGreaterThanOrEqual(s.year);
      expect(Number.isFinite(d.salary)).toBe(true);
    }
  }
}

describe("carrera de varias temporadas", () => {
  it("mantiene las parrillas completas y coherentes durante cinco temporadas", () => {
    const s = newGame("f2", "f2_var", "Test", 12345);
    checkGrids(s);
    const startIds = new Set(Object.keys(s.drivers));
    for (let y = 0; y < 5; y++) {
      simulateSeason(s);
      expect(s.history.at(-1)?.year).toBe(s.year);
      if (s.sacked) {
        // Tras un despido no se sigue jugando con ese equipo.
        break;
      }
      startNextSeason(s);
      checkGrids(s);
      expect(Number.isFinite(s.teams[s.player.teamId].budget)).toBe(true);
      expect(s.board.confidence).toBeGreaterThanOrEqual(0);
      expect(s.board.confidence).toBeLessThanOrEqual(100);
    }
    // Hay relevo generacional: pilotos nuevos y retiradas.
    const now = Object.keys(s.drivers);
    expect(now.some((id) => !startIds.has(id))).toBe(true);
    expect([...startIds].some((id) => !s.drivers[id])).toBe(true);
  }, 120_000);

  it("los pilotos punteros de F2 acaban subiendo a la F1", () => {
    const s = newGame("f1", "williams", "Test", 777);
    const f2Ids = new Set(Object.values(s.drivers).filter((d) => d.series === "f2").map((d) => d.id));
    for (let y = 0; y < 3; y++) {
      simulateSeason(s);
      if (s.sacked) break;
      startNextSeason(s);
    }
    const promoted = Object.values(s.drivers).filter((d) => d.series === "f1" && f2Ids.has(d.id));
    expect(promoted.length).toBeGreaterThan(0);
  }, 120_000);

  it("las cuentas del jugador incluyen patrocinadores, salarios y personal", () => {
    const s = newGame("f1", "mclaren", "Test", 99);
    completeWeekend(s, 0, null);
    const labels = s.finance.map((f) => f.label);
    expect(labels.some((l) => l.startsWith("Patrocinadores"))).toBe(true);
    expect(labels).toContain("Salarios de los pilotos");
    expect(labels).toContain("Salarios del personal técnico");
    expect(s.sponsors.length).toBe(5);
  });

  it("es determinista con la misma semilla", () => {
    const a = newGame("f3", "f3_mp", "Test", 4242);
    const b = newGame("f3", "f3_mp", "Test", 4242);
    for (let i = 0; i < 4; i++) {
      completeWeekend(a, a.nextWeekend, null);
      completeWeekend(b, b.nextWeekend, null);
    }
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results));
  });
});
