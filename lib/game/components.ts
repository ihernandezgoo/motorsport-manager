import { addNews, fullName } from "./news";
import { clamp, range, type Rng } from "./rng";
import type { ComponentKind, ComponentState, GameState, RaceResult, WeekendState } from "./types";

export const COMPONENTS: { kind: ComponentKind; label: string; short: string; limit: number; life: number }[] = [
  { kind: "ice", label: "Motor de combustión", short: "ICE", limit: 4, life: 6 },
  { kind: "turbo", label: "Turbocompresor", short: "TC", limit: 4, life: 6 },
  { kind: "ers", label: "Sistema híbrido (MGU-K y batería)", short: "ERS", limit: 3, life: 8 },
  { kind: "gearbox", label: "Caja de cambios", short: "CC", limit: 5, life: 5 },
];

/** Desgaste de una unidad rota: hay que cambiarla. */
export const BROKEN = 200;

const fresh = (): Record<ComponentKind, ComponentState> => ({
  ice: { used: 1, wear: 0 },
  turbo: { used: 1, wear: 0 },
  ers: { used: 1, wear: 0 },
  gearbox: { used: 1, wear: 0 },
});

/** Solo la F1 lleva la cuenta de componentes (y solo de los pilotos del jugador). */
export function tracksComponents(state: GameState): boolean {
  return state.player.series === "f1" && !state.quick;
}

/** Asegura que cada piloto del jugador tenga su ficha de componentes (y elimina las de quien se fue). */
export function ensureComponents(state: GameState) {
  state.components ??= {};
  if (!tracksComponents(state)) {
    state.components = {};
    return;
  }
  const ids = Object.values(state.drivers)
    .filter((d) => d.teamId === state.player.teamId)
    .map((d) => d.id);
  for (const id of Object.keys(state.components)) if (!ids.includes(id)) delete state.components[id];
  for (const id of ids) state.components[id] ??= fresh();
}

export function resetComponents(state: GameState) {
  state.components = {};
  ensureComponents(state);
}

/** Multiplicador de la probabilidad de avería por el desgaste de la unidad más gastada. */
export function componentRelMult(comps: Record<ComponentKind, ComponentState> | undefined): number {
  if (!comps) return 1;
  const worst = Math.max(...Object.values(comps).map((c) => c.wear));
  if (worst >= BROKEN) return 12;
  return worst <= 75 ? 1 : 1 + ((worst - 75) / 25) ** 2 * 1.5;
}

/** Puestos de sanción por introducir la unidad número `n` de un componente. */
export function penaltyFor(kind: ComponentKind, n: number): number {
  const spec = COMPONENTS.find((c) => c.kind === kind);
  if (!spec || n <= spec.limit) return 0;
  if (kind === "gearbox") return 5;
  return n === spec.limit + 1 ? 10 : 5;
}

function addPenalty(ws: WeekendState, driverId: string, places: number, reason: string) {
  const cur = ws.gridPenalty[driverId];
  ws.gridPenalty[driverId] = cur ? { places: cur.places + places, reason: `${cur.reason} + ${reason}` } : { places, reason };
}

/** ¿Se puede todavía cambiar componentes en este fin de semana? Solo antes de que empiece el Gran Premio. */
export function canFitComponents(ws: WeekendState): boolean {
  const race = ws.sessions.findIndex((s) => s.kind === "race");
  return race >= 0 && ws.step <= race;
}

/** Monta una unidad nueva. Si supera el cupo de la temporada, sanción en la parrilla del Gran Premio. */
export function fitComponent(state: GameState, ws: WeekendState, driverId: string, kind: ComponentKind): string | null {
  const comps = state.components?.[driverId];
  if (!comps) return "Este piloto no lleva cuenta de componentes";
  if (!canFitComponents(ws)) return "Ya no se pueden cambiar componentes este fin de semana";
  const c = comps[kind];
  c.used++;
  c.wear = 0;
  const pen = penaltyFor(kind, c.used);
  const spec = COMPONENTS.find((x) => x.kind === kind);
  if (pen > 0) addPenalty(ws, driverId, pen, `${spec?.short} nº ${c.used}`);
  return null;
}

/** Desgaste de los componentes tras un fin de semana (los de sprint gastan más). */
export function accrueComponentWear(state: GameState, sprint: boolean, rng: Rng) {
  for (const comps of Object.values(state.components ?? {})) {
    for (const spec of COMPONENTS) {
      const c = comps[spec.kind];
      if (c.wear >= BROKEN) continue;
      c.wear = clamp(c.wear + (100 / spec.life) * (sprint ? 1.25 : 1) * range(rng, 0.9, 1.1), 0, BROKEN - 1);
    }
  }
}

const FAILURE_KIND: Record<string, ComponentKind> = {
  "Fallo de motor": "ice",
  "Pérdida de presión de aceite": "ice",
  "Caja de cambios": "gearbox",
  "Fallo eléctrico": "ers",
};

/** Las averías de motor, caja o sistema eléctrico rompen la unidad montada. */
export function applyFailures(state: GameState, results: RaceResult[]) {
  for (const r of results) {
    for (const e of r.entries) {
      const kind = e.status === "DNF" && e.reason ? FAILURE_KIND[e.reason] : undefined;
      const comps = state.components?.[e.driverId];
      if (kind && comps) comps[kind].wear = BROKEN;
    }
  }
}

/** Al empezar un fin de semana, las unidades rotas se sustituyen obligatoriamente. */
export function replaceBroken(state: GameState, ws: WeekendState, date: string) {
  for (const [id, comps] of Object.entries(state.components ?? {})) {
    for (const spec of COMPONENTS) {
      if (comps[spec.kind].wear < BROKEN) continue;
      fitComponent(state, ws, id, spec.kind);
      const pen = ws.gridPenalty[id];
      addNews(state, {
        date,
        series: "f1",
        title: `🔧 ${fullName(state, id)} estrena ${spec.label.toLowerCase()} tras la avería`,
        body: pen ? `Saldrá ${pen.places} puestos más atrás en el Gran Premio.` : "Sin sanción: aún estaba dentro del cupo.",
      });
    }
  }
}

/** Sanciones de los rivales de F1 por cambiar componentes: más frecuentes al final de la temporada. */
export function aiGridPenalties(state: GameState, ws: WeekendState, driverIds: string[], rng: Rng) {
  if (ws.series !== "f1" || state.quick) return;
  const rounds = state.calendar.filter((w) => w.f1).length;
  const round = state.calendar[ws.weekendIndex]?.f1?.round ?? 1;
  const p = Math.max(0, (round / rounds - 0.45) * 0.09);
  for (const id of driverIds) {
    if (state.drivers[id]?.teamId === state.player.teamId) continue;
    if (rng() < p) addPenalty(ws, id, rng() < 0.3 ? 15 : rng() < 0.5 ? 10 : 5, "nuevos elementos de la unidad de potencia");
  }
}

/** Aplica las sanciones a una parrilla: cada sancionado retrocede sus puestos (los de atrás primero). */
export function applyGridPenalties(grid: string[], pens: WeekendState["gridPenalty"]): string[] {
  const out = [...grid];
  const penalized = out.filter((id) => (pens[id]?.places ?? 0) > 0).reverse();
  for (const id of penalized) {
    const i = out.indexOf(id);
    out.splice(i, 1);
    out.splice(Math.min(out.length, i + (pens[id]?.places ?? 0)), 0, id);
  }
  return out;
}
