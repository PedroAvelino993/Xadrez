import { Chess, type Move } from "chess.js";
import type { Goal } from "./types";

export type GoalResult =
  | { status: "success" }
  | { status: "continue"; fen: string; reply?: string } // keep playing from fen (reply = opponent move already applied, UCI)
  | { status: "fail"; message: string };

function flipTurn(fen: string): string {
  const p = fen.split(" ");
  p[1] = p[1] === "w" ? "b" : "w";
  p[3] = "-";
  return p.join(" ");
}

const NOME: Record<string, string> = { p: "o peão", n: "o cavalo", b: "o bispo", r: "a torre", q: "a dama", k: "o rei" };

/**
 * Checks a move against an exercise goal using the real rules (chess.js).
 * `step` counts the solver moves already made in this exercise.
 */
export function checkGoal(goal: Goal, fenBefore: string, mv: Move, step: number): GoalResult {
  const after = new Chess(mv.after);
  const uci = mv.from + mv.to + (mv.promotion ?? "");
  switch (goal.type) {
    case "reach": {
      if (mv.piece === goal.piece && mv.to === goal.square) return { status: "success" };
      const limit = goal.inMoves ?? 1;
      if (mv.piece === goal.piece && step + 1 < limit && !after.isCheckmate()) {
        try {
          const f = flipTurn(mv.after);
          new Chess(f);
          return { status: "continue", fen: f };
        } catch {
          /* fall through */
        }
      }
      return { status: "fail", message: mv.piece !== goal.piece ? `Mova ${NOME[goal.piece]}.` : `Ainda não chegou em ${goal.square}${limit > 1 ? ` (máximo de ${limit} lances)` : ""}.` };
    }
    case "capture":
      return mv.to === goal.square && mv.captured ? { status: "success" } : { status: "fail", message: `Capture a peça em ${goal.square}.` };
    case "check":
      return after.inCheck() ? { status: "success" } : { status: "fail", message: "Esse lance não dá xeque." };
    case "mate":
      if (after.isCheckmate()) return { status: "success" };
      if (after.isStalemate()) return { status: "fail", message: "Cuidado: isso é afogamento (empate), não mate!" };
      return { status: "fail", message: after.inCheck() ? "É xeque, mas o rei ainda tem saída." : "Esse lance não dá xeque-mate." };
    case "stalemate":
      return after.isStalemate() ? { status: "success" } : { status: "fail", message: "O adversário ainda tem lances legais (ou está em xeque)." };
    case "castle": {
      const ok = goal.side === "q" ? mv.flags.includes("q") : goal.side === "k" ? mv.flags.includes("k") : /[kq]/.test(mv.flags);
      return ok ? { status: "success" } : { status: "fail", message: goal.side === "q" ? "Faça o roque grande (o rei anda duas casas em direção à torre da coluna a)." : goal.side === "k" ? "Faça o roque pequeno (o rei anda duas casas em direção à torre da coluna h)." : "Faça o roque: mova o rei duas casas em direção a uma torre." };
    }
    case "enpassant":
      return mv.flags.includes("e") ? { status: "success" } : { status: "fail", message: "Capture en passant: o peão vai para a casa que o peão adversário pulou." };
    case "promote":
      if (!mv.promotion) return { status: "fail", message: "Leve um peão até a última fileira." };
      if (goal.piece && mv.promotion !== goal.piece) return { status: "fail", message: `Promova a ${NOME[goal.piece].split(" ")[1]}.` };
      return { status: "success" };
    case "safe": {
      if (mv.from !== goal.square) return { status: "fail", message: `Salve a peça que está em ${goal.square}.` };
      const opp = mv.color === "w" ? "b" : "w";
      return after.attackers(mv.to, opp).length === 0 ? { status: "success" } : { status: "fail", message: "Nessa casa a peça continua sendo atacada." };
    }
    case "moves":
      return goal.accept.includes(uci) ? { status: "success" } : { status: "fail", message: "Não é o melhor lance aqui. Tente de novo!" };
    case "sequence": {
      const i = step * 2;
      if (goal.moves[i] !== uci && !(i === goal.moves.length - 1 && after.isCheckmate())) return { status: "fail", message: "Não é esse lance. Tente de novo!" };
      if (i + 1 >= goal.moves.length) return { status: "success" };
      const reply = goal.moves[i + 1];
      const c = new Chess(mv.after);
      c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
      if (i + 2 >= goal.moves.length) return { status: "success" };
      return { status: "continue", fen: c.fen(), reply };
    }
  }
  void fenBefore;
  return { status: "fail", message: "Objetivo desconhecido." };
}

export function goalLabel(goal: Goal): string {
  switch (goal.type) {
    case "mate":
      return "Dê xeque-mate";
    case "check":
      return "Dê xeque";
    case "castle":
      return "Faça o roque";
    case "enpassant":
      return "Capture en passant";
    case "promote":
      return "Promova o peão";
    case "stalemate":
      return "Afogue o adversário";
    case "capture":
      return "Capture a peça";
    case "safe":
      return "Salve a peça atacada";
    case "reach":
      return "Leve a peça até a casa marcada";
    default:
      return "Encontre o melhor lance";
  }
}
