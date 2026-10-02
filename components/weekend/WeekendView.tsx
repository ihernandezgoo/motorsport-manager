import { RotateCcw } from "lucide-react";
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
import { Btn, cx, Panel, SeriesBadge, Stat } from "../ui";
import { PracticeSession } from "./PracticeSession";
import { QualifyingSession } from "./QualifyingSession";
import { RaceSession } from "./RaceSession";
import { WeatherForecast } from "./WeatherForecast";

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
    <PracticeSession key={`${wk.id}-p`} state={state} ws={ws} />
  ) : session.kind === "quali" || session.kind === "sprintQuali" ? (
    <QualifyingSession key={`${wk.id}-${session.key}`} state={state} ws={ws} session={session} />
  ) : (
    <RaceSession key={`${wk.id}-${session.key}`} state={state} ws={ws} session={session} onLeave={onLeave} leaveLabel={leaveLabel} />
  );

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div className="carbon flex flex-wrap items-center gap-4 rounded-2xl border border-line px-5 py-4">
        <TrackMap circuitId={c.id} className="h-16 w-16 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted">
            <SeriesBadge s={ws.series} /> {SERIES_NAMES[ws.series]} · {state.quick ? "Fin de semana rápido" : `Ronda ${entry?.round}`} · {formatDateLong(wk.date)}
          </div>
          <h1 className="truncate text-2xl font-black">{entry?.name}</h1>
          <div className="text-xs text-muted">
            {c.name} · {c.city}, {c.country}
          </div>
        </div>
        <ol className="ml-auto flex flex-wrap gap-1.5">
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
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{content}</div>
          <div className="space-y-4">
            <Panel title="Pronóstico del fin de semana">
              <WeatherForecast sessions={ws.sessions} weather={ws.weather} step={ws.step} />
              <p className="mt-2 text-[11px] text-dim">Probabilidad de lluvia por cuartos de cada sesión. Los pronósticos pueden fallar.</p>
            </Panel>
            <Panel title="Circuito">
              <TrackView circuitId={c.id} camera={{ kind: "overview" }} interactive={false} className="h-56 w-full rounded-lg" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Longitud" value={`${c.lengthKm.toFixed(3)} km`} />
                <Stat label="Pérdida en boxes" value={`${c.pitLoss} s`} />
                <Stat label="Adelantamientos" value={c.overtaking > 0.45 ? "Fácil" : c.overtaking > 0.25 ? "Medio" : "Difícil"} />
                <Stat label="Desgaste" value={c.wear > 1.15 ? "Alto" : c.wear > 0.9 ? "Medio" : "Bajo"} />
                <Stat label="Tipo" value={c.street ? "Urbano" : "Permanente"} />
                <Stat label="Safety car" value={c.sc > 0.6 ? "Frecuente" : c.sc > 0.4 ? "Posible" : "Raro"} />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekendDone({ state, ws, onFinish, quick }: { state: GameState; ws: WeekendState; onFinish: () => void; quick?: QuickActions }) {
  const wk = state.calendar[ws.weekendIndex];
  const others = weekendSeries(wk).filter((s) => s !== ws.series);
  return (
    <div className="space-y-4">
      {quick ? (
        <Panel title="Fin de semana rápido completado">
          <p className="text-sm text-muted">Estos son tus resultados. Puedes repetir el mismo fin de semana (con otro tiempo y otra suerte) o volver al menú.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn variant="primary" size="lg" onClick={quick.onRepeat}>
              <RotateCcw className="h-4 w-4" /> Repetir fin de semana
            </Btn>
            <Btn size="lg" onClick={quick.onExit}>
              Volver al menú
            </Btn>
          </div>
        </Panel>
      ) : (
        <Panel title="Fin de semana completado">
          <p className="text-sm text-muted">
            Has terminado todas las sesiones.{" "}
            {others.length > 0 ? `Al cerrar el fin de semana se simularán las carreras de ${others.map((s) => s.toUpperCase()).join(" y ")}, ` : "Al cerrar el fin de semana "}
            se cobrarán patrocinios y premios y avanzarán los proyectos de la fábrica.
          </p>
          <Btn variant="primary" size="lg" className="mt-4" onClick={onFinish}>
            Cerrar fin de semana y volver a la sede →
          </Btn>
        </Panel>
      )}
      {ws.results.map((r) => {
        const w = r.entries[0];
        return (
          <Panel key={r.kind} title={`${r.name} · Ganador: ${driverName(state.drivers[w.driverId])}${r.fastestLap ? ` · VR ${state.drivers[r.fastestLap.driverId].code} ${formatLap(r.fastestLap.time)}` : ""}`}>
            <ResultsTable state={state} result={r} compact />
          </Panel>
        );
      })}
    </div>
  );
}
