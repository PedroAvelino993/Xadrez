// Move classification and accuracy.
//
// Method (documented on purpose, so nothing is presented as "official"):
//  1. Every position is evaluated by Stockfish. Evaluations are converted to the
//     mover's expected score ("win %") with the logistic model published by
//     Lichess: wp = 50 + 50·(2/(1+e^(−0.00368208·cp)) − 1).
//  2. The cost of a move is the drop in the mover's win % between the best
//     evaluation of the position before the move and the evaluation after it.
//     Because it is measured in win %, the same pawn matters a lot in a level
//     position and very little in a position that is already won or lost —
//     the context of the game is built into the measure.
//  3. A move equal to the engine's choice, or that keeps the same evaluation,
//     is "Melhor lance"; a move is never called an error merely for differing
//     from the first suggestion — only the evaluation loss counts.
//  4. Accuracy per move uses the Lichess formula
//     103.1668·e^(−0.04354·loss) − 3.1669 (clamped 0..100); the game accuracy
//     averages a volatility-weighted mean and a harmonic mean, as Lichess does.
//     It is an estimate produced by this app, not an official rating.
import type { Classification, Color, Score } from "../types";
import { winPctFor, scoreCp } from "../engine/score";

export interface MoveEvalInput {
  mover: Color;
  before: Score; // best evaluation before the move (White POV)
  after: Score; // evaluation after the move (White POV)
  played: string; // uci
  best: string | null; // engine best move (uci)
  legalCount: number;
  isBook: boolean;
}

export const THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };

export function winLoss(i: Pick<MoveEvalInput, "mover" | "before" | "after">): number {
  return Math.max(0, winPctFor(i.before, i.mover) - winPctFor(i.after, i.mover));
}

export function classify(i: MoveEvalInput): Classification {
  if (i.isBook) return "book";
  if (i.legalCount === 1) return "forced";
  const loss = winLoss(i);
  const sameEval = Math.abs(scoreCp(i.before) - scoreCp(i.after)) <= 8 && sameMateSign(i.before, i.after);
  if (i.played === i.best || (loss < 0.5 && sameEval)) return "best";
  if (loss < THRESHOLDS.excellent) return "excellent";
  if (loss < THRESHOLDS.good) return "good";
  if (loss < THRESHOLDS.inaccuracy) return "inaccuracy";
  if (loss < THRESHOLDS.mistake) return "mistake";
  return "blunder";
}

function sameMateSign(a: Score, b: Score): boolean {
  const ma = a.mate !== undefined, mb = b.mate !== undefined;
  if (ma !== mb) return false;
  if (!ma) return true;
  return Math.sign(a.mate!) === Math.sign(b.mate!);
}

export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

/**
 * Game accuracy for one side. `winPctWhiteSeq` is White's win % for every
 * position (start … end); `color` selects whose moves are measured.
 */
export function gameAccuracy(winPctWhiteSeq: number[], startColor: Color, color: Color): number | null {
  const n = winPctWhiteSeq.length - 1;
  if (n < 1) return null;
  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const accs: number[] = [];
  const weights: number[] = [];
  for (let k = 0; k < n; k++) {
    const mover: Color = (k % 2 === 0) === (startColor === "w") ? "w" : "b";
    if (mover !== color) continue;
    const before = mover === "w" ? winPctWhiteSeq[k] : 100 - winPctWhiteSeq[k];
    const after = mover === "w" ? winPctWhiteSeq[k + 1] : 100 - winPctWhiteSeq[k + 1];
    accs.push(moveAccuracy(Math.max(0, before - after)));
    const lo = Math.max(0, k - windowSize + 1);
    const win = winPctWhiteSeq.slice(lo, Math.max(lo + 2, k + 2));
    weights.push(Math.max(0.5, Math.min(12, stdev(win))));
  }
  if (!accs.length) return null;
  const weighted = accs.reduce((s, a, i) => s + a * weights[i], 0) / weights.reduce((s, w) => s + w, 0);
  const harmonic = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return (weighted + harmonic) / 2;
}

function stdev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

export const CLASS_ORDER: Classification[] = ["best", "excellent", "good", "book", "forced", "inaccuracy", "mistake", "blunder"];
