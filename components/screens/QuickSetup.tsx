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
import { Btn, cx, Nat, PagedGrid, Panel, Segmented, SeriesLogo, Stripe } from "../ui";

const PUS = Object.fromEntries(POWER_UNITS.map((p) => [p.id, p]));
const CIRCUIT_ORDER = CALENDAR_2026.map((w) => w.circuitId);
const STEPS = ["Categoría", "Circuito", "Equipo", "Opciones"] as const;

function teamsOf(series: SeriesId) {
  return ALL_TEAMS.filter((t) => t.series === series).sort((a, b) => carScore(b, PUS) - carScore(a, PUS));
}

export function QuickSetup({ onCancel, onStart }: { onCancel: () => void; onStart: (cfg: QuickConfig) => void }) {
  const [step, setStep] = useState(0);
  const [series, setSeries] = useState<SeriesId>("f1");
  const [circuitId, setCircuitId] = useState("monza");
  const [teamId, setTeamId] = useState(() => teamsOf("f1")[0].id);
  const [sprint, setSprint] = useState(false);
  const [weather, setWeather] = useState<WeatherMode>("random");
  const [skip, setSkip] = useState(false);
  const circuit = CIRCUITS[circuitId];
  const team = ALL_TEAMS.find((t) => t.id === teamId);
  const start = () => onStart({ series, teamId, circuitId, sprint: series === "f1" && sprint, weather, skipPractice: skip });

  return (
    <div className="mx-auto flex h-dvh w-full max-w-7xl flex-col overflow-hidden px-4 py-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <button type="button" onClick={onCancel} className="mb-1 text-sm text-muted hover:text-fg">
            ← Volver al menú
          </button>
          <h1 className="text-3xl font-black">Fin de semana rápido</h1>
          <p className="text-sm text-muted">Juega un fin de semana suelto. No afecta a tu partida.</p>
        </div>
        <ol className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                  i === step ? "border-accent bg-accent/15 text-fg" : i < step ? "border-good/30 bg-good/10 text-good" : "border-line text-muted hover:text-fg",
                )}
              >
                {i + 1} · {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel fill title={`${step + 1} · ${STEPS[step]}`} className="h-full">
          {step === 0 && (
            <div className="grid flex-1 content-center gap-3 sm:grid-cols-3">
              {(["f1", "f2", "f3"] as SeriesId[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setSeries(s);
                    setTeamId(teamsOf(s)[0].id);
                    setStep(1);
                  }}
                  className={cx("rounded-xl border p-5 text-left transition", series === s ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                >
                  <div className="flex h-12 items-center">
                    <SeriesLogo s={s} className="h-full" textClass="text-4xl" />
                  </div>
                  <div className="mt-2 font-semibold">{SERIES_NAMES[s]}</div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <PagedGrid
              items={CIRCUIT_ORDER}
              minW={190}
              minH={64}
              gap={8}
              keyOf={(id) => id}
              focus={CIRCUIT_ORDER.indexOf(circuitId)}
              render={(id) => {
                const c = CIRCUITS[id];
                const inCal = CALENDAR_2026.some((w) => w.circuitId === id && w[series]);
                return (
                  <button
                    type="button"
                    onClick={() => setCircuitId(id)}
                    className={cx("flex h-full w-full items-center gap-2 rounded-lg border p-2 text-left transition", circuitId === id ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                  >
                    <TrackMap circuitId={id} className="h-12 w-12 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.city}</div>
                      <div className="truncate text-[11px] text-muted">{c.country}</div>
                      {inCal && <div className="text-[10px] font-bold uppercase" style={{ color: SERIES_COLOR[series] }}>Calendario {series.toUpperCase()}</div>}
                    </div>
                  </button>
                );
              }}
            />
          )}

          {step === 2 && (
            <PagedGrid
              items={teamsOf(series)}
              minW={250}
              minH={series === "f3" ? 175 : 155}
              gap={8}
              keyOf={(t) => t.id}
              focus={teamsOf(series).findIndex((t) => t.id === teamId)}
              render={(t) => (
                <button
                  type="button"
                  onClick={() => setTeamId(t.id)}
                  className={cx("flex h-full w-full gap-2 overflow-hidden rounded-lg border p-3 text-left transition", teamId === t.id ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                >
                  <Stripe color={t.color} className="w-1.5" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <TeamCar team={t} series={series} className="mb-1 min-h-0 w-full flex-1" />
                    <div className="flex shrink-0 items-baseline justify-between gap-2">
                      <span className="truncate font-bold">{t.short}</span>
                      <span className="text-sm font-black tabular">{carScore(t, PUS).toFixed(0)}</span>
                    </div>
                    {ALL_DRIVERS.filter((d) => d.teamId === t.id)
                      .sort((a, b) => a.number - b.number)
                      .map((d) => (
                        <div key={d.id} className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                          <span className="w-5 text-right font-mono">{d.number}</span>
                          <span className="truncate">{d.last}</span>
                          <Nat code={d.nat} />
                        </div>
                      ))}
                  </div>
                </button>
              )}
            />
          )}

          {step === 3 && (
            <div className="max-w-xl space-y-5">
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
          )}

          <div className="mt-3 flex shrink-0 justify-between gap-2 border-t border-line pt-3">
            <Btn disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              ← Atrás
            </Btn>
            {step < STEPS.length - 1 && (
              <Btn variant="primary" onClick={() => setStep((s) => s + 1)}>
                Siguiente: {STEPS[step + 1]} →
              </Btn>
            )}
          </div>
        </Panel>

        <div className="hidden min-h-0 lg:block">
        <Panel fill title="Resumen" className="h-full">
          <TrackMap circuitId={circuitId} className="mx-auto min-h-0 w-full max-w-60 flex-1" />
          <div className="mt-2 shrink-0 text-center">
            <div className="font-bold">{circuit.name}</div>
            <div className="text-xs text-muted">
              {circuit.city}, {circuit.country} · {circuit.lengthKm.toFixed(3)} km
            </div>
            <div className="mt-2 text-sm">
              {SERIES_NAMES[series]} · <b>{team?.name}</b>
            </div>
            <div className="mt-1 text-xs text-muted">
              {series === "f1" && sprint ? "Con sprint · " : ""}
              {WEATHER_MODE_LABELS[weather]}
              {skip ? " · Sin libres" : ""}
            </div>
          </div>
          <Btn variant="primary" size="lg" className="mt-4 w-full shrink-0" onClick={start}>
            <Flag className="h-5 w-5" /> Empezar fin de semana
          </Btn>
        </Panel>
        </div>
      </div>
      {/* En pantallas estrechas el resumen se oculta: el botón de empezar va abajo. */}
      <Btn variant="primary" size="lg" className="mt-3 w-full shrink-0 lg:hidden" onClick={start}>
        <Flag className="h-5 w-5" /> Empezar fin de semana
      </Btn>
    </div>
  );
}
