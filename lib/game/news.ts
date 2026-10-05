import type { GameState, NewsItem } from "./types";

const MAX_NEWS = 80;

export function addNews(state: GameState, item: Omit<NewsItem, "id">) {
  state.uid = (state.uid ?? 0) + 1;
  state.news.unshift({ ...item, id: `n${state.year}-${state.uid}` });
  if (state.news.length > MAX_NEWS) state.news.length = MAX_NEWS;
}

export function fullName(state: GameState, driverId: string) {
  const d = state.drivers[driverId];
  return d ? `${d.first} ${d.last}` : driverId;
}

/** Fecha del próximo evento (o del último, si la temporada ha terminado), para fechar noticias. */
export function currentDate(state: GameState): string {
  const wk = state.calendar[Math.min(state.nextWeekend, state.calendar.length - 1)];
  return wk?.date ?? `${state.year}-01-01`;
}
