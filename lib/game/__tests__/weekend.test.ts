import { describe, expect, it } from "vitest";
import { applyGridPenalties } from "../components";
import { CIRCUITS } from "../data/circuits";
import { migrateSave } from "../migrate";
import { qualiSegments, segmentTiming } from "../qualifying";
import { QualiSim } from "../qualiLive";
import { RaceSim } from "../race";
import { newGame } from "../season";
import { createWeekendState, qualiContext, raceConfigFor, seriesDrivers, sessionsFor } from "../weekend";

describe("formato del fin de semana", () => {
  it("F1 normal tiene tres libres, F1 sprint uno y F2 uno", () => {
    const s = newGame("f1", "mclaren", "T", 1);
    const normal = s.calendar.find((w) => w.f1 && !w.f1.sprint)!;
    const sprint = s.calendar.find((w) => w.f1?.sprint)!;
    expect(sessionsFor("f1", normal).filter((x) => x.kind === "practice")).toHaveLength(3);
    expect(sessionsFor("f1", sprint).filter((x) => x.kind === "practice")).toHaveLength(1);
    expect(sessionsFor("f2", normal).filter((x) => x.kind === "practice")).toHaveLength(1);
  });
});

describe("clasificación en vivo", () => {
  it("todas las tandas terminan con tiempos y respetan el reloj", () => {
    const s = newGame("f1", "ferrari", "T", 5);
    const ws = createWeekendState(s, 0, "f1", "ferrari");
    const all = seriesDrivers(s, "f1").map((d) => d.id);
    const segs = qualiSegments("f1", all.length, false);
    let participants = all;
    segs.forEach((seg, i) => {
      const t = segmentTiming("f1", false)[i];
      const sim = new QualiSim({
        ctx: qualiContext(s, ws, "quali"),
        segIdx: i,
        nSeg: segs.length,
        segName: seg.name,
        participants,
        keep: seg.keep,
        startMinute: t.start,
        minutes: t.minutes,
        sessionMinutes: 60,
        playerTeamId: "ferrari",
        sets: ws.tyres,
        seed: 99 + i,
        auto: Object.fromEntries(Object.keys(ws.setup).map((id) => [id, true])),
      });
      sim.runToEnd();
      expect(sim.finished).toBe(true);
      const res = sim.results();
      expect(res).toHaveLength(participants.length);
      // La gran mayoría marca tiempo.
      expect(res.filter((r) => r.time !== null).length).toBeGreaterThan(participants.length * 0.7);
      // El jugador ha gastado juegos.
      const used = Object.values(sim.sets).flat().filter((x) => x.used).length;
      expect(used).toBeGreaterThan(0);
      participants = res.slice(0, seg.keep).map((r) => r.driverId);
    });
  });

  it("un piloto manual no sale si no se le ordena", () => {
    const s = newGame("f2", "f2_art", "T", 8);
    const ws = createWeekendState(s, 0, "f2", "f2_art");
    const all = seriesDrivers(s, "f2").map((d) => d.id);
    const sim = new QualiSim({ ctx: qualiContext(s, ws, "quali"), segIdx: 0, nSeg: 1, segName: "Q", participants: all, keep: all.length, startMinute: 0, minutes: 30, sessionMinutes: 30, playerTeamId: "f2_art", sets: ws.tyres, seed: 3 });
    sim.runToEnd();
    const mine = sim.results().filter((r) => r.teamId === "f2_art");
    expect(mine.every((r) => r.time === null)).toBe(true);
  });
});

describe("neumáticos limitados en carrera", () => {
  it("las paradas consumen juegos de la asignación", () => {
    const s = newGame("f1", "mercedes", "T", 11);
    const ws = createWeekendState(s, 0, "f1", "mercedes");
    const order = seriesDrivers(s, "f1").map((d) => ({ driverId: d.id, teamId: d.teamId, time: 80, segment: 2, compound: "S" as const }));
    ws.quali.quali = { key: "quali", order };
    const mine = Object.keys(ws.setup);
    const startSets = Object.fromEntries(mine.map((id) => [id, ws.tyres[id].find((t) => t.compound === "M")!]));
    const cfg = raceConfigFor(s, ws, "race", { playerTeamId: "mercedes", startSets });
    const sim = new RaceSim(cfg);
    for (const id of mine) sim.setAuto(id, true);
    sim.runToEnd();
    for (const id of mine) {
      const usage = sim.tyreUsage(id);
      expect(usage[0].id).toBe(startSets[id].id);
      expect(new Set(usage.map((u) => u.id)).size).toBe(usage.length);
    }
  });

  it("las sanciones retrasan al piloto en la parrilla", () => {
    expect(applyGridPenalties(["a", "b", "c", "d", "e"], { a: { places: 3, reason: "x" } })).toEqual(["b", "c", "d", "a", "e"]);
    expect(applyGridPenalties(["a", "b", "c"], { b: { places: 10, reason: "x" } })).toEqual(["a", "c", "b"]);
  });
});

describe("migración de partidas", () => {
  it("convierte una partida v1 a la versión actual", () => {
    const s = newGame("f1", "haas", "T", 21) as unknown as Record<string, unknown>;
    // Simula el formato v1: sin los campos de la carrera de mánager.
    for (const k of ["board", "offers", "sacked", "career", "staff", "staffMarket", "sponsors", "sponsorOffers", "components", "uid", "marketYear"]) delete s[k];
    for (const d of Object.values(s.drivers as Record<string, Record<string, unknown>>)) {
      delete d.potential;
      delete d.salary;
      delete d.contractUntil;
    }
    s.version = 1;
    const res = migrateSave(JSON.stringify(s));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.migrated).toBe(true);
    expect(res.state.board.target).toBeGreaterThan(0);
    expect(res.state.sponsors.length).toBe(5);
    expect(Object.keys(res.state.components).length).toBe(2);
    expect(Object.values(res.state.drivers).every((d) => d.contractUntil >= 2026)).toBe(true);
  });

  it("un fin de semana a medias de v1 recibe sus juegos de neumáticos", () => {
    const s = newGame("f2", "f2_dams", "T", 22);
    s.weekend = createWeekendState(s, 0, "f2", "f2_dams");
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.weekend.tyres;
    delete raw.weekend.longRuns;
    delete raw.weekend.gridPenalty;
    raw.version = 1;
    const res = migrateSave(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ws = res.state.weekend!;
    for (const id of Object.keys(ws.setup)) expect(ws.tyres[id].length).toBeGreaterThan(0);
    expect(CIRCUITS[res.state.calendar[ws.weekendIndex].circuitId]).toBeDefined();
  });
});
