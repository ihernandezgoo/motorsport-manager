import { ArrowLeftRight, Flag, Fuel, Gauge, Headset, Thermometer, TriangleAlert, Video, Zap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { formatLap } from "@/lib/game/perf";
import { ENGINE_LABELS, ERS_LABELS, STYLE_LABELS } from "@/lib/game/race";
import { describePlan, tyreLife } from "@/lib/game/strategy";
import { availableCompounds, COMPOUND_INFO, idealForWetness, isWetTyre, TEMP_WINDOW } from "@/lib/game/tyres";
import type { Compound, DrivingStyle, EngineMode, ErsMode, GameState } from "@/lib/game/types";
import { liveRace, type LivePlayer, type LiveSnapshot, type Neighbour } from "@/lib/liveRace";
import { DriverPortrait } from "../art/Photos";
import { cx, textOn } from "../ui";

const STYLE_COLORS = ["#2563eb", "#0891b2", "#6b7280", "#ea580c", "#dc2626"];
const ENGINE_COLORS = ["#16a34a", "#6b7280", "#ea580c", "#dc2626"];
const ERS_COLORS = ["#16a34a", "#6b7280", "#a855f7"];
const ENGINE_DESC = ["Gasta menos combustible, más lento", "Consumo nominal", "Más potencia, más consumo", "Máxima potencia: consumo y riesgo de avería altos"];
const ERS_DESC = ["Recarga la batería a cambio de ritmo", "Uso equilibrado de la energía", "Despliega la batería: más rápido y ayuda a adelantar"];

function tyreRingColor(c: Compound) {
  return c === "H" ? "#9ca3af" : COMPOUND_INFO[c].color;
}

function Dots({ count, value, colors, labels, onPick, disabled }: { count: number; value: number; colors: string[]; labels: readonly string[]; onPick: (i: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <button
          type="button"
          key={i}
          title={labels[i]}
          disabled={disabled}
          onClick={() => onPick(i)}
          className={cx("h-3 w-3 rounded-full border transition-transform hover:scale-125 disabled:hover:scale-100", i <= value ? "border-transparent" : "border-white/30 bg-white/5")}
          style={i <= value ? { background: colors[value] } : undefined}
        />
      ))}
    </div>
  );
}

function NumBox({ n }: { n: Neighbour | null }) {
  if (!n) return <span className="text-white/40">—</span>;
  return (
    <span className="flex items-center gap-1" title={`P${n.pos} · ${n.code} #${n.number}`}>
      <span className="font-black tabular text-white">{n.pos}</span>
      <span className="h-3.5 w-1 rounded-full" style={{ background: n.color }} />
    </span>
  );
}

/** Dorsal del coche sobre la foto del piloto. */
function NumberBadge({ n, color }: { n: number; color: string }) {
  return (
    <span
      className="absolute bottom-1 left-1 grid h-7 min-w-7 place-items-center rounded-full border-2 border-white/90 px-1 text-xs font-black tabular shadow-md"
      style={{ background: color, color: textOn(color) }}
    >
      {n}
    </span>
  );
}

function MiniCar({ color, me }: { color: string; me?: boolean }) {
  return (
    <svg viewBox="-12 -7 24 14" width={me ? 30 : 24} height={me ? 17 : 14} aria-hidden>
      <rect x={-11} y={-4.6} width={3.2} height={9.2} rx={0.8} fill={me ? "#fff" : "#9aa3b2"} />
      <path d="M-9,-2.6 L-2,-3.4 L4,-1.8 L10.5,-0.8 L10.5,0.8 L4,1.8 L-2,3.4 L-9,2.6 Z" fill={color} />
      <rect x={9.6} y={-5} width={2} height={10} rx={0.6} fill={me ? "#fff" : "#9aa3b2"} />
    </svg>
  );
}

function CarDiagram({ wear, aero, floor, power }: { wear: number; aero: number; floor: number; power: number }) {
  const tyre = wear > 75 ? "#ef4444" : wear > 50 ? "#f59e0b" : "#22c55e";
  return (
    <svg viewBox="0 0 30 60" width={30} height={60} aria-label="Estado del coche">
      <title>{`Alerón ${aero > 0.05 ? "dañado" : "OK"} · fondo ${floor > 0.05 ? "dañado" : "OK"} · motor ${power > 0.05 ? "con problemas" : "OK"}`}</title>
      <rect x={3} y={3} width={24} height={4} rx={1} fill={aero > 0.05 ? "#ef4444" : "#4b5563"} />
      <rect x={2} y={10} width={5} height={10} rx={1.5} fill={tyre} />
      <rect x={23} y={10} width={5} height={10} rx={1.5} fill={tyre} />
      {floor > 0.05 && <path d="M8,22 L22,22 L23,48 L7,48 Z" fill="#dc2626" opacity={0.75} />}
      <path d="M12,7 L18,7 L20,24 L21,46 L9,46 L10,24 Z" fill="#6b7280" />
      <rect x={11} y={30} width={8} height={10} rx={1} fill={power > 0.05 ? "#f97316" : "#374151"} />
      <rect x={1} y={40} width={6} height={12} rx={1.5} fill={tyre} />
      <rect x={23} y={40} width={6} height={12} rx={1.5} fill={tyre} />
      <rect x={6} y={52} width={18} height={4} rx={1} fill="#4b5563" />
    </svg>
  );
}

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-white/10 bg-[#0d1117]/95 p-3 text-white shadow-2xl backdrop-blur">{children}</div>
    </>
  );
}

export function DriverPanel({
  p,
  snap,
  state,
  followed,
  onFollow,
  onCycle,
}: {
  p: LivePlayer;
  snap: LiveSnapshot;
  state: GameState;
  followed: boolean;
  onFollow: () => void;
  onCycle?: () => void;
}) {
  const [pop, setPop] = useState<null | "pit" | "engine" | "ers">(null);
  const circuit = CIRCUITS[snap.circuitId];
  const compounds = availableCompounds(snap.series, circuit);
  const locked = p.out || p.finished || snap.finished;
  const disabled = p.auto || locked;
  const remaining = Math.round(100 - p.wear);
  const ringColor = tyreRingColor(p.compound);
  const [lo, hi] = TEMP_WINDOW[p.compound];
  const tempColor = p.temp < lo ? "#2563eb" : p.temp > hi ? "#dc2626" : "#16a34a";
  const circ = 2 * Math.PI * 20;
  const driver = state.drivers[p.id];
  const ideal = idealForWetness(snap.wet);

  const alerts: { text: string; bad?: boolean }[] = [];
  if (p.wear > 85) alerts.push({ text: "Neumáticos al límite: riesgo de pinchazo", bad: true });
  else if (p.wear > 72) alerts.push({ text: "Neumáticos muy gastados" });
  if (!isWetTyre(p.compound) && snap.wet > 0.2) alerts.push({ text: "Pista mojada con slicks", bad: true });
  if (isWetTyre(p.compound) && snap.wet < 0.12) alerts.push({ text: "La pista se seca: monta slicks" });
  if (p.temp < lo - 6) alerts.push({ text: "Neumáticos fríos" });
  if (p.temp > hi + 4) alerts.push({ text: "Neumáticos sobrecalentados" });
  if (p.fuelMargin < 0) alerts.push({ text: "Combustible justo: levantando el pie", bad: true });
  if (p.needsOther && snap.totalLaps - snap.lap < 15) alerts.push({ text: "Falta usar otro compuesto", bad: snap.totalLaps - snap.lap < 5 });
  if (p.aeroDamage > 0.05) alerts.push({ text: "Alerón dañado: cámbialo en boxes", bad: true });
  if (p.floorDamage > 0.05) alerts.push({ text: `Fondo dañado (−${p.floorDamage.toFixed(1)} %): no se puede reparar` });
  if (p.powerLoss > 0.05) alerts.push({ text: "Problema de motor", bad: true });
  if (p.penalty > 0) alerts.push({ text: `Penalización +${p.penalty} s` });
  if (p.auto) alerts.unshift({ text: "El ingeniero (IA) controla este coche" });

  const suggestion = pop === "pit" ? liveRace.suggest(p.id) : null;

  return (
    <div className="relative w-full select-none">
      {p.radio && (
        <div className="mb-1 flex max-w-full items-center gap-2 rounded-lg bg-[#0e7490]/95 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
          <Headset className="h-3.5 w-3.5 shrink-0" />
          <span className="font-black uppercase">{p.last}</span>
          <span className="truncate italic">{p.radio}</span>
        </div>
      )}
      {alerts.length > 0 && !locked && (
        <div className="mb-1 flex flex-wrap gap-1">
          {alerts.map((a) => (
            <span key={a.text} className={cx("flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold shadow", a.bad ? "bg-[#dc2626] text-white" : "bg-[#f59e0b] text-black")}>
              <TriangleAlert className="h-3 w-3" /> {a.text}
            </span>
          ))}
        </div>
      )}

      {pop === "pit" && (
        <Popover onClose={() => setPop(null)}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider">Parada en boxes</span>
            <span className="text-white/60">Ideal ahora: {ideal === "dry" ? "seco" : COMPOUND_INFO[ideal].name.toLowerCase()}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {compounds.map((c) => {
              const life = isWetTyre(c) ? null : tyreLife(snap.series, circuit, c, driver.tyre);
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => {
                    liveRace.requestPit(p.id, c);
                    setPop(null);
                  }}
                  className={cx("flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition hover:bg-white/10", p.pitRequest === c ? "border-[#f5d90a]" : "border-white/10")}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full border-4 bg-black text-xs font-black" style={{ borderColor: COMPOUND_INFO[c].color, color: COMPOUND_INFO[c].color }}>
                    {COMPOUND_INFO[c].letter}
                  </span>
                  <span className="font-semibold">{COMPOUND_INFO[c].name}</span>
                  <span className="text-white/50">{life ? `~${life} v` : "Mojado"}</span>
                </button>
              );
            })}
          </div>
          {snap.redFlag && <div className="mt-2 text-[11px] font-semibold text-[#fca5a5]">Bandera roja: el cambio es gratuito y se hace en la salida parada.</div>}
          {!snap.redFlag && p.aeroDamage > 0.05 && <div className="mt-2 text-[11px] text-white/70">Se cambiará también el alerón delantero (+6 s de parada).</div>}
          {suggestion && <div className="mt-2 text-[11px] text-white/70">Plan del ingeniero desde aquí: <b className="text-white">{describePlan(suggestion)}</b></div>}
          {p.pitRequest && (
            <button
              type="button"
              onClick={() => {
                liveRace.requestPit(p.id, null);
                setPop(null);
              }}
              className="mt-2 w-full rounded-lg bg-[#dc2626] py-1.5 text-xs font-bold"
            >
              Cancelar parada
            </button>
          )}
        </Popover>
      )}
      {pop === "engine" && (
        <Popover onClose={() => setPop(null)}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider">Modo de motor · combustible {p.fuelMargin >= 0 ? "+" : ""}{p.fuelMargin.toFixed(2)} v</div>
          <div className="space-y-1">
            {ENGINE_LABELS.map((l, i) => (
              <button
                type="button"
                key={l}
                onClick={() => {
                  liveRace.setEngine(p.id, i as EngineMode);
                  setPop(null);
                }}
                className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-xs hover:bg-white/10", p.engine === i && "bg-white/10")}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: ENGINE_COLORS[i] }} />
                <span className="w-24 font-bold">{l}</span>
                <span className="text-white/60">{ENGINE_DESC[i]}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
      {pop === "ers" && (
        <Popover onClose={() => setPop(null)}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider">Energía (ERS) · batería {Math.round(p.battery)}%</div>
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#a855f7]" style={{ width: `${p.battery}%` }} />
          </div>
          <div className="space-y-1">
            {ERS_LABELS.map((l, i) => (
              <button
                type="button"
                key={l}
                onClick={() => {
                  liveRace.setErs(p.id, i as ErsMode);
                  setPop(null);
                }}
                className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-xs hover:bg-white/10", p.ers === i && "bg-white/10")}
              >
                <span className="w-24 font-bold">{l}</span>
                <span className="text-white/60">{ERS_DESC[i]}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}

      <div className="flex h-9 items-center gap-2 rounded-t-xl border border-b-0 border-white/10 bg-[#15181e]/90 px-3 text-[11px] font-bold uppercase tracking-wider text-white/60 backdrop-blur">
        <span className="italic">Detrás</span>
        <NumBox n={p.behind} />
        <span className="tabular text-[#4ade80]">{p.behind ? p.behind.gap : ""}</span>
        <div className="mx-auto flex items-center gap-1">
          {p.behind && <MiniCar color={p.behind.color} />}
          <span className="tracking-[0.3em] text-white/30">····</span>
          <MiniCar color={p.color} me />
          <span className="tracking-[0.3em] text-white/30">····</span>
          {p.ahead && <MiniCar color={p.ahead.color} />}
        </div>
        <span className="tabular text-[#f87171]">{p.ahead ? p.ahead.gap : ""}</span>
        <NumBox n={p.ahead} />
        <span className="italic">Delante</span>
      </div>

      <div className="flex h-12 items-stretch gap-2 border-x border-white/10 bg-[#1b1e25] px-2 py-1.5 text-white">
        <button type="button" onClick={onFollow} className="flex min-w-0 items-center gap-2 pl-1 text-left" title="Seguir con la cámara">
          <span className="min-w-6 text-right text-xl font-black tabular">{p.out ? "—" : p.pos}</span>
          <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="truncate text-lg font-black uppercase tracking-wide">{p.last}</span>
          {followed && <Video className="h-4 w-4 shrink-0 text-[#f5d90a]" />}
        </button>
        {onCycle && (
          <button type="button" onClick={onCycle} className="grid w-6 place-items-center text-white/50 hover:text-white" title="Cambiar de piloto">
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#262a33] px-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPop(pop === "engine" ? null : "engine")}
            className="grid h-8 w-8 place-items-center rounded-full bg-[#111318] disabled:opacity-40"
            title={`Motor: ${ENGINE_LABELS[p.engine]}`}
            style={{ boxShadow: `inset 0 0 0 2px ${ENGINE_COLORS[p.engine]}`, color: ENGINE_COLORS[p.engine] === "#6b7280" ? "#d1d5db" : ENGINE_COLORS[p.engine] }}
          >
            <Gauge className="h-4 w-4" />
          </button>
          {snap.hasErs && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPop(pop === "ers" ? null : "ers")}
              className="grid h-8 w-8 place-items-center rounded-full bg-[#111318] disabled:opacity-40"
              title={`ERS: ${ERS_LABELS[p.ers]} (${Math.round(p.battery)}%)`}
              style={{ boxShadow: `inset 0 0 0 2px ${ERS_COLORS[p.ers]}`, color: ERS_COLORS[p.ers] === "#6b7280" ? "#d1d5db" : ERS_COLORS[p.ers] }}
            >
              <Zap className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={disabled || snap.lap >= snap.totalLaps}
          onClick={() => setPop(pop === "pit" ? null : "pit")}
          className={cx(
            "w-28 shrink-0 rounded-md text-base font-black uppercase tracking-wider text-black shadow disabled:opacity-50 sm:w-36",
            p.pitRequest ? "pulse bg-[#f97316]" : "bg-[#f5d90a] hover:bg-[#ffe633]",
          )}
        >
          {p.pitRequest ? `Box · v${p.pitLap}` : "Pit"}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => liveRace.setAuto(p.id, !p.auto)}
          className={cx("grid w-10 shrink-0 place-items-center rounded-md border", p.auto ? "border-[#3b82f6] bg-[#2563eb] text-white" : "border-white/15 bg-[#262a33] text-white/80 hover:bg-[#30343e]")}
          title={p.auto ? "El ingeniero controla el coche (pulsa para recuperar el control)" : "Delegar el coche en el ingeniero (IA)"}
        >
          <Headset className="h-5 w-5" />
        </button>
      </div>

      {locked && p.out ? (
        <div className="flex h-[124px] items-center gap-3 rounded-b-xl border border-t-0 border-white/10 bg-[#23262e]/95 px-4 text-white">
          <div className="relative">
            <DriverPortrait driver={driver} color={p.color} className="h-[84px] w-[84px] grayscale" />
            <NumberBadge n={p.number} color={p.color} />
          </div>
          <div>
            <div className="text-lg font-black uppercase text-[#f87171]">Abandono</div>
            <div className="text-sm text-white/70">{p.dnfReason ?? "Retirado"}</div>
          </div>
        </div>
      ) : (
        <div className="grid h-[124px] grid-cols-[96px_minmax(0,0.9fr)_minmax(0,1.25fr)_minmax(0,1fr)_44px] items-stretch overflow-hidden rounded-b-xl border border-t-0 border-white/10 bg-[#23262e]/95 text-white">
          <div className="relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${p.color} 0%, ${p.color}55 50%, #1b1e25 100%)` }}>
            <DriverPortrait driver={driver} className="h-full w-full" rounded="" />
            <NumberBadge n={p.number} color={p.color} />
          </div>
          <div className="flex flex-col items-center justify-center border-r border-white/10 px-3 text-center">
            <div className="text-lg font-black uppercase leading-tight">{p.finished ? <Flag className="mx-auto h-5 w-5" /> : `Vuelta ${p.currentLap}`}</div>
            <div className="text-xs tabular text-white/60">de {snap.totalLaps}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-white" style={{ width: `${p.lapProgress * 100}%` }} />
            </div>
            <div className="mt-1.5 font-mono text-sm font-semibold tabular">{p.lastLap ? formatLap(p.lastLap) : "—"}</div>
            <div className="truncate text-[10px] text-white/45">Mejor {isFinite(p.bestLap) ? formatLap(p.bestLap) : "—"}</div>
          </div>
          <div className="flex flex-col justify-center border-r border-white/10 px-2">
            <div className="flex items-center justify-center gap-2">
              <svg viewBox="0 0 50 50" width={50} height={50} className="shrink-0">
                <circle cx={25} cy={25} r={20} fill="#111318" stroke="#3a3f4a" strokeWidth={5} />
                <circle
                  cx={25}
                  cy={25}
                  r={20}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={5}
                  strokeDasharray={`${(circ * remaining) / 100} ${circ}`}
                  transform="rotate(-90 25 25)"
                  strokeLinecap="round"
                />
                <text x={25} y={30} textAnchor="middle" fontSize={COMPOUND_INFO[p.compound].letter.length > 1 ? 11 : 15} fontWeight={900} fill={ringColor}>
                  {COMPOUND_INFO[p.compound].letter}
                </text>
              </svg>
              <div className="min-w-0">
                <div className="text-xl font-black tabular leading-tight">{remaining}%</div>
                <div className="text-[10px] font-semibold tabular text-white/60">{p.wearRate.toFixed(1)} % / vuelta</div>
                <div className="flex items-center gap-0.5 text-[10px] font-semibold tabular" style={{ color: tempColor }}>
                  <Thermometer className="h-3 w-3" />
                  {Math.round(p.temp)}°C · {p.tyreAge} v
                </div>
              </div>
            </div>
            <div className="mt-1.5">
              <Dots count={5} value={p.style} colors={STYLE_COLORS} labels={STYLE_LABELS} disabled={disabled} onPick={(i) => liveRace.setStyle(p.id, i as DrivingStyle)} />
              <div className="mt-0.5 text-center text-[9px] font-bold uppercase tracking-wider text-white/45">Ritmo · {STYLE_LABELS[p.style]}</div>
            </div>
          </div>
          <div className="flex flex-col justify-center border-r border-white/10 px-2">
            <div className="flex items-center justify-center gap-1.5">
              <Fuel className="h-4 w-4 text-white/70" />
              <span className={cx("text-lg font-black tabular", p.fuelMargin < 0 ? "text-[#f87171]" : p.fuelMargin < 0.4 ? "text-[#fbbf24]" : "text-[#4ade80]")}>
                {p.fuelMargin >= 0 ? "+" : ""}
                {p.fuelMargin.toFixed(2)}
              </span>
              <span className="text-[10px] font-bold text-white/50">V</span>
            </div>
            <div className="text-center text-[10px] font-semibold tabular text-white/60">{p.fuelPerLap.toFixed(2)} v / vuelta</div>
            {snap.hasErs && (
              <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-white/60">
                <Zap className="h-3 w-3 text-[#c084fc]" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-[#a855f7]" style={{ width: `${p.battery}%` }} />
                </div>
                {Math.round(p.battery)}%
              </div>
            )}
            <div className="mt-1.5">
              <Dots count={4} value={p.engine} colors={ENGINE_COLORS} labels={ENGINE_LABELS} disabled={disabled} onPick={(i) => liveRace.setEngine(p.id, i as EngineMode)} />
              <div className="mt-0.5 text-center text-[9px] font-bold uppercase tracking-wider text-white/45">Motor · {ENGINE_LABELS[p.engine]}</div>
            </div>
          </div>
          <div className="grid place-items-center bg-[#1b1e25]">
            <CarDiagram wear={p.wear} aero={p.aeroDamage} floor={p.floorDamage} power={p.powerLoss} />
          </div>
        </div>
      )}
    </div>
  );
}
