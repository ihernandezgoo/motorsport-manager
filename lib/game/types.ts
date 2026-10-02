export type SeriesId = "f1" | "f2" | "f3";

/** SS = superblando, S = blando, M = medio, H = duro, I = intermedio, W = lluvia extrema */
export type Compound = "SS" | "S" | "M" | "H" | "I" | "W";

/** 0 = relajar ... 4 = atacar */
export type DrivingStyle = 0 | 1 | 2 | 3 | 4;
/** 0 = bajo (ahorro) ... 3 = adelantamiento */
export type EngineMode = 0 | 1 | 2 | 3;
/** 0 = recargar, 1 = equilibrado, 2 = desplegar */
export type ErsMode = 0 | 1 | 2;

export interface PowerUnit {
  id: string;
  name: string;
  power: number;
  reliability: number;
  worksTeam: string;
}

export interface CarRatings {
  aero: number;
  chassis: number;
  /** En F1 se sobrescribe con la unidad de potencia; en F2/F3 es el motor monomarca. */
  engine: number;
  reliability: number;
}

export interface Team {
  id: string;
  series: SeriesId;
  name: string;
  short: string;
  color: string;
  accent: string;
  country: string;
  pu?: string;
  car: CarRatings;
  pitCrew: number;
  engineering: number;
  factory: number;
  /** Presupuesto de desarrollo disponible, en millones de euros. */
  budget: number;
  /** Ingresos de patrocinio por fin de semana, en millones. */
  sponsor: number;
}

export interface Driver {
  id: string;
  series: SeriesId;
  teamId: string;
  first: string;
  last: string;
  code: string;
  number: number;
  nat: string;
  age: number;
  pace: number;
  racecraft: number;
  consistency: number;
  tyre: number;
  wet: number;
  feedback: number;
  aggression: number;
  start: number;
}

export interface Circuit {
  id: string;
  name: string;
  city: string;
  country: string;
  nat: string;
  lengthKm: number;
  /** Vueltas de un GP de F1. */
  laps: number;
  /** Tiempo base por vuelta en seco de un F1 2026 (s). */
  lap: number;
  /** Facilidad para adelantar, 0..1. */
  overtaking: number;
  /** Multiplicador de desgaste de neumáticos. */
  wear: number;
  /** Sensibilidad a la potencia, 0..1. */
  power: number;
  /** Carga aerodinámica necesaria, 0..1. */
  downforce: number;
  /** Tiempo perdido al pasar por boxes (s). */
  pitLoss: number;
  /** Probabilidad base de lluvia por sesión. */
  rain: number;
  temp: [number, number];
  /** Propensión a safety car, 0..1. */
  sc: number;
  street: boolean;
  shape: [number, number][];
}

export interface SeriesEntry {
  round: number;
  name: string;
  sprint?: boolean;
}

export interface Weekend {
  id: string;
  circuitId: string;
  /** Fecha de la carrera principal (AAAA-MM-DD). */
  date: string;
  f1?: SeriesEntry;
  f2?: SeriesEntry;
  f3?: SeriesEntry;
}

export type RaceKind = "race" | "sprint" | "feature";
export type SessionKind = "practice" | "quali" | "sprintQuali" | RaceKind;

export interface SessionDef {
  key: string;
  kind: SessionKind;
  label: string;
}

export interface WeatherPlan {
  airTemp: number;
  trackTemp: number;
  initialWetness: number;
  /** Intensidad de lluvia (0..1) muestreada uniformemente sobre la sesión. */
  rain: number[];
  /** Nubosidad (0..1) muestreada uniformemente sobre la sesión. */
  cloud: number[];
  /** Probabilidad de lluvia pronosticada para cada cuarto de la sesión. */
  forecast: number[];
  /** Duración estimada de la sesión, en minutos. */
  minutes: number;
}

export interface ClassEntry {
  driverId: string;
  teamId: string;
  pos: number;
  grid: number;
  status: "FIN" | "DNF";
  reason?: string;
  laps: number;
  time: number;
  gap: string;
  points: number;
  pits: number;
  bestLap: number;
  penalty: number;
  fastest?: boolean;
  pole?: boolean;
}

export interface RaceResult {
  series: SeriesId;
  weekendId: string;
  round: number;
  kind: RaceKind;
  name: string;
  circuitId: string;
  laps: number;
  weather: string;
  entries: ClassEntry[];
  fastestLap?: { driverId: string; time: number; lap: number };
  poleId?: string;
  scLaps: number;
}

export interface QualiEntry {
  driverId: string;
  teamId: string;
  time: number | null;
  segment: number;
  compound: Compound;
  note?: string;
}

export interface QualiResult {
  key: string;
  order: QualiEntry[];
}

export interface SetupValues {
  aero: number;
  susp: number;
  gear: number;
}

export interface PracticeRun {
  values: SetupValues;
  time: number;
  feedback: string[];
  quality: number;
}

export interface SetupState {
  values: SetupValues;
  optimum: SetupValues;
  runsLeft: number;
  runs: PracticeRun[];
  quality: number;
}

export interface WeekendState {
  weekendIndex: number;
  series: SeriesId;
  sessions: SessionDef[];
  step: number;
  weather: Record<string, WeatherPlan>;
  setup: Record<string, SetupState>;
  aiSetup: Record<string, number>;
  quali: Record<string, QualiResult>;
  grids: Record<string, string[]>;
  results: RaceResult[];
}

export type ProjectArea = "aero" | "chassis" | "engine" | "reliability";

export interface Project {
  id: string;
  area: ProjectArea;
  tier: number;
  cost: number;
  weeksTotal: number;
  weeksLeft: number;
  gainMin: number;
  gainMax: number;
}

export interface FinanceEntry {
  weekendIndex: number;
  label: string;
  amount: number;
}

export interface NewsItem {
  id: string;
  date: string;
  series?: SeriesId;
  title: string;
  body?: string;
}

export interface ChampionRecord {
  year: number;
  f1: { driver: string; team: string };
  f2: { driver: string; team: string };
  f3: { driver: string; team: string };
}

export interface GameState {
  version: number;
  year: number;
  seed: number;
  manager: string;
  player: { series: SeriesId; teamId: string };
  teams: Record<string, Team>;
  drivers: Record<string, Driver>;
  pus: Record<string, PowerUnit>;
  calendar: Weekend[];
  nextWeekend: number;
  results: RaceResult[];
  projects: Project[];
  finance: FinanceEntry[];
  news: NewsItem[];
  weekend: WeekendState | null;
  history: ChampionRecord[];
  settings: { autoPause: boolean; defaultSpeed: number };
  /** Presente solo en un fin de semana rápido (fuera del modo carrera). */
  quick?: QuickConfig;
}

export interface QuickConfig {
  series: SeriesId;
  teamId: string;
  circuitId: string;
  sprint: boolean;
  weather: "random" | "dry" | "wet" | "mixed";
  skipPractice: boolean;
}
