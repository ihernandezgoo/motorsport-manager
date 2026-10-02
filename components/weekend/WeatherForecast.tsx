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
    <ul className="space-y-2">
      {sessions.map((s, i) => {
        const plan = weather[s.key];
        const icon = forecastIcon(plan);
        const max = Math.max(...plan.forecast);
        return (
          <li key={s.key} className={cx("flex items-center gap-2 rounded-lg border border-line px-2.5 py-2", i === step ? "border-line-2 bg-panel-2" : i < step && "opacity-50")}>
            <WeatherIcon w={icon} className="h-6 w-6" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{s.label}</div>
              <div className="truncate text-[11px] text-muted" title={plan.initialWetness > 0.1 ? "Pista mojada al comienzo de la sesión" : undefined}>
                {forecastLabel(max)} · {plan.airTemp}°/{plan.trackTemp}°C
                {plan.initialWetness > 0.1 && <span className="text-[#60a5fa]"> · mojada</span>}
              </div>
            </div>
            <div className="grid w-20 shrink-0 grid-cols-4 gap-0.5" title={plan.forecast.map((p) => `${p}%`).join(" · ")}>
              {plan.forecast.map((p, q) => (
                <div key={q} className="relative h-7 overflow-hidden rounded-sm bg-panel-3">
                  <div className="absolute inset-x-0 bottom-0 bg-[#3b82f6]" style={{ height: `${p}%`, opacity: 0.35 + p / 160 }} />
                </div>
              ))}
            </div>
            <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular text-muted">{max}%</span>
          </li>
        );
      })}
    </ul>
  );
}
