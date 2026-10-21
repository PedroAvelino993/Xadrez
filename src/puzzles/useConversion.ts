import { Chess, type Move } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Color } from "../types";
import { parseUci } from "../chess/rules";
import { play, playForSan } from "../sound/sound";
import { formatScore } from "../engine/score";
import { acceptMove, evaluate, goalReached, maxMovesFor, solverCp, type ConvertGoal, type EngineView } from "./convert";

export type ConvPhase = "idle" | "wait" | "turn" | "wrong" | "done";
export type ConvOutcome = "reached" | "kept" | "skipped" | "error";

export interface ConvState {
  goal: ConvertGoal;
  step: number;
  max: number;
  before: EngineView | null;
  msg?: string;
  outcome?: ConvOutcome;
}

interface BoardIO {
  solver: Color;
  setFen: (fen: string) => void;
  setLast: (m: { from: string; to: string } | null) => void;
  setMarks: (m: Record<string, "good" | "bad" | "hint">) => void;
  /** called with every move actually played during the conversion (UCI) */
  onPlayed?: (uci: string) => void;
}

/** Drives the "convert the advantage" phase against Stockfish (see convert.ts). */
export function useConversion(io: BoardIO) {
  const [phase, setPhase] = useState<ConvPhase>("idle");
  const [conv, setConv] = useState<ConvState | null>(null);
  const token = useRef(0);
  const fenRef = useRef<string>("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      token.current++;
      timers.current.forEach(clearTimeout);
    },
    []
  );
  const wait = (ms: number) => new Promise((r) => timers.current.push(setTimeout(r, ms)));
  const show = (fen: string, last: { from: string; to: string } | null) => {
    fenRef.current = fen;
    io.setFen(fen);
    io.setLast(last);
  };

  const finish = (outcome: ConvOutcome, msg?: string) => {
    token.current++;
    setConv((c) => (c ? { ...c, outcome, msg } : c));
    setPhase("done");
    if (outcome === "reached") play("correct");
  };

  const reply = async (fenOppToMove: string, view: EngineView, base: ConvState, my: number) => {
    if (!view.best) return finish("kept", "O adversário não tem mais lances.");
    const c = new Chess(fenOppToMove);
    const m = c.move(parseUci(view.best));
    io.onPlayed?.(view.best);
    playForSan(m.san, !!m.promotion);
    show(c.fen(), { from: m.from, to: m.to });
    io.setMarks({});
    if (c.isGameOver()) return finish("kept", "A partida terminou.");
    const before = await evaluate(c.fen());
    if (token.current !== my) return;
    setConv({ ...base, before, msg: undefined });
    setPhase("turn");
  };

  /** Starts the phase in a position where the opponent is to move. Returns false if no conversion is needed. */
  const start = async (fenAfterLine: string, decide: (view: EngineView) => ConvertGoal | null): Promise<boolean> => {
    const my = ++token.current;
    fenRef.current = fenAfterLine;
    setPhase("wait");
    try {
      const view = await evaluate(fenAfterLine);
      if (token.current !== my) return false;
      const goal = decide(view);
      if (!goal) {
        setPhase("idle");
        return false;
      }
      const base: ConvState = { goal, step: 0, max: maxMovesFor(goal), before: null };
      setConv(base);
      await wait(350);
      if (token.current !== my) return true;
      await reply(fenAfterLine, view, base, my);
      return true;
    } catch {
      if (token.current === my) setPhase("idle");
      return false;
    }
  };

  const move = async (c: Chess, mv: Move) => {
    if (!conv || !conv.before || phase !== "turn") return;
    const my = ++token.current;
    const fenBefore = fenRef.current;
    const uci = mv.from + mv.to + (mv.promotion ?? "");
    playForSan(mv.san, !!mv.promotion);
    show(c.fen(), { from: mv.from, to: mv.to });
    setPhase("wait");
    try {
      const mated = c.isCheckmate();
      const after: EngineView = c.isGameOver() ? { best: null, score: mated ? { cp: io.solver === "w" ? 100000 : -100000 } : { cp: 0 } } : await evaluate(c.fen());
      if (token.current !== my) return;
      if (!mated && !acceptMove(conv.goal, io.solver, conv.before.score, after.score)) {
        play("wrong");
        io.setMarks({ [mv.to]: "bad" });
        setConv({ ...conv, msg: `Esse lance deixa a vantagem escapar (avaliação para você: ${formatScore({ cp: solverCp(after.score, io.solver) })}). Tente outro.` });
        setPhase("wrong");
        await wait(1100);
        if (token.current !== my) return;
        show(fenBefore, null);
        io.setMarks({});
        setPhase("turn");
        return;
      }
      io.onPlayed?.(uci);
      io.setMarks({ [mv.to]: "good" });
      const next: ConvState = { ...conv, step: conv.step + 1 };
      if (goalReached(conv.goal, io.solver, c.fen(), !!mv.promotion, after.score)) {
        setConv(next);
        return finish("reached");
      }
      if (next.step >= conv.max) {
        setConv(next);
        return finish("kept");
      }
      setConv(next);
      await wait(300);
      if (token.current !== my) return;
      await reply(c.fen(), after, next, my);
    } catch {
      if (token.current === my) finish("error", "Não foi possível consultar o motor agora.");
    }
  };

  const hint = () => {
    const b = conv?.before?.best;
    if (b) io.setMarks({ [b.slice(0, 2)]: "hint" });
  };

  const playEngine = () => {
    const b = conv?.before?.best;
    if (!b || phase !== "turn") return;
    const c = new Chess(fenRef.current);
    const mv = c.move(parseUci(b));
    void move(c, mv);
  };

  const reset = () => {
    token.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setConv(null);
    setPhase("idle");
  };

  /** keep the hook aware of the current board position (for engine moves / take-backs) */
  const sync = useCallback((fen: string) => {
    fenRef.current = fen;
  }, []);

  return { phase, conv, start, move, hint, playEngine, finish, reset, sync };
}
