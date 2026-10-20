import type { Color, Score } from "../types";

/** Centipawns from White's point of view; mates mapped to large magnitudes. */
export function scoreCp(s: Score): number {
  if (s.mate !== undefined) {
    if (s.mate === 0) return 0;
    return s.mate > 0 ? 10000 - s.mate * 10 : -10000 - s.mate * 10;
  }
  return s.cp ?? 0;
}

/**
 * Expected score (0..100) for White, using the logistic model published by
 * Lichess (derived from rated games): 50 + 50 * (2 / (1 + e^(-0.00368208·cp)) - 1).
 */
export function winPctWhite(s: Score): number {
  if (s.mate !== undefined) {
    if (s.mate === 0) return 50;
    return s.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function winPctFor(s: Score, color: Color): number {
  const w = winPctWhite(s);
  return color === "w" ? w : 100 - w;
}

export function formatScore(s: Score | null | undefined): string {
  if (!s) return "0.0";
  if (s.mate !== undefined) {
    if (s.mate === 0) return "#";
    return s.mate > 0 ? `M${s.mate}` : `-M${-s.mate}`;
  }
  if (Math.abs(s.cp ?? 0) >= 99999) return (s.cp ?? 0) > 0 ? "1-0" : "0-1";
  const v = (s.cp ?? 0) / 100;
  if (Math.abs(v) < 0.05) return "0.0";
  return (v > 0 ? "+" : "") + v.toFixed(Math.abs(v) >= 10 ? 0 : 1);
}

/** Bar fill (0..100) for White in the evaluation bar. */
export function evalBarPct(s: Score | null | undefined): number {
  if (!s) return 50;
  if (s.mate !== undefined) return s.mate === 0 ? 50 : s.mate > 0 ? 100 : 0;
  // same logistic curve, clamped so the bar never fully empties
  return Math.max(4, Math.min(96, winPctWhite(s)));
}

export function describeScore(s: Score | null | undefined): string {
  if (!s) return "Posição equilibrada";
  if (s.mate !== undefined) {
    if (s.mate === 0) return "Xeque-mate";
    return s.mate > 0 ? `Brancas dão mate em ${s.mate}` : `Pretas dão mate em ${-s.mate}`;
  }
  const v = (s.cp ?? 0) / 100;
  const a = Math.abs(v);
  const side = v > 0 ? "Brancas" : "Pretas";
  if (a < 0.3) return "Posição equilibrada";
  if (a < 1) return `Leve vantagem das ${side}`;
  if (a < 2.5) return `Vantagem clara das ${side}`;
  return `Vantagem decisiva das ${side}`;
}
