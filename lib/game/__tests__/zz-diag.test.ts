import { it } from "vitest";
import { driverOverall } from "../perf";
import { completeWeekend, isSeasonOver, newGame, startNextSeason } from "../season";
import { teamStandings } from "../standings";

it("diagnóstico", () => {
  for (const [series, team] of [["f1", "williams"], ["f1", "mercedes"], ["f2", "f2_var"], ["f3", "f3_mp"]] as const) {
    const s = newGame(series, team, "T", 31337);
    const lines: string[] = [];
    for (let y = 0; y < 6; y++) {
      const b0 = s.teams[s.player.teamId].budget;
      while (!isSeasonOver(s)) completeWeekend(s, s.nextWeekend, null);
      const pos = teamStandings(s, s.player.series).findIndex((t) => t.teamId === s.player.teamId) + 1;
      const f1 = Object.values(s.drivers).filter((d) => d.series === "f1" && d.teamId).map(driverOverall);
      const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
      const income = s.finance.filter((f) => f.amount > 0).reduce((a, f) => a + f.amount, 0);
      const spend = s.finance.filter((f) => f.amount < 0).reduce((a, f) => a + f.amount, 0);
      lines.push(
        `${s.year} ${s.player.teamId} P${pos} obj P${s.board.target} conf ${Math.round(s.board.confidence)} sacked=${s.sacked} offers=${s.offers.map((o) => o.teamId).join("/")} budget ${b0.toFixed(1)}→${s.teams[s.player.teamId].budget.toFixed(1)} F1avg ${avg(f1)} drivers ${Object.keys(s.drivers).length} free ${Object.values(s.drivers).filter((d) => !d.teamId).length}`,
      );
      if (s.sacked) break;
      startNextSeason(s);
      s.finance = [];
    }
    console.log(lines.join("\n"));
  }
}, 300_000);
