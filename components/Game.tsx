"use client";

import { useEffect, useState } from "react";
import { SERIES_NAMES, SERIES_SHORT } from "@/lib/game/data/teams";
import { formatDateLong } from "@/lib/game/format";
import { newQuickWeekend } from "@/lib/game/quick";
import { isSeasonOver } from "@/lib/game/season";
import type { GameState, QuickConfig } from "@/lib/game/types";
import { liveRace } from "@/lib/liveRace";
import { gameStore, useGame, useHydrated } from "@/lib/store";
import { CalendarView } from "./screens/CalendarView";
import { DevelopmentView } from "./screens/DevelopmentView";
import { GridsView } from "./screens/GridsView";
import { Hq } from "./screens/Hq";
import { MainMenu } from "./screens/MainMenu";
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

  useEffect(() => {
    gameStore.load();
  }, []);

  if (!hydrated) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Cargando…</div>;
  }

  const startQuick = (cfg: QuickConfig) => {
    liveRace.dispose();
    gameStore.switchSlot("quick");
    gameStore.set(newQuickWeekend(cfg, Math.floor(Math.random() * 2 ** 31)));
    setMode("quick");
  };
  const exitQuick = () => {
    liveRace.dispose();
    gameStore.set(null);
    gameStore.switchSlot("career");
    setMode("menu");
  };

  if (mode === "new") {
    return (
      <NewGame
        onCancel={() => setMode("menu")}
        onCreate={(s) => {
          liveRace.dispose();
          gameStore.set(s);
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
    const career = state && !state.quick ? state : null;
    const label = career
      ? `${career.teams[career.player.teamId].name} · ${SERIES_SHORT[career.player.series]} ${career.year} · ${
          isSeasonOver(career) ? "temporada terminada" : `próximo: ${formatDateLong(career.calendar[career.nextWeekend].date)}`
        }`
      : undefined;
    return (
      <MainMenu
        hasSave={!!career}
        saveLabel={label}
        hasQuick={gameStore.hasQuick()}
        onContinue={() => {
          setView(career?.weekend ? "weekend" : "hq");
          setMode("play");
        }}
        onNew={() => setMode("new")}
        onQuick={() => setMode("quickSetup")}
        onResumeQuick={() => {
          gameStore.switchSlot("quick");
          setMode("quick");
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
      <WeekendResultsModal state={state} weekendIndex={summary} onClose={() => setSummary(null)} />
    </Shell>
  );
}

function QuickWeekend({ state, onExit, onRepeat }: { state: GameState; onExit: () => void; onRepeat: () => void }) {
  const ws = state.weekend;
  const team = state.teams[state.player.teamId];
  if (!ws) return null;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur lg:px-6">
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
      <main className="p-4 lg:p-6">
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
