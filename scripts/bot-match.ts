// Plays matches between adjacent bot levels using the app's own bot code
// (src/bots/bots.ts) and the same Stockfish 18 lite WASM build, run in Node.
// Usage: npx vite-node scripts/bot-match.ts [gamesPerPair] [firstLevelIndex]
import { spawn } from "node:child_process";
import { Chess } from "chess.js";
import { BOTS, softmaxPick, type Bot } from "../src/bots/bots";

class Uci {
  private p = spawn("node", ["node_modules/stockfish/bin/stockfish-18-lite-single.js"]);
  private buf = "";
  private listeners: ((l: string) => void)[] = [];
  constructor() {
    this.p.stdout.on("data", (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.listeners.slice().forEach((l) => l(line));
      }
    });
  }
  send(c: string) {
    this.p.stdin.write(c + "\n");
  }
  wait(pred: (l: string) => boolean): Promise<string> {
    return new Promise((res) => {
      const l = (x: string) => {
        if (pred(x)) {
          this.listeners = this.listeners.filter((y) => y !== l);
          res(x);
        }
      };
      this.listeners.push(l);
    });
  }
  async init() {
    this.send("uci");
    await this.wait((l) => l === "uciok");
    this.send("setoption name Hash value 32");
    this.send("isready");
    await this.wait((l) => l === "readyok");
  }
  async search(fen: string, opts: { depth?: number; movetime?: number; multipv?: number; elo?: number }) {
    this.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
    if (opts.elo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${opts.elo}`);
    } else this.send("setoption name UCI_LimitStrength value false");
    this.send(`position fen ${fen}`);
    const lines = new Map<number, { move: string; cp: number; depth: number }>();
    const white = fen.split(" ")[1] === "w";
    const l = (x: string) => {
      if (!x.startsWith("info") || !x.includes(" pv ") || x.includes("bound")) return;
      const mp = +(x.match(/ multipv (\d+)/)?.[1] ?? 1);
      const cp = x.match(/ score cp (-?\d+)/);
      const mate = x.match(/ score mate (-?\d+)/);
      const v = mate ? (+mate[1] > 0 ? 10000 - +mate[1] : -10000 - +mate[1]) : +(cp?.[1] ?? 0);
      lines.set(mp, { move: x.split(" pv ")[1].split(" ")[0], cp: v, depth: +x.match(/ depth (\d+)/)![1] });
    };
    this.listeners.push(l);
    this.send(opts.depth ? `go depth ${opts.depth}` : `go movetime ${opts.movetime ?? 500}`);
    const bm = await this.wait((x) => x.startsWith("bestmove"));
    this.listeners = this.listeners.filter((y) => y !== l);
    void white;
    return { bestmove: bm.split(" ")[1], lines: [...lines.values()] };
  }
  quit() {
    this.send("quit");
  }
}

async function botMove(e: Uci, bot: Bot, fen: string): Promise<string> {
  const p = bot.policy;
  if (p.kind === "softmax") {
    const r = await e.search(fen, { depth: p.depth, multipv: p.multipv });
    const d = Math.max(...r.lines.map((l) => l.depth));
    const cands = r.lines.filter((l) => l.depth >= d - 1).map((l) => ({ move: l.move, cp: l.cp }));
    return cands.length > 1 ? softmaxPick(cands, p.temperature) : r.bestmove;
  }
  if (p.kind === "elo") return (await e.search(fen, { elo: p.elo, movetime: p.movetime })).bestmove;
  return (await e.search(fen, { movetime: p.movetime })).bestmove;
}

async function play(e: Uci, judge: Uci, white: Bot, black: Bot): Promise<number> {
  const c = new Chess();
  for (let ply = 0; ply < 200 && !c.isGameOver(); ply++) {
    const bot = c.turn() === "w" ? white : black;
    const u = await botMove(e, bot, c.fen());
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  }
  if (c.isCheckmate()) return c.turn() === "w" ? 0 : 1;
  if (c.isGameOver()) return 0.5;
  const r = await judge.search(c.fen(), { depth: 14 });
  const cp = (c.turn() === "w" ? 1 : -1) * (r.lines[0]?.cp ?? 0);
  return cp > 300 ? 1 : cp < -300 ? 0 : 0.5;
}

const n = +(process.argv[2] ?? 4);
const e = new Uci();
const judge = new Uci();
await e.init();
await judge.init();
for (let i = +(process.argv[3] ?? 0); i < BOTS.length - 1; i++) {
  const a = BOTS[i],
    b = BOTS[i + 1];
  let scoreB = 0;
  for (let g = 0; g < n; g++) {
    const bWhite = g % 2 === 0;
    const res = await play(e, judge, bWhite ? b : a, bWhite ? a : b);
    scoreB += bWhite ? res : 1 - res;
  }
  console.log(`${b.name} (${b.levelName}) vs ${a.name} (${a.levelName}): ${scoreB}/${n}`);
}
e.quit();
judge.quit();
process.exit(0);
