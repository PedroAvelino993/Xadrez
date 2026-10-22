// Short, verifiable explanations for a move. Every sentence is produced only
// when its condition is checked on the actual position (legal moves, attacks,
// material along the engine's principal variation). When nothing specific can
// be confirmed, the text sticks to the evaluation change and the engine's
// preferred move.
import { Chess, type Square as Sq } from "chess.js";
import type { Classification, Color, PieceType, Score } from "../types";
import { PIECE_VALUE, parseUci, sanLineFromUci } from "../chess/rules";
import { formatScore } from "../engine/score";

const ARTIGO: Record<PieceType, string> = { p: "o peão", n: "o cavalo", b: "o bispo", r: "a torre", q: "a dama", k: "o rei" };

export interface ExplainInput {
  fenBefore: string;
  fenAfter: string;
  played: string; // uci
  san: string;
  mover: Color;
  before: Score;
  after: Score;
  bestPv: string[]; // from fenBefore
  replyPv: string[]; // from fenAfter
  cls: Classification;
  ply: number;
}

function material(c: Chess, color: Color): number {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type as PieceType];
  return s;
}

/** Material change for `color` along a PV, measured once the captures settle. */
export function pvMaterialGain(fen: string, pv: string[], color: Color, maxPlies = 8): number {
  const c = new Chess(fen);
  const start = material(c, color);
  let last = start;
  for (let i = 0; i < Math.min(maxPlies, pv.length); i++) {
    let m;
    try {
      m = c.move(parseUci(pv[i]));
    } catch {
      break;
    }
    last = material(c, color);
    // stop at the first quiet move after the exchange sequence
    if (!m.captured && !m.promotion && i >= 1) break;
  }
  return last - start;
}

/** Opponent pieces attacked by the piece on `sq` that are worth more than it, undefended, or the king. */
export function forkTargets(c: Chess, sq: string): { type: PieceType; square: string }[] {
  const p = c.get(sq as Sq);
  if (!p) return [];
  const opp: Color = p.color === "w" ? "b" : "w";
  const out: { type: PieceType; square: string }[] = [];
  for (const row of c.board())
    for (const t of row) {
      if (!t || t.color !== opp) continue;
      const attackers = c.attackers(t.square, p.color);
      if (!attackers.includes(sq as Sq)) continue;
      const defended = c.attackers(t.square, opp).length > 0;
      if (t.type === "k" || PIECE_VALUE[t.type as PieceType] > PIECE_VALUE[p.type as PieceType] || !defended) out.push({ type: t.type as PieceType, square: t.square });
    }
  return out;
}

/** Does `side` have a mate in one in this position? Returns the SAN if so. */
export function mateInOne(fen: string): string | null {
  const c = new Chess(fen);
  for (const m of c.moves({ verbose: true })) {
    c.move(m);
    const mate = c.isCheckmate();
    c.undo();
    if (mate) return m.san;
  }
  return null;
}

/** Same position with the other side to move (only valid if nobody is in check). */
function passTurn(fen: string): string | null {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  const f = parts.join(" ");
  try {
    const c = new Chess(f);
    if (c.inCheck()) return null;
    return f;
  } catch {
    return null;
  }
}

function listTargets(t: { type: PieceType; square: string }[]): string {
  const names = t.slice(0, 3).map((x) => `${ARTIGO[x.type]} em ${x.square}`);
  return names.length > 1 ? names.slice(0, -1).join(", ") + " e " + names[names.length - 1] : names[0];
}

export function explainMove(i: ExplainInput): string[] {
  try {
    return explainUnsafe(i);
  } catch {
    // never break the page because of an explanation: fall back to the facts we always have
    return [`A avaliação passou de ${formatScore(i.before)} para ${formatScore(i.after)}.`];
  }
}

function explainUnsafe(i: ExplainInput): string[] {
  const out: string[] = [];
  const opp: Color = i.mover === "w" ? "b" : "w";
  const good = i.cls === "best" || i.cls === "excellent" || i.cls === "good" || i.cls === "book" || i.cls === "forced";
  const after = new Chess(i.fenAfter);
  const moveTo = i.played.slice(2, 4);

  if (after.isCheckmate()) return ["Xeque-mate! A partida termina."];
  if (after.isStalemate()) out.push("O adversário fica sem lances legais e não está em xeque: é afogamento, empate.");

  // mate threats (mate in one, checked by brute force on legal moves)
  const passed = passTurn(i.fenBefore);
  const threat = passed && !new Chess(i.fenBefore).inCheck() ? mateInOne(passed) : null;
  const nowMate = mateInOne(i.fenAfter);
  if (threat && !nowMate) out.push(`O adversário ameaçava xeque-mate com ${threat}, e este lance impede a ameaça.`);

  const oppMates = i.after.mate !== undefined && (opp === "w" ? i.after.mate > 0 : i.after.mate < 0);
  const moverHadMate = i.before.mate !== undefined && (i.mover === "w" ? i.before.mate > 0 : i.before.mate < 0);
  const moverHasMate = i.after.mate !== undefined && (i.mover === "w" ? i.after.mate > 0 : i.after.mate < 0);

  if (oppMates) {
    const n = Math.abs(i.after.mate!);
    const line = sanLineFromUci(i.fenAfter, i.replyPv.slice(0, Math.min(2 * n - 1, 5)));
    out.push(n === 1 ? `Este lance permite xeque-mate imediato: ${nowMate ?? line[0]}.` : `Este lance permite um xeque-mate forçado em ${n}: ${line.join(" ")}.`);
  } else if (moverHadMate && !moverHasMate && i.bestPv.length) {
    const n = Math.abs(i.before.mate!);
    out.push(`Havia um xeque-mate forçado em ${n} começando com ${sanLineFromUci(i.fenBefore, i.bestPv.slice(0, 1))[0]}.`);
  }

  // material lost after the move
  if (!good && !oppMates && i.replyPv.length) {
    const oppGain = pvMaterialGain(i.fenAfter, i.replyPv, opp);
    if (oppGain >= 2) {
      const c = new Chess(i.fenAfter);
      let capture: { san: string; type: PieceType; square: string; undefended: boolean } | null = null;
      for (const u of i.replyPv.slice(0, 4)) {
        const mover = c.turn();
        const tsq = u.slice(2, 4) as Sq;
        const target = c.get(tsq);
        const undefended = target ? c.attackers(tsq, target.color).length === 0 : false;
        let m;
        try {
          m = c.move(parseUci(u));
        } catch {
          break;
        }
        if (mover === opp && m.captured && target) {
          capture = { san: m.san, type: target.type as PieceType, square: tsq, undefended };
          break;
        }
      }
      if (capture && capture.undefended) out.push(`Esse lance deixa ${ARTIGO[capture.type]} em ${capture.square} sem defesa: ${capture.san} ganha material.`);
      else if (capture) out.push(`Depois de ${capture.san}, o adversário ganha material (${ARTIGO[capture.type].split(" ")[1]}).`);
      else out.push(`A sequência ${sanLineFromUci(i.fenAfter, i.replyPv.slice(0, 3)).join(" ")} faz o adversário ganhar material.`);
    }
  }

  // missed gain of material
  if (!good && !oppMates && i.bestPv.length && i.bestPv[0] !== i.played) {
    const myGain = pvMaterialGain(i.fenBefore, i.bestPv, i.mover);
    if (myGain >= 2 && !moverHadMate) {
      const c = new Chess(i.fenBefore);
      const target = c.get(i.bestPv[0].slice(2, 4) as Sq);
      const m = c.move(parseUci(i.bestPv[0]));
      const forks = forkTargets(c, m.to);
      if (forks.length >= 2) out.push(`Você poderia ganhar material com um garfo: ${m.san} ataca ${listTargets(forks)}.`);
      else if (m.captured && target) out.push(`Você poderia ganhar material com ${m.san}, capturando ${ARTIGO[target.type as PieceType]}.`);
      else out.push(`Você poderia ganhar material com ${m.san}.`);
    }
  }

  // positive patterns of the played move
  if (good) {
    const p = after.get(moveTo as Sq);
    if (p && p.color === i.mover) {
      const forks = forkTargets(after, moveTo);
      if (forks.length >= 2) out.push(`Ataque duplo: ${i.san} ataca ${listTargets(forks)} ao mesmo tempo.`);
    }
    if (i.san.startsWith("O-O")) out.push("O roque coloca o rei em segurança e conecta as torres.");
    const mv = new Chess(i.fenBefore).move(parseUci(i.played));
    if (mv.promotion) out.push(`O peão é promovido a ${ARTIGO[mv.promotion as PieceType].split(" ")[1]}.`);
    if (mv.captured && PIECE_VALUE[mv.captured as PieceType] === PIECE_VALUE[mv.piece as PieceType] && mv.piece !== "p") {
      const lead = material(new Chess(i.fenBefore), i.mover);
      if (lead >= 2) out.push("Com vantagem material, trocar peças simplifica a posição e favorece quem está à frente.");
    }
    if (i.ply < 20 && (mv.piece === "n" || mv.piece === "b") && (mv.from[1] === "1" || mv.from[1] === "8") && !mv.captured)
      out.push("Desenvolve uma peça menor, seguindo os princípios de abertura.");
    if (i.cls === "book") out.push("Lance conhecido da teoria de aberturas.");
    if (i.cls === "forced") out.push("Era o único lance legal.");
  }

  if (moverHasMate && !moverHadMate && good) {
    out.push(`Agora há um xeque-mate forçado em ${Math.abs(i.after.mate!)}.`);
  }

  if (!out.length) {
    if (good) out.push(i.cls === "best" ? `O melhor lance segundo o motor. A avaliação fica em ${formatScore(i.after)}.` : `Mantém a avaliação praticamente igual (${formatScore(i.after)}).`);
    else out.push(`A avaliação passou de ${formatScore(i.before)} para ${formatScore(i.after)}.`);
  }
  return out.slice(0, 3);
}
