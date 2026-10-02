import { CIRCUITS } from "./data/circuits";
import { runFullQuali, type QualiCtx } from "./qualifying";
import { RaceSim, type RaceConfig } from "./race";
import { hashString, range, rngFor } from "./rng";
import { aiSetupQuality, autoSetupValues, makeOptimum, practiceRuns, setupQuality } from "./setup";
import type { Circuit, Compound, Driver, GameState, RaceKind, RaceResult, SeriesId, SessionDef, SessionKind, Weekend, WeekendState } from "./types";
import { generateWeather, type WeatherMode } from "./weather";

export function seriesEntry(wk: Weekend, series: SeriesId) {
  return wk[series];
}

export function weekendSeries(wk: Weekend): SeriesId[] {
  return (["f3", "f2", "f1"] as SeriesId[]).filter((s) => wk[s]);
}

export function sessionsFor(series: SeriesId, wk: Weekend): SessionDef[] {
  if (series === "f1") {
    return wk.f1?.sprint
      ? [
          { key: "practice", kind: "practice", label: "Libres 1" },
          { key: "sprintQuali", kind: "sprintQuali", label: "Clasificación Sprint" },
          { key: "sprint", kind: "sprint", label: "Sprint" },
          { key: "quali", kind: "quali", label: "Clasificación" },
          { key: "race", kind: "race", label: "Gran Premio" },
        ]
      : [
          { key: "practice", kind: "practice", label: "Libres" },
          { key: "quali", kind: "quali", label: "Clasificación" },
          { key: "race", kind: "race", label: "Gran Premio" },
        ];
  }
  return [
    { key: "practice", kind: "practice", label: "Libres" },
    { key: "quali", kind: "quali", label: "Clasificación" },
    { key: "sprint", kind: "sprint", label: "Carrera Sprint" },
    { key: "feature", kind: "feature", label: "Carrera Principal" },
  ];
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
  if (kind === "practice") return 60;
  if (kind === "quali" || kind === "sprintQuali") return series === "f1" ? 60 : 30;
  const lapF = { f1: 1, f2: 1.11, f3: 1.22 }[series] * c.lap;
  return (raceLaps(series, c, kind) * lapF) / 60;
}

export function seriesDrivers(state: GameState, series: SeriesId): Driver[] {
  const teamOrder = Object.values(state.teams).filter((t) => t.series === series).map((t) => t.id);
  return Object.values(state.drivers)
    .filter((d) => d.series === series)
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
  const setupRng = rngFor(seed, "setup");
  const runs = practiceRuns(series, !!wk.f1?.sprint && series === "f1");
  for (const d of seriesDrivers(state, series)) {
    aiSetup[d.id] = aiSetupQuality(state.teams[d.teamId], setupRng);
    if (d.teamId === playerTeamId) {
      setup[d.id] = { values: { aero: 50, susp: 50, gear: 50 }, optimum: makeOptimum(circuit, setupRng), runsLeft: runs, runs: [], quality: 0 };
      setup[d.id].quality = 0.55;
    }
  }
  return { weekendIndex, series, sessions, step: 0, weather, setup, aiSetup, quali: {}, grids: {}, results: [] };
}

/** El ingeniero aplica un reglaje genérico a los pilotos que no han rodado y se pasa a la siguiente sesión. */
export function skipPractice(state: GameState, ws: WeekendState) {
  const wk = state.calendar[ws.weekendIndex];
  for (const [id, st] of Object.entries(ws.setup)) {
    if (st.runs.length > 0) continue;
    const team = state.teams[state.drivers[id].teamId];
    const v = autoSetupValues(st.optimum, team, rngFor(state.seed, wk.id, id, "skip"));
    st.values = v;
    st.quality = Math.max(st.quality, setupQuality(v, st.optimum) * 0.92);
  }
  if (ws.sessions[ws.step]?.kind === "practice") ws.step++;
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
    teams: state.teams,
    pus: state.pus,
    setupQ: setupQualities(ws),
    weather: ws.weather[key],
    sprint: key === "sprintQuali",
  };
}

/** Parrilla de salida de una carrera a partir de la clasificación correspondiente. */
export function gridFor(ws: WeekendState, raceKey: string): string[] {
  if (ws.series === "f1") {
    const q = ws.quali[raceKey === "sprint" ? "sprintQuali" : "quali"];
    return q.order.map((e) => e.driverId);
  }
  const order = ws.quali.quali.order.map((e) => e.driverId);
  if (raceKey === "feature") return order;
  const n = reversedTop(ws.series);
  return [...order.slice(0, n).reverse(), ...order.slice(n)];
}

export function raceConfigFor(
  state: GameState,
  ws: WeekendState,
  key: string,
  opts: { playerTeamId?: string; startCompounds?: Record<string, Compound> } = {},
): RaceConfig {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const session = ws.sessions.find((s) => s.key === key);
  const kind = (session?.kind ?? "race") as RaceKind;
  const entry = wk[ws.series];
  const qKey = ws.series === "f1" ? (key === "sprint" ? "sprintQuali" : "quali") : "quali";
  const poleId = ws.series === "f1" ? ws.quali[qKey]?.order[0]?.driverId : key === "feature" ? ws.quali.quali?.order[0]?.driverId : undefined;
  return {
    series: ws.series,
    circuit,
    laps: raceLaps(ws.series, circuit, kind),
    kind,
    name: `${entry?.name ?? circuit.name} · ${session?.label ?? ""}`,
    grid: ws.grids[key] ?? gridFor(ws, key),
    drivers: state.drivers,
    teams: state.teams,
    pus: state.pus,
    weather: ws.weather[key],
    setupQ: setupQualities(ws),
    playerTeamId: opts.playerTeamId,
    startCompounds: opts.startCompounds,
    mustTwo: mustTwoCompounds(ws.series, kind),
    seed: hashString(`${state.seed}|${state.year}|${wk.id}|${ws.series}|${key}|race`),
    weekendId: wk.id,
    round: entry?.round ?? 0,
    poleId,
  };
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
