import { pick, type Rng } from "./rng";

/** Nombres y apellidos por nacionalidad para los pilotos y el personal que genera el juego. */
const POOLS: Record<string, { first: string[]; last: string[] }> = {
  GBR: { first: ["Oliver", "Harry", "Jack", "Charlie", "Thomas", "James", "Alfie", "Freddie", "Arthur", "George"], last: ["Walker", "Bennett", "Hughes", "Fletcher", "Marsh", "Turner", "Doyle", "Ashford", "Kendall", "Pryce"] },
  ESP: { first: ["Pablo", "Álvaro", "Hugo", "Mario", "Daniel", "Adrián", "Marc", "Iker", "Nico", "Javier"], last: ["Navarro", "Ortega", "Serrano", "Molina", "Iglesias", "Cortés", "Rubio", "Vidal", "Peña", "Castaño"] },
  ITA: { first: ["Lorenzo", "Matteo", "Federico", "Tommaso", "Riccardo", "Andrea", "Gabriele", "Edoardo", "Pietro", "Luca"], last: ["Rinaldi", "Conti", "Marchetti", "Galli", "Ferraro", "Benedetti", "Sartori", "Moretti", "Lombardo", "Barone"] },
  FRA: { first: ["Théo", "Hugo", "Louis", "Raphaël", "Arthur", "Jules", "Mathis", "Léo", "Enzo", "Victor"], last: ["Lefèvre", "Moreau", "Girard", "Faure", "Mercier", "Blanchard", "Dumont", "Rousseau", "Chevalier", "Perrin"] },
  GER: { first: ["Lukas", "Felix", "Jonas", "Leon", "Maximilian", "Paul", "Elias", "Niklas", "Moritz", "Finn"], last: ["Becker", "Hoffmann", "Krüger", "Lehmann", "Brandt", "Vogel", "Seidel", "Albrecht", "Kessler", "Winkler"] },
  NED: { first: ["Daan", "Sem", "Lars", "Thijs", "Bram", "Ruben", "Jesse", "Milan", "Stijn", "Tim"], last: ["de Groot", "Visser", "Bakker", "Mulder", "Smit", "van Dijk", "Kuipers", "Jansen", "Hendriks", "Bosman"] },
  BRA: { first: ["Gabriel", "Lucas", "Matheus", "Rafael", "Enzo", "Bernardo", "Caio", "Thiago", "Pedro", "Vitor"], last: ["Carvalho", "Ribeiro", "Moraes", "Teixeira", "Barbosa", "Azevedo", "Pacheco", "Nogueira", "Freitas", "Siqueira"] },
  ARG: { first: ["Santiago", "Mateo", "Benjamín", "Tomás", "Facundo", "Agustín", "Joaquín", "Bautista"], last: ["Gutiérrez", "Romero", "Acosta", "Medina", "Benítez", "Ledesma", "Ferreyra", "Godoy"] },
  MEX: { first: ["Emiliano", "Diego", "Sebastián", "Rodrigo", "Andrés", "Leonardo", "Iñaki", "Patricio"], last: ["Villaseñor", "Treviño", "Garza", "Cárdenas", "Salazar", "Montes", "Arriaga", "Zamora"] },
  USA: { first: ["Ethan", "Logan", "Mason", "Carter", "Wyatt", "Hunter", "Cole", "Bryce", "Tanner", "Grant"], last: ["Mitchell", "Harper", "Brooks", "Sullivan", "Prescott", "Whitaker", "Callahan", "Donovan", "Reyes", "Holloway"] },
  AUS: { first: ["Cooper", "Hamish", "Lachlan", "Riley", "Bailey", "Mitchell", "Angus", "Jett"], last: ["McAllister", "Fraser", "Gallagher", "Kirby", "Thornton", "Boyd", "Lindqvist", "Doherty"] },
  JPN: { first: ["Haruto", "Ren", "Sota", "Yuto", "Kaito", "Riku", "Hayato", "Daiki"], last: ["Nakamura", "Kobayashi", "Matsuda", "Fujiwara", "Okada", "Ishikawa", "Takeda", "Morimoto"] },
  CHN: { first: ["Hao", "Jun", "Wei", "Yichen", "Zihan", "Rui", "Tian", "Bo"], last: ["Lin", "Zhou", "Huang", "Gao", "Luo", "Song", "Tang", "Han"] },
  SWE: { first: ["Elias", "Hugo", "Oscar", "Viktor", "Axel", "Isak", "Melker", "Albin"], last: ["Lindgren", "Bergström", "Sandberg", "Holm", "Ekström", "Nyberg", "Wallin", "Forsberg"] },
  BEL: { first: ["Arthur", "Lucas", "Noah", "Louis", "Victor", "Jules", "Mathis", "Liam"], last: ["Peeters", "Claes", "Wouters", "Maes", "Dubois", "Lambert", "Verhoeven", "Janssens"] },
  POL: { first: ["Jakub", "Kacper", "Szymon", "Filip", "Mikołaj", "Wiktor", "Antoni", "Franciszek"], last: ["Nowicki", "Wróbel", "Kaczmarek", "Zieliński", "Pawlak", "Sadowski", "Michalski", "Kowal"] },
  IND: { first: ["Arjun", "Rohan", "Vihaan", "Kabir", "Ishaan", "Aarav", "Dev", "Aditya"], last: ["Mehta", "Kapoor", "Reddy", "Iyer", "Malhotra", "Bhatt", "Saxena", "Chandra"] },
  NZL: { first: ["Finn", "Nico", "Jaxon", "Ryder", "Kauri", "Tama", "Blake", "Hunter"], last: ["McKenzie", "Tane", "Rowe", "Prentice", "Fitzgerald", "Hollis", "Ngata", "Burke"] },
};

/** Nacionalidades de las canteras, con más peso en las que más pilotos aportan a la escalera FIA. */
const NAT_WEIGHTS: [string, number][] = [
  ["GBR", 14], ["ITA", 8], ["FRA", 8], ["GER", 6], ["NED", 6], ["ESP", 6], ["BRA", 6], ["USA", 5], ["AUS", 5], ["JPN", 4],
  ["MEX", 3], ["ARG", 3], ["CHN", 3], ["SWE", 3], ["BEL", 3], ["POL", 2], ["IND", 2], ["NZL", 3],
];

export function pickNat(rng: Rng): string {
  const total = NAT_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [nat, w] of NAT_WEIGHTS) {
    r -= w;
    if (r <= 0) return nat;
  }
  return "GBR";
}

export function personName(rng: Rng, nat: string): { first: string; last: string } {
  const pool = POOLS[nat] ?? POOLS.GBR;
  return { first: pick(rng, pool.first), last: pick(rng, pool.last) };
}

/** Código de tres letras a partir del apellido (sin tildes ni partículas). */
export function driverCode(last: string): string {
  const clean = last
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(de|van|von|da|di|le|la|mc)\s*/i, "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();
  return (clean + "XXX").slice(0, 3);
}

const SPONSOR_A = ["Vortex", "Nordlicht", "Helix", "Aurora", "Kestrel", "Quantum", "Solace", "Zenith", "Orbital", "Cobalt", "Atlas", "Lumen", "Sierra", "Pulsar", "Granite", "Halcyon", "Meridian", "Tempest", "Verdant", "Obsidian", "Ironclad", "Polar", "Nimbus", "Corvid"];
const SPONSOR_B = ["Energy", "Bank", "Telecom", "Logistics", "Watches", "Cloud", "Airlines", "Motors Oil", "Insurance", "Beverages", "Fintech", "Robotics", "Apparel", "Semiconductors", "Mobility", "Analytics", "Capital", "Gaming", "Hotels", "Fuels"];

export function sponsorName(rng: Rng): string {
  return `${pick(rng, SPONSOR_A)} ${pick(rng, SPONSOR_B)}`;
}
