// Lesson content format. Content lives in src/lessons/data/*.json and is
// checked by scripts/verify-lessons.mjs (legal positions, achievable goals,
// and engine-verified answers for "moves"/"sequence" exercises).
import type { PieceType } from "../types";

export type Mark = { sq: string; type: "good" | "bad" | "hint" | "target" };
export type LessonArrow = { from: string; to: string; color?: "green" | "red" | "blue" | "yellow" };

export type Goal =
  /** move a piece of this type to the square (opponent does not reply; up to inMoves moves) */
  | { type: "reach"; piece: PieceType; square: string; inMoves?: number }
  /** capture whatever stands on the square */
  | { type: "capture"; square: string }
  /** any move that gives check */
  | { type: "check" }
  /** any move that gives checkmate */
  | { type: "mate" }
  /** any move that stalemates the opponent */
  | { type: "stalemate" }
  | { type: "castle"; side?: "k" | "q" }
  | { type: "enpassant" }
  | { type: "promote"; piece?: PieceType }
  /** move the piece on `square` to a square where it is no longer attacked (or defended enough) */
  | { type: "safe"; square: string }
  /** one of the listed UCI moves (engine-verified) */
  | { type: "moves"; accept: string[] }
  /** a forced line: solver moves at even indexes, opponent replies at odd indexes (UCI) */
  | { type: "sequence"; moves: string[] };

export type Step =
  | { kind: "text"; title?: string; body: string[] }
  | { kind: "board"; title?: string; fen: string; caption: string; arrows?: LessonArrow[]; marks?: Mark[]; moves?: string[]; orientation?: "w" | "b" }
  | { kind: "exercise"; id: string; prompt: string; fen: string; goal: Goal; hint: string; success: string; orientation?: "w" | "b"; arrows?: LessonArrow[]; marks?: Mark[] }
  | { kind: "summary"; points: string[] };

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  intro: string;
  steps: Step[];
}

export interface Module {
  id: string;
  title: string;
  description: string;
  level: string;
  lessons: Lesson[];
}
