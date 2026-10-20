// Puzzle miner: Stockfish self-play with occasional imperfect moves. Whenever a
// move throws away the evaluation, the resulting position is checked deeply: the
// opponent must have a single clearly-best move at every step of the line.
// Output: JSONL of raw puzzles {fen, moves(uci), kind, ...} for later tagging.
import { Chess } from "chess.js";
import fs from "node:fs";
import { Engine, toCp, winPctScore } from "./uci.mjs";

const id = process.argv[2] ?? "0";
const target = +(process.argv[3] ?? 200);
const out = fs.createWriteStream(new URL(`../data/puzzles-raw/raw-${id}.jsonl`, import.meta.url), { flags: "a" });

const openings = ["a", "b", "c", "d", "e"].flatMap((f) =>
  fs.readFileSync(new URL(`../data/openings/${f}.tsv`, import.meta.url), "utf8").trim().split("\n").slice(1).map((l) => l.split("\t")[2])
);

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(chess, color) {
  let s = 0;
  for (const row of chess.board()) for (const sq of row) if (sq) s += (sq.color === color ? 1 : -1) * VAL[sq.type];
  return s;
}
const uci = (m) => m.from + m.to + (m.promotion ?? "");
const DEEP = 2500000;

const e = new Engine();
await e.init();
let found = 0;
const seen = new Set();

function uniqueStep(best, second) {
  if (!second) return true;
  if (best.score.mate !== undefined && best.score.mate > 0) {
    if (best.score.mate === 1) return true; // any mate in one is accepted by the app
    return !(second.score.mate !== undefined && second.score.mate > 0);
  }
  if (winPctScore(best.score) - winPctScore(second.score) >= 20) return true;
  // already winning: the move must still be clearly the only good one
  const b = Math.min(1500, toCp(best.score)), s2 = Math.min(1500, toCp(second.score));
  return b >= 300 && b - s2 >= 250;
}

async function buildTactic(startFen, blunder) {
  const c = new Chess(startFen);
  c.move(blunder);
  const solver = c.turn();
  const mat0 = material(c, solver);
  const moves = [blunder];
  let mate = false;
  for (let step = 0; step < 6; step++) {
    if (c.isGameOver()) return null;
    const legal = c.moves().length;
    const r = await e.analyse(c.fen(), { multipv: 2, nodes: DEEP });
    const [best, second] = r.lines;
    if (!best) return null;
    if (step === 0) {
      if (legal < 2) return null;
      if (toCp(best.score) < 250) return null;
    }
    if (!uniqueStep(best, second)) {
      if (step === 0) return null;
      moves.pop(); // drop the opponent reply; line ends on the solver's move
      break;
    }
    c.move(best.move);
    moves.push(best.move);
    if (c.isCheckmate()) { mate = true; break; }
    if (c.isGameOver()) return null;
    if (step === 5) break;
    const r2 = await e.analyse(c.fen(), { multipv: 1, nodes: DEEP / 2 });
    if (!r2.lines[0]) return null;
    c.move(r2.lines[0].move);
    moves.push(r2.lines[0].move);
  }
  if (moves.length % 2 !== 0) return null; // must end on a solver move
  // replay to the end position (after last solver move)
  const end = new Chess(startFen);
  for (const m of moves) end.move(m);
  let finalCp = 100000;
  if (!mate) {
    const r = await e.analyse(end.fen(), { multipv: 1, nodes: DEEP });
    if (!r.lines[0]) return null;
    finalCp = -toCp(r.lines[0].score);
    if (finalCp < 200) return null;
    const gained = material(end, solver) - mat0;
    // require the advantage to be concrete: material won, or a decisive engine edge
    if (gained < 2 && finalCp < 600) return null;
  }
  return { fen: startFen, moves, kind: mate ? "mate" : "tactic", solverMoves: moves.length / 2, finalCp };
}

async function buildDefense(startFen, oppMove) {
  const c = new Chess(startFen);
  c.move(oppMove);
  if (c.moves().length < 3) return null;
  const r = await e.analyse(c.fen(), { multipv: 2, nodes: DEEP });
  const [best, second] = r.lines;
  if (!best || !second) return null;
  const b = toCp(best.score), s = toCp(second.score);
  if (b < -80 || b > 250 || s > -300) return null;
  const mv = c.move(best.move);
  // a plain recapture is not an interesting defensive puzzle
  const last = new Chess(startFen).move(oppMove);
  if (mv.captured && mv.to === last.to) return null;
  return { fen: startFen, moves: [oppMove, best.move], kind: "defense", solverMoves: 1, finalCp: b };
}

while (found < target) {
  const c = new Chess();
  const op = openings[Math.floor(Math.random() * openings.length)];
  try { c.loadPgn(op); } catch { continue; }
  await e.newGame();
  for (let ply = 0; ply < 140 && !c.isGameOver(); ply++) {
    const fen = c.fen();
    const r = await e.analyse(fen, { multipv: 4, nodes: 40000 });
    if (!r.lines.length) break;
    const legal = c.moves({ verbose: true });
    const x = Math.random();
    let mv;
    if (x < 0.08) mv = uci(legal[Math.floor(Math.random() * legal.length)]);
    else if (x < 0.3 && r.lines.length > 1) mv = r.lines[1 + Math.floor(Math.random() * (r.lines.length - 1))].move;
    else mv = r.lines[0].move;
    const before = toCp(r.lines[0].score);
    // forced mate for the side to move: the opponent's previous move allowed it
    const m0 = r.lines[0].score.mate;
    if (m0 !== undefined && m0 >= 2 && m0 <= 4 && c.history().length) {
      const undone = c.undo();
      const pfen = c.fen();
      c.move({ from: undone.from, to: undone.to, promotion: undone.promotion });
      if (!seen.has(pfen + "m")) {
        seen.add(pfen + "m");
        const p = await buildTactic(pfen, uci(undone));
        if (p) { out.write(JSON.stringify(p) + "\n"); found++; }
      }
    }
    // defensive candidate: the mover has a single move that holds
    if (r.lines.length > 1 && ply > 6) {
      const g = toCp(r.lines[0].score) - toCp(r.lines[1].score);
      if (g >= 350 && Math.abs(before) <= 150 && c.history().length) {
        // re-root one move earlier so the solver sees the opponent's move
        const undone = c.undo(); const pfen = c.fen(); c.move({ from: undone.from, to: undone.to, promotion: undone.promotion });
        if (!seen.has(pfen + "d")) {
          seen.add(pfen + "d");
          const p = await buildDefense(pfen, uci(undone));
          if (p) { out.write(JSON.stringify(p) + "\n"); found++; }
        }
      }
    }
    c.move(mv);
    if (c.isGameOver()) break;
    if (mv !== r.lines[0].move) {
      const r2 = await e.analyse(c.fen(), { multipv: 1, nodes: 40000 });
      const o = r2.lines[0] ? toCp(r2.lines[0].score) : 0;
      if (o >= 220 && before + o >= 220 && before <= 300 && !seen.has(fen)) {
        seen.add(fen);
        const p = await buildTactic(fen, mv);
        if (p) { out.write(JSON.stringify(p) + "\n"); found++; }
      }
    }
    if (Math.abs(before) > 2500) break; // game decided, start a new one
  }
}
e.quit();
out.end();
