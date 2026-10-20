import { botById } from "./bots";

/** Performance estimate against the bots (their ratings are estimates too). */
export function performanceVsBots(games: { botId: string; outcome: string }[]): number | null {
  if (games.length < 5) return null;
  const avg = games.reduce((s, g) => s + botById(g.botId).rating, 0) / games.length;
  const score = games.reduce((s, g) => s + (g.outcome === "win" ? 1 : g.outcome === "draw" ? 0.5 : 0), 0) / games.length;
  const p = Math.min(0.97, Math.max(0.03, score));
  return Math.round(avg + 400 * Math.log10(p / (1 - p)));
}
