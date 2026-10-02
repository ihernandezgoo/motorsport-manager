import { Zap } from "lucide-react";
import { TrackMap } from "../TrackMap";
import { Btn, SeriesBadge } from "../ui";

export function MainMenu({
  hasSave,
  saveLabel,
  hasQuick,
  onContinue,
  onNew,
  onQuick,
  onResumeQuick,
}: {
  hasSave: boolean;
  saveLabel?: string;
  hasQuick: boolean;
  onContinue: () => void;
  onNew: () => void;
  onQuick: () => void;
  onResumeQuick: () => void;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
        <TrackMap circuitId="monza" className="absolute -right-40 -top-24 h-[900px] w-[900px]" />
        <TrackMap circuitId="suzuka" className="absolute -bottom-52 -left-48 h-[760px] w-[760px]" />
      </div>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-[#0090d0] to-[#7e57c2]" />
      <div className="relative w-full max-w-xl text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <SeriesBadge s="f1" />
          <SeriesBadge s="f2" />
          <SeriesBadge s="f3" />
        </div>
        <h1 className="text-5xl font-black italic tracking-tight sm:text-6xl">
          APEX<span className="text-accent">/</span>RACE
        </h1>
        <div className="mt-1 text-lg font-semibold uppercase tracking-[0.5em] text-muted">Manager 2026</div>
        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted">
          Dirige un equipo de Fórmula 1, Fórmula 2 o Fórmula 3 durante la temporada 2026 con las parrillas y el calendario reales.
          Reglajes, clasificación, estrategia de neumáticos, meteorología cambiante, safety car y desarrollo del coche,
          sobre los trazados reales de cada circuito.
        </p>
        <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3">
          {hasSave && (
            <Btn variant="primary" size="lg" onClick={onContinue}>
              Continuar partida
            </Btn>
          )}
          {hasSave && saveLabel && <div className="-mt-1 text-xs text-dim">{saveLabel}</div>}
          <Btn variant={hasSave ? "subtle" : "primary"} size="lg" onClick={onNew}>
            Nueva partida
          </Btn>
          <Btn variant="subtle" size="lg" onClick={onQuick}>
            <Zap className="h-4 w-4" /> Fin de semana rápido
          </Btn>
          {hasQuick && (
            <button type="button" onClick={onResumeQuick} className="text-xs text-muted underline hover:text-fg">
              Reanudar el fin de semana rápido a medias
            </button>
          )}
        </div>
        <p className="mt-10 text-[11px] text-dim">Proyecto no oficial creado con fines de entretenimiento. Marcas y nombres pertenecen a sus propietarios.</p>
      </div>
    </div>
  );
}
