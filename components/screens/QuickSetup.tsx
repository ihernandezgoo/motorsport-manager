import { Flag } from "lucide-react";
import { useState } from "react";
import { CALENDAR_2026 } from "@/lib/game/data/calendar";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { ALL_DRIVERS, ALL_TEAMS, POWER_UNITS, SERIES_COLOR, SERIES_NAMES } from "@/lib/game/data/teams";
import { carScore } from "@/lib/game/perf";
import type { QuickConfig, SeriesId } from "@/lib/game/types";
import { WEATHER_MODE_LABELS, type WeatherMode } from "@/lib/game/weather";
import { TeamCar } from "../art/Photos";
import { TrackMap } from "../TrackMap";
import { Btn, cx, Nat, Panel, Segmented, Stripe } from "../ui";

const PUS = Object.fromEntries(POWER_UNITS.map((p) => [p.id, p]));
const CIRCUIT_ORDER = CALENDAR_2026.map((w) => w.circuitId);

function teamsOf(series: SeriesId) {
  return ALL_TEAMS.filter((t) => t.series === series).sort((a, b) => carScore(b, PUS) - carScore(a, PUS));
}

export function QuickSetup({ onCancel, onStart }: { onCancel: () => void; onStart: (cfg: QuickConfig) => void }) {
  const [series, setSeries] = useState<SeriesId>("f1");
  const [circuitId, setCircuitId] = useState("monza");
  const [teamId, setTeamId] = useState(() => teamsOf("f1")[0].id);
  const [sprint, setSprint] = useState(false);
  const [weather, setWeather] = useState<WeatherMode>("random");
  const [skip, setSkip] = useState(false);
  const circuit = CIRCUITS[circuitId];
  const team = ALL_TEAMS.find((t) => t.id === teamId);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-muted hover:text-fg">
        ← Volver al menú
      </button>
      <h1 className="text-3xl font-black">Fin de semana rápido</h1>
      <p className="mt-1 text-sm text-muted">Elige categoría, circuito y equipo y juega un fin de semana suelto. No afecta a tu partida.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="1 · Categoría">
            <div className="grid gap-2 sm:grid-cols-3">
              {(["f1", "f2", "f3"] as SeriesId[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setSeries(s);
                    setTeamId(teamsOf(s)[0].id);
                  }}
                  className={cx("rounded-xl border p-4 text-left transition", series === s ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                >
                  <div className="text-3xl font-black italic" style={{ color: SERIES_COLOR[s] }}>
                    {s.toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold">{SERIES_NAMES[s]}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2 · Circuito">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {CIRCUIT_ORDER.map((id) => {
                const c = CIRCUITS[id];
                const inCal = CALENDAR_2026.some((w) => w.circuitId === id && w[series]);
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setCircuitId(id)}
                    className={cx("flex items-center gap-2 rounded-lg border p-2 text-left transition", circuitId === id ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                  >
                    <TrackMap circuitId={id} className="h-12 w-12 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.city}</div>
                      <div className="truncate text-[11px] text-muted">{c.country}</div>
                      {inCal && <div className="text-[10px] font-bold uppercase" style={{ color: SERIES_COLOR[series] }}>Calendario {series.toUpperCase()}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="3 · Equipo">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {teamsOf(series).map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTeamId(t.id)}
                  className={cx("flex gap-2 rounded-lg border p-3 text-left transition", teamId === t.id ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                >
                  <Stripe color={t.color} className="w-1.5" />
                  <div className="min-w-0 flex-1">
                    <TeamCar team={t} series={series} className="mb-1 h-12 w-full" />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-bold">{t.short}</span>
                      <span className="text-sm font-black tabular">{carScore(t, PUS).toFixed(0)}</span>
                    </div>
                    {ALL_DRIVERS.filter((d) => d.teamId === t.id)
                      .sort((a, b) => a.number - b.number)
                      .map((d) => (
                        <div key={d.id} className="flex items-center gap-1.5 text-xs text-muted">
                          <span className="w-5 text-right font-mono">{d.number}</span>
                          <span className="truncate">{d.last}</span>
                          <Nat code={d.nat} />
                        </div>
                      ))}
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title="4 · Opciones">
            <div className="space-y-4">
              {series === "f1" && (
                <div>
                  <div className="mb-1 text-xs text-muted">Formato</div>
                  <Segmented
                    value={sprint ? "sprint" : "normal"}
                    onChange={(v) => setSprint(v === "sprint")}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "sprint", label: "Con sprint" },
                    ]}
                  />
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-muted">Meteorología</div>
                <Segmented value={weather} onChange={setWeather} options={(Object.keys(WEATHER_MODE_LABELS) as WeatherMode[]).map((w) => ({ value: w, label: WEATHER_MODE_LABELS[w] }))} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                Saltar libres (reglaje automático del ingeniero)
              </label>
            </div>
          </Panel>
          <Panel title="Resumen">
            <TrackMap circuitId={circuitId} className="mx-auto h-40 w-40" />
            <div className="mt-2 text-center">
              <div className="font-bold">{circuit.name}</div>
              <div className="text-xs text-muted">
                {circuit.city}, {circuit.country} · {circuit.lengthKm.toFixed(3)} km
              </div>
              <div className="mt-2 text-sm">
                {SERIES_NAMES[series]} · <b>{team?.name}</b>
              </div>
            </div>
            <Btn
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              onClick={() => onStart({ series, teamId, circuitId, sprint: series === "f1" && sprint, weather, skipPractice: skip })}
            >
              <Flag className="h-5 w-5" /> Empezar fin de semana
            </Btn>
          </Panel>
        </div>
      </div>
    </div>
  );
}
