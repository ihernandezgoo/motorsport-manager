import { clamp, gauss, range, type Rng } from "./rng";
import { devFactor } from "./staff";
import type { GameState, Project, ProjectArea, SeriesId, Team } from "./types";

export const AREA_LABELS: Record<SeriesId, Record<ProjectArea, string>> = {
  f1: { aero: "Aerodinámica", chassis: "Chasis y suspensión", engine: "Unidad de potencia", reliability: "Fiabilidad" },
  f2: { aero: "Ingeniería aerodinámica", chassis: "Mecánica y amortiguadores", engine: "Motor", reliability: "Fiabilidad y preparación" },
  f3: { aero: "Ingeniería aerodinámica", chassis: "Mecánica y amortiguadores", engine: "Motor", reliability: "Fiabilidad y preparación" },
};

export const TIERS = [
  { name: "Mejora menor", cost: 4, weeks: 1, gain: [0.4, 1.0] as [number, number] },
  { name: "Paquete de mejoras", cost: 9, weeks: 2, gain: [1.0, 2.2] as [number, number] },
  { name: "Gran evolución", cost: 18, weeks: 4, gain: [2.2, 4.0] as [number, number] },
];

export const COST_SCALE: Record<SeriesId, number> = { f1: 1, f2: 0.03, f3: 0.015 };

export const FACILITIES: { key: "pitCrew" | "engineering" | "factory"; label: string; desc: string; cost: number; gain: number }[] = [
  { key: "pitCrew", label: "Entrenamiento del equipo de boxes", desc: "Paradas más rápidas y menos errores", cost: 2, gain: 4 },
  { key: "engineering", label: "Simulador e ingeniería de pista", desc: "Mejores reglajes automáticos y de la IA del equipo", cost: 4, gain: 3 },
  { key: "factory", label: "Ampliación de la fábrica", desc: "Las mejoras rinden más", cost: 6, gain: 4 },
];

export function availableAreas(state: GameState): ProjectArea[] {
  const team = state.teams[state.player.teamId];
  const areas: ProjectArea[] = ["aero", "chassis", "reliability"];
  if (team.pu && state.pus[team.pu].worksTeam === team.id) areas.splice(1, 0, "engine");
  return areas;
}

export function areaValue(state: GameState, team: Team, area: ProjectArea): number {
  if (area === "engine") return team.pu ? state.pus[team.pu].power : team.car.engine;
  return team.car[area];
}

function diminishing(current: number) {
  return clamp((100 - current) / 25, 0.25, 1.2);
}

export function factoryFactor(team: Team) {
  return 0.7 + (team.factory / 100) * 0.5;
}

export function projectCost(series: SeriesId, tier: number) {
  return TIERS[tier].cost * COST_SCALE[series];
}

export function startProject(state: GameState, area: ProjectArea, tier: number): string | null {
  const team = state.teams[state.player.teamId];
  const cost = projectCost(team.series, tier);
  if (team.budget < cost) return "Presupuesto insuficiente";
  if (state.projects.some((p) => p.area === area)) return "Ya hay un proyecto en marcha en esta área";
  team.budget -= cost;
  const t = TIERS[tier];
  const project: Project = {
    id: `${area}-${state.nextWeekend}-${tier}-${state.projects.length}`,
    area,
    tier,
    cost,
    weeksTotal: t.weeks,
    weeksLeft: t.weeks,
    gainMin: t.gain[0],
    gainMax: t.gain[1],
  };
  state.projects.push(project);
  state.finance.push({ weekendIndex: state.nextWeekend, label: `${t.name}: ${AREA_LABELS[team.series][area]}`, amount: -cost });
  return null;
}

function applyGain(state: GameState, team: Team, area: ProjectArea, raw: number): number {
  const current = areaValue(state, team, area);
  const gain = raw * diminishing(current);
  if (area === "engine" && team.pu) {
    state.pus[team.pu].power = clamp(state.pus[team.pu].power + gain, 40, 100);
  } else if (area !== "engine") {
    team.car[area] = clamp(team.car[area] + gain, 40, 100);
  }
  return gain;
}

/** Avanza los proyectos del jugador una semana. Devuelve los mensajes de proyectos completados. */
export function progressProjects(state: GameState, rng: Rng): string[] {
  const team = state.teams[state.player.teamId];
  const done: string[] = [];
  for (const p of state.projects) {
    p.weeksLeft--;
    if (p.weeksLeft <= 0) {
      const raw = range(rng, p.gainMin, p.gainMax) * factoryFactor(team) * devFactor(state);
      const gain = applyGain(state, team, p.area, raw);
      if (p.area === "reliability" && team.pu && state.pus[team.pu].worksTeam === team.id) {
        state.pus[team.pu].reliability = clamp(state.pus[team.pu].reliability + gain * 0.6, 40, 100);
      }
      done.push(`${TIERS[p.tier].name} de ${AREA_LABELS[team.series][p.area].toLowerCase()} lista: +${gain.toFixed(1)}`);
    }
  }
  state.projects = state.projects.filter((p) => p.weeksLeft > 0);
  return done;
}

export function buyFacility(state: GameState, key: (typeof FACILITIES)[number]["key"]): string | null {
  const team = state.teams[state.player.teamId];
  const f = FACILITIES.find((x) => x.key === key);
  if (!f) return "Instalación desconocida";
  const cost = f.cost * COST_SCALE[team.series];
  if (team.budget < cost) return "Presupuesto insuficiente";
  if (team[key] >= 99) return "Ya está al máximo";
  team.budget -= cost;
  team[key] = Math.min(99, team[key] + f.gain);
  state.finance.push({ weekendIndex: state.nextWeekend, label: f.label, amount: -cost });
  return null;
}

/** Desarrollo de los equipos rivales y de las unidades de potencia tras cada carrera. */
export function aiDevelopment(state: GameState, series: SeriesId, rng: Rng) {
  const player = state.player.teamId;
  for (const team of Object.values(state.teams)) {
    if (team.series !== series || team.id === player) continue;
    const f = factoryFactor(team);
    for (const area of ["aero", "chassis", "reliability"] as const) {
      const g = Math.max(0, rng() * 0.36 * f + gauss(rng) * 0.05);
      team.car[area] = clamp(team.car[area] + g * diminishing(team.car[area]), 40, 100);
    }
  }
  if (series === "f1") {
    for (const pu of Object.values(state.pus)) {
      if (pu.worksTeam === player) continue;
      pu.power = clamp(pu.power + rng() * 0.3 * diminishing(pu.power), 40, 100);
      pu.reliability = clamp(pu.reliability + rng() * 0.35 * diminishing(pu.reliability), 40, 100);
    }
  }
}
