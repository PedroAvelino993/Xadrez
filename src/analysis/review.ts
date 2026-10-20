import { Chess } from "chess.js";
import type { Classification, Color, MoveRecord, Score } from "../types";
import { getAnalysisEngine, EngineCancelled } from "../engine/stockfish";
import { winPctWhite } from "../engine/score";
import { classify, gameAccuracy, moveAccuracy, winLoss } from "./classify";
import { explainMove } from "./explain";
import { loadBook } from "../openings/book";

export interface PositionEval {
  score: Score; // White POV
  best: string | null;
  pv: string[];
  second?: { score: Score; pv: string[] };
  depth: number;
  terminal?: "1-0" | "0-1" | "1/2-1/2";
}

export interface MoveReview {
  index: number;
  record: MoveRecord;
  before: Score;
  after: Score;
  cls: Classification;
  loss: number; // win % lost by the mover
  accuracy: number;
  best: string | null;
  bestPv: string[];
  replyPv: string[];
  explanation: string[];
  opening?: string;
}

export interface GameReview {
  positions: PositionEval[];
  moves: MoveReview[];
  accuracy: { w: number | null; b: number | null };
  counts: Record<Color, Record<Classification, number>>;
  keyMoments: number[]; // move indexes
  opening?: string;
  depth: number;
}

export function terminalEval(fen: string): PositionEval | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) {
    const winner = c.turn() === "w" ? "b" : "w";
    return { score: { cp: winner === "w" ? 100000 : -100000 }, best: null, pv: [], depth: 0, terminal: winner === "w" ? "1-0" : "0-1" };
  }
  if (c.isStalemate() || c.isInsufficientMaterial() || c.isThreefoldRepetition() || c.isDrawByFiftyMoves())
    return { score: { cp: 0 }, best: null, pv: [], depth: 0, terminal: "1/2-1/2" };
  return null;
}

/** Cancellation token for a running review. */
export class ReviewControl {
  cancelled = false;
  private stopCurrent: (() => void) | null = null;
  setCurrent(f: (() => void) | null) {
    this.stopCurrent = f;
  }
  cancel() {
    this.cancelled = true;
    this.stopCurrent?.();
  }
}

export async function evaluatePositions(fens: string[], depth: number, ctl: ReviewControl, onProgress: (done: number, total: number) => void): Promise<PositionEval[]> {
  const engine = getAnalysisEngine();
  const out: PositionEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (ctl.cancelled) throw new EngineCancelled();
    const t = terminalEval(fens[i]);
    if (t) {
      out.push(t);
    } else {
      const h = engine.search(fens[i], { depth, multipv: 2 });
      ctl.setCurrent(h.cancel);
      const r = await h.promise;
      ctl.setCurrent(null);
      const l1 = r.lines[0];
      const l2 = r.lines[1];
      out.push({
        score: l1?.score ?? { cp: 0 },
        best: r.bestmove,
        pv: l1?.pv ?? [],
        second: l2 ? { score: l2.score, pv: l2.pv } : undefined,
        depth: r.depth,
      });
    }
    onProgress(i + 1, fens.length);
  }
  return out;
}

export async function buildReview(startFen: string, records: MoveRecord[], positions: PositionEval[], depth: number): Promise<GameReview> {
  const book = await loadBook().catch(() => null);
  const moves: MoveReview[] = [];
  const counts = {
    w: { best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 },
    b: { best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 },
  } as GameReview["counts"];
  let inBook = !!book && startFen.split(" ")[0] === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  let opening: string | undefined;
  records.forEach((rec, k) => {
    const pb = positions[k];
    const pa = positions[k + 1];
    const legalCount = new Chess(rec.fenBefore).moves().length;
    const named = inBook && book ? book.lookup(rec.fenAfter) : undefined;
    if (inBook && !named) inBook = false;
    if (named) opening = named.namePt;
    const before = pb.score;
    const after = pa.score;
    const cls = classify({ mover: rec.color, before, after, played: rec.uci, best: pb.best, legalCount, isBook: !!named });
    const loss = cls === "book" || cls === "forced" ? 0 : winLoss({ mover: rec.color, before, after });
    counts[rec.color][cls]++;
    moves.push({
      index: k,
      record: rec,
      before,
      after,
      cls,
      loss,
      accuracy: moveAccuracy(loss),
      best: pb.best,
      bestPv: pb.pv,
      replyPv: pa.pv,
      opening: named?.namePt,
      explanation: explainMove({
        fenBefore: rec.fenBefore,
        fenAfter: rec.fenAfter,
        played: rec.uci,
        san: rec.san,
        mover: rec.color,
        before,
        after,
        bestPv: pb.pv,
        replyPv: pa.pv,
        cls,
        ply: k,
      }),
    });
  });
  const wp = positions.map((p) => winPctWhite(p.score));
  const startColor = (startFen.split(" ")[1] === "b" ? "b" : "w") as Color;
  const keyMoments = moves
    .filter((m) => m.loss >= 10)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 5)
    .map((m) => m.index)
    .sort((a, b) => a - b);
  return {
    positions,
    moves,
    accuracy: { w: gameAccuracy(wp, startColor, "w"), b: gameAccuracy(wp, startColor, "b") },
    counts,
    keyMoments,
    opening,
    depth,
  };
}

