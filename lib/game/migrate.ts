import { CIRCUITS } from "./data/circuits";
import { rngFor } from "./rng";
import { initCareer, SAVE_VERSION } from "./season";
import { makeTyreSets } from "./tyreSets";
import type { GameState } from "./types";
import { isSprintWeekend } from "./weekend";

type RawSave = Record<string, unknown> & { version: number };

/**
 * v1 → v2: carrera de mánager (contratos, junta, personal, patrocinadores, componentes) y, si hay un
 * fin de semana a medias, sus juegos de neumáticos. Las sesiones del fin de semana en curso se
 * conservan con su formato antiguo (una sola sesión de libres).
 */
function toV2(save: RawSave): RawSave {
  const s = save as unknown as GameState;
  for (const d of Object.values(s.drivers)) {
    d.potential ??= d.pace;
    d.salary ??= 0;
    d.contractUntil ??= s.year;
  }
  initCareer(s, rngFor(s.seed, s.year, "migrate-v2"));
  const ws = s.weekend;
  if (ws) {
    const wk = s.calendar[ws.weekendIndex];
    ws.qualiProgress ??= {};
    ws.gridPenalty ??= {};
    ws.longRuns ??= {};
    ws.tyres ??= {};
    for (const id of Object.keys(ws.setup)) {
      ws.longRuns[id] ??= [];
      ws.tyres[id] ??= makeTyreSets(ws.series, CIRCUITS[wk.circuitId], isSprintWeekend(ws.series, wk), id);
    }
  }
  return { ...save, version: 2 };
}

/**
 * Migraciones de partidas guardadas. `MIGRATIONS[n]` convierte una partida de la versión `n` a la
 * `n + 1`. Al cambiar el formato de `GameState`:
 *   1. sube `SAVE_VERSION` en season.ts,
 *   2. añade aquí la entrada de la versión anterior, rellenando los campos nuevos con valores por
 *      defecto razonables (nunca dependas de datos que una partida antigua no tenga).
 * Las migraciones reciben objetos ya parseados y pueden mutarlos.
 */
const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {
  1: toV2,
};

export type LoadResult =
  | { ok: true; state: GameState; migrated: boolean; from: number }
  | { ok: false; reason: "corrupt" | "newer"; version?: number };

function looksLikeGame(s: Record<string, unknown>): boolean {
  return (
    typeof s.player === "object" &&
    s.player !== null &&
    typeof s.teams === "object" &&
    typeof s.drivers === "object" &&
    Array.isArray(s.calendar) &&
    typeof s.nextWeekend === "number"
  );
}

/** Convierte el JSON de una partida guardada a la versión actual del juego. */
export function migrateSave(json: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (typeof raw !== "object" || raw === null || typeof (raw as RawSave).version !== "number") return { ok: false, reason: "corrupt" };

  let save = raw as RawSave;
  const from = save.version;
  if (from > SAVE_VERSION) return { ok: false, reason: "newer", version: from };

  while (save.version < SAVE_VERSION) {
    const step = MIGRATIONS[save.version];
    // Falta un paso de la cadena: mejor no cargar que cargar una partida a medio convertir.
    if (!step) return { ok: false, reason: "corrupt", version: save.version };
    const before = save.version;
    save = step(save);
    if (save.version !== before + 1) throw new Error(`La migración ${before} debe dejar la partida en la versión ${before + 1}`);
  }

  if (!looksLikeGame(save)) return { ok: false, reason: "corrupt", version: from };
  return { ok: true, state: save as unknown as GameState, migrated: from !== SAVE_VERSION, from };
}
