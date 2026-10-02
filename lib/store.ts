import { useSyncExternalStore } from "react";
import { migrateSave } from "./game/migrate";
import type { GameState, SeriesId } from "./game/types";

export type CareerSlot = 1 | 2 | 3;
export type Slot = CareerSlot | "quick";
export const CAREER_SLOTS: CareerSlot[] = [1, 2, 3];

const PREFIX = "apex-race-manager-2026";
/** Clave de la única partida de carrera que existía antes de las ranuras; se mueve a la ranura 1. */
const LEGACY_KEY = PREFIX;
const LAST_KEY = `${PREFIX}-last-slot`;
const keyOf = (s: Slot) => (s === "quick" ? `${PREFIX}-quick` : `${PREFIX}-slot-${s}`);
const savedAtKey = (s: Slot) => `${keyOf(s)}-saved-at`;
const backupKey = (s: Slot, version: number) => `${keyOf(s)}-backup-v${version}`;

export interface SlotSummary {
  manager: string;
  teamName: string;
  teamColor: string;
  series: SeriesId;
  year: number;
  /** Fecha y nombre del próximo evento, o null si la temporada ha terminado. */
  next: { date: string; name: string } | null;
  savedAt: string | null;
}

export type SlotInfo =
  | { slot: CareerSlot; status: "empty" }
  | { slot: CareerSlot; status: "ok"; summary: SlotSummary }
  | { slot: CareerSlot; status: "newer" | "corrupt" };

let slot: Slot | null = null;
let state: GameState | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Almacenamiento no disponible (modo privado, cuota...): la partida sigue en memoria.
    return false;
  }
}

function removeItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nada que hacer.
  }
}

/**
 * Lee una ranura aplicando las migraciones pendientes. Si la partida cambia de versión, guarda
 * antes una copia del original y escribe la versión migrada. Nunca toca partidas que no puede leer.
 */
function readSlot(s: Slot): { state: GameState } | { error: "empty" | "corrupt" | "newer" } {
  const raw = getItem(keyOf(s));
  if (!raw) return { error: "empty" };
  let res;
  try {
    res = migrateSave(raw);
  } catch {
    return { error: "corrupt" };
  }
  if (!res.ok) return { error: res.reason };
  if (res.migrated) {
    setItem(backupKey(s, res.from), raw);
    setItem(keyOf(s), JSON.stringify(res.state));
  }
  return { state: res.state };
}

function summarize(s: GameState, savedAt: string | null): SlotSummary {
  const team = s.teams[s.player.teamId];
  const wk = s.calendar[s.nextWeekend];
  return {
    manager: s.manager,
    teamName: team?.name ?? s.player.teamId,
    teamColor: team?.color ?? "#888",
    series: s.player.series,
    year: s.year,
    next: wk ? { date: wk.date, name: wk.f1?.name ?? wk.f2?.name ?? wk.f3?.name ?? wk.id } : null,
    savedAt,
  };
}

/** Mueve la partida del formato anterior (una sola ranura) a la primera ranura libre. */
function adoptLegacySave() {
  const raw = getItem(LEGACY_KEY);
  if (!raw) return;
  const free = CAREER_SLOTS.find((s) => !getItem(keyOf(s)));
  if (!free) return;
  if (setItem(keyOf(free), raw)) {
    removeItem(LEGACY_KEY);
    if (!getItem(LAST_KEY)) setItem(LAST_KEY, String(free));
  }
}

function persist() {
  if (!slot || !state) return;
  if (setItem(keyOf(slot), JSON.stringify(state))) setItem(savedAtKey(slot), new Date().toISOString());
}

export const gameStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => state,
  isHydrated: () => hydrated,
  /** Ranura de la partida abierta, o null si no hay ninguna. */
  slot: () => slot,
  load() {
    if (hydrated) return;
    hydrated = true;
    adoptLegacySave();
    emit();
  },
  /** Estado de las tres ranuras de carrera, para el menú principal. */
  listSlots(): SlotInfo[] {
    return CAREER_SLOTS.map((s): SlotInfo => {
      const r = readSlot(s);
      if ("error" in r) return r.error === "empty" ? { slot: s, status: "empty" } : { slot: s, status: r.error };
      return { slot: s, status: "ok", summary: summarize(r.state, getItem(savedAtKey(s))) };
    });
  },
  /** Última ranura de carrera jugada. */
  lastSlot(): CareerSlot | null {
    const n = Number(getItem(LAST_KEY));
    return CAREER_SLOTS.find((s) => s === n) ?? null;
  },
  hasQuick: () => !("error" in readSlot("quick")),
  /** Abre una partida guardada. Devuelve false si no se puede leer. */
  open(next: Slot): boolean {
    const r = readSlot(next);
    if ("error" in r) return false;
    slot = next;
    state = r.state;
    if (next !== "quick") setItem(LAST_KEY, String(next));
    emit();
    return true;
  },
  /** Empieza una partida nueva en una ranura, sustituyendo lo que hubiera. */
  create(next: Slot, s: GameState) {
    slot = next;
    state = s;
    persist();
    if (next !== "quick") setItem(LAST_KEY, String(next));
    emit();
  },
  /** Cierra la partida abierta sin borrarla. */
  close() {
    slot = null;
    state = null;
    emit();
  },
  /** Borra una ranura (y sus copias de seguridad). Si es la abierta, la cierra. */
  remove(s: Slot) {
    const key = keyOf(s);
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k === key || k.startsWith(`${key}-`))) localStorage.removeItem(k);
      }
    } catch {
      // Nada que hacer.
    }
    if (getItem(LAST_KEY) === String(s)) removeItem(LAST_KEY);
    if (slot === s) {
      slot = null;
      state = null;
    }
    emit();
  },
  /** Aplica una mutación sobre una copia del estado y la publica. */
  update(fn: (draft: GameState) => void) {
    if (!state) return;
    const draft = structuredClone(state);
    fn(draft);
    state = draft;
    persist();
    emit();
  },
};

export function useGame(): GameState | null {
  return useSyncExternalStore(gameStore.subscribe, gameStore.get, () => null);
}

export function useHydrated(): boolean {
  return useSyncExternalStore(gameStore.subscribe, gameStore.isHydrated, () => false);
}
