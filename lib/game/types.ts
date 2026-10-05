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
  /** Equipo actual; "" si es agente libre (sin asiento esta temporada). */
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
  /** Techo de ritmo que puede alcanzar con la experiencia. */
  potential: number;
  /** Salario por temporada (M€). En F2 y F3 suele ser negativo: el piloto aporta patrocinio. */
  salary: number;
  /** Última temporada de su contrato actual. */
  contractUntil: number;
  /** Fichaje cerrado para la próxima temporada (puede ser su propio equipo si ha renovado). */
  next?: { teamId: string; salary: number; until: number };
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
  /** Tandas que quedan en la sesión de libres en curso. */
  runsLeft: number;
  runs: PracticeRun[];
  quality: number;
}

/** Juego de neumáticos de la asignación del fin de semana. */
export interface TyreSet {
  id: string;
  compound: Compound;
  /** Desgaste acumulado (0..100). */
  wear: number;
  /** Ya ha rodado: pierde el pico de agarre de un juego nuevo. */
  used: boolean;
}

/** Lo aprendido en las tandas largas de libres: reduce el desgaste en carrera. */
export interface LongRunData {
  compound: Compound;
  laps: number;
  /** Desgaste medido por vuelta (%). */
  wearPerLap: number;
}

/** Plan de estrategia: compuesto de salida y paradas (al final de la vuelta `lap`). */
export interface StrategyPlan {
  name: string;
  start: Compound;
  stops: { lap: number; compound: Compound }[];
}

/** Planes de un piloto para una carrera y el que está activo. */
export interface DriverStrategies {
  plans: StrategyPlan[];
  active: number;
  /** Juego de salida elegido (si no, el menos gastado del compuesto de salida). */
  startSetId?: string;
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
  /** Tandas de clasificación ya disputadas (para reanudar una clasificación a medias). */
  qualiProgress?: Record<string, QualiEntry[][]>;
  grids: Record<string, string[]>;
  results: RaceResult[];
  /** Juegos de neumáticos de los pilotos del jugador. */
  tyres: Record<string, TyreSet[]>;
  /** Tandas largas de los pilotos del jugador. */
  longRuns: Record<string, LongRunData[]>;
  /** Puestos de sanción en la parrilla del Gran Premio (por cambiar componentes, etc.). */
  gridPenalty: Record<string, { places: number; reason: string }>;
  /** Estrategias preparadas por carrera (clave de sesión) y piloto. */
  strategies?: Record<string, Record<string, DriverStrategies>>;
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

export interface BoardState {
  /** Confianza de la junta directiva (0..100). Por debajo de cierto nivel, despido. */
  confidence: number;
  /** Puesto mínimo en el campeonato de equipos que exige la junta esta temporada. */
  target: number;
  /** Puesto que se esperaba del equipo al empezar la temporada (referencia de cada fin de semana). */
  expected: number;
  /** Variación de confianza tras el último fin de semana. */
  lastDelta: number;
  /** Ya se ha avisado al mánager de que su puesto peligra. */
  warned: boolean;
}

export interface JobOffer {
  teamId: string;
  reason: string;
}

export type StaffRole = "technical" | "engineer" | "pitChief";

export interface StaffMember {
  id: string;
  name: string;
  nat: string;
  age: number;
  role: StaffRole;
  rating: number;
  /** Salario por temporada (M€). */
  salary: number;
  contractUntil: number;
}

export type SponsorTier = "title" | "major" | "minor";
export type SponsorGoal = "points" | "doublePoints" | "podium" | "win" | "bothFinish" | "beatRival";

export interface Sponsor {
  id: string;
  name: string;
  tier: SponsorTier;
  /** Pago fijo por fin de semana (M€). */
  perRace: number;
  /** Prima por cumplir el objetivo en la carrera principal del fin de semana. */
  goal: SponsorGoal;
  bonus: number;
  /** Última temporada del acuerdo. */
  until: number;
}

export type ComponentKind = "ice" | "turbo" | "ers" | "gearbox";

export interface ComponentState {
  /** Unidades introducidas esta temporada (incluida la montada). */
  used: number;
  /** Desgaste de la unidad montada (100 = fin de su vida útil prevista). */
  wear: number;
}

export interface CareerRecord {
  year: number;
  teamId: string;
  teamName: string;
  series: SeriesId;
  pos: number;
  target: number;
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
  board: BoardState;
  /** Ofertas de trabajo de otros equipos (al acabar la temporada o tras un despido). */
  offers: JobOffer[];
  /** El mánager ha sido despedido y busca equipo. */
  sacked: boolean;
  career: CareerRecord[];
  staff: Record<StaffRole, StaffMember>;
  staffMarket: StaffMember[];
  sponsors: Sponsor[];
  sponsorOffers: Sponsor[];
  /** Componentes de la unidad de potencia de los pilotos del jugador (solo F1). */
  components: Record<string, Record<ComponentKind, ComponentState>>;
  /** Contador para generar identificadores únicos (pilotos nuevos, personal, patrocinadores). */
  uid: number;
  /** Temporada en la que los equipos rivales ya han decidido sus renovaciones (abre el mercado). */
  marketYear: number;
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
