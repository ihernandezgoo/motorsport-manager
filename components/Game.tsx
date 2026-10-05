"use client";

import { useEffect, useState } from "react";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { newQuickWeekend } from "@/lib/game/quick";
import type { GameState, QuickConfig } from "@/lib/game/types";
import { liveRace } from "@/lib/liveRace";
import { gameStore, useGame, useHydrated, type CareerSlot, type Slot } from "@/lib/store";
import { CalendarView } from "./screens/CalendarView";
import { DevelopmentView } from "./screens/DevelopmentView";
import { GridsView } from "./screens/GridsView";
import { Hq } from "./screens/Hq";
import { CareerModal } from "./screens/CareerModal";
import { MainMenu } from "./screens/MainMenu";
import { MarketView } from "./screens/MarketView";
import { OfficeView } from "./screens/OfficeView";
import { NewGame } from "./screens/NewGame";
import { QuickSetup } from "./screens/QuickSetup";
import { WeekendResultsModal } from "./screens/Results";
import { Shell, type View } from "./screens/Shell";
import { StandingsView } from "./screens/StandingsView";
import { TeamView } from "./screens/TeamView";
import { Btn, SeriesBadge } from "./ui";
import { WeekendView } from "./weekend/WeekendView";

type Mode = "menu" | "new" | "play" | "quickSetup" | "quick";

export default function Game() {
  const state = useGame();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<Mode>("menu");
  const [view, setView] = useState<View>("hq");
  const [summary, setSummary] = useState<number | null>(null);
  const [newSlot, setNewSlot] = useState<CareerSlot>(1);

  useEffect(() => {
    gameStore.load();
  }, []);

  if (!hydrated) {
    return <div className="grid h-dvh place-items-center text-sm text-muted">Cargando…</div>;
  }

  /** Abre una ranura. La carrera en directo pertenece a la partida abierta: si cambia, se descarta. */
  const openSlot = (slot: Slot) => {
    if (gameStore.slot() === slot && gameStore.get()) return true;
    liveRace.dispose();
    return gameStore.open(slot);
  };

  const startQuick = (cfg: QuickConfig) => {
    liveRace.dispose();
    gameStore.create("quick", newQuickWeekend(cfg, Math.floor(Math.random() * 2 ** 31)));
    setMode("quick");
  };
  const exitQuick = () => {
    liveRace.dispose();
    gameStore.remove("quick");
    setMode("menu");
  };

  if (mode === "new") {
    return (
      <NewGame
        slot={newSlot}
        onCancel={() => setMode("menu")}
        onCreate={(s) => {
          liveRace.dispose();
          gameStore.create(newSlot, s);
          setView("hq");
          setSummary(null);
          setMode("play");
        }}
      />
    );
  }

  if (mode === "quickSetup") return <QuickSetup onCancel={() => setMode("menu")} onStart={startQuick} />;

  if (mode === "quick" && state?.quick && state.weekend) {
    return <QuickWeekend state={state} onExit={exitQuick} onRepeat={() => state.quick && startQuick(state.quick)} />;
  }

  if (mode !== "play" || !state || state.quick) {
    return (
      <MainMenu
        hasQuick={gameStore.hasQuick()}
        onPlay={(slot) => {
          if (!openSlot(slot)) return window.alert("No se ha podido abrir la partida.");
          setView(gameStore.get()?.weekend ? "weekend" : "hq");
          setSummary(null);
          setMode("play");
        }}
        onNew={(slot) => {
          setNewSlot(slot);
          setMode("new");
        }}
        onQuick={() => setMode("quickSetup")}
        onResumeQuick={() => {
          if (openSlot("quick")) setMode("quick");
        }}
      />
    );
  }

  const current = view === "weekend" && !state.weekend ? "hq" : view;

  return (
    <Shell
      state={state}
      view={current}
      onView={(v) => {
        if (v !== "weekend") liveRace.pause();
        setView(v);
      }}
      onMenu={() => {
        liveRace.pause();
        setMode("menu");
      }}
    >
      {current === "hq" && <Hq state={state} onEnterWeekend={() => setView("weekend")} onShowResults={setSummary} />}
      {current === "weekend" && state.weekend && (
        <WeekendView
          state={state}
          ws={state.weekend}
          onFinished={(idx) => {
            setView("hq");
            setSummary(idx);
          }}
          onLeave={() => setView("hq")}
        />
      )}
      {current === "calendar" && <CalendarView state={state} onShowResults={setSummary} />}
      {current === "standings" && <StandingsView state={state} />}
      {current === "team" && <TeamView state={state} />}
      {current === "dev" && <DevelopmentView state={state} />}
      {current === "grids" && <GridsView state={state} />}
      {current === "market" && <MarketView state={state} />}
      {current === "office" && <OfficeView state={state} />}
      {(state.sacked || state.offers.length > 0) && <CareerModal state={state} onMenu={() => setMode("menu")} />}
      <WeekendResultsModal state={state} weekendIndex={summary} onClose={() => setSummary(null)} />
    </Shell>
  );
}

function QuickWeekend({ state, onExit, onRepeat }: { state: GameState; onExit: () => void; onRepeat: () => void }) {
  const ws = state.weekend;
  const team = state.teams[state.player.teamId];
  if (!ws) return null;
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="z-30 flex shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="text-lg font-black italic tracking-tight">
          APEX<span className="text-accent">/</span>RACE
        </div>
        <span className="rounded bg-[#f59e0b] px-2 py-0.5 text-[11px] font-black uppercase text-black">Fin de semana rápido</span>
        <span className="h-6 w-1 rounded-full" style={{ background: team.color }} />
        <SeriesBadge s={state.player.series} />
        <span className="truncate text-sm font-semibold">
          {team.name} <span className="text-muted">· {SERIES_NAMES[state.player.series]}</span>
        </span>
        <Btn
          className="ml-auto"
          size="sm"
          onClick={() => {
            if (window.confirm("¿Salir del fin de semana rápido? Se perderá el progreso.")) onExit();
          }}
        >
          Salir al menú
        </Btn>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 lg:px-6 lg:py-4">
        <WeekendView
          state={state}
          ws={ws}
          onFinished={() => undefined}
          onLeave={() => {
            if (window.confirm("¿Salir del fin de semana rápido? Se perderá el progreso.")) onExit();
          }}
          leaveLabel="Salir al menú"
          quick={{ onExit, onRepeat }}
        />
      </main>
    </div>
  );
}
