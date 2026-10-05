import { Flag, Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { teamDrivers } from "@/lib/game/format";
import { formatLap } from "@/lib/game/perf";
import { assembleQuali, forcedCompound, qualiSegments, RISK_LABELS, segmentTiming, type Risk } from "@/lib/game/qualifying";
import { hashString } from "@/lib/game/rng";
import { setLabel } from "@/lib/game/tyreSets";
import { availableCompounds, COMPOUND_INFO, idealForWetness, isWetTyre } from "@/lib/game/tyres";
import type { Compound, GameState, SessionDef, TyreSet, WeekendState } from "@/lib/game/types";
import { describeWeather, wetnessLabel } from "@/lib/game/weather";
import { advanceStep, qualiContext, seriesDrivers } from "@/lib/game/weekend";
import { liveQuali, QUALI_SPEEDS, useLiveQuali, type QualiPlayer, type QualiSnapshot } from "@/lib/liveQuali";
import { TrackView, type CameraMode } from "../race/TrackView";
import { Btn, cx, Meter, Panel, Segmented, Stripe, Tyre, WeatherIcon } from "../ui";

const PHASE_LABEL = { garage: "En el garaje", out: "Vuelta de salida", push: "Vuelta lanzada", cool: "Vuelta de enfriamiento", in: "Vuelta de entrada" } as const;

function clockText(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function QualifyingSession({ state, ws, session }: { state: GameState; ws: WeekendState; session: SessionDef }) {
  const wk = state.calendar[ws.weekendIndex];
  const sprint = session.kind === "sprintQuali";
  const all = seriesDrivers(state, ws.series).map((d) => d.id);
  const segs = qualiSegments(ws.series, all.length, sprint);
  const done = ws.qualiProgress?.[session.key] ?? [];
  const segIdx = done.length;
  const liveKey = `${state.year}-${wk.id}-${ws.series}-${session.key}-${segIdx}`;
  const snap = useLiveQuali();

  useEffect(() => {
    if (segIdx >= segs.length || liveQuali.getSnapshot()?.key === liveKey) return;
    const participants = segIdx === 0 ? all : done[segIdx - 1].slice(0, segs[segIdx - 1].keep).map((e) => e.driverId);
    const timing = segmentTiming(ws.series, sprint)[segIdx];
    liveQuali.start(liveKey, {
      ctx: qualiContext(state, ws, session.key),
      segIdx,
      nSeg: segs.length,
      segName: segs[segIdx].name,
      participants,
      keep: segIdx < segs.length - 1 ? segs[segIdx].keep : participants.length,
      startMinute: timing.start,
      minutes: timing.minutes,
      sessionMinutes: ws.weather[session.key].minutes,
      playerTeamId: state.player.teamId,
      sets: Object.fromEntries(Object.entries(ws.tyres ?? {})),
      seed: hashString(`${state.seed}|${liveKey}`),
    });
    // Solo al cambiar de tanda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  if (segIdx >= segs.length) return <QualiDone session={session} />;
  if (!snap || snap.key !== liveKey) return <div className="grid flex-1 place-items-center text-sm text-muted">Preparando la sesión…</div>;

  const saveSegment = () => {
    const res = liveQuali.results();
    const sets = liveQuali.sets();
    if (!res) return;
    updateWeekend((w, d) => {
      w.qualiProgress ??= {};
      const prog = (w.qualiProgress[session.key] ??= []);
      prog.push(res);
      if (sets) for (const [id, s] of Object.entries(sets)) if (w.tyres[id]) w.tyres[id] = s;
      if (prog.length >= segs.length) {
        w.quali[session.key] = assembleQuali(session.key, prog);
        advanceStep(d, w);
      }
    });
    liveQuali.dispose();
  };

  return <LiveQuali state={state} ws={ws} session={session} snap={snap} segs={segs} onSave={saveSegment} />;
}

function LiveQuali({
  state,
  ws,
  session,
  snap,
  segs,
  onSave,
}: {
  state: GameState;
  ws: WeekendState;
  session: SessionDef;
  snap: QualiSnapshot;
  segs: { name: string; keep: number }[];
  onSave: () => void;
}) {
  const team = state.teams[state.player.teamId];
  const mine = teamDrivers(state, team.id);
  const [camera, setCamera] = useState<CameraMode>({ kind: "overview" });
  const [zoom, setZoom] = useState(0);
  const last = snap.segIdx === segs.length - 1;
  const cut = last ? null : snap.keep;

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-xl border border-line">
          <TrackView
            circuitId={CIRCUITS[state.calendar[ws.weekendIndex].circuitId].id}
            garageColors={Object.values(state.teams).filter((t) => t.series === ws.series).map((t) => t.color)}
            cars={snap.dots}
            camera={camera}
            zoom={zoom}
            onZoom={setZoom}
            onCamera={setCamera}
            onSelect={(id) => setCamera({ kind: "follow", id })}
            labelIds={mine.map((d) => d.id)}
            className="absolute inset-0"
          >
            {snap.wet > 0.05 && <div className="pointer-events-none absolute inset-0 bg-[#163552] mix-blend-multiply" style={{ opacity: Math.min(0.6, snap.wet * 0.65) }} />}
            {snap.rain > 0.05 && <div className="rain-overlay pointer-events-none absolute inset-0" style={{ opacity: Math.min(1, 0.45 + snap.rain) }} />}
          </TrackView>
          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-black/80 px-3 py-1.5 text-lg font-black tabular text-white">
              {snap.segName} · {clockText(snap.remaining)}
            </span>
            {snap.red && <span className="rounded-lg bg-[#dc2626] px-3 py-1.5 text-sm font-black text-white">🟥 BANDERA ROJA</span>}
            {snap.chequered && !snap.finished && <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-black text-black">🏁 Últimas vueltas</span>}
            <span className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white">
              <WeatherIcon w={describeWeather(snap.rain, Math.max(snap.rain, 0.3))} className="h-5 w-5" />
              {wetnessLabel(snap.wet)} · ideal: {idealForWetness(snap.wet) === "dry" ? "seco" : COMPOUND_INFO[idealForWetness(snap.wet) as Compound].name.toLowerCase()}
            </span>
          </div>
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-black/80 p-1 text-white">
            <button type="button" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10" onClick={() => (snap.playing ? liveQuali.pause() : liveQuali.play())} disabled={snap.finished} aria-label="Reproducir o pausar">
              {snap.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            {QUALI_SPEEDS.map((s) => (
              <button type="button" key={s} onClick={() => liveQuali.setSpeed(s)} className={cx("rounded px-2 py-1 text-xs font-bold", snap.speed === s ? "bg-white text-black" : "hover:bg-white/10")}>
                ×{s}
              </button>
            ))}
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"
              title="Simular el resto de la tanda"
              disabled={snap.finished}
              onClick={() => window.confirm("¿Simular el resto de la tanda con las órdenes actuales? Tus pilotos en el garaje no volverán a salir salvo que estén en manos del ingeniero.") && liveQuali.finishNow()}
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          {snap.finished && (
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 bg-black/85 px-4 py-3 text-white">
              <span className="text-sm">
                <Flag className="mr-2 inline h-4 w-4" />
                {snap.segName} terminada.{" "}
                {cut !== null ? `Pasan los ${cut} primeros.` : "Parrilla definida."}
              </span>
              <Btn variant="primary" onClick={onSave}>
                {last ? "Confirmar parrilla →" : `Continuar a ${segs[snap.segIdx + 1].name} →`}
              </Btn>
            </div>
          )}
        </div>
        <div className={cx("grid shrink-0 gap-3", mine.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2")}>
          {mine.map((d) => {
            const p = snap.players.find((x) => x.id === d.id);
            return p ? <DriverQualiCard key={d.id} state={state} ws={ws} session={session} snap={snap} p={p} /> : <EliminatedCard key={d.id} name={`#${d.number} ${d.last}`} color={team.color} />;
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <Panel fill className="min-h-0 flex-1" title="Tiempos en directo" bodyClass="p-0">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {snap.rows.map((r) => (
                  <tr key={r.id} className={cx("border-b border-line/60", r.isPlayer && "bg-accent/10", cut !== null && r.pos === cut + 1 && "border-t-2 border-t-bad")} style={{ height: 24 }}>
                    <td className={cx("w-7 text-center font-bold tabular", cut !== null && r.pos > cut && "text-bad")}>{r.pos}</td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <Stripe color={r.color} className="h-4" />
                        <span className="font-semibold">{r.code}</span>
                      </span>
                    </td>
                    <td className="w-6">{r.compound && <Tyre c={r.compound} size={15} />}</td>
                    <td className="w-14 text-[10px] text-muted">
                      {r.crashed ? <span className="text-bad">ACC</span> : r.phase === "garage" ? "BOX" : r.phase === "push" ? <span className="font-bold text-[#a78bfa]">⏱ LANZ</span> : r.phase === "out" ? "SALIDA" : r.phase === "in" ? "ENTRA" : "ENFR"}
                    </td>
                    <td className="pr-2 text-right font-mono tabular">{formatLap(r.best)}</td>
                    <td className="w-14 pr-2 text-right font-mono tabular text-muted">{r.gap !== null ? `+${r.gap.toFixed(3)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="h-48 shrink-0" fill title="Dirección de carrera" bodyClass="p-0">
          <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-1 text-xs">
            {snap.events.length === 0 && <li className="py-1 text-muted">Pit lane abierto.</li>}
            {snap.events.map((e, i) => (
              <li key={`${e.time}-${i}`} className={cx("py-0.5", e.kind === "red" || e.kind === "crash" ? "text-bad" : e.kind === "top" ? "text-[#a78bfa]" : e.drivers.some((id) => mine.some((m) => m.id === id)) ? "text-fg" : "text-muted")}>
                <span className="mr-2 font-mono text-dim">{clockText(Math.max(0, e.time))}</span>
                {e.text}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function EliminatedCard({ name, color }: { name: string; color: string }) {
  return (
    <div className="mm-panel flex items-center gap-2 rounded-xl p-3 opacity-50">
      <Stripe color={color} className="h-5" />
      <span className="font-bold">{name}</span>
      <span className="ml-auto text-xs text-bad">Eliminado</span>
    </div>
  );
}

function DriverQualiCard({ state, ws, session, snap, p }: { state: GameState; ws: WeekendState; session: SessionDef; snap: QualiSnapshot; p: QualiPlayer }) {
  const d = state.drivers[p.id];
  const team = state.teams[d.teamId];
  const circuit = CIRCUITS[state.calendar[ws.weekendIndex].circuitId];
  const sprint = session.kind === "sprintQuali";
  const forced = forcedCompound(ws.series, sprint, snap.segIdx, snap.wet);
  const ideal = idealForWetness(snap.wet);
  const defaultCompound: Compound = ideal !== "dry" ? ideal : forced ?? availableCompounds(ws.series, circuit)[0];
  const [compound, setCompound] = useState<Compound>(defaultCompound);
  const [setId, setSetId] = useState<string>("");
  const [risk, setRisk] = useState<Risk>(1);
  const [laps, setLaps] = useState(ws.series === "f1" ? 1 : 3);
  const [msg, setMsg] = useState<string | null>(null);
  const sets = p.sets.filter((s) => s.compound === compound && s.wear < 100);
  const garage = p.phase === "garage";

  const go = () => setMsg(liveQuali.sendOut(p.id, { compound, setId: setId || undefined, risk, laps }));
  const countNew = (c: Compound) => p.sets.filter((s: TyreSet) => s.compound === c && !s.used).length;
  const countAll = (c: Compound) => p.sets.filter((s: TyreSet) => s.compound === c && s.wear < 100).length;

  return (
    <div className={cx("mm-panel rounded-xl p-3", p.crashed && "opacity-60")}>
      <div className="mb-2 flex items-center gap-2">
        <Stripe color={team.color} className="h-5" />
        <span className="truncate font-bold">
          #{d.number} {d.last}
        </span>
        <span className="text-xs text-muted">P{p.pos} · {formatLap(p.best)}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] text-muted" title="El ingeniero decide cuándo salir y con qué neumático">
          <input type="checkbox" checked={p.auto} disabled={p.crashed} onChange={(e) => liveQuali.setAuto(p.id, e.target.checked)} />
          Ingeniero
        </label>
      </div>
      {p.crashed ? (
        <p className="text-xs text-bad">Accidente: el coche no puede volver a pista en esta sesión.</p>
      ) : !garage ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">
              {PHASE_LABEL[p.phase]}
              {p.order && (
                <span className="ml-2 inline-flex items-center gap-1 text-muted">
                  <Tyre c={p.order.compound} size={14} /> {RISK_LABELS[p.order.risk]}
                </span>
              )}
            </span>
            <span className="text-muted">{p.pushLeft > 0 ? `${p.pushLeft} lanzada${p.pushLeft > 1 ? "s" : ""} por hacer` : ""}</span>
          </div>
          <Meter value={p.phaseFrac * 100} color={p.phase === "push" ? "#a78bfa" : "#64748b"} />
          {!p.auto && (
            <Btn size="sm" variant="danger" disabled={p.abort} onClick={() => liveQuali.boxNow(p.id)}>
              {p.abort ? "Entrará al terminar la vuelta" : "Entrar a boxes al acabar la vuelta"}
            </Btn>
          )}
        </div>
      ) : p.auto ? (
        <p className="text-xs text-muted">El ingeniero gestiona las salidas{p.readyIn > 0 ? ` · cambio de neumáticos ${Math.ceil(p.readyIn)} s` : ""}.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="xs"
              value={compound}
              onChange={(c) => {
                setCompound(c);
                setSetId("");
              }}
              options={availableCompounds(ws.series, circuit).map((c) => ({
                value: c,
                title: `${COMPOUND_INFO[c].name}: ${countNew(c)} nuevos, ${countAll(c)} disponibles`,
                label: (
                  <span className="flex items-center gap-1">
                    <Tyre c={c} size={15} />
                    {countNew(c)}
                  </span>
                ),
                activeColor: "#2f3a4a",
                disabled: countAll(c) === 0 || (!!forced && !isWetTyre(c) && c !== forced),
              }))}
            />
            <select value={setId} onChange={(e) => setSetId(e.target.value)} className="min-w-0 flex-1 rounded border border-line-2 bg-panel-2 px-1 py-0.5 text-[11px]">
              <option value="">El más nuevo</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {setLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="xs" value={risk} onChange={setRisk} options={RISK_LABELS.map((l, i) => ({ value: i as Risk, label: l, activeColor: ["#2563eb", "#4b5563", "#dc2626"][i] }))} />
            <Segmented size="xs" value={laps} onChange={setLaps} options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} v`, title: `${n} vueltas lanzadas` }))} />
          </div>
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="primary" disabled={snap.chequered || snap.red || countAll(compound) === 0} onClick={go}>
              {p.queued ? "Esperando para salir…" : p.readyIn > 0 ? `Salir (listo en ${Math.ceil(p.readyIn)} s)` : "Salir a pista"}
            </Btn>
            {forced && <span className="text-[10px] text-warn">Obligatorio: {COMPOUND_INFO[forced].name}</span>}
            {msg && <span className="text-[10px] text-bad">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function QualiDone({ session }: { session: SessionDef }) {
  // Caso raro: todas las tandas guardadas pero sin avanzar (partida migrada a medias).
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className="text-sm text-muted">La clasificación ya está completa.</p>
      <Btn
        variant="primary"
        onClick={() =>
          updateWeekend((w, d) => {
            const prog = w.qualiProgress?.[session.key] ?? [];
            w.quali[session.key] = assembleQuali(session.key, prog);
            advanceStep(d, w);
          })
        }
      >
        Confirmar parrilla →
      </Btn>
    </div>
  );
}
