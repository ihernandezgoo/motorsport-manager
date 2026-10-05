import { acceptJob, declineJobs } from "@/lib/actions";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { teamOverall } from "@/lib/game/format";
import { formatMoney } from "@/lib/game/perf";
import type { GameState } from "@/lib/game/types";
import { liveRace } from "@/lib/liveRace";
import { Btn, Modal, SeriesBadge, Stripe } from "../ui";

/** Despido u ofertas de otros equipos. */
export function CareerModal({ state, onMenu }: { state: GameState; onMenu: () => void }) {
  const sacked = state.sacked;
  const title = sacked ? "Has sido despedido" : "Ofertas de trabajo";
  return (
    <Modal open onClose={() => (sacked ? undefined : declineJobs())} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {sacked
            ? state.offers.length
              ? `La junta de ${state.teams[state.player.teamId]?.name} ha perdido la confianza en ti. Estos equipos quieren contratarte:`
              : "La junta ha perdido la confianza en ti y ningún equipo te ofrece trabajo. Tu carrera como mánager termina aquí."
            : "Tu buena temporada no ha pasado desapercibida. Puedes cambiar de equipo o quedarte donde estás."}
        </p>
        <div className="space-y-2">
          {state.offers.map((o) => {
            const t = state.teams[o.teamId];
            return (
              <div key={o.teamId} className="flex items-center gap-3 rounded-lg border border-line-2 bg-panel-2 p-3">
                <Stripe color={t.color} className="h-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold">
                    <SeriesBadge s={t.series} /> {t.name}
                  </div>
                  <div className="text-xs text-muted">
                    {SERIES_NAMES[t.series]} · coche {teamOverall(state, t)} · presupuesto {formatMoney(t.budget)}
                  </div>
                  <div className="text-xs">{o.reason}</div>
                </div>
                <Btn
                  variant="primary"
                  onClick={() => {
                    if (!window.confirm(`¿Fichar por ${t.name}? Dejarás tu equipo actual con sus proyectos, su personal y sus patrocinadores.`)) return;
                    liveRace.dispose();
                    acceptJob(o.teamId);
                  }}
                >
                  Aceptar
                </Btn>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          {sacked ? (
            <Btn onClick={onMenu}>Volver al menú principal</Btn>
          ) : (
            <Btn onClick={declineJobs}>Quedarme en {state.teams[state.player.teamId]?.short}</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
