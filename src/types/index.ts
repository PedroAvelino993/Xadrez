export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Square = string; // "a1".."h8"

export interface Piece {
  type: PieceType;
  color: Color;
}

/** Engine score from White's point of view. */
export interface Score {
  cp?: number;
  mate?: number; // positive: White mates in N, negative: Black mates in N
}

export interface EngineLine {
  multipv: number;
  depth: number;
  score: Score; // White's point of view
  pv: string[]; // UCI moves
}

export interface EngineResult {
  depth: number;
  lines: EngineLine[];
  bestmove: string | null;
}

export type Classification =
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "forced";

export interface MoveRecord {
  san: string;
  uci: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  fenBefore: string;
  fenAfter: string;
  /** clock of the mover after the move, ms (when the game is timed) */
  clockMs?: number;
}

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type EndReason =
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "fifty"
  | "insufficient"
  | "timeout"
  | "timeout-insufficient"
  | "resign"
  | "agreement"
  | "abandoned";

export interface TimeControl {
  id: string;
  label: string;
  baseMs: number; // 0 = untimed
  incMs: number;
}

export interface SavedGame {
  id: string;
  date: number;
  botId: string;
  playerColor: Color;
  result: GameResult;
  reason: EndReason;
  timeControl: string;
  startFen: string;
  moves: string[]; // SAN
  pgn: string;
  /** player's outcome */
  outcome: "win" | "loss" | "draw";
}
