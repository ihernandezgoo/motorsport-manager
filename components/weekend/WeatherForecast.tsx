import type { SessionDef, WeatherPlan } from "@/lib/game/types";
import { cloudAt, describeWeather, forecastLabel } from "@/lib/game/weather";
import { cx, WeatherIcon } from "../ui";

export function forecastIcon(plan: WeatherPlan) {
  const p = Math.max(...plan.forecast) / 100;
  const cloud = cloudAt(plan, 0.5);
  if (plan.initialWetness > 0.4) return describeWeather(0.4, 1);
  return describeWeather(p > 0.6 ? 0.35 : p > 0.4 ? 0.1 : 0, Math.max(cloud, p));
}

export function WeatherForecast({ sessions, weather, step }: { sessions: SessionDef[]; weather: Record<string, WeatherPlan>; step: number }) {
  return (
    <ul className="space-y-3">
      {sessions.map((s, i) => {
        const plan = weather[s.key];
        const icon = forecastIcon(plan);
        const max = Math.max(...plan.forecast);
        return (
          <li key={s.key} className={cx("rounded-lg border border-line p-3", i === step ? "border-line-2 bg-panel-2" : i < step && "opacity-50")}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{s.label}</div>
                <div className="text-[11px] text-muted">
                  {forecastLabel(max)} · {plan.airTemp}°C aire · {plan.trackTemp}°C pista
                </div>
              </div>
              <WeatherIcon w={icon} className="h-7 w-7" />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {plan.forecast.map((p, q) => (
                <div key={q} className="text-center">
                  <div className="relative h-7 overflow-hidden rounded-sm bg-panel-3">
                    <div className="absolute inset-x-0 bottom-0 bg-[#3b82f6]" style={{ height: `${p}%`, opacity: 0.35 + p / 160 }} />
                  </div>
                  <div className="mt-0.5 text-[10px] tabular text-muted">{p}%</div>
                </div>
              ))}
            </div>
            {plan.initialWetness > 0.1 && <div className="mt-1.5 text-[11px] text-[#60a5fa]">Pista mojada al comienzo de la sesión</div>}
          </li>
        );
      })}
    </ul>
  );
}
