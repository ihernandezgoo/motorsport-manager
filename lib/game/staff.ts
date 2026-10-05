import { personName, pickNat } from "./names";
import { addNews, currentDate } from "./news";
import { formatMoney } from "./perf";
import { clamp, gauss, type Rng } from "./rng";
import type { GameState, SeriesId, StaffMember, StaffRole, Team } from "./types";

export const STAFF_ROLES: { role: StaffRole; label: string; desc: string }[] = [
  { role: "technical", label: "Director técnico", desc: "Las mejoras de la fábrica rinden más" },
  { role: "engineer", label: "Ingeniero de pista jefe", desc: "Reglajes más precisos y mejor ingeniería de pista" },
  { role: "pitChief", label: "Jefe de mecánicos", desc: "Paradas más rápidas y con menos errores" },
];

/** Escala de salarios por categoría respecto a la F1. */
const SALARY_SCALE: Record<SeriesId, number> = { f1: 1, f2: 0.06, f3: 0.03 };
/** Valoración neutra: un miembro del personal con esta nota no altera el rendimiento base del equipo. */
export const STAFF_NEUTRAL = 75;

const round2 = (x: number) => Math.round(x * 100) / 100;

export function staffSalary(rating: number, series: SeriesId): number {
  return round2((0.4 + Math.max(0, rating - 60) ** 2 * 0.004) * SALARY_SCALE[series]);
}

export function generateStaff(state: GameState, rng: Rng, role: StaffRole, series: SeriesId, rating: number): StaffMember {
  state.uid = (state.uid ?? 0) + 1;
  const nat = pickNat(rng);
  const { first, last } = personName(rng, nat);
  const r = Math.round(clamp(rating, 50, 97));
  return {
    id: `staff-${state.uid}`,
    name: `${first} ${last}`,
    nat,
    age: 32 + Math.floor(rng() * 28),
    role,
    rating: r,
    salary: staffSalary(r, series),
    contractUntil: state.year + 1 + Math.floor(rng() * 2),
  };
}

/** Personal inicial (neutro) del equipo del jugador y primera bolsa de candidatos. */
export function initStaff(state: GameState, rng: Rng) {
  const series = state.player.series;
  state.staff = {
    technical: generateStaff(state, rng, "technical", series, STAFF_NEUTRAL + gauss(rng) * 2),
    engineer: generateStaff(state, rng, "engineer", series, STAFF_NEUTRAL + gauss(rng) * 2),
    pitChief: generateStaff(state, rng, "pitChief", series, STAFF_NEUTRAL + gauss(rng) * 2),
  };
  refreshStaffMarket(state, rng);
}

/** Nueva bolsa de candidatos: tres por puesto, de todos los niveles. */
export function refreshStaffMarket(state: GameState, rng: Rng) {
  const series = state.player.series;
  state.staffMarket = [];
  for (const { role } of STAFF_ROLES) {
    for (const base of [68, 80, 89]) state.staffMarket.push(generateStaff(state, rng, role, series, base + gauss(rng) * 4));
  }
}

/** Puntos que suma (o resta) un miembro del personal respecto al nivel neutro. */
export function staffBonus(state: GameState, role: StaffRole): number {
  const m = state.staff?.[role];
  return m ? (m.rating - STAFF_NEUTRAL) * 0.4 : 0;
}

/** Multiplicador de las mejoras de la fábrica por el director técnico. */
export function devFactor(state: GameState): number {
  const m = state.staff?.technical;
  return m ? 1 + (m.rating - STAFF_NEUTRAL) * 0.012 : 1;
}

/** El equipo del jugador con los efectos de su personal (ingeniería de pista y boxes). */
export function effectiveTeam(state: GameState, team: Team): Team {
  if (team.id !== state.player.teamId || !state.staff) return team;
  return {
    ...team,
    engineering: clamp(team.engineering + staffBonus(state, "engineer"), 40, 99),
    pitCrew: clamp(team.pitCrew + staffBonus(state, "pitChief"), 40, 99),
  };
}

/** Todos los equipos, con el del jugador ajustado por su personal. */
export function effectiveTeams(state: GameState): Record<string, Team> {
  const t = state.teams[state.player.teamId];
  if (!t) return state.teams;
  return { ...state.teams, [t.id]: effectiveTeam(state, t) };
}

/** Indemnización por despedir a quien ocupa el puesto (media temporada de salario por año restante). */
export function staffSeverance(state: GameState, role: StaffRole): number {
  const cur = state.staff[role];
  return round2(cur.salary * 0.5 * Math.max(1, cur.contractUntil - state.year));
}

/** Coste total de fichar a un candidato: prima de fichaje (25 % del salario) más la indemnización del saliente. */
export function hireCost(state: GameState, cand: StaffMember): number {
  return round2(cand.salary * 0.25 + staffSeverance(state, cand.role));
}

export function hireStaff(state: GameState, id: string): string | null {
  const cand = state.staffMarket.find((s) => s.id === id);
  if (!cand) return "Candidato no disponible";
  const team = state.teams[state.player.teamId];
  const cost = hireCost(state, cand);
  if (team.budget < cost) return "Presupuesto insuficiente";
  const old = state.staff[cand.role];
  team.budget -= cost;
  state.finance.push({ weekendIndex: state.nextWeekend, label: `Fichaje de ${cand.name} (${STAFF_ROLES.find((r) => r.role === cand.role)?.label})`, amount: -cost });
  state.staff[cand.role] = { ...cand, contractUntil: state.year + 2 };
  state.staffMarket = state.staffMarket.filter((s) => s.id !== id);
  addNews(state, {
    date: currentDate(state),
    series: state.player.series,
    title: `👔 ${cand.name} llega a ${team.short}`,
    body: `Sustituye a ${old.name}. Salario: ${formatMoney(cand.salary)} por temporada.`,
  });
  return null;
}

/** Cambio de temporada: el personal evoluciona un poco y se renuevan los contratos que vencen. */
export function staffNewSeason(state: GameState, rng: Rng) {
  const series = state.player.series;
  for (const { role } of STAFF_ROLES) {
    const m = state.staff[role];
    const drift = m.age < 45 ? 0.6 : m.age > 60 ? -1 : 0;
    m.age++;
    m.rating = Math.round(clamp(m.rating + drift + gauss(rng) * 1.2, 50, 97));
    if (m.contractUntil < state.year) {
      m.contractUntil = state.year + 1;
      m.salary = staffSalary(m.rating, series);
    }
  }
  refreshStaffMarket(state, rng);
}

export function staffWage(state: GameState): number {
  return Object.values(state.staff ?? {}).reduce((a, m) => a + m.salary, 0);
}
