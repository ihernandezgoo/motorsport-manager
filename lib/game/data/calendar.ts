import type { Weekend } from "../types";

// Calendario 2026 tal y como quedó tras la cancelación de Arabia Saudí
// y el traslado del GP de Baréin a Sepang.
export const CALENDAR_2026: Weekend[] = [
  { id: "aus", circuitId: "albert_park", date: "2026-03-08", f1: { round: 1, name: "GP de Australia" }, f2: { round: 1, name: "Ronda de Melbourne" }, f3: { round: 1, name: "Ronda de Melbourne" } },
  { id: "chn", circuitId: "shanghai", date: "2026-03-15", f1: { round: 2, name: "GP de China", sprint: true } },
  { id: "jpn", circuitId: "suzuka", date: "2026-03-29", f1: { round: 3, name: "GP de Japón" } },
  { id: "mia", circuitId: "miami", date: "2026-05-03", f1: { round: 4, name: "GP de Miami", sprint: true }, f2: { round: 2, name: "Ronda de Miami" } },
  { id: "can", circuitId: "montreal", date: "2026-05-24", f1: { round: 5, name: "GP de Canadá", sprint: true }, f2: { round: 3, name: "Ronda de Montreal" } },
  { id: "mon", circuitId: "monaco", date: "2026-06-07", f1: { round: 6, name: "GP de Mónaco" }, f2: { round: 4, name: "Ronda de Montecarlo" }, f3: { round: 2, name: "Ronda de Montecarlo" } },
  { id: "bcn", circuitId: "barcelona", date: "2026-06-14", f1: { round: 7, name: "GP de Barcelona-Cataluña" }, f2: { round: 5, name: "Ronda de Barcelona" }, f3: { round: 3, name: "Ronda de Barcelona" } },
  { id: "aut", circuitId: "red_bull_ring", date: "2026-06-28", f1: { round: 8, name: "GP de Austria" }, f2: { round: 6, name: "Ronda de Spielberg" }, f3: { round: 4, name: "Ronda de Spielberg" } },
  { id: "gbr", circuitId: "silverstone", date: "2026-07-05", f1: { round: 9, name: "GP de Gran Bretaña", sprint: true }, f2: { round: 7, name: "Ronda de Silverstone" }, f3: { round: 5, name: "Ronda de Silverstone" } },
  { id: "bel", circuitId: "spa", date: "2026-07-19", f1: { round: 10, name: "GP de Bélgica" }, f2: { round: 8, name: "Ronda de Spa-Francorchamps" }, f3: { round: 6, name: "Ronda de Spa-Francorchamps" } },
  { id: "hun", circuitId: "hungaroring", date: "2026-07-26", f1: { round: 11, name: "GP de Hungría" }, f2: { round: 9, name: "Ronda de Budapest" }, f3: { round: 7, name: "Ronda de Budapest" } },
  { id: "ned", circuitId: "zandvoort", date: "2026-08-23", f1: { round: 12, name: "GP de los Países Bajos", sprint: true } },
  { id: "ita", circuitId: "monza", date: "2026-09-06", f1: { round: 13, name: "GP de Italia" }, f2: { round: 10, name: "Ronda de Monza" }, f3: { round: 8, name: "Ronda de Monza" } },
  { id: "esp", circuitId: "madring", date: "2026-09-13", f1: { round: 14, name: "GP de España" }, f2: { round: 11, name: "Ronda de Madrid" }, f3: { round: 9, name: "Ronda de Madrid" } },
  { id: "aze", circuitId: "baku", date: "2026-09-26", f1: { round: 15, name: "GP de Azerbaiyán" }, f2: { round: 12, name: "Ronda de Bakú" } },
  { id: "bhr", circuitId: "sepang", date: "2026-10-04", f1: { round: 16, name: "GP de Baréin (Sepang)" } },
  { id: "sgp", circuitId: "marina_bay", date: "2026-10-11", f1: { round: 17, name: "GP de Singapur", sprint: true } },
  { id: "usa", circuitId: "cota", date: "2026-10-25", f1: { round: 18, name: "GP de Estados Unidos" } },
  { id: "mex", circuitId: "mexico", date: "2026-11-01", f1: { round: 19, name: "GP de la Ciudad de México" } },
  { id: "bra", circuitId: "interlagos", date: "2026-11-08", f1: { round: 20, name: "GP de São Paulo" } },
  { id: "lvg", circuitId: "las_vegas", date: "2026-11-21", f1: { round: 21, name: "GP de Las Vegas" } },
  { id: "qat", circuitId: "lusail", date: "2026-11-29", f1: { round: 22, name: "GP de Catar" }, f2: { round: 13, name: "Ronda de Lusail" } },
  { id: "abu", circuitId: "yas_marina", date: "2026-12-06", f1: { round: 23, name: "GP de Abu Dabi" }, f2: { round: 14, name: "Ronda de Yas Marina" } },
];
