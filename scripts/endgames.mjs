// Endgame study generator: random legal pawn / rook endgames where the side to
// move has exactly one winning move (or exactly one move that holds the draw).
// Each step of the solution must again be unique; verified with deep searches.
import { Chess } from "chess.js";
import fs from "node:fs";
import { Engine, toCp, winPctScore } from "./uci.mjs";

const type = process.argv[2] ?? "pawn"; // pawn | rook
const target = +(process.argv[3] ?? 40);
const out = fs.createWriteStream(new URL(`../data/puzzles-raw/end-${type}-${process.pid}.jsonl`, import.meta.url), { flags: "a" });
const e = new Engine();
await e.init();
const NODES = 6000000;

const rnd = (n) => Math.floor(Math.random() * n);
const sq = (f, r) => "abcdefgh"[f] + (r + 1);

function randomPosition() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const used = new Set();
  const place = (piece, rmin = 0, rmax = 7) => {
    for (let t = 0; t < 200; t++) {
      const f = rnd(8), r = rmin + rnd(rmax - rmin + 1);
      if (used.has(f * 8 + r)) continue;
      used.add(f * 8 + r);
      board[r][f] = piece;
      return [f, r];
    }
    return null;
  };
  const wk = place("K");
  let bk;
  for (let t = 0; t < 100; t++) {
    const f = rnd(8), r = rnd(8);
    if (Math.abs(f - wk[0]) <= 1 && Math.abs(r - wk[1]) <= 1) continue;
    if (used.has(f * 8 + r)) continue;
    used.add(f * 8 + r);
    board[r][f] = "k";
    bk = [f, r];
    break;
  }
  if (!bk) return null;
  const wp = 1 + rnd(type === "pawn" ? 3 : 2), bp = rnd(type === "pawn" ? 3 : 2);
  for (let i = 0; i < wp; i++) place("P", 1, 6);
  for (let i = 0; i < bp; i++) place("p", 1, 6);
  if (type === "rook") { place("R"); place("r"); }
  let fen = "";
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) empty++;
      else { if (empty) fen += empty; empty = 0; fen += p; }
    }
    if (empty) fen += empty;
    if (r) fen += "/";
  }
  const side = Math.random() < 0.5 ? "w" : "b";
  fen += ` ${side} - - 0 1`;
  try {
    const c = new Chess(fen);
    // side not to move must not be in check
    const other = new Chess(fen.replace(` ${side} `, ` ${side === "w" ? "b" : "w"} `));
    if (other.inCheck()) return null;
    if (c.isGameOver()) return null;
    return c;
  } catch { return null; }
}

function unique(best, second, mode) {
  if (!second) return true;
  if (mode === "win") {
    if (best.score.mate !== undefined && best.score.mate > 0) return !(second.score.mate > 0) && toCp(second.score) < 300;
    return toCp(best.score) >= 400 && toCp(second.score) <= 120;
  }
  // draw: best holds, second loses
  return Math.abs(toCp(best.score)) <= 60 && toCp(second.score) <= -400;
}

let found = 0;
while (found < target) {
  const c = randomPosition();
  if (!c) continue;
  if (c.moves().length < 3) continue;
  const quick = await e.analyse(c.fen(), { multipv: 2, nodes: 300000 });
  const [qb, qs] = quick.lines;
  if (!qb || !qs) continue;
  const winCand = toCp(qb.score) >= 400 && toCp(qs.score) <= 150;
  const drawCand = Math.abs(toCp(qb.score)) <= 60 && toCp(qs.score) <= -350;
  if (!winCand && !drawCand) continue;
  const mode = winCand ? "win" : "draw";
  const start = c.fen();
  const moves = [];
  let ok = true;
  for (let step = 0; step < 4; step++) {
    const r = await e.analyse(c.fen(), { multipv: 2, nodes: NODES });
    const [best, second] = r.lines;
    if (!best) { ok = step > 0; break; }
    if (!unique(best, second, mode)) { if (step === 0) ok = false; else moves.pop(); break; }
    c.move(best.move);
    moves.push(best.move);
    if (c.isGameOver() || step === 3) break;
    const r2 = await e.analyse(c.fen(), { multipv: 1, nodes: NODES / 2 });
    if (!r2.lines[0]) break;
    c.move(r2.lines[0].move);
    moves.push(r2.lines[0].move);
  }
  if (!ok || moves.length === 0 || moves.length % 2 === 0) continue;
  // final confirmation from the solver's side after the last solver move
  const end = new Chess(start);
  for (const m of moves) end.move(m);
  const fin = end.isGameOver() ? null : await e.analyse(end.fen(), { multipv: 1, nodes: NODES });
  const finCp = fin && fin.lines[0] ? -toCp(fin.lines[0].score) : 0;
  if (mode === "win" && fin && finCp < 400) continue;
  if (mode === "draw" && fin && finCp < -80) continue;
  out.write(JSON.stringify({ fen: start, moves, kind: `end-${type}`, mode, solverFirst: true, solverMoves: (moves.length + 1) / 2, finalCp: finCp }) + "\n");
  found++;
}
e.quit();
out.end();
void winPctScore;
