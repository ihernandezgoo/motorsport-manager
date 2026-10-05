import { useState, type ReactNode } from "react";
import { boardMood, SACK_SEASON_END, targetText } from "@/lib/game/board";
import { SERIES_SHORT } from "@/lib/game/data/teams";
import { formatMoney } from "@/lib/game/perf";
import { dropSponsor, emptySlots, GOAL_LABEL, signSponsor, TIER_LABEL } from "@/lib/game/sponsors";
import { devFactor, hireCost, hireStaff, STAFF_NEUTRAL, STAFF_ROLES, staffBonus } from "@/lib/game/staff";
import { teamStandings } from "@/lib/game/standings";
import type { GameState, Sponsor } from "@/lib/game/types";
import { gameStore } from "@/lib/store";
import { Btn, cx, Meter, Nat, Panel, Stat, Tabs } from "../ui";

type Tab = "board" | "staff" | "sponsors";

export function OfficeView({ state }: { state: GameState }) {
  const [tab, setTab] = useState<Tab>("board");
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: (s: GameState) => string | null) => {
    let err: string | null = null;
    gameStore.update((s) => {
      err = fn(s);
    });
    setMsg(err);
  };
  const empty = emptySlots(state).length;
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "board", label: "Junta directiva" },
            { id: "staff", label: "Personal" },
            { id: "sponsors", label: empty ? `Patrocinadores (${empty} libres)` : "Patrocinadores" },
          ]}
        />
        {msg && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-1 text-sm text-bad">{msg}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "board" && <Board state={state} />}
        {tab === "staff" && <Staff state={state} run={run} />}
        {tab === "sponsors" && <Sponsors state={state} run={run} />}
      </div>
    </div>
  );
}

export function confidenceColor(c: number) {
  return c >= 60 ? "#22c55e" : c >= 40 ? "#f59e0b" : c >= SACK_SEASON_END ? "#f97316" : "#ef4444";
}

function Board({ state }: { state: GameState }) {
  const b = state.board;
  const ts = teamStandings(state, state.player.series);
  const pos = ts.findIndex((t) => t.teamId === state.player.teamId) + 1;
  const started = state.results.some((r) => r.series === state.player.series);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Confianza de la junta">
        <div className="flex items-end gap-4">
          <div className="text-5xl font-black tabular" style={{ color: confidenceColor(b.confidence) }}>
            {Math.round(b.confidence)}
          </div>
          <div className="pb-1">
            <div className="text-lg font-bold">{boardMood(b.confidence)}</div>
            <div className={cx("text-xs", b.lastDelta >= 0 ? "text-good" : "text-bad")}>
              {b.lastDelta >= 0 ? "▲" : "▼"} {Math.abs(b.lastDelta).toFixed(1)} tras la última carrera
            </div>
          </div>
        </div>
        <Meter className="mt-3" value={b.confidence} color={confidenceColor(b.confidence)} height={10} />
        <p className="mt-3 text-xs text-muted">
          La junta compara cada fin de semana tu resultado con lo que se espera de tu coche y tus pilotos (P{b.expected}). Si la confianza cae por debajo de {SACK_SEASON_END} al final de la temporada, o se hunde a mitad de año, te despiden. Quedarte sin presupuesto también resta.
        </p>
      </Panel>
      <Panel title={`Objetivo ${state.year}`}>
        <div className="text-xl font-black">{targetText(b.target)}</div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Objetivo" value={`P${b.target}`} />
          <Stat label="Ahora" value={started ? `P${pos}` : "—"} sub={started ? (pos <= b.target ? "Cumpliendo" : "Por debajo") : undefined} />
          <Stat label="Esperado" value={`P${b.expected}`} sub="por coche y pilotos" />
        </div>
        <p className="mt-3 text-xs text-muted">Superar el objetivo trae una prima al final de la temporada y ofertas de equipos más grandes, también de la categoría superior.</p>
      </Panel>
      <Panel title="Trayectoria del mánager" className="lg:col-span-2">
        {state.career.length === 0 ? (
          <p className="text-sm text-muted">Primera temporada en el cargo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-dim">
              <tr>
                <th className="py-1">Año</th>
                <th>Equipo</th>
                <th>Categoría</th>
                <th className="text-right">Puesto</th>
                <th className="text-right">Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {state.career.map((c) => (
                <tr key={`${c.year}-${c.teamId}`} className="border-t border-line/60">
                  <td className="py-1">{c.year}</td>
                  <td>{c.teamName}</td>
                  <td>{SERIES_SHORT[c.series]}</td>
                  <td className={cx("text-right font-bold", c.pos <= c.target ? "text-good" : "text-bad")}>P{c.pos}</td>
                  <td className="text-right text-muted">P{c.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Staff({ state, run }: { state: GameState; run: (fn: (s: GameState) => string | null) => void }) {
  const team = state.teams[state.player.teamId];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {STAFF_ROLES.map((r) => {
        const cur = state.staff[r.role];
        const bonus = staffBonus(state, r.role);
        const effect = r.role === "technical" ? `×${devFactor(state).toFixed(2)} en las mejoras` : `${bonus >= 0 ? "+" : ""}${bonus.toFixed(1)} ${r.role === "engineer" ? "de ingeniería de pista" : "de equipo de boxes"}`;
        const cands = state.staffMarket.filter((s) => s.role === r.role).sort((a, b) => b.rating - a.rating);
        return (
          <Panel key={r.role} title={r.label}>
            <div className="rounded-lg border border-line-2 bg-panel-2 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">
                    {cur.name} <Nat code={cur.nat} />
                  </div>
                  <div className="text-xs text-muted">
                    {cur.age} años · {formatMoney(cur.salary)}/temporada · hasta {cur.contractUntil}
                  </div>
                </div>
                <div className="text-3xl font-black tabular">{cur.rating}</div>
              </div>
              <div className={cx("mt-1 text-xs font-semibold", cur.rating >= STAFF_NEUTRAL ? "text-good" : "text-warn")}>{effect}</div>
            </div>
            <p className="mt-2 text-[11px] text-dim">{r.desc}. Una valoración de {STAFF_NEUTRAL} no cambia el rendimiento del equipo.</p>
            <div className="mt-3 space-y-2">
              {cands.map((c) => {
                const cost = hireCost(state, c);
                return (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-line p-2 text-xs">
                    <span className="w-8 text-lg font-black tabular">{c.rating}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {c.name} <Nat code={c.nat} />
                      </div>
                      <div className="text-muted">
                        {c.age} años · {formatMoney(c.salary)}/temp.
                      </div>
                    </div>
                    <Btn size="xs" disabled={team.budget < cost} onClick={() => window.confirm(`¿Fichar a ${c.name}? Coste inmediato: ${formatMoney(cost)} (prima e indemnización a ${cur.name}).`) && run((s) => hireStaff(s, c.id))}>
                      Fichar · {formatMoney(cost)}
                    </Btn>
                  </div>
                );
              })}
              {cands.length === 0 && <p className="text-xs text-muted">No hay candidatos hasta la próxima temporada.</p>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function SponsorCard({ s, action }: { s: Sponsor; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-2 bg-panel-2 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-dim">{TIER_LABEL[s.tier]}</div>
        <div className="truncate font-bold">{s.name}</div>
        <div className="text-xs text-muted">
          {formatMoney(s.perRace)} por carrera · prima {formatMoney(s.bonus)}: {GOAL_LABEL[s.goal].toLowerCase()} · hasta {s.until}
        </div>
      </div>
      {action}
    </div>
  );
}

function Sponsors({ state, run }: { state: GameState; run: (fn: (s: GameState) => string | null) => void }) {
  const empty = emptySlots(state);
  const fixed = state.sponsors.reduce((a, s) => a + s.perRace, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Acuerdos vigentes" right={<span className="text-xs text-muted">Fijo: {formatMoney(fixed)} por carrera</span>}>
        <div className="space-y-2">
          {state.sponsors.map((s) => (
            <SponsorCard
              key={s.id}
              s={s}
              action={
                <Btn size="xs" variant="ghost" onClick={() => window.confirm(`¿Romper el acuerdo con ${s.name}? Dejarás de cobrar y la junta no lo verá con buenos ojos.`) && run((st) => (dropSponsor(st, s.id), null))}>
                  Romper
                </Btn>
              }
            />
          ))}
          {empty.map((t, i) => (
            <div key={`${t}-${i}`} className="rounded-lg border border-dashed border-line-2 p-3 text-sm text-muted">
              Hueco libre · {TIER_LABEL[t]}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Las primas se cobran cuando se cumple el objetivo en la carrera principal del fin de semana. Si dejas un hueco libre, el departamento comercial acabará cerrando un acuerdo por su cuenta.</p>
      </Panel>
      <Panel title="Ofertas">
        {state.sponsorOffers.length === 0 ? (
          <p className="text-sm text-muted">No hay ofertas: todos los huecos están cubiertos.</p>
        ) : (
          <div className="space-y-2">
            {state.sponsorOffers.map((s) => (
              <SponsorCard
                key={s.id}
                s={s}
                action={
                  <Btn size="xs" variant="good" onClick={() => run((st) => signSponsor(st, s.id))}>
                    Firmar
                  </Btn>
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
