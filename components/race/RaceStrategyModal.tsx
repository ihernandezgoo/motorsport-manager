import { CIRCUITS } from "@/lib/game/data/circuits";
import type { StratCtx } from "@/lib/game/strategy";
import { availableCompounds, COMPOUND_INFO, dryCompounds } from "@/lib/game/tyres";
import type { Compound, GameState } from "@/lib/game/types";
import { liveRace, type LiveSnapshot } from "@/lib/liveRace";
import { Modal } from "../ui";
import { StrategyEditor } from "../weekend/StrategyEditor";

/** Estrategia de un piloto durante la carrera: cambiar de plan o editar las paradas que quedan. */
export function RaceStrategyModal({ state, snap, driverId, onClose }: { state: GameState; snap: LiveSnapshot; driverId: string; onClose: () => void }) {
  const p = snap.players.find((x) => x.id === driverId);
  if (!p) return null;
  const circuit = CIRCUITS[snap.circuitId];
  const ctx: StratCtx = {
    series: snap.series,
    circuit,
    base: snap.baseLap,
    laps: snap.totalLaps,
    dry: dryCompounds(snap.series, circuit),
    mustTwo: snap.mustTwo,
    tyreSkill: state.drivers[driverId].tyre,
    pitLoss: circuit.pitLoss,
  };
  const sets: Partial<Record<Compound, number>> = {};
  for (const s of p.spareSets ?? []) sets[s.compound] = (sets[s.compound] ?? 0) + 1;
  const currentLap = liveRace.currentLap(driverId);
  return (
    <Modal open wide tall onClose={onClose} title={`Estrategia · ${p.name} · P${p.pos} · vuelta ${currentLap}/${snap.totalLaps}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          <span>
            Montado: <b className="text-fg">{COMPOUND_INFO[p.compound].name}</b> · {Math.round(100 - p.wear)} % de vida
          </span>
          {p.spareSets && (
            <span>
              Juegos que quedan:{" "}
              {Object.entries(sets)
                .map(([c, n]) => `${n}× ${c}`)
                .join(" · ") || "ninguno"}
            </span>
          )}
          {p.auto && <span className="text-warn">El coche está en manos de la IA: el plan no se aplica hasta que lo recuperes.</span>}
        </div>
        <StrategyEditor
          ctx={ctx}
          plans={p.plans}
          active={p.activePlan}
          compounds={availableCompounds(snap.series, circuit)}
          sets={sets}
          currentLap={currentLap}
          rain={snap.radar.length ? Array.from({ length: snap.totalLaps }, (_, l) => (l + 1 >= snap.lap && l + 1 < snap.lap + snap.radar.length ? snap.radar[l + 1 - snap.lap] : 0)) : undefined}
          onChange={(plans, active) => liveRace.setPlans(driverId, plans, active)}
        />
        <p className="mt-3 text-[11px] text-dim">Las paradas se piden solas al llegar su vuelta. Si la pista está mojada, una parada con neumáticos de seco se aplaza. La lluvia mostrada es el radar de las próximas 10 vueltas.</p>
      </div>
    </Modal>
  );
}
