import type { Driver, PowerUnit, SeriesId, Team } from "../types";

export const POWER_UNITS: PowerUnit[] = [
  { id: "mercedes", name: "Mercedes-AMG F1 M17", power: 96, reliability: 90, worksTeam: "mercedes" },
  { id: "ferrari", name: "Ferrari 067/6", power: 91, reliability: 86, worksTeam: "ferrari" },
  { id: "rbford", name: "Red Bull Ford DM01", power: 87, reliability: 80, worksTeam: "red_bull" },
  { id: "honda", name: "Honda RA626H", power: 74, reliability: 66, worksTeam: "aston_martin" },
  { id: "audi", name: "Audi AFR 26 Hybrid", power: 82, reliability: 76, worksTeam: "audi" },
];

type TeamRow = [
  id: string,
  name: string,
  short: string,
  color: string,
  accent: string,
  country: string,
  aero: number,
  chassis: number,
  reliability: number,
  pitCrew: number,
  engineering: number,
  factory: number,
  budget: number,
  sponsor: number,
  pu?: string,
];

function teams(series: SeriesId, engine: number, rows: TeamRow[]): Team[] {
  return rows.map(([id, name, short, color, accent, country, aero, chassis, reliability, pitCrew, engineering, factory, budget, sponsor, pu]) => ({
    id,
    series,
    name,
    short,
    color,
    accent,
    country,
    pu,
    car: { aero, chassis, engine, reliability },
    pitCrew,
    engineering,
    factory,
    budget,
    sponsor,
  }));
}

export const F1_TEAMS = teams("f1", 0, [
  ["mercedes", "Mercedes-AMG Petronas F1 Team", "Mercedes", "#27F4D2", "#0b0b0b", "GER", 94, 93, 90, 88, 92, 92, 55, 6.0, "mercedes"],
  ["ferrari", "Scuderia Ferrari HP", "Ferrari", "#E8002D", "#FFEB3B", "ITA", 92, 91, 87, 92, 88, 90, 55, 6.5, "ferrari"],
  ["mclaren", "McLaren Mastercard F1 Team", "McLaren", "#FF8000", "#0b0b0b", "GBR", 87, 88, 88, 94, 92, 92, 55, 6.2, "mercedes"],
  ["red_bull", "Oracle Red Bull Racing", "Red Bull", "#3671C6", "#CC1E4A", "AUT", 90, 89, 84, 95, 92, 90, 52, 6.0, "rbford"],
  ["racing_bulls", "Visa Cash App Racing Bulls F1 Team", "Racing Bulls", "#6692FF", "#FFFFFF", "ITA", 82, 82, 82, 84, 80, 78, 32, 3.4, "rbford"],
  ["alpine", "BWT Alpine F1 Team", "Alpine", "#0093CC", "#FF87BC", "FRA", 76, 76, 82, 80, 79, 80, 36, 3.6, "mercedes"],
  ["haas", "TGR Haas F1 Team", "Haas", "#B6BABD", "#E10600", "USA", 78, 78, 82, 80, 76, 72, 28, 3.0, "ferrari"],
  ["williams", "Atlassian Williams F1 Team", "Williams", "#64C4FF", "#041E42", "GBR", 71, 72, 84, 82, 80, 80, 34, 3.4, "mercedes"],
  ["audi", "Audi Revolut F1 Team", "Audi", "#5A5F66", "#FF1E00", "GER", 79, 79, 78, 78, 80, 85, 48, 4.2, "audi"],
  ["aston_martin", "Aston Martin Aramco F1 Team", "Aston Martin", "#229971", "#CEDC00", "GBR", 82, 80, 74, 84, 85, 92, 50, 4.6, "honda"],
  ["cadillac", "Cadillac Formula 1 Team", "Cadillac", "#F2F2F2", "#111111", "USA", 70, 71, 78, 76, 74, 76, 40, 3.8, "ferrari"],
]);

export const F2_TEAMS = teams("f2", 85, [
  ["f2_invicta", "Invicta Racing", "Invicta", "#C6FF00", "#1b1b1b", "GBR", 88, 88, 86, 84, 88, 84, 2.6, 0.42],
  ["f2_hitech", "Hitech", "Hitech", "#9CA3AF", "#E11D48", "GBR", 82, 82, 84, 82, 82, 82, 2.4, 0.38],
  ["f2_campos", "Campos Racing", "Campos", "#FF7A00", "#1E3A8A", "ESP", 89, 88, 86, 86, 89, 84, 2.6, 0.42],
  ["f2_dams", "DAMS Lucas Oil", "DAMS", "#1D4ED8", "#FACC15", "FRA", 85, 85, 84, 82, 85, 82, 2.4, 0.38],
  ["f2_mp", "MP Motorsport", "MP", "#F43F5E", "#FFFFFF", "NED", 86, 86, 85, 84, 86, 84, 2.5, 0.4],
  ["f2_prema", "PREMA Racing", "PREMA", "#DC2626", "#FFFFFF", "ITA", 80, 81, 84, 84, 80, 84, 2.5, 0.4],
  ["f2_rodin", "Rodin Motorsport", "Rodin", "#D4A017", "#0b0b0b", "NZL", 88, 87, 85, 84, 88, 82, 2.5, 0.4],
  ["f2_art", "ART Grand Prix", "ART", "#F5F5F5", "#DC2626", "FRA", 85, 85, 85, 84, 85, 84, 2.5, 0.4],
  ["f2_aix", "AIX Racing", "AIX", "#7C3AED", "#FFFFFF", "UAE", 78, 78, 82, 78, 78, 78, 2.2, 0.34],
  ["f2_var", "Van Amersfoort Racing", "VAR", "#0EA5E9", "#F97316", "NED", 80, 80, 83, 80, 80, 80, 2.2, 0.34],
  ["f2_trident", "Trident", "Trident", "#60A5FA", "#0B1F4D", "ITA", 83, 83, 84, 82, 83, 82, 2.3, 0.36],
]);

export const F3_TEAMS = teams("f3", 85, [
  ["f3_campos", "Campos Racing", "Campos", "#FF7A00", "#1E3A8A", "ESP", 88, 88, 86, 84, 88, 84, 1.3, 0.2],
  ["f3_trident", "Trident", "Trident", "#60A5FA", "#0B1F4D", "ITA", 85, 86, 85, 84, 86, 82, 1.2, 0.19],
  ["f3_mp", "MP Motorsport", "MP", "#F43F5E", "#FFFFFF", "NED", 85, 85, 85, 84, 85, 84, 1.2, 0.19],
  ["f3_art", "ART Grand Prix", "ART", "#F5F5F5", "#DC2626", "FRA", 84, 84, 85, 84, 84, 84, 1.2, 0.19],
  ["f3_var", "Van Amersfoort Racing", "VAR", "#0EA5E9", "#F97316", "NED", 83, 83, 84, 80, 83, 80, 1.1, 0.17],
  ["f3_rodin", "Rodin Motorsport", "Rodin", "#D4A017", "#0b0b0b", "NZL", 83, 83, 84, 82, 83, 82, 1.1, 0.17],
  ["f3_prema", "PREMA Racing", "PREMA", "#DC2626", "#FFFFFF", "ITA", 80, 80, 84, 84, 80, 84, 1.2, 0.19],
  ["f3_hitech", "Hitech", "Hitech", "#9CA3AF", "#E11D48", "GBR", 79, 79, 84, 82, 79, 82, 1.1, 0.17],
  ["f3_dams", "DAMS Lucas Oil", "DAMS", "#1D4ED8", "#FACC15", "FRA", 79, 79, 83, 80, 79, 80, 1.0, 0.16],
  ["f3_aix", "AIX Racing", "AIX", "#7C3AED", "#FFFFFF", "UAE", 77, 77, 82, 78, 77, 78, 1.0, 0.15],
]);

type DriverRow = [
  id: string,
  teamId: string,
  first: string,
  last: string,
  code: string,
  number: number,
  nat: string,
  age: number,
  pace: number,
  racecraft: number,
  consistency: number,
  tyre: number,
  wet: number,
  feedback: number,
  aggression: number,
  start: number,
];

function drivers(series: SeriesId, rows: DriverRow[]): Driver[] {
  return rows.map(([id, teamId, first, last, code, number, nat, age, pace, racecraft, consistency, tyre, wet, feedback, aggression, start]) => ({
    id,
    series,
    teamId,
    first,
    last,
    code,
    number,
    nat,
    age,
    pace,
    racecraft,
    consistency,
    tyre,
    wet,
    feedback,
    aggression,
    start,
  }));
}

export const F1_DRIVERS = drivers("f1", [
  ["norris", "mclaren", "Lando", "Norris", "NOR", 1, "GBR", 26, 93, 89, 88, 90, 88, 88, 62, 84],
  ["piastri", "mclaren", "Oscar", "Piastri", "PIA", 81, "AUS", 25, 92, 89, 89, 91, 85, 86, 60, 86],
  ["leclerc", "ferrari", "Charles", "Leclerc", "LEC", 16, "MON", 28, 95, 90, 87, 87, 88, 86, 66, 85],
  ["hamilton", "ferrari", "Lewis", "Hamilton", "HAM", 44, "GBR", 41, 91, 93, 90, 93, 95, 95, 58, 86],
  ["verstappen", "red_bull", "Max", "Verstappen", "VER", 3, "NED", 28, 98, 97, 95, 92, 98, 94, 76, 90],
  ["hadjar", "red_bull", "Isack", "Hadjar", "HAD", 6, "FRA", 21, 86, 84, 83, 83, 82, 80, 68, 82],
  ["russell", "mercedes", "George", "Russell", "RUS", 63, "GBR", 28, 93, 90, 91, 89, 90, 90, 64, 86],
  ["antonelli", "mercedes", "Kimi", "Antonelli", "ANT", 12, "ITA", 19, 93, 88, 87, 88, 89, 82, 70, 84],
  ["alonso", "aston_martin", "Fernando", "Alonso", "ALO", 14, "ESP", 44, 90, 95, 92, 92, 93, 96, 70, 92],
  ["stroll", "aston_martin", "Lance", "Stroll", "STR", 18, "CAN", 27, 78, 78, 76, 80, 82, 76, 60, 86],
  ["gasly", "alpine", "Pierre", "Gasly", "GAS", 10, "FRA", 30, 86, 85, 84, 85, 84, 84, 58, 82],
  ["colapinto", "alpine", "Franco", "Colapinto", "COL", 43, "ARG", 22, 81, 82, 76, 79, 77, 76, 72, 80],
  ["albon", "williams", "Alexander", "Albon", "ALB", 23, "THA", 30, 86, 86, 86, 86, 82, 86, 56, 82],
  ["sainz", "williams", "Carlos", "Sainz", "SAI", 55, "ESP", 31, 88, 88, 88, 90, 85, 92, 62, 84],
  ["lawson", "racing_bulls", "Liam", "Lawson", "LAW", 30, "NZL", 24, 83, 84, 80, 81, 82, 78, 74, 80],
  ["lindblad", "racing_bulls", "Arvid", "Lindblad", "LIN", 41, "GBR", 18, 82, 82, 79, 79, 78, 74, 68, 82],
  ["ocon", "haas", "Esteban", "Ocon", "OCO", 31, "FRA", 29, 84, 85, 84, 85, 86, 82, 66, 82],
  ["bearman", "haas", "Oliver", "Bearman", "BEA", 87, "GBR", 20, 84, 83, 80, 81, 80, 78, 66, 82],
  ["hulkenberg", "audi", "Nico", "Hülkenberg", "HUL", 27, "GER", 38, 85, 84, 87, 84, 84, 88, 52, 80],
  ["bortoleto", "audi", "Gabriel", "Bortoleto", "BOR", 5, "BRA", 21, 83, 82, 82, 82, 80, 80, 60, 80],
  ["perez", "cadillac", "Sergio", "Pérez", "PER", 11, "MEX", 36, 82, 84, 78, 89, 82, 84, 64, 82],
  ["bottas", "cadillac", "Valtteri", "Bottas", "BOT", 77, "FIN", 36, 84, 81, 85, 84, 80, 88, 50, 86],
]);

export const F2_DRIVERS = drivers("f2", [
  ["f2_camara", "f2_invicta", "Rafael", "Câmara", "CAM", 1, "BRA", 20, 90, 87, 86, 86, 84, 80, 66, 84],
  ["f2_durksen", "f2_invicta", "Joshua", "Dürksen", "DUR", 2, "PAR", 22, 82, 82, 79, 80, 80, 76, 70, 80],
  ["f2_miyata", "f2_hitech", "Ritomo", "Miyata", "MIY", 3, "JPN", 26, 80, 80, 82, 82, 82, 82, 56, 80],
  ["f2_herta", "f2_hitech", "Colton", "Herta", "HER", 4, "USA", 26, 79, 82, 76, 78, 76, 84, 68, 76],
  ["f2_leon", "f2_campos", "Noel", "León", "LEO", 5, "MEX", 21, 84, 83, 82, 83, 80, 78, 64, 82],
  ["f2_tsolov", "f2_campos", "Nikola", "Tsolov", "TSO", 6, "BUL", 19, 89, 87, 83, 84, 84, 78, 72, 84],
  ["f2_beganovic", "f2_dams", "Dino", "Beganovic", "BEG", 7, "SWE", 22, 84, 83, 83, 83, 82, 80, 62, 82],
  ["f2_bilinski", "f2_dams", "Roman", "Bilinski", "BIL", 8, "POL", 22, 78, 78, 77, 78, 78, 74, 62, 80],
  ["f2_mini", "f2_mp", "Gabriele", "Minì", "MIN", 9, "ITA", 21, 86, 84, 84, 84, 82, 80, 60, 82],
  ["f2_goethe", "f2_mp", "Oliver", "Goethe", "GOE", 10, "GER", 21, 78, 78, 77, 78, 78, 74, 62, 80],
  ["f2_montoya", "f2_prema", "Sebastián", "Montoya", "MON", 11, "COL", 21, 78, 77, 77, 78, 78, 76, 62, 78],
  ["f2_boya", "f2_prema", "Mari", "Boya", "BOY", 12, "ESP", 21, 77, 77, 76, 77, 80, 74, 64, 78],
  ["f2_stenshorne", "f2_rodin", "Martinius", "Stenshorne", "STE", 14, "NOR", 20, 83, 82, 82, 82, 82, 78, 62, 82],
  ["f2_dunne", "f2_rodin", "Alex", "Dunne", "DUN", 15, "IRL", 20, 89, 87, 82, 84, 84, 80, 74, 84],
  ["f2_maini", "f2_art", "Kush", "Maini", "MAI", 16, "IND", 25, 82, 82, 81, 82, 80, 80, 62, 80],
  ["f2_inthraphuvasak", "f2_art", "Tasanapol", "Inthraphuvasak", "INT", 17, "THA", 20, 80, 80, 79, 80, 80, 74, 64, 80],
  ["f2_fittipaldi", "f2_aix", "Emerson", "Fittipaldi Jr.", "FIT", 20, "BRA", 19, 77, 77, 76, 77, 76, 72, 64, 78],
  ["f2_shields", "f2_aix", "Cian", "Shields", "SHI", 21, "GBR", 22, 74, 75, 75, 76, 76, 72, 60, 76],
  ["f2_varrone", "f2_var", "Nicolás", "Varrone", "VAR", 22, "ARG", 25, 76, 78, 76, 78, 78, 80, 66, 78],
  ["f2_villagomez", "f2_var", "Rafael", "Villagómez", "VIL", 23, "MEX", 24, 78, 79, 78, 79, 78, 78, 60, 80],
  ["f2_vanhoepen", "f2_trident", "Laurens", "van Hoepen", "VHO", 24, "NED", 20, 82, 82, 80, 81, 80, 76, 64, 80],
  ["f2_bennett", "f2_trident", "John", "Bennett", "BEN", 25, "GBR", 22, 79, 78, 78, 79, 78, 76, 62, 78],
]);

export const F3_DRIVERS = drivers("f3", [
  ["f3_nael", "f3_campos", "Théophile", "Naël", "NAE", 1, "FRA", 19, 84, 83, 82, 83, 80, 78, 62, 82],
  ["f3_ugochukwu", "f3_campos", "Ugo", "Ugochukwu", "UGO", 2, "USA", 19, 90, 87, 86, 85, 84, 80, 66, 84],
  ["f3_rivera", "f3_campos", "Ernesto", "Rivera", "RIV", 3, "MEX", 19, 84, 83, 81, 82, 80, 76, 66, 82],
  ["f3_stromsted", "f3_trident", "Noah", "Strømsted", "STR", 4, "DEN", 17, 82, 81, 79, 80, 80, 74, 66, 80],
  ["f3_slater", "f3_trident", "Freddie", "Slater", "SLA", 5, "GBR", 17, 90, 86, 84, 84, 84, 78, 70, 84],
  ["f3_depalo", "f3_trident", "Matteo", "De Palo", "DEP", 6, "ITA", 18, 76, 76, 76, 77, 76, 72, 62, 78],
  ["f3_colnaghi", "f3_mp", "Mattia", "Colnaghi", "COL", 7, "ARG", 18, 81, 80, 79, 80, 80, 74, 66, 80],
  ["f3_taponen", "f3_mp", "Tuukka", "Taponen", "TAP", 8, "FIN", 19, 87, 85, 82, 83, 82, 78, 68, 82],
  ["f3_giusti", "f3_mp", "Alessandro", "Giusti", "GIU", 9, "FRA", 18, 79, 79, 78, 79, 78, 74, 62, 80],
  ["f3_kato", "f3_art", "Taito", "Kato", "KAT", 10, "JPN", 19, 86, 84, 83, 83, 82, 78, 62, 82],
  ["f3_gladysz", "f3_art", "Maciej", "Gładysz", "GLA", 11, "POL", 18, 80, 80, 79, 80, 78, 74, 62, 80],
  ["f3_le", "f3_art", "Kanato", "Le", "KLE", 12, "JPN", 18, 77, 77, 77, 78, 78, 72, 60, 78],
  ["f3_yamakoshi", "f3_var", "Hiyu", "Yamakoshi", "YAM", 14, "JPN", 19, 82, 82, 81, 81, 80, 76, 62, 80],
  ["f3_deligny", "f3_var", "Enzo", "Deligny", "DEL", 15, "FRA", 17, 79, 79, 78, 79, 78, 72, 64, 80],
  ["f3_delpino", "f3_var", "Bruno", "del Pino", "DPI", 16, "ESP", 18, 80, 80, 79, 80, 80, 74, 64, 80],
  ["f3_clerot", "f3_rodin", "Pedro", "Clerot", "CLE", 17, "BRA", 19, 84, 83, 82, 82, 80, 76, 64, 82],
  ["f3_badoer", "f3_rodin", "Brando", "Badoer", "BAD", 18, "ITA", 20, 82, 82, 81, 81, 80, 76, 62, 80],
  ["f3_ho", "f3_rodin", "Christian", "Ho", "CHO", 19, "SGP", 21, 74, 75, 76, 76, 76, 74, 58, 78],
  ["f3_sharp", "f3_prema", "Louis", "Sharp", "SHA", 20, "NZL", 19, 79, 79, 77, 78, 78, 74, 64, 80],
  ["f3_wharton", "f3_prema", "James", "Wharton", "WHA", 21, "AUS", 19, 79, 79, 78, 79, 78, 74, 64, 80],
  ["f3_garfias", "f3_prema", "José", "Garfias", "GAR", 22, "MEX", 19, 73, 74, 74, 75, 74, 70, 62, 76],
  ["f3_shin", "f3_hitech", "Michael", "Shin", "SHI", 23, "KOR", 18, 72, 73, 73, 74, 74, 70, 62, 76],
  ["f3_mclaughlin", "f3_hitech", "Fionn", "McLaughlin", "MCL", 24, "IRL", 19, 74, 75, 74, 75, 76, 72, 62, 76],
  ["f3_nakamura", "f3_hitech", "Jin", "Nakamura", "NAK", 25, "JPN", 19, 80, 80, 79, 80, 78, 74, 62, 80],
  ["f3_escotto", "f3_aix", "Ricardo", "Escotto", "ESC", 26, "MEX", 20, 73, 74, 74, 75, 74, 72, 64, 76],
  ["f3_david", "f3_aix", "Yevan", "David", "DAV", 27, "SRI", 19, 78, 78, 77, 78, 76, 72, 64, 78],
  ["f3_barrichello", "f3_aix", "Fernando", "Barrichello", "BAR", 28, "BRA", 21, 73, 74, 74, 75, 76, 72, 60, 76],
  ["f3_lacorte", "f3_dams", "Nicola", "Lacorte", "LAC", 29, "ITA", 19, 78, 78, 77, 78, 78, 74, 62, 78],
  ["f3_bhirombhakdi", "f3_dams", "Nandhavud", "Bhirombhakdi", "BHI", 30, "THA", 19, 72, 73, 73, 74, 74, 70, 60, 76],
  ["f3_xie", "f3_dams", "Gerrard", "Xie", "XIE", 31, "CHN", 18, 76, 76, 75, 76, 76, 72, 62, 78],
]);

export const ALL_TEAMS: Team[] = [...F1_TEAMS, ...F2_TEAMS, ...F3_TEAMS];
export const ALL_DRIVERS: Driver[] = [...F1_DRIVERS, ...F2_DRIVERS, ...F3_DRIVERS];

export const SERIES_NAMES: Record<SeriesId, string> = {
  f1: "Fórmula 1",
  f2: "Fórmula 2",
  f3: "Fórmula 3",
};

export const SERIES_SHORT: Record<SeriesId, string> = { f1: "F1", f2: "F2", f3: "F3" };

export const SERIES_COLOR: Record<SeriesId, string> = {
  f1: "#e10600",
  f2: "#0090d0",
  f3: "#7e57c2",
};
