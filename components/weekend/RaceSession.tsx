import { Flag } from "lucide-react";
import { useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { teamDrivers } from "@/lib/game/format";
import { baseLap } from "@/lib/game/perf";
import { describePlan, planStrategy, tyreLife } from "@/lib/game/strategy";
import { availableCompounds, COMPOUND_INFO, dryCompounds, isWetTyre } from "@/lib/game/tyres";
import type { Compound, GameState, SessionDef, WeekendState } from "@/lib/game/types";
import { earlyRaceWetness, forecastLabel, wetnessLabel } from "@/lib/game/weather";
import { freshestSet, setLabel } from "@/lib/game/tyreSets";
import { advanceStep, raceConfigFor, wearMultFor } from "@/lib/game/weekend";
import { liveRace, useLiveRace } from "@/lib/liveRace";
import { Btn, cx, PagedGrid, Panel, Segmented, Stripe, Tabs, Tyre } from "../ui";
import { RaceHud } from "../race/RaceHud";

export function RaceSession({
  state,
  ws,
  session,
  onLeave,
  leaveLabel,
}: {
  state: GameState;
  ws: WeekendState;
  session: SessionDef;
  onLeave?: () => void;
  leaveLabel?: string;
}) {
  const snap = useLiveRace();
  const wk = state.calendar[ws.weekendIndex];
  const liveKey = `${state.year}-${wk.id}-${ws.series}-${session.key}`;

  const finish = () => {
    const res = liveRace.result();
    if (!res) return;
    const usage = liveRace.tyreUsage();
    updateWeekend((w, d) => {
      w.results.push(res);
      for (const [id, used] of Object.entries(usage)) {
        for (const u of used) {
          const set = w.tyres?.[id]?.find((s) => s.id === u.id);
          if (set) {
            set.wear = Math.max(set.wear, Math.min(100, u.wear));
            set.used = true;
          }
        }
      }
      advanceStep(d, w);
    });
    liveRace.dispose();
  };

  if (snap && snap.key === liveKey) return <RaceHud state={state} snap={snap} dateISO={wk.date} onContinue={finish} onLeave={onLeave} leaveLabel={leaveLabel} />;
  return <RacePrep state={state} ws={ws} session={session} liveKey={liveKey} />;
}

function RacePrep({ state, ws, session, liveKey }: { state: GameState; ws: WeekendState; session: SessionDef; liveKey: string }) {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const team = state.teams[state.player.teamId];
  const cfg = raceConfigFor(state, ws, session.key);
  const plan = ws.weather[session.key];
  const mine = teamDrivers(state, team.id);
  const dry = dryCompounds(ws.series, circuit);
  const compounds = availableCompounds(ws.series, circuit);
  const base = baseLap(ws.series, circuit);

  const suggestion = (id: string, start?: Compound) =>
    planStrategy(
      { series: ws.series, circuit, base, laps: cfg.laps, dry, mustTwo: cfg.mustTwo, tyreSkill: state.drivers[id].tyre, pitLoss: circuit.pitLoss },
      undefined,
      start,
    );
  const startWet = earlyRaceWetness(plan, base, cfg.laps);
  const defaultCompound = (id: string): Compound => (startWet >= 0.85 ? "W" : startWet >= 0.2 ? "I" : suggestion(id).start);

  const [compound, setCompound] = useState<Record<string, Compound>>(() => Object.fromEntries(mine.map((d) => [d.id, defaultCompound(d.id)])));
  const [auto, setAuto] = useState<Record<string, boolean>>(() => Object.fromEntries(mine.map((d) => [d.id, false])));
  const [setChoice, setSetChoice] = useState<Record<string, string>>({});
  const [side, setSide] = useState<"grid" | "tyres">("grid");
  const setsOf = (id: string) => (ws.tyres?.[id] ?? []).filter((s) => s.wear < 100);
  /** Juego de salida: el elegido o el menos gastado del compuesto. */
  const startSet = (id: string) => {
    const sets = setsOf(id);
    return sets.find((s) => s.id === setChoice[id] && s.compound === compound[id]) ?? freshestSet(sets, compound[id]);
  };

  const start = (instant: boolean) => {
    const startSets = Object.fromEntries(mine.map((d) => [d.id, startSet(d.id)]).filter(([, s]) => !!s));
    const full = raceConfigFor(state, ws, session.key, { playerTeamId: team.id, startCompounds: compound, startSets });
    const autoMap = instant ? Object.fromEntries(mine.map((d) => [d.id, true])) : auto;
    liveRace.start(liveKey, full, { auto: autoMap, speed: state.settings.defaultSpeed, autoPause: state.settings.autoPause });
    if (instant) liveRace.finishNow();
  };

  const rules =
    ws.series === "f3"
      ? "Sin paradas obligatorias. Un único compuesto de seco: gestiona el desgaste."
      : cfg.mustTwo
        ? "En seco es obligatorio usar al menos dos compuestos distintos (no aplica si se usan neumáticos de lluvia)."
        : "Sin parada obligatoria.";
  const reversed = ws.series !== "f1" && session.kind === "sprint";

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel fill className="h-full" title={`${session.label} · ${cfg.laps} vueltas`}>
          <div className="mb-3 grid shrink-0 gap-3 rounded-lg border border-line bg-panel-2 p-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted">Pronóstico</div>
              <div className="font-semibold">{forecastLabel(Math.max(...plan.forecast))}</div>
              <div className="text-[11px] text-dim">Por cuartos de carrera: {plan.forecast.join("% · ")}%</div>
            </div>
            <div>
              <div className="text-xs text-muted">Pista en la salida</div>
              <div className="font-semibold">
                {wetnessLabel(plan.initialWetness)}
                {plan.initialWetness >= 0.05 && <span className="font-normal text-muted"> → {wetnessLabel(startWet).toLowerCase()} en 2 vueltas</span>}
              </div>
              <div className="text-[11px] text-dim">
                {plan.airTemp}°C aire · {plan.trackTemp}°C asfalto
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Normativa</div>
              <div className="text-[12px] leading-snug">{rules}</div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
            {mine.map((d) => {
              const pos = cfg.grid.indexOf(d.id) + 1;
              const c = compound[d.id];
              const s = isWetTyre(c) ? null : suggestion(d.id, c);
              return (
                <div key={d.id} className="rounded-lg border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="flex w-36 items-center gap-2">
                      <Stripe color={team.color} className="h-6" />
                      <span className="truncate text-lg font-black">
                        P{pos} · {d.last}
                      </span>
                    </div>
                    <Segmented
                      value={c}
                      onChange={(v) => {
                        setCompound((x) => ({ ...x, [d.id]: v }));
                        setSetChoice((x) => ({ ...x, [d.id]: "" }));
                      }}
                      options={compounds.map((cp) => {
                        const n = setsOf(d.id).filter((s) => s.compound === cp).length;
                        return {
                          value: cp,
                          title: `${COMPOUND_INFO[cp].name}: ${n} juegos disponibles`,
                          label: (
                            <span className="flex items-center gap-1">
                              <Tyre c={cp} size={18} /> {COMPOUND_INFO[cp].name} <span className="text-[10px] opacity-70">×{n}</span>
                            </span>
                          ),
                          activeColor: "#2f3a4a",
                          disabled: ws.tyres?.[d.id] ? n === 0 : false,
                        };
                      })}
                    />
                    {ws.tyres?.[d.id] && (
                      <select
                        value={startSet(d.id)?.id ?? ""}
                        onChange={(e) => setSetChoice((x) => ({ ...x, [d.id]: e.target.value }))}
                        className="rounded border border-line-2 bg-panel-2 px-1 py-0.5 text-[11px]"
                      >
                        {setsOf(d.id)
                          .filter((s) => s.compound === c)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {setLabel(s)}
                            </option>
                          ))}
                      </select>
                    )}
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={auto[d.id]} onChange={(e) => setAuto((a) => ({ ...a, [d.id]: e.target.checked }))} />
                      Delegar en el ingeniero (IA)
                    </label>
                  </div>
                  {ws.gridPenalty?.[d.id] && session.kind === "race" && (
                    <div className="mt-1 text-xs text-bad">
                      Sanción de {ws.gridPenalty[d.id].places} puestos ({ws.gridPenalty[d.id].reason})
                    </div>
                  )}
                  {wearMultFor(ws, d.id) < 1 && <div className="mt-1 text-[11px] text-good">Datos de tandas largas: −{Math.round((1 - wearMultFor(ws, d.id)) * 100)} % de desgaste</div>}
                  <div className="mt-1 truncate text-xs text-muted">
                    {s ? (
                      <>
                        Estrategia sugerida: <b className="text-fg">{describePlan(s)}</b>
                      </>
                    ) : (
                      "Con lluvia: vigila el radar y cambia a seco cuando la humedad baje del 15 %."
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap gap-2">
            <Btn variant="primary" size="lg" onClick={() => start(false)}>
              <Flag className="h-5 w-5" /> Comenzar carrera
            </Btn>
            <Btn size="lg" onClick={() => start(true)} title="Simula la carrera al instante con las decisiones de tu ingeniero">
              Simular sin ver
            </Btn>
          </div>
        </Panel>

        <div className="hidden min-h-0 lg:block">
          <Panel
            fill
            className="h-full"
            title={
              <Tabs
                value={side}
                onChange={setSide}
                tabs={[
                  { id: "grid", label: "Parrilla" },
                  { id: "tyres", label: "Neumáticos" },
                ]}
              />
            }
          >
          {side === "tyres" ? (
            <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-dim">
                  <th className="pb-1">Compuesto</th>
                  {mine.map((d) => (
                    <th key={d.id} className="pb-1 text-right">
                      {d.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dry.map((c) => (
                  <tr key={c} className="border-t border-line/60">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <Tyre c={c} size={18} /> {COMPOUND_INFO[c].name}
                      </span>
                    </td>
                    {mine.map((d) => (
                      <td key={d.id} className="py-1.5 text-right tabular">
                        ~{tyreLife(ws.series, circuit, c, state.drivers[d.id].tyre)} v
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-dim">Vueltas hasta ~75 % de desgaste a ritmo neutral. Atacar las acorta; conservar las alarga.</p>
            </>
          ) : (
            <PagedGrid
              items={cfg.grid}
              minW={110}
              minH={28}
              maxCols={2}
              gap={6}
              keyOf={(id) => id}
              focus={cfg.grid.findIndex((id) => state.drivers[id].teamId === team.id)}
              header={<span className="text-xs text-muted">{reversed ? "Top invertido" : "Orden de salida"}</span>}
              render={(id, i) => {
                const d = state.drivers[id];
                const t = state.teams[d.teamId];
                return (
                  <div className={cx("flex h-full items-center gap-2 rounded px-2 text-xs", t.id === team.id ? "bg-accent/15" : "bg-panel-2")}>
                    <span className="w-5 text-right font-bold tabular text-muted">{i + 1}</span>
                    <Stripe color={t.color} className="h-4" />
                    <span className="font-semibold">{d.code}</span>
                    <span className="truncate text-muted">{d.last}</span>
                  </div>
                );
              }}
            />
          )}
          </Panel>
        </div>
    </div>
  );
}
