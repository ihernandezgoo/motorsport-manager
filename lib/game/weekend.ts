import { aiGridPenalties, applyGridPenalties, componentRelMult, replaceBroken } from "./components";
import { CIRCUITS } from "./data/circuits";
import { runFullQuali, type QualiCtx } from "./qualifying";
import { RaceSim, type RaceConfig } from "./race";
import { hashString, range, rngFor } from "./rng";
import { aiSetupQuality, autoSetupValues, makeOptimum, setupQuality } from "./setup";
import { effectiveTeam, effectiveTeams } from "./staff";
import { basePct, baseLap } from "./perf";
import type { StratCtx } from "./strategy";
import { dryCompounds, isWetTyre, spec, wetPenalty } from "./tyres";
import { makeTyreSets, usedSetPenalty } from "./tyreSets";
import type { Circuit, Compound, Driver, GameState, RaceKind, RaceResult, SeriesId, SessionDef, SessionKind, StrategyPlan, TyreSet, Weekend, WeekendState } from "./types";
import { generateWeather, type WeatherMode } from "./weather";

export function seriesEntry(wk: Weekend, series: SeriesId) {
  return wk[series];
}

export function weekendSeries(wk: Weekend): SeriesId[] {
  return (["f3", "f2", "f1"] as SeriesId[]).filter((s) => wk[s]);
}

/**
 * Programa del fin de semana. F1: tres sesiones de libres, clasificación y GP; en formato sprint,
 * una sola sesión de libres, clasificación sprint, sprint, clasificación y GP. F2 y F3: una sesión de
 * libres, clasificación, carrera sprint y carrera principal.
 */
export function sessionsFor(series: SeriesId, wk: Weekend): SessionDef[] {
  if (series === "f1") {
    return wk.f1?.sprint
      ? [
          { key: "fp1", kind: "practice", label: "Libres 1" },
          { key: "sprintQuali", kind: "sprintQuali", label: "Clasif. Sprint" },
          { key: "sprint", kind: "sprint", label: "Sprint" },
          { key: "quali", kind: "quali", label: "Clasificación" },
          { key: "race", kind: "race", label: "Gran Premio" },
        ]
      : [
          { key: "fp1", kind: "practice", label: "Libres 1" },
          { key: "fp2", kind: "practice", label: "Libres 2" },
          { key: "fp3", kind: "practice", label: "Libres 3" },
          { key: "quali", kind: "quali", label: "Clasificación" },
          { key: "race", kind: "race", label: "Gran Premio" },
        ];
  }
  return [
    { key: "fp1", kind: "practice", label: "Libres" },
    { key: "quali", kind: "quali", label: "Clasificación" },
    { key: "sprint", kind: "sprint", label: "Carrera Sprint" },
    { key: "feature", kind: "feature", label: "Carrera Principal" },
  ];
}

export function isSprintWeekend(series: SeriesId, wk: Weekend): boolean {
  return series === "f1" && !!wk.f1?.sprint;
}

/** Tandas por piloto en una sesión de libres. */
export function practiceRunsFor(series: SeriesId, wk: Weekend): number {
  if (series === "f1") return wk.f1?.sprint ? 5 : 3;
  return 4;
}

export function raceLaps(series: SeriesId, c: Circuit, kind: RaceKind): number {
  const lapF = { f1: 1, f2: 1.11, f3: 1.22 }[series] * c.lap;
  if (series === "f1") return kind === "race" ? c.laps : Math.ceil(100 / c.lengthKm);
  if (series === "f2") return kind === "feature" ? Math.min(Math.round(170 / c.lengthKm), Math.floor(3600 / lapF)) : Math.min(Math.round(120 / c.lengthKm), Math.floor(2700 / lapF));
  return kind === "feature" ? Math.min(Math.round(125 / c.lengthKm), Math.floor(2700 / lapF)) : Math.min(Math.round(100 / c.lengthKm), Math.floor(2400 / lapF));
}

export function mustTwoCompounds(series: SeriesId, kind: RaceKind): boolean {
  return (series === "f1" && kind === "race") || (series === "f2" && kind === "feature");
}

/** Pilotos que se invierten en la parrilla de la sprint de F2/F3. */
export function reversedTop(series: SeriesId): number {
  return series === "f2" ? 10 : series === "f3" ? 12 : 0;
}

export function sessionMinutes(series: SeriesId, kind: SessionKind, c: Circuit): number {
  if (kind === "practice") return series === "f1" ? 60 : 45;
  if (kind === "quali" || kind === "sprintQuali") return series === "f1" ? 60 : 30;
  const lapF = { f1: 1, f2: 1.11, f3: 1.22 }[series] * c.lap;
  return (raceLaps(series, c, kind) * lapF) / 60;
}

/** Pilotos con asiento en una categoría (sin agentes libres), ordenados por equipo y dorsal. */
export function seriesDrivers(state: GameState, series: SeriesId): Driver[] {
  const teamOrder = Object.values(state.teams).filter((t) => t.series === series).map((t) => t.id);
  return Object.values(state.drivers)
    .filter((d) => d.series === series && d.teamId && teamOrder.includes(d.teamId))
    .sort((a, b) => teamOrder.indexOf(a.teamId) - teamOrder.indexOf(b.teamId) || a.number - b.number);
}

export function createWeekendState(state: GameState, weekendIndex: number, series: SeriesId, playerTeamId?: string, weatherMode: WeatherMode = "random"): WeekendState {
  const wk = state.calendar[weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const sessions = sessionsFor(series, wk);
  const seed = `${state.seed}|${state.year}|${wk.id}|${series}`;
  const biasRng = rngFor(seed, "bias");
  const bias = range(biasRng, 0.5, 1.6);
  const weather: WeekendState["weather"] = {};
  for (const s of sessions) weather[s.key] = generateWeather(circuit, rngFor(seed, "wx", s.key), sessionMinutes(series, s.kind, circuit), bias, weatherMode);

  const aiSetup: Record<string, number> = {};
  const setup: WeekendState["setup"] = {};
  const tyres: WeekendState["tyres"] = {};
  const longRuns: WeekendState["longRuns"] = {};
  const setupRng = rngFor(seed, "setup");
  const runs = practiceRunsFor(series, wk);
  const drivers = seriesDrivers(state, series);
  for (const d of drivers) {
    aiSetup[d.id] = aiSetupQuality(state.teams[d.teamId], setupRng);
    if (d.teamId === playerTeamId) {
      setup[d.id] = { values: { aero: 50, susp: 50, gear: 50 }, optimum: makeOptimum(circuit, setupRng), runsLeft: runs, runs: [], quality: 0.55 };
      tyres[d.id] = makeTyreSets(series, circuit, isSprintWeekend(series, wk), d.id);
      longRuns[d.id] = [];
    }
  }
  const ws: WeekendState = { weekendIndex, series, sessions, step: 0, weather, setup, aiSetup, quali: {}, qualiProgress: {}, grids: {}, results: [], tyres, longRuns, gridPenalty: {} };
  if (playerTeamId && series === state.player.series) replaceBroken(state, ws, wk.date);
  aiGridPenalties(state, ws, drivers.map((d) => d.id), rngFor(seed, "penalties"));
  return ws;
}

/** Pasa a la siguiente sesión. Al empezar unos libres se reponen las tandas de cada piloto. */
export function advanceStep(state: GameState, ws: WeekendState) {
  ws.step++;
  const next = ws.sessions[ws.step];
  if (next?.kind !== "practice") return;
  const runs = practiceRunsFor(ws.series, state.calendar[ws.weekendIndex]);
  for (const st of Object.values(ws.setup)) st.runsLeft = runs;
}

/** El ingeniero aplica un reglaje genérico a los pilotos que no han rodado y se pasa a la siguiente sesión. */
export function skipPractice(state: GameState, ws: WeekendState) {
  const wk = state.calendar[ws.weekendIndex];
  for (const [id, st] of Object.entries(ws.setup)) {
    if (st.runs.length > 0) continue;
    const team = effectiveTeam(state, state.teams[state.drivers[id].teamId]);
    const v = autoSetupValues(st.optimum, team, rngFor(state.seed, wk.id, id, "skip"));
    st.values = v;
    st.quality = Math.max(st.quality, setupQuality(v, st.optimum) * 0.92);
  }
  if (ws.sessions[ws.step]?.kind === "practice") advanceStep(state, ws);
}

/** Salta todas las sesiones de libres que quedan seguidas. */
export function skipAllPractice(state: GameState, ws: WeekendState) {
  let guard = 0;
  while (ws.sessions[ws.step]?.kind === "practice" && guard++ < 5) skipPractice(state, ws);
}

export function setupQualities(ws: WeekendState): Record<string, number> {
  const out = { ...ws.aiSetup };
  for (const [id, s] of Object.entries(ws.setup)) out[id] = s.quality;
  return out;
}

export function qualiContext(state: GameState, ws: WeekendState, key: string): QualiCtx {
  const wk = state.calendar[ws.weekendIndex];
  return {
    series: ws.series,
    circuit: CIRCUITS[wk.circuitId],
    drivers: state.drivers,
    teams: effectiveTeams(state),
    pus: state.pus,
    setupQ: setupQualities(ws),
    weather: ws.weather[key],
    sprint: key === "sprintQuali",
  };
}

/** Parrilla de salida de una carrera a partir de la clasificación correspondiente (con sanciones). */
export function gridFor(ws: WeekendState, raceKey: string): string[] {
  if (ws.series === "f1") {
    const q = ws.quali[raceKey === "sprint" ? "sprintQuali" : "quali"];
    const order = q.order.map((e) => e.driverId);
    return raceKey === "race" ? applyGridPenalties(order, ws.gridPenalty ?? {}) : order;
  }
  const order = ws.quali.quali.order.map((e) => e.driverId);
  if (raceKey === "feature") return order;
  const n = reversedTop(ws.series);
  return [...order.slice(0, n).reverse(), ...order.slice(n)];
}

/**
 * Conocimiento de los neumáticos ganado en las tandas largas: hasta un 5 % menos de desgaste en
 * carrera (con unas 20 vueltas de datos).
 */
export function wearMultFor(ws: WeekendState, driverId: string): number {
  const laps = (ws.longRuns?.[driverId] ?? []).reduce((a, r) => a + r.laps, 0);
  return 1 - 0.05 * Math.min(1, laps / 20);
}

export function raceConfigFor(
  state: GameState,
  ws: WeekendState,
  key: string,
  opts: {
    playerTeamId?: string;
    startCompounds?: Record<string, Compound>;
    startSets?: Record<string, TyreSet>;
    strategies?: Record<string, { plans: StrategyPlan[]; active: number }>;
  } = {},
): RaceConfig {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const session = ws.sessions.find((s) => s.key === key);
  const kind = (session?.kind ?? "race") as RaceKind;
  const entry = wk[ws.series];
  const qKey = ws.series === "f1" ? (key === "sprint" ? "sprintQuali" : "quali") : "quali";
  const poleId = ws.series === "f1" ? ws.quali[qKey]?.order[0]?.driverId : key === "feature" ? ws.quali.quali?.order[0]?.driverId : undefined;
  const mine = Object.keys(ws.setup);
  const spareSets: Record<string, TyreSet[]> = {};
  const wearMult: Record<string, number> = {};
  const relMult: Record<string, number> = {};
  for (const id of mine) {
    const start = opts.startSets?.[id];
    if (ws.tyres?.[id]) spareSets[id] = ws.tyres[id].filter((s) => s.id !== start?.id && s.wear < 100);
    wearMult[id] = wearMultFor(ws, id);
    relMult[id] = componentRelMult(state.components?.[id]);
  }
  return {
    series: ws.series,
    circuit,
    laps: raceLaps(ws.series, circuit, kind),
    kind,
    name: `${entry?.name ?? circuit.name} · ${session?.label ?? ""}`,
    grid: ws.grids[key] ?? gridFor(ws, key),
    drivers: state.drivers,
    teams: effectiveTeams(state),
    pus: state.pus,
    weather: ws.weather[key],
    setupQ: setupQualities(ws),
    playerTeamId: opts.playerTeamId,
    startCompounds: opts.startCompounds,
    startSets: opts.startSets,
    strategies: opts.strategies,
    spareSets: opts.playerTeamId ? spareSets : undefined,
    wearMult,
    relMult,
    mustTwo: mustTwoCompounds(ws.series, kind),
    seed: hashString(`${state.seed}|${state.year}|${wk.id}|${ws.series}|${key}|race`),
    weekendId: wk.id,
    round: entry?.round ?? 0,
    poleId,
  };
}

/** Contexto del planificador de estrategias para un piloto en una carrera del fin de semana. */
export function stratContext(state: GameState, ws: WeekendState, key: string, driverId: string, startWear = 0): StratCtx {
  const circuit = CIRCUITS[state.calendar[ws.weekendIndex].circuitId];
  const kind = (ws.sessions.find((s) => s.key === key)?.kind ?? "race") as RaceKind;
  return {
    series: ws.series,
    circuit,
    base: baseLap(ws.series, circuit),
    laps: raceLaps(ws.series, circuit, kind),
    dry: dryCompounds(ws.series, circuit),
    mustTwo: mustTwoCompounds(ws.series, kind),
    tyreSkill: state.drivers[driverId].tyre,
    wearMult: wearMultFor(ws, driverId),
    pitLoss: circuit.pitLoss,
    startWear,
  };
}

/**
 * Tiempo estimado de una vuelta rápida con un juego concreto en unas condiciones dadas: coche,
 * piloto, reglaje, compuesto, humedad y estado del juego.
 */
export function estimateLap(state: GameState, ws: WeekendState, driverId: string, set: Pick<TyreSet, "compound" | "wear" | "used">, wet: number): number {
  const circuit = CIRCUITS[state.calendar[ws.weekendIndex].circuitId];
  const d = state.drivers[driverId];
  const team = effectiveTeam(state, state.teams[d.teamId]);
  let pct = basePct(ws.series, team, d, state.pus, circuit, wet, ws.setup[driverId]?.quality ?? ws.aiSetup[driverId] ?? 0.8);
  pct += isWetTyre(set.compound) ? 0 : spec(ws.series, set.compound).pace * 1.2;
  pct += wetPenalty(set.compound, wet) + wet * 6 + usedSetPenalty(set);
  return baseLap(ws.series, circuit) * (1 + pct / 100);
}

/** Simula un fin de semana completo de una categoría sin intervención del jugador. */
export function simulateSeriesWeekend(state: GameState, weekendIndex: number, series: SeriesId): RaceResult[] {
  const ws = createWeekendState(state, weekendIndex, series);
  const participants = seriesDrivers(state, series).map((d) => d.id);
  const wk = state.calendar[weekendIndex];
  const results: RaceResult[] = [];
  for (const s of ws.sessions) {
    if (s.kind === "practice") continue;
    if (s.kind === "quali" || s.kind === "sprintQuali") {
      const ctx = qualiContext(state, ws, s.key);
      ws.quali[s.key] = runFullQuali(ctx, s.key, participants, rngFor(state.seed, state.year, wk.id, series, s.key, "q"));
      continue;
    }
    ws.grids[s.key] = gridFor(ws, s.key);
    const sim = new RaceSim(raceConfigFor(state, ws, s.key));
    sim.runToEnd();
    results.push(sim.toResult());
  }
  return results;
}
