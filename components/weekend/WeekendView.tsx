import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { finishPlayerWeekend } from "@/lib/actions";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { circuitOf, driverName, formatDateLong } from "@/lib/game/format";
import { formatLap } from "@/lib/game/perf";
import type { GameState, WeekendState } from "@/lib/game/types";
import { weekendSeries } from "@/lib/game/weekend";
import { useLiveRace } from "@/lib/liveRace";
import { TrackView } from "../race/TrackView";
import { ResultsTable } from "../screens/Results";
import { TrackMap } from "../TrackMap";
import { Btn, cx, Panel, SeriesBadge, Stat, Tabs } from "../ui";
import { PracticeSession } from "./PracticeSession";
import { QualifyingSession } from "./QualifyingSession";
import { RaceSession } from "./RaceSession";
import { WeatherForecast } from "./WeatherForecast";
import { ComponentsPanel, TyreAllocation } from "./WeekendExtras";

export interface QuickActions {
  onExit: () => void;
  onRepeat: () => void;
}

export function WeekendView({
  state,
  ws,
  onFinished,
  onLeave,
  leaveLabel,
  quick,
}: {
  state: GameState;
  ws: WeekendState;
  onFinished: (idx: number) => void;
  onLeave?: () => void;
  leaveLabel?: string;
  quick?: QuickActions;
}) {
  const wk = state.calendar[ws.weekendIndex];
  const c = circuitOf(wk);
  const entry = wk[ws.series];
  const session = ws.sessions[ws.step];
  const snap = useLiveRace();
  const racing = !!snap && !snap.finished;

  const content = !session ? (
    <WeekendDone
      state={state}
      ws={ws}
      quick={quick}
      onFinish={() => {
        const idx = finishPlayerWeekend();
        if (idx !== null) onFinished(idx);
      }}
    />
  ) : session.kind === "practice" ? (
    <PracticeSession key={`${wk.id}-${session.key}`} state={state} ws={ws} session={session} />
  ) : session.kind === "quali" || session.kind === "sprintQuali" ? (
    <QualifyingSession key={`${wk.id}-${session.key}`} state={state} ws={ws} session={session} />
  ) : (
    <RaceSession key={`${wk.id}-${session.key}`} state={state} ws={ws} session={session} onLeave={onLeave} leaveLabel={leaveLabel} />
  );

  const showSide = session?.kind === "practice";

  return (
    <div className="mx-auto flex h-full w-full max-w-[1800px] min-h-0 flex-col gap-3">
      <div className="carbon flex shrink-0 items-center gap-4 rounded-2xl border border-line px-5 py-2.5">
        <TrackMap circuitId={c.id} className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate text-xs text-muted">
            <SeriesBadge s={ws.series} /> {SERIES_NAMES[ws.series]} · {state.quick ? "Fin de semana rápido" : `Ronda ${entry?.round}`} · {formatDateLong(wk.date)}
          </div>
          <h1 className="truncate text-xl font-black">{entry?.name}</h1>
          <div className="truncate text-xs text-muted">
            {c.name} · {c.city}, {c.country}
          </div>
        </div>
        <ol className="ml-auto flex shrink-0 gap-1.5">
          {ws.sessions.map((s, i) => (
            <li
              key={s.key}
              className={cx(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                i < ws.step ? "border-good/30 bg-good/10 text-good" : i === ws.step ? "border-accent bg-accent/15 text-fg" : "border-line text-dim",
              )}
            >
              {i < ws.step ? "✓ " : ""}
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      {racing || (session && (session.kind === "race" || session.kind === "sprint" || session.kind === "feature") && snap) ? (
        content
      ) : showSide ? (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-h-0 min-w-0 flex-col">{content}</div>
          <WeekendSide state={state} ws={ws} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{content}</div>
      )}
    </div>
  );
}

function WeekendSide({ state, ws }: { state: GameState; ws: WeekendState }) {
  const [tab, setTab] = useState<"forecast" | "circuit" | "tyres" | "pu">("forecast");
  const c = circuitOf(state.calendar[ws.weekendIndex]);
  return (
    <div className="hidden min-h-0 xl:block">
      <Panel
        fill
        className="h-full"
        title={
          <Tabs
            value={tab}
            onChange={setTab}
            className="text-xs"
            tabs={[
              { id: "forecast", label: "Pronóstico" },
              { id: "circuit", label: "Circuito" },
              { id: "tyres", label: "Neumáticos" },
              ...(state.player.series === "f1" && !state.quick ? [{ id: "pu" as const, label: "Motor" }] : []),
            ]}
          />
        }
      >
        {tab === "tyres" ? (
          <TyreAllocation state={state} ws={ws} />
        ) : tab === "pu" ? (
          <ComponentsPanel state={state} ws={ws} />
        ) : tab === "forecast" ? (
          <>
            <WeatherForecast sessions={ws.sessions} weather={ws.weather} step={ws.step} />
            <p className="mt-2 shrink-0 text-[11px] text-dim">Probabilidad de lluvia por cuartos de cada sesión. Los pronósticos pueden fallar.</p>
          </>
        ) : (
          <>
            <TrackView circuitId={c.id} camera={{ kind: "overview" }} interactive={false} className="min-h-0 w-full flex-1 rounded-lg" />
            <div className="mt-3 grid shrink-0 grid-cols-2 gap-3">
              <Stat label="Longitud" value={`${c.lengthKm.toFixed(3)} km`} />
              <Stat label="Pérdida en boxes" value={`${c.pitLoss} s`} />
              <Stat label="Adelantamientos" value={c.overtaking > 0.45 ? "Fácil" : c.overtaking > 0.25 ? "Medio" : "Difícil"} />
              <Stat label="Desgaste" value={c.wear > 1.15 ? "Alto" : c.wear > 0.9 ? "Medio" : "Bajo"} />
              <Stat label="Tipo" value={c.street ? "Urbano" : "Permanente"} />
              <Stat label="Safety car" value={c.sc > 0.6 ? "Frecuente" : c.sc > 0.4 ? "Posible" : "Raro"} />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function WeekendDone({ state, ws, onFinish, quick }: { state: GameState; ws: WeekendState; onFinish: () => void; quick?: QuickActions }) {
  const wk = state.calendar[ws.weekendIndex];
  const others = weekendSeries(wk).filter((s) => s !== ws.series);
  const [sel, setSel] = useState(Math.max(0, ws.results.length - 1));
  const r = ws.results[sel];
  const winner = r?.entries[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {quick ? (
        <Panel className="shrink-0" title="Fin de semana rápido completado">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Puedes repetir el mismo fin de semana (con otro tiempo y otra suerte) o volver al menú.</p>
            <div className="flex gap-2">
              <Btn variant="primary" size="lg" onClick={quick.onRepeat}>
                <RotateCcw className="h-4 w-4" /> Repetir fin de semana
              </Btn>
              <Btn size="lg" onClick={quick.onExit}>
                Volver al menú
              </Btn>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel className="shrink-0" title="Fin de semana completado">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">
              {others.length > 0 ? `Al cerrar el fin de semana se simularán las carreras de ${others.map((s) => s.toUpperCase()).join(" y ")}, ` : "Al cerrar el fin de semana "}
              se cobrarán patrocinios y premios y avanzarán los proyectos de la fábrica.
            </p>
            <Btn variant="primary" size="lg" onClick={onFinish}>
              Cerrar fin de semana y volver a la sede →
            </Btn>
          </div>
        </Panel>
      )}
      {r && winner && (
        <Panel
          fill
          className="flex-1"
          title={
            ws.results.length > 1 ? (
              <Tabs value={String(sel)} onChange={(v) => setSel(Number(v))} className="text-xs" tabs={ws.results.map((x, i) => ({ id: String(i), label: x.name }))} />
            ) : (
              r.name
            )
          }
          right={
            <span className="truncate text-xs text-muted">
              Ganador: <b className="text-fg">{driverName(state.drivers[winner.driverId])}</b>
              {r.fastestLap ? ` · VR ${state.drivers[r.fastestLap.driverId].code} ${formatLap(r.fastestLap.time)}` : ""}
            </span>
          }
        >
          <ResultsTable key={sel} state={state} result={r} compact />
        </Panel>
      )}
    </div>
  );
}
