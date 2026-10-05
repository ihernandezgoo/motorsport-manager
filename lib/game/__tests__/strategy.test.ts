import { describe, expect, it } from "vitest";
import { RaceSim } from "../race";
import { newGame } from "../season";
import { evaluatePlan, suggestPlans } from "../strategy";
import type { WeekendState } from "../types";
import { createWeekendState, raceConfigFor, seriesDrivers, stratContext } from "../weekend";

function dryWeekend(): { s: ReturnType<typeof newGame>; ws: WeekendState } {
  const s = newGame("f1", "mclaren", "T", 404);
  const ws = createWeekendState(s, 0, "f1", "mclaren", "dry");
  const order = seriesDrivers(s, "f1").map((d) => ({ driverId: d.id, teamId: d.teamId, time: 80, segment: 2, compound: "S" as const }));
  ws.quali.quali = { key: "quali", order };
  return { s, ws };
}

describe("planes de estrategia", () => {
  it("el ingeniero propone planes distintos y válidos", () => {
    const { s, ws } = dryWeekend();
    const id = Object.keys(ws.setup)[0];
    const ctx = stratContext(s, ws, "race", id);
    const plans = suggestPlans(ctx);
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.map((p) => p.name)).toEqual(["A", "B", "C"].slice(0, plans.length));
    for (const p of plans) expect(evaluatePlan(ctx, p).issues.filter((i) => i.includes("dos compuestos"))).toHaveLength(0);
  });

  it("detecta un plan ilegal o que no aguanta", () => {
    const { s, ws } = dryWeekend();
    const ctx = stratContext(s, ws, "race", Object.keys(ws.setup)[0]);
    const ev = evaluatePlan(ctx, { start: "S", stops: [] });
    expect(ev.issues.some((i) => i.includes("dos compuestos"))).toBe(true);
    expect(ev.issues.some((i) => i.includes("no aguanta") || i.includes("límite"))).toBe(true);
  });

  it("un coche manual hace las paradas de su plan y se puede cambiar de plan", () => {
    const { s, ws } = dryWeekend();
    const [a, b] = Object.keys(ws.setup);
    const planA = { name: "A", start: "M" as const, stops: [{ lap: 20, compound: "H" as const }] };
    const planB = { name: "B", start: "M" as const, stops: [{ lap: 15, compound: "S" as const }, { lap: 38, compound: "H" as const }] };
    const cfg = raceConfigFor(s, ws, "race", {
      playerTeamId: "mclaren",
      startCompounds: { [a]: "M", [b]: "M" },
      strategies: { [a]: { plans: [planA, planB], active: 0 }, [b]: { plans: [planA, planB], active: 1 } },
    });
    const sim = new RaceSim(cfg);
    sim.runToEnd();
    const pitsOf = (id: string) =>
      sim.cars
        .find((c) => c.driverId === id)!
        .laps.filter((l) => l.pitCompound)
        .map((l) => [l.lap, l.pitCompound]);
    const ca = sim.cars.find((c) => c.driverId === a)!;
    const cb = sim.cars.find((c) => c.driverId === b)!;
    if (ca.status === "run" && (ca.dnfLap ?? 99) > 20) expect(pitsOf(a)[0]).toEqual([20, "H"]);
    if (cb.status === "run") expect(pitsOf(b).slice(0, 2)).toEqual([[15, "S"], [38, "H"]]);
  });
});
