import {
  ArrowLeftRight,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleX,
  CloudRain,
  Droplets,
  Flag,
  Headset,
  Info,
  Map as MapIcon,
  Menu,
  Minus,
  Pause,
  Play,
  Plus,
  Scale,
  Siren,
  SkipForward,
  Timer,
  TriangleAlert,
  Undo2,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CIRCUITS } from "@/lib/game/data/circuits";
import { formatLap } from "@/lib/game/perf";
import type { RaceEvent, TeamOrder } from "@/lib/game/race";
import { describePlan, tyreLife } from "@/lib/game/strategy";
import { COMPOUND_INFO, dryCompounds, idealForWetness } from "@/lib/game/tyres";
import type { GameState } from "@/lib/game/types";
import { describeWeather, wetnessLabel } from "@/lib/game/weather";
import { liveRace, type LiveSnapshot, type LiveTowerRow } from "@/lib/liveRace";
import { ResultsTable } from "../screens/Results";
import { TrackMap } from "../TrackMap";
import { cx, Pager, SeriesBadge, Tyre, useRowPager, WeatherIcon } from "../ui";
import { DriverPanel } from "./DriverPanel";
import { RaceStrategyModal } from "./RaceStrategyModal";
import { FOLLOW_ZOOM, TrackView, type CameraMode } from "./TrackView";

const SPEEDS = [1, 2, 5, 10, 25, 50, 100];
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const KIND_TITLE = { race: "Carrera", sprint: "Sprint", feature: "Carrera principal" } as const;
const COLS = [
  { key: "gap", label: "Dif. con el líder" },
  { key: "interval", label: "Intervalo" },
  { key: "last", label: "Última vuelta" },
  { key: "best", label: "Mejor vuelta" },
  { key: "pits", label: "Paradas" },
] as const;
const EVENT_ICONS: Record<RaceEvent["type"], { Icon: LucideIcon; color: string }> = {
  overtake: { Icon: ArrowLeftRight, color: "#93c5fd" },
  pit: { Icon: Wrench, color: "#fbbf24" },
  dnf: { Icon: CircleX, color: "#f87171" },
  sc: { Icon: Siren, color: "#facc15" },
  vsc: { Icon: Siren, color: "#fde68a" },
  restart: { Icon: Flag, color: "#4ade80" },
  weather: { Icon: CloudRain, color: "#93c5fd" },
  incident: { Icon: TriangleAlert, color: "#fb923c" },
  penalty: { Icon: Scale, color: "#fca5a5" },
  fastest: { Icon: Timer, color: "#c084fc" },
  info: { Icon: Info, color: "#cbd5e1" },
  red: { Icon: Flag, color: "#ef4444" },
  radio: { Icon: Headset, color: "#67e8f9" },
  order: { Icon: Users, color: "#c4b5fd" },
};

const ORDERS: { id: TeamOrder; label: string; title: string }[] = [
  { id: "free", label: "Libre", title: "Los pilotos pueden luchar entre ellos" },
  { id: "hold", label: "Mantener", title: "Nadie ataca a su compañero" },
  { id: "swap", label: "Intercambiar", title: "El de delante deja pasar a su compañero si está a menos de 3 s" },
];

function EventIcon({ type }: { type: RaceEvent["type"] }) {
  const { Icon, color } = EVENT_ICONS[type];
  return <Icon className="inline h-4 w-4 shrink-0" color={color} />;
}

function sessionDay(dateISO: string, kind: LiveSnapshot["kind"]) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  if (kind === "sprint") d.setUTCDate(d.getUTCDate() - 1);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function towerValue(r: LiveTowerRow, col: number): string {
  if (r.out) return "OUT";
  if (r.inPit) return "BOX";
  switch (COLS[col].key) {
    case "gap":
      return r.pos === 1 ? "LÍDER" : r.gap;
    case "interval":
      return r.pos === 1 ? "LÍDER" : r.interval;
    case "last":
      return r.lastLap ? formatLap(r.lastLap) : "—";
    case "best":
      return isFinite(r.bestLap) ? formatLap(r.bestLap) : "—";
    case "pits":
      return `${r.pits} ${r.pits === 1 ? "parada" : "paradas"}`;
  }
}

export function RaceHud({
  state,
  snap,
  dateISO,
  onContinue,
  onLeave,
  leaveLabel,
}: {
  state: GameState;
  snap: LiveSnapshot;
  dateISO: string;
  onContinue: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
}) {
  const [camera, setCamera] = useState<CameraMode>(() => ({ kind: "follow", id: snap.players[0]?.id ?? snap.tower[0]?.id ?? "" }));
  const [zoom, setZoom] = useState(FOLLOW_ZOOM);
  const [col, setCol] = useState(0);
  const [data, setData] = useState(false);
  const [menu, setMenu] = useState(false);
  const [slots, setSlots] = useState<number[]>([0, 1]);
  const [stratFor, setStratFor] = useState<string | null>(null);
  const circuit = CIRCUITS[snap.circuitId];
  const followId = camera.kind === "follow" ? camera.id : null;
  const playerIds = snap.players.map((p) => p.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      e.preventDefault();
      const s = liveRace.getSnapshot();
      if (!s || s.finished) return;
      if (s.playing) liveRace.pause();
      else liveRace.play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const follow = (id: string) => setCamera({ kind: "follow", id });
  const speedIdx = Math.max(0, SPEEDS.indexOf(snap.speed));
  const window5 = 5 * Math.max(1, snap.speed);
  // La radio de los pilotos se ve en su propio panel; aquí solo los avisos de carrera.
  const toasts = snap.events.filter((e) => e.type !== "fastest" && e.type !== "radio" && e.time >= snap.clock - window5).slice(0, 2);
  const forecastMax = Math.max(...snap.radar);
  const forecastIcon = describeWeather(forecastMax, Math.max(0.2, forecastMax * 1.5));
  const nowIcon = describeWeather(snap.rain, Math.max(0.2, snap.rain * 1.5));
  const forecastMinutes = Math.round((10 * snap.baseLap) / 60);
  const cycle = (slot: number) =>
    setSlots((s) => {
      const other = s[1 - slot];
      let next = s[slot];
      do next = (next + 1) % snap.players.length;
      while (next === other && snap.players.length > 1);
      const copy = [...s];
      copy[slot] = next;
      return copy;
    });
  const panelPlayers = slots.map((i) => snap.players[i]).filter(Boolean);

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-black text-white">
      <TrackView
        circuitId={snap.circuitId}
        garageColors={Object.values(state.teams).filter((t) => t.series === snap.series).map((t) => t.color)}
        cars={snap.dots}
        camera={camera}
        zoom={zoom}
        onZoom={setZoom}
        onCamera={setCamera}
        onSelect={follow}
        labelIds={playerIds}
        className="h-[60vh] w-full lg:absolute lg:inset-0 lg:h-full"
      >
        {snap.wet > 0.05 && <div className="pointer-events-none absolute inset-0 bg-[#163552] mix-blend-multiply" style={{ opacity: Math.min(0.6, snap.wet * 0.65) }} />}
        {snap.rain > 0.05 && <div className="rain-overlay pointer-events-none absolute inset-0" style={{ opacity: Math.min(1, 0.45 + snap.rain) }} />}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-80 bg-gradient-to-t from-black/75 to-transparent lg:block" />
      </TrackView>

      {/* Cabecera */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-3">
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-[#15181e]/90 hover:bg-[#262a33]" aria-label="Menú">
            <Menu className="h-5 w-5" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute left-0 top-12 z-20 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#15181e]/95 py-1 text-sm shadow-2xl">
                <MenuItem onClick={() => { setMenu(false); setData(true); }}>
                  <ChartColumn className="h-4 w-4" /> Centro de datos
                </MenuItem>
                {!snap.finished && (
                  <MenuItem
                    onClick={() => {
                      setMenu(false);
                      if (window.confirm("¿Simular el resto de la carrera al instante con las órdenes actuales?")) liveRace.finishNow();
                    }}
                  >
                    <SkipForward className="h-4 w-4" /> Simular hasta el final
                  </MenuItem>
                )}
                {onLeave && (
                  <MenuItem
                    onClick={() => {
                      setMenu(false);
                      liveRace.pause();
                      onLeave();
                    }}
                  >
                    <Undo2 className="h-4 w-4" /> {leaveLabel ?? "Volver a la sede (pausa)"}
                  </MenuItem>
                )}
              </div>
            </>
          )}
        </div>
        <SeriesBadge s={snap.series} className="px-2 py-1 text-sm" />
        <div className="leading-tight [text-shadow:0_1px_4px_#000]">
          <div className="text-xl font-black uppercase tracking-wide">{KIND_TITLE[snap.kind]}</div>
          <div className="text-sm font-semibold text-white/80">
            {sessionDay(dateISO, snap.kind)} · {circuit.city}
          </div>
        </div>
      </div>

      {/* Notificaciones */}
      <div className="absolute left-1/2 top-3 z-20 flex w-[min(560px,60vw)] -translate-x-1/2 flex-col items-center gap-1.5">
        {!snap.playing && !snap.finished && snap.pauseReason && (
          <div className="flex items-center gap-3 rounded-lg bg-[#f59e0b] px-4 py-1.5 text-sm font-semibold text-black shadow-lg">
            <Pause className="h-4 w-4" /> {snap.pauseReason}
            <button type="button" onClick={() => liveRace.play()} className="rounded bg-black/80 px-2 py-0.5 text-xs text-white">
              Reanudar
            </button>
          </div>
        )}
        {snap.status === "red" && !snap.finished && (
          <div className="flex flex-col items-center gap-1">
            <span className="rounded bg-[#dc2626] px-5 py-1 text-sm font-black tracking-[0.3em] text-white shadow-lg ring-2 ring-white/70">BANDERA ROJA</span>
            {snap.redFlag && (
              <span className="rounded bg-black/80 px-3 py-1 text-xs font-semibold text-white">
                Carrera suspendida · salida parada en {Math.max(0, Math.ceil(snap.redFlag.restartIn))} s · cambio de neumáticos gratis con el botón PIT
              </span>
            )}
          </div>
        )}
        {(snap.status === "sc" || snap.status === "vsc") && !snap.finished && (
          <div className="sc-stripes rounded px-1 py-1 shadow-lg">
            <span className="rounded bg-[#facc15] px-3 py-0.5 text-sm font-black tracking-[0.25em] text-black">{snap.status === "sc" ? "SAFETY CAR" : "VIRTUAL SAFETY CAR"}</span>
          </div>
        )}
        {toasts.map((e, i) => (
          <div
            key={`${e.time}-${i}`}
            className={cx("flex items-center gap-2 rounded-md border border-white/10 bg-[#15181e]/85 px-4 py-1.5 text-sm shadow-lg backdrop-blur", e.drivers.some((d) => playerIds.includes(d)) && "ring-1 ring-white/60")}
          >
            <EventIcon type={e.type} />
            {e.text}
          </div>
        ))}
      </div>

      {/* Clima y centro de datos */}
      <div className="absolute right-3 top-3 z-20 hidden items-stretch gap-2 lg:flex">
        <div className="flex flex-col justify-center rounded-lg border border-white/10 bg-[#15181e]/85 px-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/80">Agua en pista</span>
            <span className="flex items-center gap-1 text-sm font-black uppercase">
              <Droplets className="h-4 w-4 text-[#93c5fd]" /> {wetnessLabel(snap.wet)}
            </span>
          </div>
          <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#38bdf8]" style={{ width: `${Math.max(4, snap.wet * 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-[#15181e]/85 px-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <div className="text-sm text-white/80">Actual</div>
              <div className="text-xs font-bold italic tabular text-white/70">{snap.airTemp}°C</div>
            </div>
            <WeatherIcon w={nowIcon} className="h-7 w-7" />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <div className="text-sm text-white/80">Previsión</div>
              <div className="text-xs font-bold italic tabular text-white/70">{forecastMinutes} min</div>
            </div>
            <WeatherIcon w={forecastIcon} className="h-7 w-7" />
          </div>
        </div>
        <button type="button" onClick={() => setData(true)} className="rounded-lg bg-white px-6 text-sm font-black uppercase tracking-[0.15em] text-black shadow-lg hover:bg-[#e5e7eb]">
          Centro de datos
        </button>
      </div>

      {/* Torre de tiempos */}
      <div className="relative z-10 mx-3 mt-3 flex max-h-[40vh] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#15181e]/85 backdrop-blur lg:absolute lg:left-3 lg:top-[68px] lg:m-0 lg:max-h-[calc(100%-358px)] lg:w-[300px]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70">
          <button type="button" onClick={() => setCol((c) => (c + COLS.length - 1) % COLS.length)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/10 hover:text-white" aria-label="Columna anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {COLS[col].label}
          <button type="button" onClick={() => setCol((c) => (c + 1) % COLS.length)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/10 hover:text-white" aria-label="Columna siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Tower snap={snap} col={col} followId={followId} onFollow={follow} />
      </div>

      {/* Minimapa y cámara */}
      <div className="relative z-10 mx-3 mt-3 lg:absolute lg:right-3 lg:top-[68px] lg:m-0 lg:w-[250px]">
        <div className="rounded-xl border border-white/10 bg-[#15181e]/80 p-2 backdrop-blur">
          <TrackMap circuitId={snap.circuitId} dots={snap.dots} labels="player" wet={snap.wet} className="h-[200px] w-full" />
        </div>
        <div className="mt-2 flex items-center gap-1">
          <HudBtn onClick={() => setZoom((z) => Math.max(-4, z - 0.5))} title="Alejar">
            <Minus className="h-4 w-4" />
          </HudBtn>
          <HudBtn onClick={() => setZoom((z) => Math.min(3.5, z + 0.5))} title="Acercar">
            <Plus className="h-4 w-4" />
          </HudBtn>
          <HudBtn onClick={() => setCamera({ kind: "overview" })} active={camera.kind === "overview"} title="Ver todo el circuito">
            <MapIcon className="h-4 w-4" /> Vista general
          </HudBtn>
        </div>
        <select
          value={followId ?? (camera.kind === "overview" ? "__overview" : "")}
          onChange={(e) => {
            if (e.target.value === "__overview") setCamera({ kind: "overview" });
            else if (e.target.value) follow(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#15181e]/90 px-2 py-1 text-xs text-white"
        >
          <option value="" disabled>Cámara libre</option>
          <option value="__overview">Vista general</option>
          {snap.tower.map((r) => (
            <option key={r.id} value={r.id}>
              Cámara: P{r.pos} · #{r.number} {r.last}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[10px] text-white/50">Arrastra para mover la cámara · rueda para el zoom · espacio para pausar</div>
      </div>

      {/* Paneles de los pilotos y control de carrera */}
      <div className="relative z-10 mx-3 my-3 flex flex-col gap-3 lg:absolute lg:inset-x-3 lg:bottom-3 lg:m-0 lg:flex-row lg:items-end lg:justify-between">
        <div className="lg:w-[calc(50%-175px)] lg:max-w-[620px]">
          {panelPlayers[0] && (
            <DriverPanel
              p={panelPlayers[0]}
              snap={snap}
              state={state}
              followed={followId === panelPlayers[0].id}
              onFollow={() => follow(panelPlayers[0].id)}
              onCycle={snap.players.length > 2 ? () => cycle(0) : undefined}
              onStrategy={() => setStratFor(panelPlayers[0].id)}
            />
          )}
        </div>
        <div className="order-first w-full lg:order-none lg:w-[320px]">
          {!snap.playing && !snap.finished && snap.clock === 0 && (
            <div className="mb-2 rounded-lg bg-[#16a34a] px-3 py-1.5 text-center text-sm font-bold shadow-lg">Coches en parrilla · pulsa ▶ para dar la salida</div>
          )}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#15181e]/90 backdrop-blur">
            {snap.players.length > 1 && !snap.finished && (
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-stretch border-b border-white/10 text-[10px] font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1 px-2 text-white/50" title="Órdenes de equipo">
                  <Users className="h-3.5 w-3.5" />
                </span>
                {ORDERS.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    title={o.title}
                    onClick={() => liveRace.setTeamOrder(o.id)}
                    className={cx("py-1.5 transition-colors", snap.teamOrder === o.id ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-center gap-3 px-3 py-2">
              <StatusDots green={snap.status === "green"} />
              <span className="text-sm font-black uppercase tracking-wider">{KIND_TITLE[snap.kind]}</span>
              <span className="text-lg font-black tabular">{snap.finished ? "FINAL" : `VUELTA ${snap.lap}/${snap.totalLaps}`}</span>
              <StatusDots green={snap.status === "green"} />
            </div>
            <div className="grid grid-cols-[48px_56px_minmax(0,1fr)_48px] border-t border-white/10">
              <button type="button" onClick={() => setData(true)} className="grid h-11 place-items-center hover:bg-white/10" title="Centro de datos">
                <ChartColumn className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={snap.finished}
                onClick={() => (snap.playing ? liveRace.pause() : liveRace.play())}
                className={cx("grid h-11 place-items-center", snap.playing ? "hover:bg-white/10" : "bg-[#16a34a] hover:bg-[#15803d]")}
                title={snap.playing ? "Pausa" : "Reanudar"}
              >
                {snap.playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
              </button>
              <div className="flex items-center justify-between px-2">
                <button type="button" onClick={() => liveRace.setSpeed(SPEEDS[Math.max(0, speedIdx - 1)])} className="px-1 hover:text-[#facc15]" aria-label="Más lento">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="font-black tabular">×{snap.speed}</span>
                <button type="button" onClick={() => liveRace.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, speedIdx + 1)])} className="px-1 hover:text-[#facc15]" aria-label="Más rápido">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <button
                type="button"
                disabled={snap.finished}
                onClick={() => {
                  if (window.confirm("¿Simular el resto de la carrera al instante con las órdenes actuales?")) liveRace.finishNow();
                }}
                className="grid h-11 place-items-center hover:bg-white/10"
                title="Simular hasta el final"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="lg:w-[calc(50%-175px)] lg:max-w-[620px]">
          {panelPlayers[1] && (
            <DriverPanel
              p={panelPlayers[1]}
              snap={snap}
              state={state}
              followed={followId === panelPlayers[1].id}
              onFollow={() => follow(panelPlayers[1].id)}
              onCycle={snap.players.length > 2 ? () => cycle(1) : undefined}
              onStrategy={() => setStratFor(panelPlayers[1].id)}
            />
          )}
        </div>
      </div>

      {data && <DataCentre snap={snap} state={state} onClose={() => setData(false)} />}
      {stratFor && <RaceStrategyModal state={state} snap={snap} driverId={stratFor} onClose={() => setStratFor(null)} />}

      {snap.replaying && (
        <div className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/85 px-4 py-2 text-sm text-white shadow-xl">
          <span className="font-black tracking-wider text-[#f5d90a]">▶ REPETICIÓN</span>
          <button type="button" onClick={() => liveRace.stopReplay()} className="rounded bg-white px-3 py-1 text-xs font-bold text-black hover:bg-white/80">
            Volver a resultados
          </button>
        </div>
      )}

      {snap.finished && snap.result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[900px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-2 bg-panel text-fg shadow-2xl">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Flag className="h-5 w-5" /> {snap.name} · Resultado final
              </h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => setData(true)} className="rounded-lg border border-line-2 px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg">
                  Centro de datos
                </button>
                <button type="button" onClick={onContinue} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-bold text-white hover:bg-[#ff2419]">
                  Guardar y continuar →
                </button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex min-h-0 flex-col">
                <ResultsTable state={state} result={snap.result} />
              </div>
              <div className="flex min-h-0 flex-col">
                <div className="mb-2 text-xs font-black uppercase tracking-wider text-muted">Momentos clave</div>
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-xs">
                  {snap.highlights.length === 0 && <li className="text-muted">Carrera sin incidencias.</li>}
                  {snap.highlights.map((e, i) => (
                    <li key={`${e.time}-${i}`}>
                      <button type="button" onClick={() => liveRace.replay(e.time)} className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-panel-3" title="Ver la repetición">
                        <span className="shrink-0 font-mono text-dim">V{e.lap}</span>
                        <span className="min-w-0 flex-1">{e.text}</span>
                        <span className="shrink-0 text-accent">▶</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TOWER_ROW = 26;
/** Coches visibles a la vez en la torre; el resto (p. ej. F3 con 30) se ve haciendo scroll. */
const TOWER_VISIBLE = 22;

/** Torre de tiempos: única zona del juego con scroll. Si falta altura en pantalla, muestra menos filas. */
function Tower({ snap, col, followId, onFollow }: { snap: LiveSnapshot; col: number; followId: string | null; onFollow: (id: string) => void }) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: TOWER_ROW * TOWER_VISIBLE }}>
        {snap.tower.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onFollow(r.id)}
              style={{ height: TOWER_ROW }}
              className={cx(
                "relative grid w-full grid-cols-[22px_4px_minmax(0,1fr)_74px_18px_34px] items-center gap-1.5 px-2 text-left text-[12.5px] font-bold uppercase",
                r.isPlayer ? "bg-white text-black" : followId === r.id ? "bg-white/15" : "hover:bg-white/10",
                r.out && "opacity-40",
              )}
            >
              <span className="text-right tabular">{r.out ? "—" : r.pos}</span>
              <span className="h-4 w-1" style={{ background: r.color }} />
              <span className="truncate tracking-wide">{r.last}</span>
              <span className={cx("text-right font-mono text-[11.5px] tabular", r.inPit && "text-[#d97706]", !r.isPlayer && !r.inPit && "text-white/85")}>
                {towerValue(r, col)}
                {r.penalty > 0 && !r.out && <span className="text-[#f59e0b]"> +{r.penalty}</span>}
              </span>
              <span className="grid h-4 w-4 place-items-center rounded-full border-2 text-[8px] leading-none" style={{ borderColor: COMPOUND_INFO[r.compound].color }}>
                {COMPOUND_INFO[r.compound].letter.charAt(0)}
              </span>
              <span className="text-right font-mono text-[11px] tabular">{Math.round(100 - r.wear)}%</span>
              {snap.fastest?.id === r.id && <span className="absolute -right-0 top-0 h-full w-1 bg-[#a855f7]" title="Vuelta rápida" />}
            </button>
          </li>
        ))}
    </ul>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-white/10">
      {children}
    </button>
  );
}

/** Rejilla de 3×2 luces, como el marcador de estado de carrera. */
function StatusDots({ green }: { green: boolean }) {
  return (
    <span className={cx("grid grid-cols-3 gap-[3px]", !green && "pulse")}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={cx("h-[5px] w-[5px] rounded-full", green ? "bg-[#22c55e]" : "bg-[#facc15]")} />
      ))}
    </span>
  );
}

function HudBtn({ onClick, children, title, active }: { onClick: () => void; children: ReactNode; title?: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-bold backdrop-blur",
        active ? "border-white bg-white text-black" : "border-white/10 bg-[#15181e]/85 text-white hover:bg-[#262a33]",
      )}
    >
      {children}
    </button>
  );
}

function DataCentre({ snap, state, onClose }: { snap: LiveSnapshot; state: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<"timing" | "events" | "weather" | "strategy">("timing");
  const [mine, setMine] = useState(false);
  const circuit = CIRCUITS[snap.circuitId];
  const playerIds = snap.players.map((p) => p.id);
  const events = snap.events.filter((e) => !mine || e.drivers.some((d) => playerIds.includes(d)) || ["sc", "vsc", "red", "restart", "weather"].includes(e.type));
  const ideal = idealForWetness(snap.wet);
  const dry = dryCompounds(snap.series, circuit);
  const tabs = [
    { id: "timing", label: "Tiempos" },
    { id: "events", label: "Dirección de carrera" },
    { id: "weather", label: "Meteorología" },
    { id: "strategy", label: "Estrategia" },
  ] as const;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex h-full max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
          <h2 className="mr-4 text-lg font-black uppercase tracking-wider">Centro de datos</h2>
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === t.id ? "bg-white text-black" : "text-white/70 hover:bg-white/10")}
            >
              {t.label}
            </button>
          ))}
          <button type="button" onClick={onClose} className="ml-auto rounded-md px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
          {tab === "timing" && <TimingTable snap={snap} state={state} />}
          {tab === "events" && (
            <EventLog events={events} playerIds={playerIds} filter={<label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Solo mi equipo y avisos generales
              </label>} />
          )}
          {tab === "weather" && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 text-sm">
                <WeatherIcon w={describeWeather(snap.rain, Math.max(0.2, snap.rain * 1.5))} className="h-12 w-12" />
                <div>
                  Pista: <b>{wetnessLabel(snap.wet)}</b> ({Math.round(snap.wet * 100)}% de humedad)
                </div>
                <div>
                  Intensidad de lluvia: <b>{Math.round(snap.rain * 100)}%</b>
                </div>
                <div>
                  Temperaturas: <b>{snap.airTemp}°C</b> aire · <b>{snap.trackTemp}°C</b> asfalto
                </div>
                <div className="flex items-center gap-2">
                  Neumático ideal ahora:{" "}
                  {ideal === "dry" ? (
                    <b>seco</b>
                  ) : (
                    <>
                      <Tyre c={ideal} size={18} /> <b>{COMPOUND_INFO[ideal].name}</b>
                    </>
                  )}
                </div>
                <p className="text-xs text-white/50">Los intermedios rinden mejor entre el 18 % y el 85 % de humedad; por encima, los de lluvia extrema. Con la pista seca, los neumáticos de lluvia se sobrecalientan y se destrozan.</p>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Radar · próximas 10 vueltas</div>
                <div className="flex h-40 items-end gap-1.5">
                  {snap.radar.map((r, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t bg-[#3b82f6]" style={{ height: `${Math.max(3, r * 100)}%`, opacity: r > 0.03 ? 0.4 + r * 0.6 : 0.15 }} />
                      <span className="text-[10px] tabular text-white/40">v{Math.min(snap.totalLaps, snap.lap + i)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === "strategy" && (
            <div className="grid gap-4 md:grid-cols-2">
              {snap.players.map((p) => {
                const plan = liveRace.suggest(p.id);
                const d = state.drivers[p.id];
                return (
                  <div key={p.id} className="rounded-xl border border-white/10 p-4">
                    <div className="mb-2 flex items-center gap-2 font-bold">
                      <span className="h-4 w-1" style={{ background: p.color }} />
                      {p.name} · P{p.pos}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Tyre c={p.compound} size={20} age={p.tyreAge} /> {Math.round(100 - p.wear)}% restante · {p.wearRate.toFixed(1)} %/vuelta
                    </div>
                    <div className="mt-2 text-sm">
                      Plan del ingeniero: <b>{plan ? describePlan(plan) : "—"}</b>
                    </div>
                    <table className="mt-3 w-full text-xs">
                      <tbody>
                        {dry.map((c) => (
                          <tr key={c} className="border-t border-white/5">
                            <td className="py-1">
                              <span className="flex items-center gap-2">
                                <Tyre c={c} size={16} /> {COMPOUND_INFO[c].name}
                              </span>
                            </td>
                            <td className="py-1 text-right tabular text-white/70">~{tyreLife(snap.series, circuit, c, d.tyre)} vueltas de vida</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TIMING_ROW = 32;
const TIMING_HEAD = 32;

function TimingTable({ snap, state }: { snap: LiveSnapshot; state: GameState }) {
  const { ref, pager } = useRowPager(snap.tower.length, TIMING_ROW, TIMING_HEAD);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-white/50" style={{ height: TIMING_HEAD }}>
              <th className="text-center">Pos</th>
              <th>Piloto</th>
              <th>Equipo</th>
              <th className="text-right">Dif.</th>
              <th className="text-right">Int.</th>
              <th className="text-right">Última</th>
              <th className="text-right">Mejor</th>
              <th className="pl-4">Neumático</th>
              <th className="text-center">Paradas</th>
              <th className="text-center">+/-</th>
            </tr>
          </thead>
          <tbody>
            {snap.tower.slice(pager.start, pager.end).map((r) => {
              const d = state.drivers[r.id];
              return (
                <tr key={r.id} className={cx("border-b border-white/5", r.isPlayer && "bg-white/10")} style={{ height: TIMING_ROW }}>
                  <td className="text-center font-bold tabular">{r.out ? "—" : r.pos}</td>
                  <td className="whitespace-nowrap">
                    <span className="mr-2 inline-block h-3 w-1 align-middle" style={{ background: r.color }} />
                    <span className="font-mono text-xs text-white/50">{r.number}</span> <b>{d ? `${d.first} ${d.last}` : r.last}</b>
                  </td>
                  <td className="whitespace-nowrap text-white/60">{d ? state.teams[d.teamId].short : ""}</td>
                  <td className="text-right font-mono text-xs tabular">{r.out ? "OUT" : r.pos === 1 ? "—" : r.gap}</td>
                  <td className="text-right font-mono text-xs tabular">{r.out || r.pos === 1 ? "" : r.interval}</td>
                  <td className="text-right font-mono text-xs tabular">{r.lastLap ? formatLap(r.lastLap) : "—"}</td>
                  <td className={cx("text-right font-mono text-xs tabular", snap.fastest?.id === r.id && "font-bold text-[#c084fc]")}>{isFinite(r.bestLap) ? formatLap(r.bestLap) : "—"}</td>
                  <td className="pl-4">
                    <span className="flex items-center gap-2">
                      <Tyre c={r.compound} size={18} age={r.tyreAge} />
                      <span className="text-xs tabular text-white/60">{Math.round(100 - r.wear)}%</span>
                    </span>
                  </td>
                  <td className="text-center tabular">{r.pits}</td>
                  <td className={cx("text-center text-xs tabular", r.delta > 0 ? "text-[#4ade80]" : r.delta < 0 ? "text-[#f87171]" : "text-white/40")}>
                    {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : "·"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-end pt-2">
        <Pager pager={pager} dark />
      </div>
    </div>
  );
}

const EVENT_ROW = 30;

function EventLog({ events, playerIds, filter }: { events: RaceEvent[]; playerIds: string[]; filter: ReactNode }) {
  const { ref, pager } = useRowPager(events.length, EVENT_ROW);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        {filter}
        <Pager pager={pager} dark />
      </div>
      <ul ref={ref} className="min-h-0 flex-1 overflow-hidden text-sm">
        {events.length === 0 && <li className="py-2 text-white/50">Sin novedades.</li>}
        {events.slice(pager.start, pager.end).map((e, i) => (
          <li
            key={`${e.time}-${pager.start + i}`}
            className={cx("flex items-center gap-3 border-b border-white/5", e.drivers.some((d) => playerIds.includes(d)) && "text-[#fde68a]")}
            style={{ height: EVENT_ROW }}
          >
            <span className="w-10 shrink-0 text-right text-xs tabular text-white/40">V{Math.max(1, e.lap)}</span>
            <span className="grid w-5 shrink-0 place-items-center">
              <EventIcon type={e.type} />
            </span>
            <span className="truncate" title={e.text}>
              {e.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
