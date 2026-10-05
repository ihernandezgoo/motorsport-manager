import { useMemo, useState } from "react";
import { SERIES_SHORT } from "@/lib/game/data/teams";
import { teamDrivers } from "@/lib/game/format";
import { askingSalary, evaluateOffer, isAvailable, LEVEL, MARKET_OPENS, marketIsOpen, nextSeasonLineup, rating, SEATS, signDriver, terminateContract, terminationCost } from "@/lib/game/market";
import { driverOverall, formatMoney } from "@/lib/game/perf";
import { driverRank } from "@/lib/game/standings";
import type { Driver, GameState, SeriesId } from "@/lib/game/types";
import { gameStore } from "@/lib/store";
import { DriverPortrait } from "../art/Photos";
import { Btn, cx, Modal, Nat, Panel, SeriesBadge, Stripe, Tabs } from "../ui";

type Filter = "all" | SeriesId | "free";

/** Salario con signo como texto: en F2/F3 los pilotos aportan dinero. */
function money(x: number) {
  return x < 0 ? `aporta ${formatMoney(-x)}` : formatMoney(x);
}

export function MarketView({ state }: { state: GameState }) {
  const [tab, setTab] = useState<"mine" | "market">("mine");
  const [offer, setOffer] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const team = state.teams[state.player.teamId];
  const open = marketIsOpen(state);
  const lineup = nextSeasonLineup(state, team.id);
  const seats = SEATS[team.series];

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "mine", label: "Mis pilotos" },
            { id: "market", label: "Mercado de pilotos" },
          ]}
        />
        <span className={cx("rounded-lg px-3 py-1.5 text-xs font-bold", open ? "bg-good/15 text-good" : "bg-panel-3 text-muted")}>
          {open ? `Mercado abierto · fichajes para ${state.year + 1}` : `El mercado abre en la ronda ${Math.floor(state.calendar.length * MARKET_OPENS) + 1}`}
        </span>
        <span className="text-xs text-muted">
          Alineación {state.year + 1}: <b className={lineup.length < seats ? "text-warn" : "text-good"}>{lineup.length}/{seats}</b> asientos cubiertos
        </span>
        {msg && <span className="rounded-lg border border-line-2 bg-panel-2 px-3 py-1 text-xs">{msg}</span>}
      </div>
      {tab === "mine" ? <MyDrivers state={state} onOffer={setOffer} onMsg={setMsg} /> : <MarketList state={state} onOffer={setOffer} />}
      {offer && <OfferModal state={state} driverId={offer} onClose={() => setOffer(null)} onDone={(m) => { setMsg(m); setOffer(null); }} />}
    </div>
  );
}

function contractStatus(state: GameState, d: Driver): { text: string; cls: string } {
  if (d.next) {
    if (d.next.teamId === d.teamId) return { text: `Renovado hasta ${d.next.until}`, cls: "text-good" };
    return { text: `Se va a ${state.teams[d.next.teamId]?.short} en ${state.year + 1}`, cls: "text-bad" };
  }
  if (d.contractUntil > state.year) return { text: `Contrato hasta ${d.contractUntil}`, cls: "text-muted" };
  return { text: "Termina contrato esta temporada", cls: "text-warn" };
}

function MyDrivers({ state, onOffer, onMsg }: { state: GameState; onOffer: (id: string) => void; onMsg: (m: string | null) => void }) {
  const team = state.teams[state.player.teamId];
  const mine = teamDrivers(state, team.id);
  const incoming = Object.values(state.drivers).filter((d) => d.next?.teamId === team.id && d.teamId !== team.id);
  return (
    <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto lg:grid-cols-2">
      <Panel title={`Plantilla ${state.year}`}>
        <div className="space-y-3">
          {mine.map((d) => {
            const st = contractStatus(state, d);
            const canRenew = isAvailable(state, d);
            const cost = terminationCost(state, d);
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <DriverPortrait driver={d} color={team.color} className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    #{d.number} {d.first} {d.last} <Nat code={d.nat} />
                  </div>
                  <div className="text-xs text-muted">
                    {d.age} años · media {driverOverall(d)} · salario {money(d.salary)}
                  </div>
                  <div className={cx("text-xs font-semibold", st.cls)}>{st.text}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {canRenew && (
                    <Btn size="xs" variant="good" onClick={() => onOffer(d.id)}>
                      Renovar
                    </Btn>
                  )}
                  {d.contractUntil > state.year && !(d.next && d.next.teamId !== team.id) && (
                    <Btn
                      size="xs"
                      variant="danger"
                      onClick={() => {
                        if (!window.confirm(`¿Rescindir el contrato de ${d.last}? Indemnización: ${formatMoney(cost)}. Correrá hasta final de temporada.`)) return;
                        let err: string | null = null;
                        gameStore.update((s) => {
                          err = terminateContract(s, d.id);
                        });
                        onMsg(err ?? `${d.last} se marchará a final de temporada`);
                      }}
                    >
                      Rescindir
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title={`Fichajes para ${state.year + 1}`}>
        {incoming.length === 0 ? (
          <p className="text-sm text-muted">Aún no has cerrado ningún fichaje. Si al acabar la temporada queda un asiento libre, la junta ficha por su cuenta.</p>
        ) : (
          <ul className="space-y-2">
            {incoming.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line p-2 text-sm">
                <Nat code={d.nat} />
                <span className="font-semibold">
                  {d.first} {d.last}
                </span>
                <span className="text-xs text-muted">
                  hasta {d.next?.until} · {money(d.next?.salary ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          Los contratos que terminan esta temporada se pueden renovar o dejar marchar. En F1 los pilotos cobran un salario; en F2 y F3 la mayoría aporta patrocinio a cambio del asiento, y los menos talentosos tienen que traer más dinero.
        </p>
      </Panel>
    </div>
  );
}

function MarketList({ state, onOffer }: { state: GameState; onOffer: (id: string) => void }) {
  const team = state.teams[state.player.teamId];
  const [filter, setFilter] = useState<Filter>(team.series);
  const [onlyAvail, setOnlyAvail] = useState(true);
  const rows = useMemo(() => {
    return Object.values(state.drivers)
      .filter((d) => d.teamId !== team.id)
      .filter((d) => (filter === "all" ? true : filter === "free" ? !d.teamId : d.series === filter))
      .filter((d) => !onlyAvail || isAvailable(state, d))
      .filter((d) => LEVEL[d.series] <= LEVEL[team.series] + 1)
      .sort((a, b) => rating(b) - rating(a));
  }, [state, team, filter, onlyAvail]);

  return (
    <Panel fill className="min-h-0 flex-1" bodyClass="p-0" title={
      <Tabs
        value={filter}
        onChange={setFilter}
        className="text-xs"
        tabs={[
          { id: "f1", label: "F1" },
          { id: "f2", label: "F2" },
          { id: "f3", label: "F3" },
          { id: "free", label: "Libres" },
          { id: "all", label: "Todos" },
        ]}
      />
    } right={
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={onlyAvail} onChange={(e) => setOnlyAvail(e.target.checked)} /> Solo negociables
      </label>
    }>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase tracking-wider text-dim">
            <tr>
              <th className="px-3 py-2">Piloto</th>
              <th>Edad</th>
              <th>Equipo</th>
              <th className="text-right">Pos.</th>
              <th className="text-right">Media</th>
              <th className="text-right">Potencial</th>
              <th className="text-right">Contrato</th>
              <th className="pr-3 text-right">Pide</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-muted">
                  No hay pilotos que cumplan el filtro.
                </td>
              </tr>
            )}
            {rows.map((d) => {
              const t = d.teamId ? state.teams[d.teamId] : null;
              const avail = isAvailable(state, d);
              const rank = d.teamId ? driverRank(state, d.id) : 0;
              return (
                <tr key={d.id} className="border-b border-line/60">
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <SeriesBadge s={d.series} />
                      <span className="font-semibold">
                        {d.first} {d.last}
                      </span>
                      <Nat code={d.nat} />
                    </span>
                  </td>
                  <td className="tabular">{d.age}</td>
                  <td>
                    {t ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Stripe color={t.color} className="h-3" /> {t.short}
                      </span>
                    ) : (
                      <span className="text-xs text-good">Agente libre</span>
                    )}
                  </td>
                  <td className="text-right text-xs tabular text-muted">{rank ? `P${rank}` : "—"}</td>
                  <td className="text-right font-bold tabular">{driverOverall(d)}</td>
                  <td className="text-right tabular text-muted" title="Techo de ritmo estimado por los ojeadores">
                    {d.age <= 25 ? d.potential : "—"}
                  </td>
                  <td className="text-right text-xs">{d.next ? <span className="text-bad">Firmado ({state.teams[d.next.teamId]?.short})</span> : d.teamId ? d.contractUntil : "—"}</td>
                  <td className="pr-3 text-right text-xs tabular">{avail ? money(askingSalary(state, d, team.id)) : ""}</td>
                  <td className="pr-3 text-right">
                    <Btn size="xs" disabled={!avail || !marketIsOpen(state)} onClick={() => onOffer(d.id)}>
                      Ofertar
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] text-dim">
        Solo se puede negociar con agentes libres y con pilotos cuyo contrato termina esta temporada. Se puede subir un escalón ({SERIES_SHORT.f3} → {SERIES_SHORT.f2} → {SERIES_SHORT.f1}); para la F1 hace falta nivel de superlicencia.
      </p>
    </Panel>
  );
}

function OfferModal({ state, driverId, onClose, onDone }: { state: GameState; driverId: string; onClose: () => void; onDone: (m: string) => void }) {
  const d = state.drivers[driverId];
  const teamId = state.player.teamId;
  const ask = askingSalary(state, d, teamId);
  const [salary, setSalary] = useState(Math.round(ask * 100) / 100);
  const [years, setYears] = useState(d.age <= 23 ? 2 : 1);
  const verdict = evaluateOffer(state, driverId, teamId, salary, years);
  const step = Math.max(0.01, Math.abs(ask) / 20);
  const f1 = state.teams[teamId].series === "f1";
  return (
    <Modal open onClose={onClose} title={`Oferta a ${d.first} ${d.last}`}>
      <div className="space-y-4">
        <div className="text-sm text-muted">
          {d.age} años · media {driverOverall(d)} · {d.teamId ? `${state.teams[d.teamId].short}, contrato hasta ${d.contractUntil}` : "agente libre"}
        </div>
        <label className="block">
          <div className="mb-1 flex justify-between text-sm">
            <span>{f1 || salary >= 0 ? "Salario por temporada" : "Aportación de patrocinio por temporada"}</span>
            <b className="tabular">{money(salary)}</b>
          </div>
          <input
            type="range"
            className="w-full"
            min={Math.round((ask - Math.abs(ask) * 0.8 - 0.1) * 100) / 100}
            max={Math.round((ask + Math.abs(ask) * 1.2 + 0.1) * 100) / 100}
            step={step}
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
          />
          <div className="text-[11px] text-dim">Lo que pide: {money(ask)}</div>
        </label>
        <div className="flex items-center gap-2 text-sm">
          Duración:
          {[1, 2, 3].map((y) => (
            <Btn key={y} size="sm" variant={years === y ? "primary" : "subtle"} onClick={() => setYears(y)}>
              {y} {y === 1 ? "temporada" : "temporadas"}
            </Btn>
          ))}
        </div>
        <div className={cx("rounded-lg border px-3 py-2 text-sm", verdict.ok ? "border-good/40 bg-good/10 text-good" : "border-bad/40 bg-bad/10 text-bad")}>{verdict.msg}</div>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn
            variant="primary"
            disabled={!verdict.ok}
            onClick={() => {
              let res = verdict;
              gameStore.update((s) => {
                res = signDriver(s, driverId, teamId, salary, years);
              });
              onDone(res.msg);
            }}
          >
            Cerrar el acuerdo
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
