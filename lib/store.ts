import { useSyncExternalStore } from "react";
import { SAVE_VERSION } from "./game/season";
import type { GameState } from "./game/types";

export type Slot = "career" | "quick";

const KEYS: Record<Slot, string> = {
  career: "apex-race-manager-2026",
  quick: "apex-race-manager-2026-quick",
};

let slot: Slot = "career";
let state: GameState | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function read(s: Slot): GameState | null {
  try {
    const raw = localStorage.getItem(KEYS[s]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    return parsed.version === SAVE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (state) localStorage.setItem(KEYS[slot], JSON.stringify(state));
    else localStorage.removeItem(KEYS[slot]);
  } catch {
    // Almacenamiento no disponible (modo privado, cuota...): la partida sigue en memoria.
  }
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
  slot: () => slot,
  load() {
    if (hydrated) return;
    hydrated = true;
    state = read("career");
    emit();
  },
  /** Cambia entre la partida de carrera y el fin de semana rápido. */
  switchSlot(next: Slot) {
    if (next === slot) return;
    slot = next;
    state = read(next);
    emit();
  },
  /** ¿Hay un fin de semana rápido a medias guardado? */
  hasQuick: () => read("quick") !== null,
  set(next: GameState | null) {
    state = next;
    persist();
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
