import { Flag } from "lucide-react";
import { useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { teamDrivers } from "@/lib/game/format";
import { baseLap, formatRaceTime } from "@/lib/game/perf";
import { evaluatePlan, sanitizeStops, suggestPlans } from "@/lib/game/strategy";
import { freshestSet } from "@/lib/game/tyreSets";
import { availableCompounds } from "@/lib/game/tyres";
import type { Compound, DriverStrategies, GameState, SessionDef, TyreSet, WeekendState } from "@/lib/game/types";
import { earlyRaceWetness, forecastLabel, rainAt, wetnessLabel } from "@/lib/game/weather";
import { advanceStep, raceConfigFor, stratContext, wearMultFor } from "@/lib/game/weekend";
import { liveRace, useLiveRace } from "@/lib/liveRace";
import { DriverPortrait } from "../art/Photos";
import { RaceHud } from "../race/RaceHud";
import { Btn, cx, PagedGrid, Panel, Stripe, Tabs, Tyre } from "../ui";
import { StrategyEditor } from "./StrategyEditor";
import { TyreModal, TyreTile } from "./TyrePicker";

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

/** Juegos disponibles por compuesto. */
function setCounts(sets: TyreSet[] | undefined): Partial<Record<Compound, number>> | undefined {
  if (!sets) return undefined;
  const out: Partial<Record<Compound, number>> = {};
  for (const s of sets) if (s.wear < 100) out[s.compound] = (out[s.compound] ?? 0) + 1;
  return out;
}

function RacePrep({ state, ws, session, liveKey }: { state: GameState; ws: WeekendState; session: SessionDef; liveKey: string }) {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const team = state.teams[state.player.teamId];
  const cfg = raceConfigFor(state, ws, session.key);
  const plan = ws.weather[session.key];
  const mine = teamDrivers(state, team.id);
  const compounds = availableCompounds(ws.series, circuit);
  const startWet = earlyRaceWetness(plan, baseLap(ws.series, circuit), cfg.laps);
  const rain = Array.from({ length: cfg.laps }, (_, l) => rainAt(plan, (l + 0.5) / cfg.laps));

  const [sel, setSel] = useState(mine[0]?.id ?? "");
  const [side, setSide] = useState<"driver" | "grid">("driver");
  const [auto, setAuto] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState(false);

  /** Planes de un piloto: los guardados o los que propone el ingeniero. */
  const stratsOf = (id: string): DriverStrategies => {
    const saved = ws.strategies?.[session.key]?.[id];
    if (saved) return saved;
    const plans = suggestPlans(stratContext(state, ws, session.key, id));
    if (startWet >= 0.2) {
      const wc: Compound = startWet >= 0.85 ? "W" : "I";
      return { plans: [{ name: "A", start: wc, stops: [] }, ...plans.slice(0, 2).map((p, i) => ({ ...p, name: "BC"[i] }))], active: 0 };
    }
    return { plans, active: 0 };
  };
  const save = (id: string, patch: Partial<DriverStrategies>) =>
    updateWeekend((w) => {
      w.strategies ??= {};
      const bySession = (w.strategies[session.key] ??= {});
      bySession[id] = { ...stratsOf(id), ...bySession[id], ...patch };
    });
  /** Juego de salida: el elegido si es del compuesto de salida; si no, el menos gastado de ese compuesto. */
  const startSetOf = (id: string): TyreSet | null => {
    const st = stratsOf(id);
    const start = st.plans[st.active]?.start;
    const sets = (ws.tyres?.[id] ?? []).filter((s) => s.wear < 100);
    return sets.find((s) => s.id === st.startSetId && s.compound === start) ?? (start ? freshestSet(sets, start) : null);
  };

  const start = (instant: boolean) => {
    const strategies: Record<string, { plans: DriverStrategies["plans"]; active: number }> = {};
    const startSets: Record<string, TyreSet> = {};
    const startCompounds: Record<string, Compound> = {};
    for (const d of mine) {
      const st = stratsOf(d.id);
      strategies[d.id] = { plans: st.plans, active: st.active };
      startCompounds[d.id] = st.plans[st.active].start;
      const set = startSetOf(d.id);
      if (set) startSets[d.id] = set;
    }
    updateWeekend((w) => {
      w.strategies ??= {};
      w.strategies[session.key] = Object.fromEntries(mine.map((d) => [d.id, stratsOf(d.id)]));
    });
    const full = raceConfigFor(state, ws, session.key, { playerTeamId: team.id, startCompounds, startSets, strategies });
    const autoMap = instant ? Object.fromEntries(mine.map((d) => [d.id, true])) : Object.fromEntries(mine.map((d) => [d.id, !!auto[d.id]]));
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
  const d = state.drivers[sel];
  const st = d ? stratsOf(d.id) : null;
  const ctx = d ? stratContext(state, ws, session.key, d.id) : null;
  const active = st?.plans[st.active];
  const ev = ctx && active ? evaluatePlan(ctx, active) : null;
  const firstStop = active ? sanitizeStops(active.stops, cfg.laps)[0] : undefined;
  const startSet = d ? startSetOf(d.id) : null;
  const pos = d ? cfg.grid.indexOf(d.id) + 1 : 0;
  const pen = d ? ws.gridPenalty?.[d.id] : undefined;

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        fill
        className="h-full"
        title={`${session.label} · ${cfg.laps} vueltas · Editor de estrategia`}
        right={
          <div className="flex gap-1">
            {mine.map((x) => (
              <button
                type="button"
                key={x.id}
                onClick={() => setSel(x.id)}
                className={cx("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold", sel === x.id ? "bg-white text-black" : "bg-panel-3 text-muted hover:text-fg")}
              >
                <Stripe color={team.color} className="h-3" />P{cfg.grid.indexOf(x.id) + 1} {x.last}
              </button>
            ))}
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {d && st && ctx && (
            <StrategyEditor
              key={d.id}
              ctx={ctx}
              plans={st.plans}
              active={st.active}
              compounds={compounds}
              sets={setCounts(ws.tyres?.[d.id])}
              rain={rain}
              onChange={(plans, a) => save(d.id, { plans, active: a })}
            />
          )}
        </div>
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <Btn variant="primary" size="lg" onClick={() => start(false)}>
            <Flag className="h-5 w-5" /> Comenzar carrera
          </Btn>
          <Btn size="lg" onClick={() => start(true)} title="Simula la carrera al instante con las decisiones de tu ingeniero">
            Simular sin ver
          </Btn>
          <span className="text-xs text-muted">Durante la carrera el coche sigue el plan activo; puedes cambiar de plan o editarlo desde su panel.</span>
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-3">
        <Tabs
          className="shrink-0 self-start text-xs"
          value={side}
          onChange={setSide}
          tabs={[
            { id: "driver", label: "Piloto" },
            { id: "grid", label: "Parrilla" },
          ]}
        />
        {side === "driver" && d ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="mm-panel rounded-xl p-3">
              <div className="flex items-center gap-3">
                <DriverPortrait driver={d} color={team.color} className="h-16 w-16" />
                <div className="min-w-0">
                  <div className="text-xs text-muted">#{d.number}</div>
                  <div className="truncate text-lg font-black uppercase">{d.last}</div>
                  <div className="text-xs text-muted">
                    Sale P{pos}
                    {pen && session.kind === "race" && <span className="text-bad"> · sanción {pen.places} puestos</span>}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <span className="text-muted">Próxima ventana de parada</span>
                  {firstStop ? (
                    <span className="flex items-center gap-1 font-semibold">
                      V{Math.max(1, firstStop.lap - 3)}–{Math.min(cfg.laps - 1, firstStop.lap + 3)} <Tyre c={firstStop.compound} size={16} />
                    </span>
                  ) : (
                    <span className="text-muted">Sin paradas</span>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <span className="text-muted">Neumáticos de salida</span>
                  <span className="flex items-center gap-2">
                    {startSet ? <TyreTile set={startSet} size="sm" /> : <span className="text-xs text-bad">Sin juegos</span>}
                    {ws.tyres?.[d.id] && (
                      <Btn size="xs" onClick={() => setPicker(true)}>
                        Cambiar
                      </Btn>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <span className="text-muted">Tiempo estimado</span>
                  <span className="font-semibold tabular">{ev ? formatRaceTime(ev.est) : "—"}</span>
                </div>
                {wearMultFor(ws, d.id) < 1 && <div className="text-[11px] text-good">Datos de tandas largas: −{Math.round((1 - wearMultFor(ws, d.id)) * 100)} % de desgaste</div>}
                <label className="flex cursor-pointer items-center justify-between border-t border-line pt-2 text-xs text-muted">
                  Delegar el coche en el ingeniero (IA)
                  <input type="checkbox" checked={!!auto[d.id]} onChange={(e) => setAuto((a) => ({ ...a, [d.id]: e.target.checked }))} />
                </label>
              </div>
            </div>
            <div className="mm-panel space-y-2 rounded-xl p-3 text-sm">
              <div>
                <div className="text-xs text-muted">Pronóstico</div>
                <div className="font-semibold">{forecastLabel(Math.max(...plan.forecast))}</div>
                <div className="text-[11px] text-dim">Por cuartos de carrera: {plan.forecast.join("% · ")}%</div>
              </div>
              <div>
                <div className="text-xs text-muted">Pista en la salida</div>
                <div className="font-semibold">{wetnessLabel(plan.initialWetness)}</div>
                <div className="text-[11px] text-dim">
                  {plan.airTemp}°C aire · {plan.trackTemp}°C asfalto
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Normativa</div>
                <div className="text-[12px] leading-snug">{rules}</div>
              </div>
            </div>
          </div>
        ) : (
          <Panel fill className="min-h-0 flex-1">
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
                const dd = state.drivers[id];
                const t = state.teams[dd.teamId];
                return (
                  <div className={cx("flex h-full items-center gap-2 rounded px-2 text-xs", t.id === team.id ? "bg-accent/15" : "bg-panel-2")}>
                    <span className="w-5 text-right font-bold tabular text-muted">{i + 1}</span>
                    <Stripe color={t.color} className="h-4" />
                    <span className="font-semibold">{dd.code}</span>
                    <span className="truncate text-muted">{dd.last}</span>
                  </div>
                );
              }}
            />
          </Panel>
        )}
      </div>

      {picker && d && st && (
        <TyreModal
          state={state}
          ws={ws}
          driverId={d.id}
          title={`Neumáticos de salida · ${d.first} ${d.last}`}
          fittedId={startSet?.id}
          wet={startWet}
          confirmLabel="Salir con este juego"
          onClose={() => setPicker(false)}
          onPick={(s) => {
            const plans = st.plans.map((p, i) => (i === st.active ? { ...p, start: s.compound } : p));
            save(d.id, { plans, startSetId: s.id });
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
