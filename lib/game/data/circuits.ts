import { circuitShape } from "../geo";
import type { Circuit } from "../types";

type Row = Omit<Circuit, "shape">;

// Datos deportivos de cada circuito. El trazado real se toma de ./geo.ts.
const ROWS: Row[] = [
  {
    id: "albert_park", name: "Albert Park Circuit", city: "Melbourne", country: "Australia", nat: "AUS",
    lengthKm: 5.278, laps: 58, lap: 82, overtaking: 0.35, wear: 0.9, power: 0.5, downforce: 0.55, pitLoss: 19,
    rain: 0.2, temp: [16, 26], sc: 0.6, street: false,
  },
  {
    id: "shanghai", name: "Shanghai International Circuit", city: "Shanghái", country: "China", nat: "CHN",
    lengthKm: 5.451, laps: 56, lap: 96, overtaking: 0.5, wear: 1.15, power: 0.45, downforce: 0.55, pitLoss: 22,
    rain: 0.25, temp: [14, 24], sc: 0.35, street: false,
  },
  {
    id: "suzuka", name: "Suzuka International Racing Course", city: "Suzuka", country: "Japón", nat: "JPN",
    lengthKm: 5.807, laps: 53, lap: 93, overtaking: 0.25, wear: 1.2, power: 0.45, downforce: 0.75, pitLoss: 22,
    rain: 0.3, temp: [14, 24], sc: 0.35, street: false,
  },
  {
    id: "miami", name: "Miami International Autodrome", city: "Miami", country: "Estados Unidos", nat: "USA",
    lengthKm: 5.412, laps: 57, lap: 91, overtaking: 0.4, wear: 1.0, power: 0.6, downforce: 0.45, pitLoss: 20,
    rain: 0.25, temp: [26, 32], sc: 0.5, street: false,
  },
  {
    id: "montreal", name: "Circuit Gilles Villeneuve", city: "Montreal", country: "Canadá", nat: "CAN",
    lengthKm: 4.361, laps: 70, lap: 76, overtaking: 0.5, wear: 0.9, power: 0.7, downforce: 0.3, pitLoss: 18,
    rain: 0.3, temp: [16, 26], sc: 0.6, street: false,
  },
  {
    id: "monaco", name: "Circuit de Monaco", city: "Montecarlo", country: "Mónaco", nat: "MON",
    lengthKm: 3.337, laps: 78, lap: 75, overtaking: 0.04, wear: 0.6, power: 0.1, downforce: 1.0, pitLoss: 20,
    rain: 0.15, temp: [19, 25], sc: 0.7, street: true,
  },
  {
    id: "barcelona", name: "Circuit de Barcelona-Catalunya", city: "Montmeló", country: "España", nat: "ESP",
    lengthKm: 4.657, laps: 66, lap: 79, overtaking: 0.25, wear: 1.25, power: 0.4, downforce: 0.8, pitLoss: 21,
    rain: 0.12, temp: [20, 30], sc: 0.25, street: false,
  },
  {
    id: "red_bull_ring", name: "Red Bull Ring", city: "Spielberg", country: "Austria", nat: "AUT",
    lengthKm: 4.318, laps: 71, lap: 68, overtaking: 0.55, wear: 1.0, power: 0.6, downforce: 0.45, pitLoss: 20,
    rain: 0.3, temp: [18, 30], sc: 0.35, street: false,
  },
  {
    id: "silverstone", name: "Silverstone Circuit", city: "Silverstone", country: "Reino Unido", nat: "GBR",
    lengthKm: 5.891, laps: 52, lap: 90, overtaking: 0.45, wear: 1.25, power: 0.4, downforce: 0.7, pitLoss: 20,
    rain: 0.35, temp: [15, 25], sc: 0.35, street: false,
  },
  {
    id: "spa", name: "Circuit de Spa-Francorchamps", city: "Stavelot", country: "Bélgica", nat: "BEL",
    lengthKm: 7.004, laps: 44, lap: 108, overtaking: 0.6, wear: 1.1, power: 0.65, downforce: 0.35, pitLoss: 18,
    rain: 0.45, temp: [13, 23], sc: 0.45, street: false,
  },
  {
    id: "hungaroring", name: "Hungaroring", city: "Mogyoród", country: "Hungría", nat: "HUN",
    lengthKm: 4.381, laps: 70, lap: 81, overtaking: 0.15, wear: 1.05, power: 0.25, downforce: 0.9, pitLoss: 20,
    rain: 0.2, temp: [24, 34], sc: 0.3, street: false,
  },
  {
    id: "zandvoort", name: "Circuit Zandvoort", city: "Zandvoort", country: "Países Bajos", nat: "NED",
    lengthKm: 4.259, laps: 72, lap: 74, overtaking: 0.12, wear: 1.05, power: 0.3, downforce: 0.85, pitLoss: 21,
    rain: 0.35, temp: [16, 24], sc: 0.4, street: false,
  },
  {
    id: "monza", name: "Autodromo Nazionale Monza", city: "Monza", country: "Italia", nat: "ITA",
    lengthKm: 5.793, laps: 53, lap: 84, overtaking: 0.6, wear: 0.85, power: 0.9, downforce: 0.1, pitLoss: 24,
    rain: 0.2, temp: [20, 30], sc: 0.35, street: false,
  },
  {
    id: "madring", name: "Madring", city: "Madrid", country: "España", nat: "ESP",
    lengthKm: 5.474, laps: 57, lap: 90, overtaking: 0.35, wear: 1.0, power: 0.5, downforce: 0.6, pitLoss: 21,
    rain: 0.1, temp: [18, 30], sc: 0.6, street: true,
  },
  {
    id: "baku", name: "Baku City Circuit", city: "Bakú", country: "Azerbaiyán", nat: "AZE",
    lengthKm: 6.003, laps: 51, lap: 106, overtaking: 0.55, wear: 0.8, power: 0.8, downforce: 0.3, pitLoss: 20,
    rain: 0.08, temp: [18, 26], sc: 0.75, street: true,
  },
  {
    id: "sepang", name: "Sepang International Circuit", city: "Sepang", country: "Malasia", nat: "MAS",
    lengthKm: 5.543, laps: 56, lap: 98, overtaking: 0.5, wear: 1.25, power: 0.5, downforce: 0.6, pitLoss: 21,
    rain: 0.6, temp: [28, 34], sc: 0.3, street: false,
  },
  {
    id: "marina_bay", name: "Marina Bay Street Circuit", city: "Singapur", country: "Singapur", nat: "SGP",
    lengthKm: 4.927, laps: 62, lap: 96, overtaking: 0.12, wear: 1.0, power: 0.3, downforce: 0.95, pitLoss: 28,
    rain: 0.35, temp: [27, 31], sc: 0.85, street: true,
  },
  {
    id: "cota", name: "Circuit of the Americas", city: "Austin", country: "Estados Unidos", nat: "USA",
    lengthKm: 5.513, laps: 56, lap: 99, overtaking: 0.45, wear: 1.15, power: 0.5, downforce: 0.65, pitLoss: 21,
    rain: 0.15, temp: [20, 30], sc: 0.4, street: false,
  },
  {
    id: "mexico", name: "Autódromo Hermanos Rodríguez", city: "Ciudad de México", country: "México", nat: "MEX",
    lengthKm: 4.304, laps: 71, lap: 81, overtaking: 0.4, wear: 0.95, power: 0.6, downforce: 0.6, pitLoss: 22,
    rain: 0.15, temp: [18, 26], sc: 0.45, street: false,
  },
  {
    id: "interlagos", name: "Autódromo José Carlos Pace", city: "São Paulo", country: "Brasil", nat: "BRA",
    lengthKm: 4.309, laps: 71, lap: 74, overtaking: 0.5, wear: 1.0, power: 0.55, downforce: 0.5, pitLoss: 21,
    rain: 0.4, temp: [18, 28], sc: 0.55, street: false,
  },
  {
    id: "las_vegas", name: "Las Vegas Strip Circuit", city: "Las Vegas", country: "Estados Unidos", nat: "USA",
    lengthKm: 6.201, laps: 50, lap: 97, overtaking: 0.55, wear: 0.8, power: 0.85, downforce: 0.2, pitLoss: 21,
    rain: 0.03, temp: [10, 18], sc: 0.55, street: true,
  },
  {
    id: "lusail", name: "Lusail International Circuit", city: "Lusail", country: "Catar", nat: "QAT",
    lengthKm: 5.419, laps: 57, lap: 86, overtaking: 0.35, wear: 1.35, power: 0.45, downforce: 0.7, pitLoss: 25,
    rain: 0.02, temp: [24, 32], sc: 0.3, street: false,
  },
  {
    id: "yas_marina", name: "Yas Marina Circuit", city: "Abu Dabi", country: "Emiratos Árabes Unidos", nat: "UAE",
    lengthKm: 5.281, laps: 58, lap: 89, overtaking: 0.35, wear: 0.85, power: 0.55, downforce: 0.6, pitLoss: 21,
    rain: 0.02, temp: [26, 32], sc: 0.3, street: false,
  },
];

export const CIRCUITS: Record<string, Circuit> = Object.fromEntries(
  ROWS.map((r) => [r.id, { ...r, shape: circuitShape(r.id) }]),
);
