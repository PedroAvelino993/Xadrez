// Tags raw puzzles with themes detected on the actual solution line, estimates
// difficulty, writes a short explanation of the idea, and emits puzzles.json.
import { Chess } from "chess.js";
import fs from "node:fs";
import { Engine } from "./uci.mjs";

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME = { p: "o peão", n: "o cavalo", b: "o bispo", r: "a torre", q: "a dama", k: "o rei" };
const DIRS = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
DIRS.q = [...DIRS.r, ...DIRS.b];
const F = "abcdefgh";
const sqOf = (f, r) => F[f] + (r + 1);
const fr = (s) => [F.indexOf(s[0]), +s[1] - 1];
const uci = (m) => m.from + m.to + (m.promotion ?? "");
const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function material(c, color) {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p && p.type !== "k") s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
function targetsOf(c, sq) {
  const p = c.get(sq);
  if (!p) return [];
  const opp = p.color === "w" ? "b" : "w";
  const out = [];
  for (const row of c.board())
    for (const t of row) {
      if (!t || t.color !== opp) continue;
      if (!c.attackers(t.square, p.color).includes(sq)) continue;
      const defended = c.attackers(t.square, opp).length > 0;
      if (t.type === "k" || VAL[t.type] > VAL[p.type] || (!defended && t.type !== "p")) out.push(t);
    }
  return out;
}
// For a slider on sq: list of [first enemy, second piece] along rays
function rays(c, sq) {
  const p = c.get(sq);
  if (!p || !DIRS[p.type]) return [];
  const out = [];
  const [f0, r0] = fr(sq);
  for (const [df, dr] of DIRS[p.type]) {
    let f = f0 + df, r = r0 + dr, first = null;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const q = c.get(sqOf(f, r));
      if (q) {
        if (!first) { if (q.color === p.color) break; first = { ...q, square: sqOf(f, r) }; }
        else { out.push([first, { ...q, square: sqOf(f, r) }]); break; }
      }
      f += df; r += dr;
    }
  }
  return out;
}

function analyse(p) {
  const c = new Chess(p.fen);
  const all = [];
  for (const u of p.moves) all.push(c.move(parse(u)));
  const solverFirst = !!p.solverFirst;
  const solverIdx = all.map((_, i) => i).filter((i) => (solverFirst ? i % 2 === 0 : i % 2 === 1));
  const solver = all[solverIdx[0]].color;
  const themes = new Set();
  const ideas = [];
  const start = new Chess(p.fen);
  if (!solverFirst) start.move(parse(p.moves[0]));
  const mat0 = material(start, solver);
  const nSolver = solverIdx.length;
  const last = all[all.length - 1];

  if (p.kind === "mate") { themes.add(`mateIn${Math.min(nSolver, 4)}`); themes.add("mate"); }
  if (p.kind === "defense") themes.add("defense");
  if (p.kind === "end-pawn") themes.add("pawnEndgame");
  if (p.kind === "end-rook") themes.add("rookEndgame");

  // replay to inspect each solver move
  const b = new Chess(p.fen);
  let minMat = mat0;
  const later = (k) => all.slice(k + 1).filter((m) => m.color === solver);
  for (let k = 0; k < all.length; k++) {
    const before = new Chess(b.fen());
    const m = b.move(parse(p.moves[k]));
    if (m.color === solver) {
      // fork / double attack
      const tg = targetsOf(b, m.to);
      if (tg.length >= 2) {
        const cap = later(k).find((x) => x.captured && x.from === m.to);
        // the follow-up capture may lie beyond the verified line: accept a final
        // forking move when the engine confirmed a decisive result (finalCp)
        const decisiveEnd = k === all.length - 1 && (p.finalCp ?? 0) >= 300 && tg.some((t) => t.type === "k" || t.type === "q" || t.type === "r");
        if (cap || decisiveEnd) {
          themes.add(m.piece === "q" ? "doubleAttack" : "fork");
          if (m.piece !== "q") themes.add("doubleAttack");
          ideas.push(`${m.san} ataca ${tg.slice(0, 2).map((t) => `${NAME[t.type]} em ${t.square}`).join(" e ")} ao mesmo tempo.`);
        }
      }
      // pins and skewers created by the moved slider
      for (const [p1, p2] of rays(b, m.to)) {
        if (p2.color === solver) continue;
        const capP1 = later(k).find((x) => x.to === p1.square && x.captured);
        const capP2 = later(k).find((x) => x.to === p2.square && x.captured);
        if ((p2.type === "k" || VAL[p2.type] > VAL[p1.type]) && capP1 && p1.type !== "p") {
          themes.add("pin");
          ideas.push(`${m.san} crava ${NAME[p1.type]} em ${p1.square} contra ${NAME[p2.type]}.`);
        } else if ((p1.type === "k" || VAL[p1.type] > VAL[p2.type]) && capP2 && p2.type !== "p") {
          themes.add("skewer");
          ideas.push(`${m.san} é um espeto: ${NAME[p1.type]} precisa sair e ${NAME[p2.type]} em ${p2.square} fica exposto.`);
        }
      }
      // discovered attack: another solver slider now hits a valuable target
      for (const row of b.board())
        for (const s of row) {
          if (!s || s.color !== solver || s.square === m.to || !DIRS[s.type]) continue;
          for (const [p1] of rays(b, s.square)) {
            const was = rays(before, s.square).some(([q1]) => q1.square === p1.square);
            if (was) continue;
            const blockedBefore = lineBetween(s.square, p1.square, m.from);
            if (blockedBefore && (p1.type === "k" || VAL[p1.type] >= 5)) {
              themes.add("discoveredAttack");
              ideas.push(`Ao mover a peça com ${m.san}, ${NAME[s.type]} em ${s.square} passa a atacar ${NAME[p1.type]} (ataque descoberto).`);
            }
          }
        }
    } else if (k > 0 && all[k - 1].color === solver) {
      // deflection / overload: defender leaves (or is forced to recapture), solver lands on a square it guarded
      const nextSolver = all[k + 1];
      if (nextSolver && nextSolver.color === solver) {
        const guarded = before.attackers(nextSolver.to, m.color).includes(m.from);
        const nowGuarded = b.attackers(nextSolver.to, m.color).length > 0;
        if (guarded && !nowGuarded && (nextSolver.captured || nextSolver.san.includes("#"))) {
          const solePrev = before.attackers(nextSolver.to, m.color).length === 1;
          if (m.captured && m.to === all[k - 1].to && solePrev) {
            themes.add("overloading");
            ideas.push(`${NAME[m.piece][0].toUpperCase() + NAME[m.piece].slice(1)} adversário tinha duas tarefas: ao capturar em ${m.to}, deixa de proteger ${nextSolver.to}.`);
          } else {
            themes.add("deflection");
            ideas.push(`${all[k - 1].san} desvia ${NAME[m.piece]} que defendia ${nextSolver.to}.`);
          }
        }
      }
    }
    minMat = Math.min(minMat, material(b, solver));
  }
  const finalMat = material(b, solver);
  if (minMat <= mat0 - 2 && (b.isCheckmate() || finalMat >= mat0) && p.kind !== "defense") themes.add("sacrifice");

  // hanging piece: single capture of an undefended piece
  if (nSolver === 1 && p.kind === "tactic") {
    const s0 = all[solverIdx[0]];
    if (s0.captured && start.attackers(s0.to, s0.color === "w" ? "b" : "w").length === 0) {
      themes.add("hangingPiece");
      ideas.push(`${NAME[s0.captured][0].toUpperCase() + NAME[s0.captured].slice(1)} em ${s0.to} estava sem defesa.`);
    } else if (s0.captured) themes.add("winMaterial");
  }
  if (p.kind === "tactic" && !themes.size) themes.add("winMaterial");
  // endgame by material
  const pieces = start.board().flat().filter(Boolean).map((x) => x.type);
  if (!pieces.some((t) => "nbrq".includes(t))) themes.add("pawnEndgame");
  else if (!pieces.some((t) => "nbq".includes(t)) && pieces.includes("r")) themes.add("rookEndgame");
  if (nSolver >= 3 && p.kind !== "mate") themes.add("advancedCombo");
  if (themes.has("mate") && nSolver >= 3) themes.add("advancedCombo");

  if (!ideas.length && p.kind === "tactic") {
    const gain = finalMat - mat0;
    const line = all.filter((_, i) => solverIdx.includes(i)).map((m) => m.san).join(", ");
    ideas.push(gain >= 2 ? `A sequência ${line} ganha ${gain} pontos de material.` : `${line}: o Stockfish confirma vantagem decisiva depois deste lance.`);
  }
  // general idea text
  if (p.kind === "mate") ideas.unshift(`Mate forçado em ${nSolver}: ${all.filter((_, i) => solverIdx.includes(i)).map((m) => m.san).join(", ")}.`);
  if (p.kind === "defense") ideas.unshift(`Só ${all[1].san} segura a posição; os outros lances perdem material ou a partida.`);
  if (p.kind === "end-pawn" || p.kind === "end-rook") {
    ideas.unshift(p.mode === "draw" ? `Só ${all[0].san} garante o empate.` : `Só ${all[0].san} vence; os outros lances permitem o empate.`);
  }
  return { themes: [...themes], ideas: [...new Set(ideas)].slice(0, 2), solver, nSolver, last };
}

function lineBetween(a, b, x) {
  const [af, ar] = fr(a), [bf, br] = fr(b), [xf, xr] = fr(x);
  const df = Math.sign(bf - af), dr = Math.sign(br - ar);
  let f = af + df, r = ar + dr;
  while (f !== bf || r !== br) {
    if (f === xf && r === xr) return true;
    f += df; r += dr;
  }
  return false;
}

// ---- difficulty: smallest search that finds every solver move ----
const e = new Engine();
await e.init();
const LEVELS = [1, 16, 128, 1024];
async function difficulty(p) {
  const c = new Chess(p.fen);
  let total = 0;
  for (let i = 0; i < p.moves.length; i++) {
    const solverMove = p.solverFirst ? i % 2 === 0 : i % 2 === 1;
    if (solverMove) {
      let lvl = LEVELS.length;
      for (let j = 0; j < LEVELS.length; j++) {
        await e.newGame();
        const r = await e.analyse(c.fen(), { multipv: 1, nodes: LEVELS[j] });
        if (r.bestmove === p.moves[i] || (p.kind === "mate" && i === p.moves.length - 1 && mateMove(c, r.bestmove))) { lvl = j; break; }
      }
      total += lvl;
    }
    c.move(parse(p.moves[i]));
  }
  return total;
}
function mateMove(c, u) {
  try { const x = new Chess(c.fen()); x.move(parse(u)); return x.isCheckmate(); } catch { return false; }
}

// Transparent difficulty heuristic (puzzle "rating" is an estimate for ordering only).
function estimateRating(p, a, engineLevel) {
  const start = new Chess(p.fen);
  if (!p.solverFirst) start.move(parse(p.moves[0]));
  const first = new Chess(start.fen()).move(parse(p.moves[p.solverFirst ? 0 : 1]));
  let r = 600;
  r += (a.nSolver - 1) * 260;
  const forcing = first.san.includes("+") || first.captured;
  if (!forcing) r += 320;
  if (a.themes.includes("hangingPiece")) r -= 120;
  if (a.themes.includes("sacrifice")) r += 280;
  if (p.kind === "defense") r += 300;
  if (p.kind === "end-pawn") r += 250;
  if (p.kind === "end-rook") r += 380;
  for (const t of ["pin", "skewer", "discoveredAttack", "deflection", "overloading"]) if (a.themes.includes(t)) r += 140;
  r += Math.min(180, start.moves().length * 4);
  r += engineLevel * 60;
  return Math.round(Math.max(400, Math.min(2600, r)) / 10) * 10;
}

const files = fs.readdirSync(new URL("../data/", import.meta.url)).filter((f) => /^(raw|end)-.*\.jsonl$/.test(f));
const seen = new Set();
const out = [];
for (const f of files) {
  for (const line of fs.readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8").trim().split("\n")) {
    if (!line) continue;
    const p = JSON.parse(line);
    const key = p.fen.split(" ").slice(0, 4).join(" ") + p.moves.join("");
    if (seen.has(key)) continue;
    seen.add(key);
    // drop near-empty boards outside endgame sets
    const nonKing = new Chess(p.fen).board().flat().filter((x) => x && x.type !== "k").length;
    if (!p.kind.startsWith("end") && nonKing < 5) continue;
    const a = analyse(p);
    const d = await difficulty(p);
    const rating = estimateRating(p, a, d);
    out.push({
      id: "",
      fen: p.fen,
      moves: p.moves,
      solverFirst: !!p.solverFirst,
      themes: a.themes,
      rating,
      idea: a.ideas,
      ...(p.mode ? { goal: p.mode } : {}),
    });
  }
}
out.sort((x, y) => x.rating - y.rating || x.fen.localeCompare(y.fen));
out.forEach((p, i) => (p.id = "p" + String(i + 1).padStart(4, "0")));
fs.writeFileSync(process.argv[2] ?? new URL("../data/puzzles.json", import.meta.url), JSON.stringify(out));
const tally = {};
for (const p of out) for (const t of p.themes) tally[t] = (tally[t] ?? 0) + 1;
console.log(out.length, "puzzles", tally);
e.quit();
