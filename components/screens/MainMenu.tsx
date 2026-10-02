import { CircleAlert, Play, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { formatDateLong } from "@/lib/game/format";
import { liveRace } from "@/lib/liveRace";
import { gameStore, type CareerSlot, type SlotInfo } from "@/lib/store";
import { TrackMap } from "../TrackMap";
import { Btn, cx, SeriesBadge } from "../ui";

function savedAgo(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MainMenu({
  hasQuick,
  onPlay,
  onNew,
  onQuick,
  onResumeQuick,
}: {
  hasQuick: boolean;
  onPlay: (slot: CareerSlot) => void;
  onNew: (slot: CareerSlot) => void;
  onQuick: () => void;
  onResumeQuick: () => void;
}) {
  const [slots, setSlots] = useState<SlotInfo[]>(() => gameStore.listSlots());
  const last = gameStore.lastSlot();

  const remove = (info: SlotInfo) => {
    const what = info.status === "ok" ? `la partida de ${info.summary.teamName} (${info.summary.year})` : "esta ranura";
    if (!window.confirm(`¿Borrar ${what}? No se puede deshacer.`)) return;
    if (gameStore.slot() === info.slot) liveRace.dispose();
    gameStore.remove(info.slot);
    setSlots(gameStore.listSlots());
  };

  return (
    <div className="relative flex h-dvh items-center justify-center overflow-hidden px-4">
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

        <div className="mt-8 space-y-2 text-left">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-dim">Partidas</div>
          {slots.map((info) => (
            <SlotCard key={info.slot} info={info} last={info.slot === last} onPlay={onPlay} onNew={onNew} onRemove={remove} />
          ))}
        </div>

        <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2">
          <Btn variant="subtle" size="lg" onClick={onQuick}>
            <Zap className="h-4 w-4" /> Fin de semana rápido
          </Btn>
          {hasQuick && (
            <button type="button" onClick={onResumeQuick} className="text-xs text-muted underline hover:text-fg">
              Reanudar el fin de semana rápido a medias
            </button>
          )}
        </div>
        <p className="mt-6 text-[11px] text-dim">Proyecto no oficial creado con fines de entretenimiento. Marcas y nombres pertenecen a sus propietarios.</p>
      </div>
    </div>
  );
}

function SlotCard({
  info,
  last,
  onPlay,
  onNew,
  onRemove,
}: {
  info: SlotInfo;
  last: boolean;
  onPlay: (slot: CareerSlot) => void;
  onNew: (slot: CareerSlot) => void;
  onRemove: (info: SlotInfo) => void;
}) {
  const label = <span className="w-6 shrink-0 text-center text-lg font-black tabular text-dim">{info.slot}</span>;

  if (info.status === "empty") {
    return (
      <button
        type="button"
        onClick={() => onNew(info.slot)}
        className="flex h-[68px] w-full items-center gap-3 rounded-xl border border-dashed border-line-2 bg-panel/60 px-3 text-left text-muted transition hover:border-accent hover:text-fg"
      >
        {label}
        <Plus className="h-5 w-5" />
        <span className="font-semibold">Nueva partida</span>
        <span className="ml-auto text-xs">Ranura vacía</span>
      </button>
    );
  }

  if (info.status !== "ok") {
    return (
      <div className="flex h-[68px] items-center gap-3 rounded-xl border border-bad/40 bg-bad/10 px-3">
        {label}
        <CircleAlert className="h-5 w-5 shrink-0 text-bad" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">{info.status === "newer" ? "Partida de una versión más nueva" : "Partida dañada"}</div>
          <div className="truncate text-xs text-muted">
            {info.status === "newer" ? "Actualiza el juego para abrirla. No se ha modificado." : "No se puede leer. Puedes borrarla para liberar la ranura."}
          </div>
        </div>
        <button type="button" onClick={() => onRemove(info)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-bad/20 hover:text-bad" title="Borrar">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const s = info.summary;
  const saved = savedAgo(s.savedAt);
  return (
    <div className={cx("flex h-[68px] items-center gap-3 rounded-xl border bg-panel px-3", last ? "border-accent/60" : "border-line")}>
      {label}
      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.teamColor }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SeriesBadge s={s.series} />
          <span className="truncate font-bold">{s.teamName}</span>
          {last && <span className="shrink-0 rounded bg-accent/20 px-1.5 text-[10px] font-bold uppercase text-accent">Última</span>}
        </div>
        <div className="truncate text-xs text-muted">
          {s.manager} · {s.year} · {s.next ? `${s.next.name}, ${formatDateLong(s.next.date)}` : "Temporada terminada"}
          {saved && <span className="text-dim"> · guardada {saved}</span>}
        </div>
      </div>
      <button type="button" onClick={() => onRemove(info)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-bad/20 hover:text-bad" title="Borrar partida">
        <Trash2 className="h-4 w-4" />
      </button>
      <Btn variant="primary" onClick={() => onPlay(info.slot)}>
        <Play className="h-4 w-4" fill="currentColor" /> Jugar
      </Btn>
    </div>
  );
}
