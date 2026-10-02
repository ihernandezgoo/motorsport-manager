import { useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { teamDrivers } from "@/lib/game/format";
import { formatLap } from "@/lib/game/perf";
import { aiQualiChoice, assembleQuali, forcedCompound, qualiSegments, RISK_LABELS, runSegment, segmentConditions, type QualiChoice, type Risk } from "@/lib/game/qualifying";
import { rngFor } from "@/lib/game/rng";
import { availableCompounds, COMPOUND_INFO, idealForWetness, isWetTyre } from "@/lib/game/tyres";
import type { GameState, QualiEntry, SessionDef, WeekendState } from "@/lib/game/types";
import { describeWeather, wetnessLabel } from "@/lib/game/weather";
import { qualiContext, seriesDrivers } from "@/lib/game/weekend";
import { Btn, cx, Meter, Nat, Pager, Panel, Segmented, Stripe, Tyre, useRowPager, WeatherIcon } from "../ui";

export function QualifyingSession({ state, ws, session }: { state: GameState; ws: WeekendState; session: SessionDef }) {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const team = state.teams[state.player.teamId];
  const sprint = session.kind === "sprintQuali";
  const all = seriesDrivers(state, ws.series).map((d) => d.id);
  const segs = qualiSegments(ws.series, all.length, sprint);
  const [results, setResults] = useState<QualiEntry[][]>([]);
  const [choices, setChoices] = useState<Record<string, Partial<QualiChoice>>>({});
  const segIdx = results.length;
  const done = segIdx >= segs.length;
  const participants = segIdx === 0 ? all : results[segIdx - 1].slice(0, segs[segIdx - 1].keep).map((e) => e.driverId);
  const plan = ws.weather[session.key];
  const cond = segmentConditions(plan, Math.min(segIdx, segs.length - 1), segs.length);
  const mine = teamDrivers(state, team.id);
  const compounds = availableCompounds(ws.series, circuit);
  const forced = forcedCompound(ws.series, sprint, segIdx, cond.wet);
  const ideal = idealForWetness(cond.wet);

  const choiceFor = (id: string): QualiChoice => {
    const ai = aiQualiChoice(ws.series, circuit, cond.wet, sprint, segIdx);
    const c = choices[id] ?? {};
    let compound = c.compound ?? ai.compound;
    if (forced && !isWetTyre(compound)) compound = forced;
    return { compound, risk: (c.risk ?? ai.risk) as Risk };
  };

  const runNext = () => {
    const ctx = qualiContext(state, ws, session.key);
    const ch: Record<string, QualiChoice> = {};
    for (const d of mine) if (participants.includes(d.id)) ch[d.id] = choiceFor(d.id);
    const rng = rngFor(state.seed, state.year, wk.id, session.key, segIdx);
    setResults((r) => [...r, runSegment(ctx, participants, segIdx, segs.length, ch, rng)]);
    setChoices({});
  };

  const confirm = () =>
    updateWeekend((w) => {
      w.quali[session.key] = assembleQuali(session.key, results);
      w.step++;
    });

  const shown = done ? assembleQuali(session.key, results).order : results[segIdx - 1];
  const shownSeg = done ? segs.length - 1 : segIdx - 1;
  const cut = !done && shownSeg >= 0 ? segs[shownSeg].keep : null;
  const weatherNow = describeWeather(cond.rain, Math.max(cond.rain, 0.3));
  const best = shown?.find((e) => e.time !== null)?.time ?? null;

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <Panel
        fill
        className="h-full"
        title={`${session.label} · ${done ? "Parrilla definitiva" : segs[segIdx].name}`}
        right={
          <div className="flex items-center gap-2 text-xs text-muted">
            {segs.map((s, i) => (
              <span key={s.name} className={cx("rounded px-2 py-0.5 font-bold", i < segIdx ? "bg-good/20 text-good" : i === segIdx ? "bg-accent text-white" : "bg-panel-3")}>
                {s.name}
              </span>
            ))}
          </div>
        }
      >
        {!done ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-panel-2 p-3 text-sm">
              <WeatherIcon w={weatherNow} className="h-8 w-8" />
              <div>
                <div className="text-xs text-muted">Pista</div>
                <div className="font-semibold">{wetnessLabel(cond.wet)}</div>
              </div>
              <div className="w-40">
                <div className="mb-1 text-xs text-muted">Humedad {Math.round(cond.wet * 100)}%</div>
                <Meter value={cond.wet * 100} color="#3b82f6" />
              </div>
              <div>
                <div className="text-xs text-muted">Neumático recomendado</div>
                <div className="font-semibold">{ideal === "dry" ? "Seco" : COMPOUND_INFO[ideal].name}</div>
              </div>
              {forced && <div className="text-xs text-warn">Normativa sprint: compuesto {COMPOUND_INFO[forced].name} obligatorio en seco</div>}
              <div className="text-xs text-muted">
                {participants.length} pilotos en pista · pasan {segs[segIdx].keep < participants.length ? segs[segIdx].keep : "todos"}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
              {mine.map((d) => {
                const inSeg = participants.includes(d.id);
                const c = choiceFor(d.id);
                return (
                  <div key={d.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line p-3", !inSeg && "opacity-40")}>
                    <div className="flex w-36 items-center gap-2">
                      <Stripe color={team.color} className="h-4" />
                      <span className="truncate font-bold">
                        #{d.number} {d.last}
                      </span>
                      {!inSeg && <span className="text-xs text-bad">Eliminado</span>}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-xs text-muted">Neumático</span>
                        <Segmented
                          size="xs"
                          disabled={!inSeg}
                          value={c.compound}
                          onChange={(v) => setChoices((x) => ({ ...x, [d.id]: { ...x[d.id], compound: v } }))}
                          options={compounds.map((cp) => ({ value: cp, label: <Tyre c={cp} size={18} />, activeColor: "#2f3a4a", disabled: !!forced && !isWetTyre(cp) && cp !== forced }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-xs text-muted">Riesgo</span>
                        <Segmented
                          size="xs"
                          disabled={!inSeg}
                          value={c.risk}
                          onChange={(v) => setChoices((x) => ({ ...x, [d.id]: { ...x[d.id], risk: v } }))}
                          options={RISK_LABELS.map((l, i) => ({ value: i as Risk, label: l, activeColor: ["#2563eb", "#4b5563", "#dc2626"][i] }))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="shrink-0 text-xs text-dim">
              &quot;Al límite&quot; gana unas décimas pero aumenta el riesgo de error o de que te anulen la vuelta. En mojado los errores son más
              probables, y salir con slicks en pista mojada es un suicidio.
            </p>
            <Btn variant="primary" size="lg" className="shrink-0 self-start" onClick={runNext}>
              Salir a pista · {segs[segIdx].name}
            </Btn>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">Clasificación terminada. Revisa la parrilla y confírmala para continuar.</p>
            <Btn variant="primary" size="lg" onClick={confirm}>
              Confirmar parrilla →
            </Btn>
          </div>
        )}
      </Panel>

      <QualiTimes
        key={shownSeg}
        state={state}
        rows={shown ?? []}
        title={!shown ? "Tiempos" : done ? "Parrilla de salida" : `Resultados ${segs[shownSeg].name}`}
        cut={cut}
        best={best}
        segLabel={done && segs.length > 1 ? (e) => `Q${e.segment + 1}` : undefined}
      />
    </div>
  );
}

const ROW = 30;

function QualiTimes({
  state,
  rows,
  title,
  cut,
  best,
  segLabel,
}: {
  state: GameState;
  rows: QualiEntry[];
  title: string;
  cut: number | null;
  best: number | null;
  segLabel?: (e: QualiEntry) => string;
}) {
  const { ref, pager } = useRowPager(rows.length, ROW, 0, rows.findIndex((e) => e.teamId === state.player.teamId));
  return (
    <Panel fill className="h-full" title={title} bodyClass="p-0" right={<Pager pager={pager} />}>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {rows.length === 0 && <p className="p-4 text-sm text-muted">Todavía no hay tiempos. Elige neumático y riesgo y sal a pista.</p>}
        <table className="w-full text-sm">
          <tbody>
            {rows.slice(pager.start, pager.end).map((e, j) => {
              const i = pager.start + j;
              const d = state.drivers[e.driverId];
              const t = state.teams[e.teamId];
              const isMine = t.id === state.player.teamId;
              return (
                <tr
                  key={e.driverId}
                  className={cx("border-b border-line/60", isMine && "bg-accent/10", cut !== null && i === cut && "border-t-2 border-t-bad")}
                  style={{ height: ROW }}
                >
                  <td className="w-10 text-center font-bold tabular">{i + 1}</td>
                  <td className="pr-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Stripe color={t.color} className="h-5" />
                      <span className="w-6 text-right font-mono text-xs text-muted">{d.number}</span>
                      <span className="font-semibold">{d.last}</span>
                      <Nat code={d.nat} />
                      <span className="text-xs text-dim">{t.short}</span>
                    </div>
                  </td>
                  <td className="pr-2">
                    <Tyre c={e.compound} size={18} />
                  </td>
                  <td className="pr-2 text-right font-mono text-xs tabular">{formatLap(e.time)}</td>
                  <td className="pr-3 text-right font-mono text-xs tabular text-muted">{e.time !== null && best !== null && i > 0 ? `+${(e.time - best).toFixed(3)}` : ""}</td>
                  <td className="max-w-24 truncate pr-3 text-xs text-warn" title={e.note}>
                    {e.note}
                  </td>
                  {segLabel && <td className="pr-3 text-right text-[10px] text-dim">{segLabel(e)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cut !== null && <div className="shrink-0 px-4 py-2 text-[11px] text-dim">La línea roja marca la zona de eliminación.</div>}
    </Panel>
  );
}
