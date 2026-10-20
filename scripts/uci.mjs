// Minimal UCI wrapper around a native Stockfish process (used offline to
// generate and verify puzzles / positions; the app itself uses the WASM build).
import { spawn } from "node:child_process";

export class Engine {
  constructor(path = "/usr/games/stockfish") {
    this.p = spawn(path);
    this.buf = "";
    this.listeners = [];
    this.p.stdout.on("data", (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        for (const l of [...this.listeners]) l(line);
      }
    });
  }
  send(cmd) { this.p.stdin.write(cmd + "\n"); }
  waitFor(pred) {
    return new Promise((res) => {
      const l = (line) => { if (pred(line)) { this.listeners = this.listeners.filter((x) => x !== l); res(line); } };
      this.listeners.push(l);
    });
  }
  async init() {
    this.send("uci"); await this.waitFor((l) => l === "uciok");
    this.send("setoption name Threads value 1");
    this.send("setoption name Hash value 64");
    this.send("isready"); await this.waitFor((l) => l === "readyok");
  }
  async newGame() { this.send("ucinewgame"); this.send("isready"); await this.waitFor((l) => l === "readyok"); }
  // Returns array of {move, score:{cp|mate}, pv} sorted by multipv, scores from side to move.
  async analyse(fen, { multipv = 1, nodes, depth } = {}) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    const lines = new Map();
    const l = (line) => {
      if (!line.startsWith("info") || !line.includes(" pv ")) return;
      const mp = +(line.match(/ multipv (\d+)/)?.[1] ?? 1);
      const cp = line.match(/ score cp (-?\d+)/);
      const mate = line.match(/ score mate (-?\d+)/);
      if (line.includes("lowerbound") || line.includes("upperbound")) return;
      const pv = line.split(" pv ")[1].trim().split(" ");
      lines.set(mp, { move: pv[0], pv, score: mate ? { mate: +mate[1] } : { cp: +cp[1] }, depth: +line.match(/ depth (\d+)/)[1] });
    };
    this.listeners.push(l);
    this.send(depth ? `go depth ${depth}` : `go nodes ${nodes ?? 1000000}`);
    const best = await this.waitFor((x) => x.startsWith("bestmove"));
    this.listeners = this.listeners.filter((x) => x !== l);
    const out = [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    if (!out.length) return { lines: [], bestmove: best.split(" ")[1] };
    return { lines: out, bestmove: best.split(" ")[1] };
  }
  quit() { this.send("quit"); }
}

// Score -> centipawns from side to move (mates mapped to large values).
export function toCp(s) {
  if (!s) return 0;
  if (s.mate !== undefined) return s.mate > 0 ? 100000 - s.mate * 100 : -100000 - s.mate * 100;
  return s.cp;
}
// Lichess win-percentage model.
export function winPct(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}
export function winPctScore(s) {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  return winPct(s.cp);
}
