// Verifies lesson and position-library content:
//  - every FEN is a legal position; demo move lists are legal;
//  - every exercise goal can actually be achieved;
//  - "moves"/"sequence" answers are confirmed by Stockfish (native binary):
//    accepted moves are as good as the engine's best, and no unlisted move is
//    nearly as good (so a correct alternative is never marked wrong).
// Usage: node scripts/verify-lessons.mjs [files...]   (needs /usr/games/stockfish)
import { Chess } from "chess.js";
import fs from "node:fs";
import path from "node:path";
import { Engine, toCp, winPctScore } from "./uci.mjs";

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...fs.readdirSync("src/lessons/data").map((f) => path.join("src/lessons/data", f)), "src/positions/library.json"].filter((f) => fs.existsSync(f));

const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
let errors = 0,
  warnings = 0;
const err = (where, msg) => {
  errors++;
  console.log(`ERRO  ${where}: ${msg}`);
};
const warn = (where, msg) => {
  warnings++;
  console.log(`aviso ${where}: ${msg}`);
};

function legalFen(fen, where) {
  try {
    const c = new Chess(fen);
    const parts = fen.split(" ");
    const other = new Chess(fen.replace(` ${parts[1]} `, ` ${parts[1] === "w" ? "b" : "w"} `).replace(/ [a-h][36] /, " - "));
    if (other.inCheck()) err(where, "o lado que não joga está em xeque");
    const rows = parts[0].split("/");
    if (/[pP]/.test(rows[0]) || /[pP]/.test(rows[7])) err(where, "peão na 1ª/8ª fileira");
    return c;
  } catch (e) {
    err(where, `FEN inválida: ${fen} (${e.message})`);
    return null;
  }
}

function flipTurn(fen) {
  const p = fen.split(" ");
  p[1] = p[1] === "w" ? "b" : "w";
  p[3] = "-";
  return p.join(" ");
}

function reachable(fen, piece, square, n) {
  const color = fen.split(" ")[1];
  let frontier = [fen];
  for (let d = 0; d < n; d++) {
    const next = [];
    for (const f of frontier) {
      const c = new Chess(f);
      for (const m of c.moves({ verbose: true })) {
        if (m.piece !== piece) continue;
        if (m.to === square) return true;
        c.move(m);
        try {
          next.push(flipTurn(c.fen()));
        } catch {}
        c.undo();
      }
    }
    frontier = next.slice(0, 3000);
    void color;
  }
  return false;
}

const e = new Engine();
await e.init();
const NODES = 3000000;

async function checkMoves(where, fen, accept) {
  const c = new Chess(fen);
  for (const u of accept) {
    try {
      new Chess(fen).move(parse(u));
    } catch {
      return err(where, `lance aceito ilegal: ${u}`);
    }
  }
  const n = Math.min(6, c.moves().length);
  const r = await e.analyse(fen, { multipv: n, nodes: NODES });
  const best = r.lines[0];
  if (!best) return err(where, "motor sem resposta");
  if (!accept.includes(best.move)) err(where, `o melhor lance do motor é ${best.move} (${JSON.stringify(best.score)}), que não está na lista aceita`);
  const bw = winPctScore(best.score),
    bc = toCp(best.score);
  for (const l of r.lines.slice(1)) {
    const close = bw - winPctScore(l.score) < 6 && bc - toCp(l.score) < 60;
    const mateBoth = best.score.mate > 0 && l.score.mate > 0;
    if (accept.includes(l.move)) {
      if (!close && !mateBoth) err(where, `lance aceito ${l.move} é bem pior que ${best.move} (${JSON.stringify(l.score)} vs ${JSON.stringify(best.score)})`);
    } else if (close || (mateBoth && l.score.mate <= best.score.mate + 1)) {
      err(where, `alternativa ${l.move} (${JSON.stringify(l.score)}) é quase tão boa quanto ${best.move} — inclua-a ou troque a posição`);
    }
  }
}

async function checkSequence(where, fen, moves) {
  const c = new Chess(fen);
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) await checkMoves(`${where}[${i}]`, c.fen(), [moves[i]]);
    else {
      const r = await e.analyse(c.fen(), { multipv: 1, nodes: NODES / 2 });
      const b = r.lines[0];
      if (b && b.move !== moves[i]) {
        const cc = new Chess(c.fen());
        cc.move(parse(moves[i]));
        const r2 = await e.analyse(cc.fen(), { multipv: 1, nodes: NODES / 2 });
        const after = r2.lines[0] ? -toCp(r2.lines[0].score) : 0;
        if (toCp(b.score) - after > 80) warn(`${where}[${i}]`, `resposta ${moves[i]} não é a melhor defesa (${b.move})`);
      }
    }
    try {
      c.move(parse(moves[i]));
    } catch {
      return err(where, `lance ilegal na sequência: ${moves[i]}`);
    }
  }
}

async function checkExercise(where, ex) {
  const c = legalFen(ex.fen, where);
  if (!c) return;
  const g = ex.goal;
  const moves = c.moves({ verbose: true });
  const after = (m) => {
    const x = new Chess(ex.fen);
    x.move(m);
    return x;
  };
  switch (g.type) {
    case "reach":
      if (!reachable(ex.fen, g.piece, g.square, g.inMoves ?? 1)) err(where, `${g.piece} não alcança ${g.square} em ${g.inMoves ?? 1} lance(s)`);
      break;
    case "capture":
      if (!moves.some((m) => m.to === g.square && m.captured)) err(where, `nenhuma captura em ${g.square}`);
      break;
    case "check":
      if (!moves.some((m) => m.san.includes("+") || m.san.includes("#"))) err(where, "nenhum xeque possível");
      break;
    case "mate":
      if (!moves.some((m) => m.san.includes("#"))) err(where, "nenhum mate em 1 possível");
      break;
    case "stalemate":
      if (!moves.some((m) => after(m).isStalemate())) err(where, "nenhum lance afoga");
      break;
    case "castle":
      if (!moves.some((m) => (g.side === "q" ? m.flags.includes("q") : g.side === "k" ? m.flags.includes("k") : /[kq]/.test(m.flags)))) err(where, "roque impossível");
      break;
    case "enpassant":
      if (!moves.some((m) => m.flags.includes("e"))) err(where, "en passant impossível");
      break;
    case "promote":
      if (!moves.some((m) => m.promotion && (!g.piece || m.promotion === g.piece))) err(where, "promoção impossível");
      break;
    case "safe": {
      const p = c.get(g.square);
      if (!p) err(where, `nenhuma peça em ${g.square}`);
      else if (!moves.some((m) => m.from === g.square && after(m).attackers(m.to, p.color === "w" ? "b" : "w").length === 0)) err(where, `${g.square} não tem casa segura`);
      break;
    }
    case "moves":
      await checkMoves(where, ex.fen, g.accept);
      break;
    case "sequence":
      await checkSequence(where, ex.fen, g.moves);
      break;
    default:
      err(where, `tipo de objetivo desconhecido: ${g.type}`);
  }
}

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const lessons = Array.isArray(data) ? null : data.lessons;
  if (lessons) {
    const ids = new Set();
    for (const l of lessons) {
      for (const [i, s] of l.steps.entries()) {
        const where = `${path.basename(f)}:${l.id}#${i}`;
        if (s.kind === "board") {
          const c = legalFen(s.fen, where);
          if (c && s.moves) for (const u of s.moves) try { c.move(parse(u)); } catch { err(where, `lance de demonstração ilegal: ${u}`); break; }
        } else if (s.kind === "exercise") {
          if (ids.has(s.id)) err(where, `id repetido ${s.id}`);
          ids.add(s.id);
          await checkExercise(`${where}(${s.id})`, s);
        }
      }
    }
  } else {
    // position library: [{ id, fen, best: [uci...], line?: [...] }]
    for (const p of data) {
      const where = `${path.basename(f)}:${p.id}`;
      const c = legalFen(p.fen, where);
      if (!c) continue;
      if (p.best?.length) await checkMoves(where, p.fen, p.best);
      for (const v of p.variations ?? []) {
        const x = new Chess(p.fen);
        for (const u of v.moves) try { x.move(parse(u)); } catch { err(where, `variante "${v.name}" ilegal em ${u}`); break; }
      }
      for (const k of ["title", "objective", "difficulty", "category"]) if (!p[k]) err(where, `campo ${k} ausente`);
    }
  }
}
e.quit();
console.log(`\n${errors} erro(s), ${warnings} aviso(s)`);
process.exit(errors ? 1 : 0);
