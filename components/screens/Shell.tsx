import { ArrowLeftRight, Briefcase, Calendar, CarFront, ChevronRight, Flag, House, Menu, Settings2, Trophy, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SERIES_NAMES } from "@/lib/game/data/teams";
import { formatDateLong } from "@/lib/game/format";
import { formatMoney } from "@/lib/game/perf";
import { isSeasonOver } from "@/lib/game/season";
import type { GameState } from "@/lib/game/types";
import { gameStore } from "@/lib/store";
import { cx, SeriesBadge, textOn } from "../ui";

export type View = "hq" | "weekend" | "calendar" | "standings" | "team" | "dev" | "market" | "office" | "grids";

const NAV: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: "hq", label: "Sede", Icon: House },
  { id: "weekend", label: "Fin de semana", Icon: Flag },
  { id: "calendar", label: "Calendario", Icon: Calendar },
  { id: "standings", label: "Clasificaciones", Icon: Trophy },
  { id: "team", label: "Mi equipo", Icon: CarFront },
  { id: "dev", label: "Desarrollo", Icon: Wrench },
  { id: "market", label: "Mercado", Icon: ArrowLeftRight },
  { id: "office", label: "Despacho", Icon: Briefcase },
  { id: "grids", label: "Parrillas", Icon: Users },
];

export function Shell({ state, view, onView, onMenu, children }: { state: GameState; view: View; onView: (v: View) => void; onMenu: () => void; children: ReactNode }) {
  const [settings, setSettings] = useState(false);
  const team = state.teams[state.player.teamId];
  const nav = NAV.filter((n) => n.id !== "weekend" || state.weekend);
  const next = isSeasonOver(state) ? null : state.calendar[state.nextWeekend];
  const setSetting = (patch: Partial<GameState["settings"]>) => gameStore.update((d) => void Object.assign(d.settings, patch));
  const current = NAV.find((n) => n.id === view) ?? NAV[0];

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="relative z-30 shrink-0 border-b border-white/5 bg-bg/85 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5 lg:px-6">
          <div className="relative">
            <TopBtn onClick={() => setSettings((s) => !s)} label="Menú">
              <Menu className="h-5 w-5" />
            </TopBtn>
            {settings && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSettings(false)} />
                <div className="absolute left-0 top-12 z-20 w-72 space-y-3 rounded-xl border border-line-2 bg-panel p-4 text-sm shadow-2xl">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-muted">
                    <Settings2 className="h-4 w-4" /> Ajustes
                  </div>
                  <label className="flex cursor-pointer items-center justify-between gap-2">
                    Pausa automática en carrera
                    <input type="checkbox" checked={state.settings.autoPause} onChange={(e) => setSetting({ autoPause: e.target.checked })} />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    Velocidad inicial
                    <select
                      value={state.settings.defaultSpeed}
                      onChange={(e) => setSetting({ defaultSpeed: Number(e.target.value) })}
                      className="rounded border border-line-2 bg-panel-2 px-1 py-0.5 text-fg"
                    >
                      {[1, 2, 5, 10, 25, 50].map((s) => (
                        <option key={s} value={s}>
                          ×{s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={onMenu} className="w-full rounded-lg border border-line-2 py-2 font-bold uppercase tracking-wider text-muted hover:text-fg">
                    Menú principal
                  </button>
                </div>
              </>
            )}
          </div>
          <span
            className="ml-1 grid h-10 min-w-10 place-items-center rounded-lg px-2 text-sm font-black italic tracking-tight shadow"
            style={{ background: team.color, color: textOn(team.color) }}
            title={team.name}
          >
            {team.short.slice(0, 3).toUpperCase()}
          </span>
          <div className="min-w-0 pl-1">
            <h1 className="truncate text-xl font-black uppercase tracking-wide lg:text-2xl">{current.label}</h1>
            <div className="hidden truncate text-[11px] text-muted sm:block">
              {state.manager} · {team.name} · {SERIES_NAMES[state.player.series]} {state.year}
            </div>
          </div>
          <div className="ml-auto flex items-stretch gap-2">
            <TopBox className="hidden md:flex" onClick={() => onView("standings")} title="Clasificaciones">
              <Trophy className="h-5 w-5 text-[#fcd34d]" />
            </TopBox>
            <TopBox className="hidden sm:flex">
              <SeriesBadge s={state.player.series} className="px-2 py-1 text-sm" />
            </TopBox>
            <TopBox>
              <Wallet className="h-5 w-5 text-muted" />
              <span className="text-base font-black tabular text-[#4ade80] lg:text-lg">{formatMoney(team.budget)}</span>
            </TopBox>
            {next && (
              <TopBox className="hidden lg:flex" onClick={() => onView("calendar")} title="Calendario">
                <Flag className="h-4 w-4 text-accent" />
                <span className="font-black uppercase">{next.f1?.name ?? next.f2?.name ?? next.f3?.name}</span>
                <span className="text-sm text-muted">{formatDateLong(next.date)}</span>
              </TopBox>
            )}
          </div>
        </div>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 lg:px-6 lg:py-4">{children}</main>

      <nav className="z-30 flex shrink-0 items-end justify-center gap-3 px-2 pb-2">
        <div className="flex max-w-full items-stretch overflow-hidden rounded-t-xl rounded-b-lg border border-white/10 bg-[#1b1e25]/95 shadow-[0_-8px_30px_rgba(0,0,0,.5)] backdrop-blur">
          {nav.map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => onView(n.id)}
              title={n.label}
              className={cx(
                "relative flex min-w-16 flex-col items-center justify-center gap-0.5 border-r border-white/5 px-3 py-2 transition-colors last:border-r-0 sm:min-w-20",
                view === n.id ? "bg-[#3a3f4b] text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <n.Icon className="h-5 w-5" strokeWidth={2.2} />
              <span className="text-[10px] font-bold uppercase tracking-wide">{n.label}</span>
              {view === n.id && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-white" />}
              {n.id === "weekend" && <span className="pulse absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[#22c55e]" />}
            </button>
          ))}
        </div>
        {state.weekend && view !== "weekend" && (
          <button
            type="button"
            onClick={() => onView("weekend")}
            className="hidden h-14 items-center gap-2 rounded-lg bg-gradient-to-r from-[#16a34a] to-[#22c55e] px-6 text-lg font-black uppercase tracking-wider text-white shadow-lg hover:brightness-110 md:flex"
          >
            Continuar <ChevronRight className="h-6 w-6" strokeWidth={3} />
          </button>
        )}
      </nav>
    </div>
  );
}

function TopBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-panel-2 hover:bg-panel-3">
      {children}
    </button>
  );
}

function TopBox({ children, className, onClick, title }: { children: ReactNode; className?: string; onClick?: () => void; title?: string }) {
  const cls = cx("flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-panel-2 px-3", onClick && "hover:bg-panel-3", className);
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={cls}>
      {children}
    </button>
  ) : (
    <div title={title} className={cls}>
      {children}
    </div>
  );
}
