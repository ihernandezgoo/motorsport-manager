import { useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { teamDrivers } from "@/lib/game/format";
import { formatLap } from "@/lib/game/perf";
import { rngFor } from "@/lib/game/rng";
import { autoSetupValues, driverFeedback, practiceLap, practiceRuns, SETUP_PARAMS, setupQuality } from "@/lib/game/setup";
import type { GameState, SetupValues, WeekendState } from "@/lib/game/types";
import { wetnessAt } from "@/lib/game/weather";
import { skipPractice } from "@/lib/game/weekend";
import { Btn, cx, Meter, Panel, Stripe } from "../ui";

export function PracticeSession({ state, ws }: { state: GameState; ws: WeekendState }) {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const team = state.teams[state.player.teamId];
  const drivers = teamDrivers(state, team.id);
  const [vals, setVals] = useState<Record<string, SetupValues>>(() => Object.fromEntries(drivers.map((d) => [d.id, ws.setup[d.id]?.values ?? { aero: 50, susp: 50, gear: 50 }])));
  const totalRuns = practiceRuns(ws.series, !!wk.f1?.sprint && ws.series === "f1");

  const runLap = (id: string) => {
    const values = vals[id];
    updateWeekend((w, d) => {
      const st = w.setup[id];
      if (!st || st.runsLeft <= 0) return;
      const rng = rngFor(d.seed, d.year, wk.id, id, "practice", st.runs.length);
      const q = setupQuality(values, st.optimum);
      const wet = wetnessAt(w.weather.practice, (st.runs.length + 0.5) / totalRuns);
      const time = practiceLap(w.series, d.teams[team.id], d.drivers[id], d.pus, circuit, wet, q, rng);
      const feedback = driverFeedback(values, st.optimum, d.drivers[id], rng);
      st.runs.push({ values, time, feedback, quality: q });
      st.runsLeft--;
      if (q > st.quality || st.runs.length === 1) {
        st.quality = Math.max(st.quality, q);
        st.values = values;
      }
    });
  };

  const engineer = (id: string) => {
    const st = ws.setup[id];
    if (!st) return;
    const rng = rngFor(state.seed, state.year, wk.id, id, "engineer", st.runs.length);
    setVals((v) => ({ ...v, [id]: autoSetupValues(st.optimum, team, rng) }));
  };

  // Si algún piloto no ha rodado, el ingeniero aplica un reglaje genérico.
  const finish = () => updateWeekend((w, d) => skipPractice(d, w));

  return (
    <div className="space-y-4">
      <Panel title="Entrenamientos libres · Reglajes">
        <p className="text-sm text-muted">
          Ajusta el coche y sal a pista. Tras cada tanda el piloto te dirá qué cambiaría. Un buen reglaje da confianza y
          mejora el ritmo a una vuelta y en carrera (hasta medio segundo). Los pilotos con buen <i>feedback</i> técnico dan
          indicaciones más precisas. Dispones de <b className="text-fg">{totalRuns} tandas</b> por piloto.
        </p>
      </Panel>
      <div className={cx("grid gap-4", drivers.length > 2 ? "xl:grid-cols-3" : "lg:grid-cols-2")}>
        {drivers.map((d) => {
          const st = ws.setup[d.id];
          if (!st) return null;
          const v = vals[d.id];
          const last = st.runs[st.runs.length - 1];
          return (
            <Panel
              key={d.id}
              title={
                <span className="flex items-center gap-2 normal-case tracking-normal">
                  <Stripe color={team.color} className="h-4" />
                  <span className="text-sm font-bold text-fg">
                    #{d.number} {d.first} {d.last}
                  </span>
                </span>
              }
              right={<span className="text-xs text-muted">Tandas: {st.runsLeft}/{totalRuns}</span>}
            >
              <div className="space-y-4">
                {SETUP_PARAMS.map((p) => (
                  <div key={p.key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold">{p.label}</span>
                      <span className="tabular text-muted">{v[p.key]}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={v[p.key]}
                      disabled={st.runsLeft <= 0}
                      onChange={(e) => setVals((all) => ({ ...all, [d.id]: { ...all[d.id], [p.key]: Number(e.target.value) } }))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-dim">
                      <span>{p.low}</span>
                      <span>{p.high}</span>
                    </div>
                  </div>
                ))}
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">Confianza del piloto (mejor reglaje)</span>
                    <span className="font-bold tabular">{Math.round(st.quality * 100)}%</span>
                  </div>
                  <Meter value={st.quality * 100} color={st.quality > 0.85 ? "#22c55e" : st.quality > 0.7 ? "#f59e0b" : "#ef4444"} height={8} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn variant="primary" disabled={st.runsLeft <= 0} onClick={() => runLap(d.id)}>
                    Salir a pista
                  </Btn>
                  <Btn disabled={st.runsLeft <= 0} onClick={() => engineer(d.id)} title="Tu ingeniero propone un reglaje según los datos del equipo">
                    Propuesta del ingeniero
                  </Btn>
                </div>
                {last && (
                  <div className="rounded-lg border border-line bg-panel-2 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted">Última tanda</span>
                      <span className="font-mono text-sm font-bold">{formatLap(last.time)}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs">
                      {last.feedback.map((f) => (
                        <li key={f} className={f.startsWith("✔") ? "text-good" : "text-warn"}>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {st.runs.length > 1 && (
                  <div className="text-[11px] text-dim">
                    Tiempos: {st.runs.map((r) => formatLap(r.time)).join(" · ")}
                  </div>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Btn variant="primary" size="lg" onClick={finish}>
          Terminar libres →
        </Btn>
      </div>
    </div>
  );
}
