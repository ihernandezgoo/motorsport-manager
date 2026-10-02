import { useState } from "react";
import { AREA_LABELS, areaValue, availableAreas, buyFacility, COST_SCALE, FACILITIES, factoryFactor, projectCost, startProject, TIERS } from "@/lib/game/development";
import { formatMoney } from "@/lib/game/perf";
import type { GameState } from "@/lib/game/types";
import { gameStore } from "@/lib/store";
import { Btn, cx, Meter, Pager, Panel, Tabs, useRowPager } from "../ui";

export function DevelopmentView({ state }: { state: GameState }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"factory" | "facilities">("factory");
  const team = state.teams[state.player.teamId];
  const series = team.series;
  const areas = availableAreas(state);
  const ff = factoryFactor(team);

  const run = (fn: (d: GameState) => string | null) => {
    let err: string | null = null;
    gameStore.update((d) => {
      err = fn(d);
    });
    setMsg(err);
  };

  const income = state.finance.filter((f) => f.amount > 0).reduce((a, f) => a + f.amount, 0);
  const spend = state.finance.filter((f) => f.amount < 0).reduce((a, f) => a + f.amount, 0);

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "factory", label: "Proyectos" },
            { id: "facilities", label: "Instalaciones y finanzas" },
          ]}
        />
        {msg && <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-1.5 text-sm text-bad">{msg}</div>}
      </div>
      <div className="grid shrink-0 gap-4 sm:grid-cols-3">
        <Panel title="Presupuesto disponible">
          <div className="text-3xl font-black tabular text-good">{formatMoney(team.budget)}</div>
          <div className="mt-1 text-xs text-muted">Patrocinio: +{formatMoney(team.sponsor)} por carrera · Costes: −{formatMoney(team.sponsor * 0.6)}</div>
        </Panel>
        <Panel title="Balance de la temporada">
          <div className="flex gap-6">
            <div>
              <div className="text-xs text-muted">Ingresos</div>
              <div className="text-xl font-bold tabular text-good">+{formatMoney(income)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Gastos</div>
              <div className="text-xl font-bold tabular text-bad">{formatMoney(spend)}</div>
            </div>
          </div>
        </Panel>
        <Panel title="Eficiencia de la fábrica">
          <div className="text-3xl font-black tabular">×{ff.toFixed(2)}</div>
          <div className="mt-1 text-xs text-muted">Multiplica la ganancia de cada mejora. Las áreas ya muy desarrolladas rinden menos.</div>
        </Panel>
      </div>

      {tab === "factory" ? (
      <Panel title="Proyectos de desarrollo" className="min-h-0 shrink">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {areas.map((area) => {
            const active = state.projects.find((p) => p.area === area);
            const value = areaValue(state, team, area);
            return (
              <div key={area} className="rounded-xl border border-line-2 bg-panel-2 p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-bold">{AREA_LABELS[series][area]}</div>
                  <div className="text-2xl font-black tabular">{value.toFixed(1)}</div>
                </div>
                {active ? (
                  <div className="mt-3">
                    <div className="text-xs text-muted">
                      {TIERS[active.tier].name} en curso · {active.weeksLeft} {active.weeksLeft === 1 ? "carrera" : "carreras"} restantes
                    </div>
                    <Meter className="mt-2" value={active.weeksTotal - active.weeksLeft} max={active.weeksTotal} color="#f59e0b" />
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {TIERS.map((t, i) => {
                      const cost = projectCost(series, i);
                      return (
                        <button
                          type="button"
                          key={t.name}
                          disabled={team.budget < cost}
                          onClick={() => run((d) => startProject(d, area, i))}
                          className="flex w-full items-center justify-between rounded-lg border border-line-2 bg-panel-3 px-3 py-2 text-left text-xs transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span>
                            <span className="block font-semibold">{t.name}</span>
                            <span className="text-muted">
                              {t.weeks} {t.weeks === 1 ? "carrera" : "carreras"} · +{(t.gain[0] * ff).toFixed(1)}–{(t.gain[1] * ff).toFixed(1)}
                            </span>
                          </span>
                          <span className="font-bold tabular">{formatMoney(cost)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          Solo puede haber un proyecto por área. Los rivales también desarrollan sus coches después de cada carrera.
          {series !== "f1" && " En F2 y F3 el chasis es monomarca: las mejoras representan el trabajo de ingeniería y preparación del equipo."}
        </p>
      </Panel>
      ) : (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <Panel title="Instalaciones y personal" className="self-start">
          <div className="space-y-3">
            {FACILITIES.map((f) => {
              const cost = f.cost * COST_SCALE[series];
              return (
                <div key={f.key} className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">{f.label}</span>
                      <span className="font-bold tabular">{team[f.key]}</span>
                    </div>
                    <div className="text-xs text-muted">{f.desc}</div>
                    <Meter className="mt-1.5" value={team[f.key] - 50} max={50} color="#3b82f6" height={4} />
                  </div>
                  <Btn size="sm" disabled={team.budget < cost || team[f.key] >= 99} onClick={() => run((d) => buyFacility(d, f.key))}>
                    +{f.gain} · {formatMoney(cost)}
                  </Btn>
                </div>
              );
            })}
          </div>
        </Panel>
        <Movements state={state} />
      </div>
      )}
    </div>
  );
}

const MOVE_ROW = 32;

function Movements({ state }: { state: GameState }) {
  const moves = state.finance.slice().reverse();
  const { ref, pager } = useRowPager(moves.length, MOVE_ROW);
  return (
    <Panel fill title="Movimientos" bodyClass="p-0" className="h-full" right={<Pager pager={pager} />}>
      <ul ref={ref} className="min-h-0 flex-1 overflow-hidden">
        {moves.length === 0 && <li className="px-4 py-3 text-sm text-muted">Sin movimientos todavía.</li>}
        {moves.slice(pager.start, pager.end).map((f, i) => (
          <li key={pager.start + i} className="flex items-center justify-between gap-3 border-b border-line/60 px-4 text-sm" style={{ height: MOVE_ROW }}>
            <span className="truncate text-muted">{f.label}</span>
            <span className={cx("shrink-0 font-semibold tabular", f.amount >= 0 ? "text-good" : "text-bad")}>
              {f.amount >= 0 ? "+" : ""}
              {formatMoney(f.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
