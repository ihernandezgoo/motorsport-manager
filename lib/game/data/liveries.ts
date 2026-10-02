import { hashString } from "../rng";
import type { Driver, Team } from "../types";

export type LiveryPattern = "upper" | "lower" | "swoosh" | "split" | "stripe";

export interface Livery {
  /** Color principal de la carrocería. */
  base: string;
  /** Segundo color (bandas, pontones o tapa motor). */
  second: string;
  /** Detalles: pinstripes, alerones, número. */
  accent: string;
  pattern: LiveryPattern;
  /** Color de las llantas. */
  rim?: string;
}

/** Decoraciones 2026 interpretadas a partir de los colores de cada equipo (diseños propios). */
export const LIVERIES: Record<string, Livery> = {
  mercedes: { base: "#121314", second: "#c3c9cf", accent: "#00d2be", pattern: "swoosh" },
  ferrari: { base: "#d40000", second: "#ffffff", accent: "#121212", pattern: "upper" },
  mclaren: { base: "#ff8000", second: "#1b1b1d", accent: "#ff8000", pattern: "lower", rim: "#2fb6ff" },
  red_bull: { base: "#1b2a5c", second: "#c8102e", accent: "#ffcd00", pattern: "swoosh", rim: "#3b5bff" },
  racing_bulls: { base: "#f4f5f7", second: "#1b3fb5", accent: "#e10600", pattern: "lower" },
  alpine: { base: "#1677e8", second: "#ff6eb4", accent: "#0a0a0a", pattern: "stripe" },
  haas: { base: "#f2f2f2", second: "#1a1a1a", accent: "#e10600", pattern: "swoosh" },
  williams: { base: "#1640d6", second: "#0a1a4f", accent: "#47c7fc", pattern: "lower", rim: "#b14bff" },
  audi: { base: "#d9dbde", second: "#141414", accent: "#e4002b", pattern: "split" },
  aston_martin: { base: "#00594f", second: "#003b34", accent: "#cedc00", pattern: "stripe" },
  cadillac: { base: "#141414", second: "#8a8f96", accent: "#ffffff", pattern: "split", rim: "#e5e7eb" },

  f2_invicta: { base: "#141414", second: "#c6ff00", accent: "#ffffff", pattern: "swoosh" },
  f2_hitech: { base: "#e5e7eb", second: "#141414", accent: "#e11d48", pattern: "lower" },
  f2_campos: { base: "#ff7a00", second: "#1e3a8a", accent: "#ffffff", pattern: "swoosh" },
  f2_dams: { base: "#1d4ed8", second: "#facc15", accent: "#ffffff", pattern: "stripe" },
  f2_mp: { base: "#ff5a1f", second: "#141414", accent: "#ffffff", pattern: "lower" },
  f2_prema: { base: "#dc2626", second: "#ffffff", accent: "#141414", pattern: "upper" },
  f2_rodin: { base: "#141414", second: "#d4a017", accent: "#ffffff", pattern: "stripe" },
  f2_art: { base: "#f5f5f5", second: "#dc2626", accent: "#141414", pattern: "swoosh" },
  f2_aix: { base: "#6d28d9", second: "#ffffff", accent: "#141414", pattern: "split" },
  f2_var: { base: "#0ea5e9", second: "#f97316", accent: "#ffffff", pattern: "lower" },
  f2_trident: { base: "#0b1f4d", second: "#60a5fa", accent: "#ffffff", pattern: "swoosh" },

  f3_campos: { base: "#ff7a00", second: "#1e3a8a", accent: "#ffffff", pattern: "lower" },
  f3_trident: { base: "#0b1f4d", second: "#60a5fa", accent: "#ffffff", pattern: "stripe" },
  f3_mp: { base: "#ff5a1f", second: "#141414", accent: "#ffffff", pattern: "swoosh" },
  f3_art: { base: "#f5f5f5", second: "#dc2626", accent: "#141414", pattern: "lower" },
  f3_var: { base: "#0ea5e9", second: "#f97316", accent: "#ffffff", pattern: "swoosh" },
  f3_rodin: { base: "#141414", second: "#d4a017", accent: "#ffffff", pattern: "split" },
  f3_prema: { base: "#dc2626", second: "#ffffff", accent: "#141414", pattern: "swoosh" },
  f3_hitech: { base: "#e5e7eb", second: "#141414", accent: "#e11d48", pattern: "stripe" },
  f3_dams: { base: "#1d4ed8", second: "#facc15", accent: "#ffffff", pattern: "lower" },
  f3_aix: { base: "#6d28d9", second: "#ffffff", accent: "#141414", pattern: "swoosh" },
};

export function liveryOf(team: Pick<Team, "id" | "color" | "accent">): Livery {
  return LIVERIES[team.id] ?? { base: team.color, second: team.accent, accent: "#ffffff", pattern: "swoosh" };
}

export type HelmetPattern = "stripes" | "chevron" | "split" | "band" | "flames" | "stars" | "halo" | "diagonal";

export interface HelmetDesign {
  base: string;
  second: string;
  accent: string;
  pattern: HelmetPattern;
  /** Tinte de la visera. */
  visor: string;
}

/** Diseños propios para los pilotos de F1, inspirados en sus colores habituales. */
const F1_HELMETS: Record<string, Omit<HelmetDesign, "visor"> & { visor?: string }> = {
  norris: { base: "#d7ff1f", second: "#141414", accent: "#00b2ff", pattern: "stripes" },
  piastri: { base: "#0b1f4a", second: "#ff8000", accent: "#ffffff", pattern: "band" },
  leclerc: { base: "#ffffff", second: "#d40000", accent: "#0b1f4a", pattern: "chevron" },
  hamilton: { base: "#f5c400", second: "#6b21a8", accent: "#ffffff", pattern: "diagonal" },
  verstappen: { base: "#0b1f4a", second: "#ff6a00", accent: "#e10600", pattern: "flames", visor: "#ff8a00" },
  hadjar: { base: "#f8fafc", second: "#1d4ed8", accent: "#ef4444", pattern: "split" },
  russell: { base: "#0f172a", second: "#38bdf8", accent: "#f97316", pattern: "band" },
  antonelli: { base: "#ffffff", second: "#16a34a", accent: "#dc2626", pattern: "halo" },
  alonso: { base: "#1d4ed8", second: "#facc15", accent: "#dc2626", pattern: "chevron" },
  stroll: { base: "#ffffff", second: "#dc2626", accent: "#00594f", pattern: "split" },
  gasly: { base: "#0b1f4a", second: "#ffffff", accent: "#ff6eb4", pattern: "diagonal" },
  colapinto: { base: "#74acdf", second: "#ffffff", accent: "#f6b40e", pattern: "band" },
  albon: { base: "#ffffff", second: "#1e40af", accent: "#e11d48", pattern: "stripes" },
  sainz: { base: "#c8102e", second: "#f1bf00", accent: "#141414", pattern: "flames" },
  lawson: { base: "#141414", second: "#e5e7eb", accent: "#14b8a6", pattern: "chevron" },
  lindblad: { base: "#0f766e", second: "#ffffff", accent: "#facc15", pattern: "split" },
  ocon: { base: "#ec4899", second: "#1e3a8a", accent: "#ffffff", pattern: "halo" },
  bearman: { base: "#ffffff", second: "#012169", accent: "#c8102e", pattern: "diagonal" },
  hulkenberg: { base: "#d1d5db", second: "#141414", accent: "#ef4444", pattern: "stripes" },
  bortoleto: { base: "#009c3b", second: "#ffdf00", accent: "#002776", pattern: "band" },
  perez: { base: "#ffffff", second: "#006847", accent: "#ce1126", pattern: "chevron" },
  bottas: { base: "#002f6c", second: "#ffffff", accent: "#7fb2e5", pattern: "split" },
};

const FLAG_COLORS: Record<string, [string, string, string]> = {
  GBR: ["#012169", "#ffffff", "#c8102e"],
  AUS: ["#00247d", "#ffffff", "#e4002b"],
  BRA: ["#009c3b", "#ffdf00", "#002776"],
  MEX: ["#006847", "#ffffff", "#ce1126"],
  USA: ["#0a3161", "#ffffff", "#b31942"],
  JPN: ["#ffffff", "#bc002d", "#141414"],
  ESP: ["#aa151b", "#f1bf00", "#141414"],
  FRA: ["#002395", "#ffffff", "#ed2939"],
  ITA: ["#009246", "#ffffff", "#ce2b37"],
  NED: ["#ff6a00", "#21468b", "#ffffff"],
  GER: ["#141414", "#dd0000", "#ffce00"],
  ARG: ["#74acdf", "#ffffff", "#f6b40e"],
  NZL: ["#141414", "#ffffff", "#00b2a9"],
  THA: ["#2d2a4a", "#ffffff", "#a51931"],
  FIN: ["#ffffff", "#002f6c", "#7fb2e5"],
  CAN: ["#ff0000", "#ffffff", "#141414"],
  MON: ["#ce1126", "#ffffff", "#141414"],
  PAR: ["#d52b1e", "#ffffff", "#0038a8"],
  BUL: ["#00966e", "#ffffff", "#d62612"],
  SWE: ["#006aa7", "#fecc00", "#ffffff"],
  POL: ["#ffffff", "#dc143c", "#141414"],
  COL: ["#fcd116", "#003893", "#ce1126"],
  NOR: ["#ba0c2f", "#ffffff", "#00205b"],
  IRL: ["#169b62", "#ffffff", "#ff883e"],
  IND: ["#ff9933", "#ffffff", "#138808"],
  DEN: ["#c60c30", "#ffffff", "#141414"],
  SGP: ["#ef3340", "#ffffff", "#141414"],
  KOR: ["#ffffff", "#cd2e3a", "#0047a0"],
  SRI: ["#8d153a", "#ffb700", "#005f56"],
  CHN: ["#de2910", "#ffde00", "#141414"],
};

const PATTERNS: HelmetPattern[] = ["stripes", "chevron", "split", "band", "flames", "stars", "halo", "diagonal"];
const VISORS = ["#1b2a3a", "#2a1b3a", "#3a2a12", "#123a3a", "#1b1b1b"];

export function helmetOf(d: Pick<Driver, "id" | "nat">): HelmetDesign {
  const h = hashString(d.id);
  const manual = F1_HELMETS[d.id];
  if (manual) return { visor: VISORS[h % VISORS.length], ...manual };
  const flag = FLAG_COLORS[d.nat] ?? ["#1f2937", "#ffffff", "#ef4444"];
  const rot = h % 3;
  const [base, second, accent] = [flag[rot], flag[(rot + 1) % 3], flag[(rot + 2) % 3]];
  return { base, second, accent, pattern: PATTERNS[(h >>> 3) % PATTERNS.length], visor: VISORS[(h >>> 7) % VISORS.length] };
}
