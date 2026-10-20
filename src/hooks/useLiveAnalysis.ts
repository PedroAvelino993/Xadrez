import { useEffect, useRef, useState } from "react";
import type { EngineResult } from "../types";
import { getAnalysisEngine, EngineCancelled } from "../engine/stockfish";
import { terminalEval } from "../analysis/review";

export interface LiveAnalysis {
  result: EngineResult | null;
  running: boolean;
  error: string | null;
  terminal: string | null;
}

// Cache of finished searches (fen + settings) so revisiting a position is instant.
const cache = new Map<string, EngineResult>();

export function cachedEval(fen: string, minDepth: number): EngineResult | undefined {
  for (const [k, v] of cache) if (k.startsWith(fen + "|") && v.depth >= minDepth) return v;
  return undefined;
}

/** Streams Stockfish analysis of `fen`; cancels the previous search on change. */
export function useLiveAnalysis(fen: string | null, enabled: boolean, depth: number, multipv: number): LiveAnalysis {
  const [state, setState] = useState<LiveAnalysis>({ result: null, running: false, error: null, terminal: null });
  const last = useRef(0);
  useEffect(() => {
    if (!enabled || !fen) {
      setState((s) => ({ ...s, running: false }));
      return;
    }
    const t = terminalEval(fen);
    if (t) {
      setState({ result: { depth: 0, lines: [{ multipv: 1, depth: 0, score: t.score, pv: [] }], bestmove: null }, running: false, error: null, terminal: t.terminal ?? null });
      return;
    }
    const key = `${fen}|${depth}|${multipv}`;
    const hit = cache.get(key);
    if (hit) {
      setState({ result: hit, running: false, error: null, terminal: null });
      return;
    }
    setState({ result: null, running: true, error: null, terminal: null });
    const h = getAnalysisEngine().search(fen, { depth, multipv }, (r) => {
      const now = performance.now();
      if (now - last.current < 120) return; // throttle UI updates
      last.current = now;
      setState({ result: r, running: true, error: null, terminal: null });
    });
    h.promise
      .then((r) => {
        cache.set(key, r);
        if (cache.size > 400) cache.delete(cache.keys().next().value!);
        setState({ result: r, running: false, error: null, terminal: null });
      })
      .catch((e) => {
        if (e instanceof EngineCancelled) return;
        setState({ result: null, running: false, error: String((e as Error).message ?? e), terminal: null });
      });
    return () => h.cancel();
  }, [fen, enabled, depth, multipv]);
  return state;
}

/** Evaluates a single position once (used for "before" positions); result is cached. */
export function useEvalOnce(fen: string | null, depth: number, enabled: boolean): EngineResult | null {
  const [res, setRes] = useState<EngineResult | null>(null);
  useEffect(() => {
    if (!fen || !enabled) {
      setRes(null);
      return;
    }
    const t = terminalEval(fen);
    if (t) {
      setRes({ depth: 0, lines: [{ multipv: 1, depth: 0, score: t.score, pv: [] }], bestmove: null });
      return;
    }
    const hit = cachedEval(fen, depth);
    if (hit) {
      setRes(hit);
      return;
    }
    setRes(null);
    const h = getAnalysisEngine().search(fen, { depth, multipv: 1 });
    h.promise
      .then((r) => {
        cache.set(`${fen}|${depth}|1`, r);
        setRes(r);
      })
      .catch(() => {});
    return () => h.cancel();
  }, [fen, depth, enabled]);
  return res;
}
