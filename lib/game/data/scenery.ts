// Entorno de cada circuito: qué rodea la pista en la vista de carrera.
// Las direcciones usan el plano de la vista: x hacia el este, y hacia el sur.

export type Biome = "park" | "forest" | "fields" | "dry" | "desert" | "dunes" | "tropical" | "urban";

export interface Water {
  /**
   * sea: mar o bahía hacia `dir`.
   * lake: lago dentro del trazado.
   * island: el circuito está en una isla rodeada de agua.
   * marina: dársena parcial dentro del trazado.
   */
  kind: "sea" | "lake" | "island" | "marina";
  dir?: [number, number];
  /** Dónde empieza el agua a lo largo de `dir` (fracción del tamaño del circuito). */
  offset?: number;
  /** Distancia mínima del agua a la pista (m). */
  min?: number;
  /** Barcos amarrados o navegando. */
  boats?: number;
}

export interface Scenery {
  biome: Biome;
  /** Circuito urbano: muros y vallas pegados a la pista, sin escapatorias de grava. */
  street?: boolean;
  /** Carrera nocturna con focos. */
  night?: boolean;
  water?: Water;
  /** Densidad de edificios cerca de la pista (0..1). */
  buildings: number;
  /** Densidad de árboles (0..1). */
  trees: number;
  palms?: boolean;
  /** Paleta de tejados. */
  roofs: string[];
  /** Edificios altos (sombras más largas). */
  tall?: boolean;
  /** Letreros de neón en los tejados. */
  neon?: boolean;
  landmark?: "sphere" | "stadium" | "wheel" | "tower";
}

const ROOF_EU = ["#b5523b", "#c06a4a", "#9c4a36", "#d9cbb4", "#8f949b", "#a7aab0"];
const ROOF_MED = ["#e8dcc5", "#f0e6d2", "#d9b48f", "#c97c5d", "#efe9dc", "#b8a58a"];
const ROOF_MODERN = ["#9aa4b1", "#b8c2cc", "#7e8894", "#cfd6de", "#5f6b78", "#6f8aa3"];
const ROOF_GLASS = ["#4d6a88", "#6b8db0", "#3e5470", "#8fb3d1", "#a9b7c6", "#2f4257"];
const ROOF_DESERT = ["#e3d2b0", "#d8c39b", "#efe4cc", "#c9b089", "#bfc4c9"];
const ROOF_US = ["#7d858f", "#9aa2ab", "#5d646d", "#c4c9cf", "#a38e74"];

export const SCENERY: Record<string, Scenery> = {
  albert_park: { biome: "park", water: { kind: "lake", min: 60, boats: 10 }, buildings: 0.25, trees: 0.55, roofs: ROOF_MODERN },
  shanghai: { biome: "fields", buildings: 0.35, trees: 0.2, roofs: ROOF_MODERN, tall: true },
  suzuka: { biome: "forest", buildings: 0.12, trees: 0.8, roofs: ROOF_MODERN, landmark: "wheel" },
  miami: { biome: "tropical", street: true, water: { kind: "marina", min: 45, boats: 26 }, buildings: 0.3, trees: 0.35, palms: true, roofs: ROOF_US, landmark: "stadium" },
  montreal: { biome: "park", water: { kind: "island", min: 130, boats: 8 }, buildings: 0.05, trees: 0.7, roofs: ROOF_MODERN },
  monaco: { biome: "urban", street: true, water: { kind: "sea", dir: [0.55, 0.83], offset: -0.05, min: 32, boats: 70 }, buildings: 1, trees: 0.25, palms: true, roofs: ROOF_MED, tall: true },
  barcelona: { biome: "dry", buildings: 0.2, trees: 0.3, roofs: ROOF_MED },
  red_bull_ring: { biome: "forest", buildings: 0.08, trees: 0.55, roofs: ROOF_EU },
  silverstone: { biome: "fields", buildings: 0.12, trees: 0.25, roofs: ROOF_EU },
  spa: { biome: "forest", buildings: 0.1, trees: 0.95, roofs: ROOF_EU },
  hungaroring: { biome: "dry", buildings: 0.12, trees: 0.4, roofs: ROOF_EU },
  zandvoort: { biome: "dunes", water: { kind: "sea", dir: [-1, 0], offset: 0.35, min: 90, boats: 4 }, buildings: 0.3, trees: 0.25, roofs: ROOF_EU },
  monza: { biome: "forest", buildings: 0.08, trees: 0.9, roofs: ROOF_EU },
  madring: { biome: "dry", street: true, buildings: 0.7, trees: 0.25, roofs: ROOF_MED, tall: true },
  baku: { biome: "urban", street: true, water: { kind: "sea", dir: [0.35, 0.94], offset: 0.2, min: 40, boats: 18 }, buildings: 1, trees: 0.15, roofs: ROOF_DESERT, tall: true },
  sepang: { biome: "tropical", buildings: 0.08, trees: 0.6, palms: true, roofs: ROOF_MODERN },
  marina_bay: { biome: "urban", street: true, night: true, water: { kind: "sea", dir: [0.6, 0.8], offset: 0.15, min: 40, boats: 22 }, buildings: 1, trees: 0.35, palms: true, roofs: ROOF_GLASS, tall: true, landmark: "wheel" },
  cota: { biome: "dry", buildings: 0.08, trees: 0.2, roofs: ROOF_US, landmark: "tower" },
  mexico: { biome: "park", buildings: 0.6, trees: 0.45, roofs: ROOF_MED, landmark: "stadium" },
  interlagos: { biome: "park", buildings: 0.75, trees: 0.4, roofs: ROOF_MED },
  las_vegas: { biome: "urban", street: true, night: true, buildings: 1, trees: 0.06, palms: true, roofs: ROOF_US, tall: true, neon: true, landmark: "sphere" },
  lusail: { biome: "desert", night: true, buildings: 0.05, trees: 0.05, palms: true, roofs: ROOF_DESERT },
  yas_marina: { biome: "desert", night: true, water: { kind: "marina", min: 50, boats: 40 }, buildings: 0.3, trees: 0.15, palms: true, roofs: ROOF_DESERT, tall: true },
};

export const DEFAULT_SCENERY: Scenery = { biome: "park", buildings: 0.15, trees: 0.5, roofs: ROOF_EU };

export function sceneryOf(circuitId: string): Scenery {
  return SCENERY[circuitId] ?? DEFAULT_SCENERY;
}

export interface BiomeColors {
  ground: string;
  stripe: string;
  runoff: string;
  gravel: string;
  tree: [string, string];
  treeHi: string;
}

export const BIOME_COLORS: Record<Biome, BiomeColors> = {
  park: { ground: "#4d8a3a", stripe: "#55933f", runoff: "#6aa64f", gravel: "#d8c38f", tree: ["#2f6127", "#3a7030"], treeHi: "#58934a" },
  forest: { ground: "#3f7a31", stripe: "#468237", runoff: "#62a04a", gravel: "#d8c38f", tree: ["#24501f", "#2e5f27"], treeHi: "#4c8440" },
  fields: { ground: "#5f9440", stripe: "#679c47", runoff: "#78b057", gravel: "#d8c38f", tree: ["#2f6127", "#3a7030"], treeHi: "#58934a" },
  dry: { ground: "#8a9a52", stripe: "#93a25b", runoff: "#9db262", gravel: "#dcc48c", tree: ["#4b6630", "#56723a"], treeHi: "#7b9455" },
  desert: { ground: "#d6bd8b", stripe: "#d0b684", runoff: "#5f646d", gravel: "#e4d1a3", tree: ["#4f7a3a", "#5d8a44"], treeHi: "#86b062" },
  dunes: { ground: "#cbb47e", stripe: "#c2ab75", runoff: "#8fa660", gravel: "#e6d6a8", tree: ["#5f7d3a", "#6c8a44"], treeHi: "#93ad65" },
  tropical: { ground: "#3e8a37", stripe: "#46933f", runoff: "#5fa84f", gravel: "#d8c38f", tree: ["#1f5a24", "#2a6a2c"], treeHi: "#4f9a4a" },
  urban: { ground: "#5b6068", stripe: "#60656d", runoff: "#8b9199", gravel: "#a8adb4", tree: ["#2f6127", "#3a7030"], treeHi: "#58934a" },
};
