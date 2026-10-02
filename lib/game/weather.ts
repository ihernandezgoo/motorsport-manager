import { clamp, gauss, lerp, range, type Rng } from "./rng";
import type { Circuit, WeatherPlan } from "./types";

const SAMPLES = 25;

/**
 * Genera la meteorología real de una sesión y un pronóstico imperfecto.
 * `bias` permite que un fin de semana entero sea más o menos lluvioso.
 */
export type WeatherMode = "random" | "dry" | "wet" | "mixed";

export const WEATHER_MODE_LABELS: Record<WeatherMode, string> = {
  random: "Realista (aleatorio)",
  dry: "Seco",
  wet: "Lluvia",
  mixed: "Cambiante",
};

export function generateWeather(circuit: Circuit, rng: Rng, minutes: number, bias = 1, mode: WeatherMode = "random"): WeatherPlan {
  const airTemp = Math.round(lerp(circuit.temp[0], circuit.temp[1], rng()) - (mode === "wet" ? 4 : 0));
  const rain = new Array<number>(SAMPLES).fill(0);
  let initialWetness = 0;
  const cloudBase = mode === "dry" ? rng() * 0.3 : rng() * 0.55;
  const rainy = mode === "wet" || mode === "mixed" || (mode === "random" && rng() < clamp(circuit.rain * bias * 0.7, 0, 0.9));
  if (rainy) {
    const cells = mode === "random" && rng() < 0.3 ? 2 : 1;
    for (let c = 0; c < cells; c++) {
      let start = range(rng, -0.45, 0.92);
      let len = range(rng, 0.12, 0.65);
      let peak = 0.1 + Math.pow(rng(), 0.9) * 0.9;
      if (mode === "wet") {
        start = range(rng, -0.4, -0.2);
        len = range(rng, 1.3, 1.6);
        peak = range(rng, 0.45, 0.95);
      } else if (mode === "mixed") {
        start = range(rng, 0.2, 0.55);
        len = range(rng, 0.25, 0.45);
        peak = range(rng, 0.35, 0.85);
      }
      for (let i = 0; i < SAMPLES; i++) {
        const t = i / (SAMPLES - 1);
        if (t >= start && t <= start + len) {
          const x = (t - start) / len;
          rain[i] = Math.max(rain[i], peak * Math.pow(Math.sin(Math.PI * x), 0.6));
        }
      }
      if (start < 0) initialWetness = Math.max(initialWetness, clamp(0.1 + peak * 1.0, 0, 1));
    }
  } else if (mode === "random" && rng() < 0.06) {
    // Lluvia previa a la sesión: la pista empieza húmeda pero se va secando.
    initialWetness = range(rng, 0.15, 0.45);
  }
  const cloud = rain.map((r) => clamp(cloudBase + r * 1.6 + gauss(rng) * 0.05, 0, 1));
  const avgCloud = cloud.reduce((a, b) => a + b, 0) / SAMPLES;
  const trackTemp = Math.round(airTemp + (1 - avgCloud) * 16 + 2);

  const forecast = [0, 1, 2, 3].map((q) => {
    const from = Math.floor((q * (SAMPLES - 1)) / 4);
    const to = Math.ceil(((q + 1) * (SAMPLES - 1)) / 4);
    let max = 0;
    for (let i = from; i <= to; i++) max = Math.max(max, rain[i]);
    const p = max > 0.05 ? 0.45 + max * 0.45 + gauss(rng) * 0.15 : (rainy ? 0.15 : 0.03) + rng() * 0.2 + gauss(rng) * 0.05;
    return Math.round(clamp(p, 0, 0.95) * 20) * 5;
  });

  return { airTemp, trackTemp, initialWetness, rain, cloud, forecast, minutes };
}

function sample(arr: number[], frac: number): number {
  const f = clamp(frac, 0, 1) * (arr.length - 1);
  const i = Math.floor(f);
  const j = Math.min(arr.length - 1, i + 1);
  return lerp(arr[i], arr[j], f - i);
}

export const rainAt = (p: WeatherPlan, frac: number) => sample(p.rain, frac);
export const cloudAt = (p: WeatherPlan, frac: number) => sample(p.cloud, frac);

/** Evolución de la humedad de la pista durante `minutes` minutos. */
export function evolveWetness(w: number, rain: number, trackTemp: number, minutes: number, racing: boolean): number {
  const target = rain > 0.03 ? Math.min(1, 0.1 + rain * 1.1) : 0;
  if (w < target) return Math.min(target, w + rain * 0.16 * minutes);
  let dry = (0.02 + 0.0009 * Math.max(0, trackTemp - 15)) * minutes * (racing ? 1.25 : 1);
  dry *= 1 - Math.min(0.8, rain * 4);
  return Math.max(target, w - dry);
}

/** Humedad de pista en una fracción de la sesión, simulando desde el principio. */
export function wetnessAt(p: WeatherPlan, frac: number, racing = false): number {
  const steps = 40;
  let w = p.initialWetness;
  const dt = (p.minutes * clamp(frac, 0, 1)) / steps;
  for (let s = 0; s < steps; s++) {
    const f = (frac * (s + 0.5)) / steps;
    w = evolveWetness(w, rainAt(p, f), p.trackTemp, dt, racing);
  }
  return w;
}

/**
 * Humedad prevista tras las primeras vueltas de una carrera. Sirve para elegir el neumático
 * de salida: una pista solo húmeda que se va a secar enseguida no justifica los intermedios.
 */
export function earlyRaceWetness(p: WeatherPlan, lapSeconds: number, totalLaps: number, laps = 2): number {
  let w = p.initialWetness;
  for (let i = 0; i < laps; i++) {
    const r = rainAt(p, (i + 0.5) / totalLaps);
    w = evolveWetness(w, r, p.trackTemp - r * 10, lapSeconds / 60, true);
  }
  return w;
}

export function describeWeather(rain: number, cloud: number): { icon: string; label: string } {
  if (rain > 0.6) return { icon: "⛈️", label: "Tormenta" };
  if (rain > 0.3) return { icon: "🌧️", label: "Lluvia" };
  if (rain > 0.05) return { icon: "🌦️", label: "Llovizna" };
  if (cloud > 0.6) return { icon: "☁️", label: "Nublado" };
  if (cloud > 0.3) return { icon: "⛅", label: "Parcialmente nublado" };
  return { icon: "☀️", label: "Soleado" };
}

export function forecastLabel(prob: number): string {
  if (prob >= 70) return "Lluvia muy probable";
  if (prob >= 45) return "Probable lluvia";
  if (prob >= 25) return "Posibles chubascos";
  return "Seco";
}

export function wetnessLabel(w: number): string {
  if (w < 0.05) return "Seca";
  if (w < 0.18) return "Húmeda";
  if (w < 0.5) return "Mojada";
  if (w < 0.85) return "Muy mojada";
  return "Encharcada";
}

export function summarizeWeather(maxRain: number, maxWet: number): string {
  if (maxWet > 0.5) return "Lluvia";
  if (maxWet > 0.15) return "Mixta";
  if (maxRain > 0.03) return "Llovizna";
  return "Seco";
}
