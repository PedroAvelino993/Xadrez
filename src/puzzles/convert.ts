// "Convert the advantage" phase that follows the verified part of a puzzle.
// After the unique-solution line ends, play continues against Stockfish until
// the point of the puzzle is actually reached (promotion, mate, a decisive
// evaluation, or holding the draw). Here several moves are usually good, so a
// move is accepted when the engine confirms it keeps the advantage.
import { Chess } from "chess.js";
import type { Color, Score } from "../types";
import type { Puzzle } from "./logic";
import { getAnalysisEngine } from "../engine/stockfish";
import { scoreCp, winPctFor } from "../engine/score";

export type ConvertGoal = "promote" | "decisive" | "hold" | "mate";

export interface EngineView {
  best: string | null;
  score: Score; // White POV
}

export const CONVERT_DEPTH = 14;
export const DECISIVE_CP = 500;

export async function evaluate(fen: string, depth = CONVERT_DEPTH): Promise<EngineView> {
  const r = await getAnalysisEngine().search(fen, { depth }).promise;
  return { best: r.bestmove, score: r.lines[0]?.score ?? { cp: 0 } };
}

/** Centipawns from the solver's point of view. */
export function solverCp(score: Score, solver: Color): number {
  return (solver === "w" ? 1 : -1) * scoreCp(score);
}

function hasPawns(c: Chess, color: Color): boolean {
  return c.board().some((row) => row.some((p) => p && p.color === color && p.type === "p"));
}

/** Which conversion (if any) should follow, given the position after the verified line. */
export function decideGoal(p: Puzzle, fenAfterLine: string, solver: Color, evalAfterLine: Score): ConvertGoal | null {
  const c = new Chess(fenAfterLine);
  if (c.isGameOver()) return null;
  if (p.themes.includes("defense")) return null;
  if (p.goal === "draw") return "hold";
  const endgame = p.goal === "win" || p.themes.includes("pawnEndgame") || p.themes.includes("rookEndgame");
  if (endgame && hasPawns(c, solver)) return "promote";
  const cp = solverCp(evalAfterLine, solver);
  if (evalAfterLine.mate !== undefined && cp > 0) return endgame ? "decisive" : null;
  if (cp >= DECISIVE_CP && !endgame) return null;
  return "decisive";
}

export function maxMovesFor(goal: ConvertGoal): number {
  return goal === "promote" ? 24 : goal === "hold" ? 4 : 8;
}

export function goalText(goal: ConvertGoal): string {
  if (goal === "promote") return "Agora termine o trabalho: avance e promova um peão (ou dê mate). O Stockfish joga pelo adversário.";
  if (goal === "hold") return "Agora segure o empate por mais alguns lances contra o Stockfish.";
  if (goal === "mate") return "Agora termine: continue até dar xeque-mate. O Stockfish defende pelo adversário.";
  return "Agora converta a vantagem: continue até a vantagem ficar decisiva. O Stockfish joga pelo adversário.";
}

/**
 * Is the solver's move acceptable? `before` is the engine view of the position
 * before the move (solver to move); `after` is the evaluation after it.
 */
export function acceptMove(goal: ConvertGoal, solver: Color, before: Score, after: Score): boolean {
  if (goal === "hold") return solverCp(after, solver) >= -100;
  const wb = winPctFor(before, solver);
  const wa = winPctFor(after, solver);
  const hadMate = before.mate !== undefined && solverCp(before, solver) > 0;
  const keepsMate = after.mate !== undefined && solverCp(after, solver) > 0;
  if (goal === "mate") return keepsMate;
  if (hadMate) return keepsMate || solverCp(after, solver) >= 900;
  return wa >= 70 && wb - wa <= 10;
}

/** Has the conversion reached its goal after the solver's move? */
export function goalReached(goal: ConvertGoal, solver: Color, fenAfter: string, promoted: boolean, after: Score): boolean {
  const c = new Chess(fenAfter);
  if (c.isCheckmate()) return true;
  if (goal === "hold") return c.isStalemate() || c.isInsufficientMaterial() || c.isThreefoldRepetition();
  if (goal === "promote") return promoted && solverCp(after, solver) >= 300;
  if (goal === "mate") return false;
  return (after.mate !== undefined && solverCp(after, solver) > 0) || solverCp(after, solver) >= DECISIVE_CP;
}

/** Same idea for library positions, using their written objective ("…vencem", "…empatam"). */
export function decideGoalForObjective(objective: string, endgame: boolean, fenAfter: string, solver: Color, evalAfter: Score): ConvertGoal | null {
  const c = new Chess(fenAfter);
  if (c.isGameOver()) return null;
  const o = objective.toLowerCase();
  if (o.includes("empat")) return "hold";
  if (!/venc|ganh|mate|promov|coroa/.test(o)) return null;
  const cp = solverCp(evalAfter, solver);
  if (/mate/.test(o) && evalAfter.mate !== undefined && cp > 0) return "mate";
  if (cp < 150) return null; // not a winning objective after all
  if (hasPawns(c, solver) && (endgame || /promov|coroa|peão/.test(o))) return "promote";
  if (cp >= DECISIVE_CP && !endgame) return null;
  return "decisive";
}
