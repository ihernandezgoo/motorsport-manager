import { useState } from "react";
import { updateWeekend } from "@/lib/actions";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { teamDrivers } from "@/lib/game/format";
import { formatLap } from "@/lib/game/perf";
import { gauss, rngFor } from "@/lib/game/rng";
import { autoSetupValues, driverFeedback, practiceLap, SETUP_PARAMS, setupQuality } from "@/lib/game/setup";
import { effectiveTeam } from "@/lib/game/staff";
import { wearRate } from "@/lib/game/strategy";
import { runOnSet, setLabel } from "@/lib/game/tyreSets";
import { availableCompounds, COMPOUND_INFO, isWetTyre } from "@/lib/game/tyres";
import type { Compound, GameState, SessionDef, SetupValues, WeekendState } from "@/lib/game/types";
import { wetnessAt } from "@/lib/game/weather";
import { practiceRunsFor, skipAllPractice, skipPractice, wearMultFor } from "@/lib/game/weekend";
import { Btn, cx, Meter, Panel, Segmented, Stripe, Tyre } from "../ui";

type Program = "setup" | "long";
const LAPS: Record<Program, number> = { setup: 3, long: 10 };

export function PracticeSession({ state, ws, session }: { state: GameState; ws: WeekendState; session: SessionDef }) {
  const wk = state.calendar[ws.weekendIndex];
  const circuit = CIRCUITS[wk.circuitId];
  const team = state.teams[state.player.teamId];
  const drivers = teamDrivers(state, team.id);
  const [vals, setVals] = useState<Record<string, SetupValues>>(() => Object.fromEntries(drivers.map((d) => [d.id, ws.setup[d.id]?.values ?? { aero: 50, susp: 50, gear: 50 }])));
  const totalRuns = practiceRunsFor(ws.series, wk);
  const moreLater = ws.sessions.slice(ws.step + 1).some((s) => s.kind === "practice");

  const runLap = (id: string, program: Program, setId: string) => {
    const values = vals[id];
    updateWeekend((w, d) => {
      const st = w.setup[id];
      if (!st || st.runsLeft <= 0) return;
      const set = w.tyres[id]?.find((s) => s.id === setId);
      if (!set) return;
      const plan = w.weather[session.key];
      const runIdx = totalRuns - st.runsLeft;
      const rng = rngFor(d.seed, d.year, wk.id, id, session.key, runIdx);
      const wet = wetnessAt(plan, (runIdx + 0.5) / totalRuns);
      const driver = d.drivers[id];
      const q = setupQuality(values, st.optimum);
      const t = effectiveTeam(d, d.teams[team.id]);
      let time = practiceLap(w.series, t, driver, d.pus, circuit, wet, q, rng);
      // Neumático: compuesto y desgaste del juego, y lluvia con slicks.
      time *= 1 + (isWetTyre(set.compound) ? 0.01 : 0) + set.wear * 0.0002;
      if (program === "long") {
        const rate = wearRate(w.series, circuit, set.compound, driver.tyre) * (1 + gauss(rng) * 0.06);
        runOnSet(set, LAPS.long, w.series, circuit, driver.tyre);
        w.longRuns[id] ??= [];
        w.longRuns[id].push({ compound: set.compound, laps: LAPS.long, wearPerLap: Math.max(0.1, rate) });
        st.runs.push({ values: st.values, time: time * 1.012, feedback: [`📈 Tanda larga con ${COMPOUND_INFO[set.compound].name.toLowerCase()}: ${rate.toFixed(1)} % de desgaste por vuelta`], quality: st.quality });
      } else {
        runOnSet(set, LAPS.setup, w.series, circuit, driver.tyre);
        const feedback = driverFeedback(values, st.optimum, driver, rng);
        st.runs.push({ values, time, feedback, quality: q });
        if (q > st.quality || st.runs.length === 1) {
          st.quality = Math.max(st.quality, q);
          st.values = values;
        }
      }
      st.runsLeft--;
    });
  };

  const engineer = (id: string) => {
    const st = ws.setup[id];
    if (!st) return;
    const rng = rngFor(state.seed, state.year, wk.id, id, "engineer", st.runs.length);
    setVals((v) => ({ ...v, [id]: autoSetupValues(st.optimum, effectiveTeam(state, team), rng) }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="mm-panel flex shrink-0 flex-wrap items-center gap-4 rounded-xl px-4 py-2.5">
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted">
          <b className="text-fg">{session.label}.</b> Cada tanda gasta neumáticos de tu asignación. Las tandas de <b className="text-fg">reglajes</b> (3 vueltas) dan el feedback del piloto; las <b className="text-fg">tandas largas</b> (10 vueltas) miden la degradación y reducen hasta un 5 % el desgaste en carrera. Tienes <b className="text-fg">{totalRuns} tandas</b> por piloto en esta sesión.
        </p>
        <div className="flex gap-2">
          {moreLater && (
            <Btn onClick={() => updateWeekend((w, d) => skipAllPractice(d, w))} title="El ingeniero cierra los libres que quedan">
              Saltar todos los libres
            </Btn>
          )}
          <Btn variant="primary" onClick={() => updateWeekend((w, d) => skipPractice(d, w))}>
            Terminar {session.label.toLowerCase()} →
          </Btn>
        </div>
      </div>
      <div className={cx("grid min-h-0 flex-1 gap-4", drivers.length > 2 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {drivers.map((d) => (
          <DriverPractice
            key={d.id}
            ws={ws}
            id={d.id}
            title={`#${d.number} ${d.first} ${d.last}`}
            color={team.color}
            v={vals[d.id]}
            totalRuns={totalRuns}
            compounds={availableCompounds(ws.series, circuit)}
            onChange={(p, x) => setVals((all) => ({ ...all, [d.id]: { ...all[d.id], [p]: x } }))}
            onRun={(prog, setId) => runLap(d.id, prog, setId)}
            onEngineer={() => engineer(d.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DriverPractice({
  ws,
  id,
  title,
  color,
  v,
  totalRuns,
  compounds,
  onChange,
  onRun,
  onEngineer,
}: {
  ws: WeekendState;
  id: string;
  title: string;
  color: string;
  v: SetupValues;
  totalRuns: number;
  compounds: Compound[];
  onChange: (p: keyof SetupValues, x: number) => void;
  onRun: (p: Program, setId: string) => void;
  onEngineer: () => void;
}) {
  const st = ws.setup[id];
  const sets = (ws.tyres?.[id] ?? []).filter((s) => s.wear < 100);
  // Por defecto, el juego más gastado del compuesto más duro: los nuevos se guardan para el sábado y el domingo.
  const defaultSet = [...sets].sort((a, b) => compounds.indexOf(b.compound) - compounds.indexOf(a.compound) || b.wear - a.wear).find((s) => !isWetTyre(s.compound)) ?? sets[0];
  const [program, setProgram] = useState<Program>("setup");
  const [setId, setSetId] = useState(defaultSet?.id ?? "");
  const chosen = sets.find((s) => s.id === setId) ?? defaultSet;
  if (!st) return null;
  const last = st.runs[st.runs.length - 1];
  const lr = ws.longRuns?.[id] ?? [];
  return (
    <Panel
      fill
      className="h-full"
      title={
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <Stripe color={color} className="h-4" />
          <span className="text-sm font-bold text-fg">{title}</span>
        </span>
      }
      right={<span className="text-xs text-muted">Tandas: {st.runsLeft}/{totalRuns}</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        {SETUP_PARAMS.map((p) => (
          <div key={p.key} className="shrink-0">
            <div className="flex justify-between text-xs">
              <span className="font-semibold">{p.label}</span>
              <span className="tabular text-muted">{v[p.key]}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-dim">
              <span className="w-16 truncate" title={p.low}>
                {p.low}
              </span>
              <input type="range" min={0} max={100} value={v[p.key]} disabled={st.runsLeft <= 0} onChange={(e) => onChange(p.key, Number(e.target.value))} className="min-w-0 flex-1" />
              <span className="w-16 truncate text-right" title={p.high}>
                {p.high}
              </span>
            </div>
          </div>
        ))}
        <div className="shrink-0">
          <div className="mb-1 flex justify-between text-xs">
            <span className="truncate font-semibold">Confianza del piloto (mejor reglaje)</span>
            <span className="font-bold tabular">{Math.round(st.quality * 100)}%</span>
          </div>
          <Meter value={st.quality * 100} color={st.quality > 0.85 ? "#22c55e" : st.quality > 0.7 ? "#f59e0b" : "#ef4444"} height={8} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Segmented
            size="xs"
            value={program}
            onChange={setProgram}
            options={[
              { value: "setup", label: "Reglajes · 3 v" },
              { value: "long", label: "Tanda larga · 10 v" },
            ]}
          />
          <select value={chosen?.id ?? ""} onChange={(e) => setSetId(e.target.value)} className="min-w-0 flex-1 rounded border border-line-2 bg-panel-2 px-1 py-0.5 text-[11px]">
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {setLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex shrink-0 gap-2">
          <Btn variant="primary" className="flex-1" disabled={st.runsLeft <= 0 || !chosen} onClick={() => chosen && onRun(program, chosen.id)}>
            Salir a pista
          </Btn>
          <Btn className="flex-1" disabled={st.runsLeft <= 0} onClick={onEngineer} title="Tu ingeniero propone un reglaje según los datos del equipo">
            Propuesta ingeniero
          </Btn>
        </div>
        {last && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-panel-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">Última tanda</span>
              <span className="font-mono text-sm font-bold">{formatLap(last.time)}</span>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {last.feedback.map((f) => (
                <li key={f} className={f.startsWith("✔") ? "text-good" : f.startsWith("📈") ? "text-fg" : "text-warn"}>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {lr.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-muted">
            Tandas largas:
            {lr.map((r, i) => (
              <span key={i} className="flex items-center gap-1">
                <Tyre c={r.compound} size={14} /> {r.wearPerLap.toFixed(1)} %/v
              </span>
            ))}
            <span className="ml-auto text-good">−{Math.round((1 - wearMultFor(ws, id)) * 100)} % desgaste en carrera</span>
          </div>
        )}
      </div>
    </Panel>
  );
}
