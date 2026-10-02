import { basePct, baseLap } from "./perf";
import { clamp, gauss, type Rng } from "./rng";
import type { Circuit, Driver, PowerUnit, SeriesId, SetupValues, Team } from "./types";

export const SETUP_PARAMS: { key: keyof SetupValues; label: string; low: string; high: string; more: string; less: string }[] = [
  { key: "aero", label: "Carga aerodinámica", low: "Poca carga", high: "Mucha carga", more: "más carga aerodinámica", less: "menos carga aerodinámica" },
  { key: "susp", label: "Suspensión", low: "Blanda", high: "Dura", more: "una suspensión más dura", less: "una suspensión más blanda" },
  { key: "gear", label: "Desarrollo de marchas", low: "Corto (aceleración)", high: "Largo (punta)", more: "marchas más largas", less: "marchas más cortas" },
];

export function makeOptimum(circuit: Circuit, rng: Rng): SetupValues {
  return {
    aero: Math.round(clamp(15 + circuit.downforce * 70 + gauss(rng) * 9, 5, 95)),
    susp: Math.round(clamp(52 + (circuit.street ? -16 : 0) + (circuit.wear - 1) * 30 + gauss(rng) * 13, 5, 95)),
    gear: Math.round(clamp(15 + circuit.power * 70 + gauss(rng) * 9, 5, 95)),
  };
}

export function setupQuality(v: SetupValues, o: SetupValues): number {
  const d = (Math.abs(v.aero - o.aero) + Math.abs(v.susp - o.susp) + Math.abs(v.gear - o.gear)) / 3;
  return clamp(1 - d / 45, 0, 1);
}

export function practiceRuns(series: SeriesId, sprintWeekend: boolean): number {
  if (series === "f1") return sprintWeekend ? 3 : 6;
  return 4;
}

/** Comentarios del piloto tras una tanda. Los pilotos con poco feedback a veces se equivocan. */
export function driverFeedback(v: SetupValues, o: SetupValues, d: Driver, rng: Rng): string[] {
  const tol = 4 + (100 - d.feedback) * 0.12;
  return SETUP_PARAMS.map((p) => {
    let diff = o[p.key] - v[p.key];
    if (Math.abs(diff) <= tol) return `✔ ${p.label}: me siento cómodo`;
    if (Math.abs(diff) < 20 && rng() < (100 - d.feedback) * 0.004) diff = -diff;
    const abs = Math.abs(diff);
    const amount = abs > 30 ? "mucho" : abs > 12 ? "bastante" : "un poco";
    const arrow = diff > 0 ? (abs > 30 ? "▲▲" : "▲") : abs > 30 ? "▼▼" : "▼";
    return `${arrow} Necesito ${diff > 0 ? p.more : p.less} (${amount})`;
  });
}

export function practiceLap(series: SeriesId, team: Team, d: Driver, pus: Record<string, PowerUnit>, circuit: Circuit, wet: number, q: number, rng: Rng): number {
  const pct = basePct(series, team, d, pus, circuit, wet, q) + wet * 6 + 0.8 + gauss(rng) * 0.25;
  return baseLap(series, circuit) * (1 + pct / 100);
}

export function aiSetupQuality(team: Team, rng: Rng): number {
  return clamp(0.62 + (team.engineering / 100) * 0.3 + gauss(rng) * 0.05, 0.5, 0.97);
}

/** Reglaje automático del ingeniero: más preciso cuanto mejor es el departamento de ingeniería. */
export function autoSetupValues(o: SetupValues, team: Team, rng: Rng): SetupValues {
  const sd = (100 - team.engineering) * 0.55;
  const f = (x: number) => Math.round(clamp(x + gauss(rng) * sd, 0, 100));
  return { aero: f(o.aero), susp: f(o.susp), gear: f(o.gear) };
}
