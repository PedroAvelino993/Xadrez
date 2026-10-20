// Stockfish 18 (lite, single-threaded WASM build) running in a Web Worker.
// The single-threaded build needs no cross-origin isolation headers, so it
// works on static hosting such as GitHub Pages.
//
// One `Engine` instance = one worker = one search at a time. Jobs are queued;
// `cancel()` removes a queued job or stops the running search. Scores are
// converted to White's point of view (positive = White better).
import type { EngineLine, EngineResult, Score } from "../types";

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  nodes?: number;
  multipv?: number;
  /** Stockfish "Skill Level" 0..20 */
  skill?: number;
  /** UCI_LimitStrength + UCI_Elo (Stockfish accepts 1320..3190) */
  elo?: number;
}

export interface SearchHandle {
  promise: Promise<EngineResult>;
  cancel: () => void;
}

export class EngineCancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

type Job = {
  fen: string;
  opts: SearchOptions;
  onInfo?: (r: EngineResult) => void;
  resolve: (r: EngineResult) => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
  lines: Map<number, EngineLine>;
  depth: number;
  whiteToMove: boolean;
};

export type EngineStatus = "idle" | "loading" | "ready" | "error";

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`;

export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lastOptions = new Map<string, string>();
  private statusListeners = new Set<(s: EngineStatus) => void>();
  status: EngineStatus = "idle";
  error: string | null = null;

  constructor(readonly name: string) {}

  onStatus(l: (s: EngineStatus) => void) {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  /** Starts the worker (idempotent). */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.setStatus("loading");
    this.ready = new Promise<void>((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(ENGINE_URL);
      } catch (e) {
        this.fail(`Não foi possível iniciar o motor (${String(e)})`);
        reject(e);
        return;
      }
      this.worker = w;
      const timeout = setTimeout(() => {
        this.fail("O motor demorou demais para carregar.");
        reject(new Error("engine timeout"));
      }, 30000);
      let phase: "uci" | "ready" | "running" = "uci";
      w.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : String(e.data);
        if (phase === "uci" && line === "uciok") {
          phase = "ready";
          this.post("setoption name Hash value 32");
          this.post("isready");
        } else if (phase === "ready" && line === "readyok") {
          phase = "running";
          clearTimeout(timeout);
          this.setStatus("ready");
          resolve();
          this.pump();
        } else if (phase === "running") this.onLine(line);
      };
      w.onerror = (ev) => {
        clearTimeout(timeout);
        this.fail(`Erro no motor: ${ev.message || "falha ao carregar"}`);
        reject(new Error("engine error"));
      };
      this.post("uci");
    });
    return this.ready;
  }

  private fail(msg: string) {
    this.error = msg;
    this.setStatus("error");
    const jobs = [this.current, ...this.queue].filter(Boolean) as Job[];
    this.current = null;
    this.queue = [];
    jobs.forEach((j) => j.reject(new Error(msg)));
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    this.ready = null;
    this.lastOptions.clear();
  }

  /** Terminates and restarts the worker (used after errors). */
  restart() {
    this.fail("reiniciando");
    this.error = null;
    return this.init();
  }

  private post(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private setOption(name: string, value: string) {
    if (this.lastOptions.get(name) === value) return;
    this.lastOptions.set(name, value);
    this.post(`setoption name ${name} value ${value}`);
  }

  search(fen: string, opts: SearchOptions = {}, onInfo?: (r: EngineResult) => void): SearchHandle {
    let job!: Job;
    const promise = new Promise<EngineResult>((resolve, reject) => {
      job = {
        fen,
        opts,
        onInfo,
        resolve,
        reject,
        cancelled: false,
        lines: new Map(),
        depth: 0,
        whiteToMove: fen.split(" ")[1] !== "b",
      };
    });
    this.queue.push(job);
    this.init()
      .then(() => this.pump())
      .catch(() => {
        /* rejected through fail() */
      });
    return {
      promise,
      cancel: () => {
        if (job.cancelled) return;
        job.cancelled = true;
        const qi = this.queue.indexOf(job);
        if (qi >= 0) {
          this.queue.splice(qi, 1);
          job.reject(new EngineCancelled());
        } else if (this.current === job) this.post("stop");
      },
    };
  }

  private pump() {
    if (this.current || this.status !== "ready") return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    const o = job.opts;
    this.setOption("MultiPV", String(o.multipv ?? 1));
    if (o.elo) {
      this.setOption("UCI_LimitStrength", "true");
      this.setOption("UCI_Elo", String(Math.max(1320, Math.min(3190, Math.round(o.elo)))));
    } else this.setOption("UCI_LimitStrength", "false");
    this.setOption("Skill Level", String(o.skill ?? 20));
    this.post(`position fen ${job.fen}`);
    const parts = ["go"];
    if (o.depth) parts.push("depth", String(o.depth));
    if (o.movetime) parts.push("movetime", String(o.movetime));
    if (o.nodes) parts.push("nodes", String(o.nodes));
    if (parts.length === 1) parts.push("depth", "16");
    this.post(parts.join(" "));
  }

  private onLine(line: string) {
    const job = this.current;
    if (!job) return;
    if (line.startsWith("info") && line.includes(" pv ") && !line.includes("bound")) {
      const depth = +(line.match(/ depth (\d+)/)?.[1] ?? 0);
      const mp = +(line.match(/ multipv (\d+)/)?.[1] ?? 1);
      const cp = line.match(/ score cp (-?\d+)/);
      const mate = line.match(/ score mate (-?\d+)/);
      const pv = line.split(" pv ")[1].trim().split(/\s+/);
      const sign = job.whiteToMove ? 1 : -1;
      const score: Score = mate ? { mate: sign * +mate[1] } : { cp: sign * +(cp?.[1] ?? 0) };
      job.lines.set(mp, { multipv: mp, depth, score, pv });
      if (mp === 1) job.depth = depth;
      if (job.onInfo && mp === (job.opts.multipv ?? 1)) job.onInfo(this.snapshot(job, null));
    } else if (line.startsWith("bestmove")) {
      const bm = line.split(/\s+/)[1];
      this.current = null;
      const result = this.snapshot(job, bm && bm !== "(none)" ? bm : null);
      if (job.cancelled) job.reject(new EngineCancelled());
      else job.resolve(result);
      this.pump();
    }
  }

  private snapshot(job: Job, bestmove: string | null): EngineResult {
    const lines = [...job.lines.values()]
      .filter((l) => l.depth >= job.depth - 1)
      .sort((a, b) => a.multipv - b.multipv);
    return { depth: job.depth, lines, bestmove: bestmove ?? lines[0]?.pv[0] ?? null };
  }
}

let playEngine: Engine | null = null;
let analysisEngine: Engine | null = null;

/** Engine used by bots during games. */
export function getPlayEngine() {
  return (playEngine ??= new Engine("play"));
}
/** Engine used by the analysis board and game review. */
export function getAnalysisEngine() {
  return (analysisEngine ??= new Engine("analysis"));
}
