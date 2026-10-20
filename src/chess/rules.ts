// Chess rules helpers. All legality checks go through chess.js; this module
// only adds stricter FEN validation, result detection and PGN helpers.
import { Chess, validateFen as cjsValidateFen, type Move } from "chess.js";
import type { Color, EndReason, GameResult, MoveRecord, PieceType } from "../types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const FILES = "abcdefgh";

export const PIECE_NAME: Record<PieceType, string> = {
  p: "peão",
  n: "cavalo",
  b: "bispo",
  r: "torre",
  q: "dama",
  k: "rei",
};
export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const COLOR_NAME: Record<Color, string> = { w: "Brancas", b: "Pretas" };

export function squareName(file: number, rank: number) {
  return FILES[file] + (rank + 1);
}
export function fileOf(sq: string) {
  return FILES.indexOf(sq[0]);
}
export function rankOf(sq: string) {
  return +sq[1] - 1;
}

export interface FenCheck {
  ok: boolean;
  error?: string;
}

/** chess.js validation plus the checks a position editor needs. */
export function validateFen(fen: string): FenCheck {
  const f = fen.trim().replace(/\s+/g, " ");
  const basic = cjsValidateFen(f);
  if (!basic.ok) return { ok: false, error: traduzirErroFen(basic.error ?? "") };
  const [placement, turn] = f.split(" ");
  const rows = placement.split("/");
  let wk = 0,
    bk = 0;
  for (let r = 0; r < 8; r++) {
    for (const ch of rows[r]) {
      if (ch === "K") wk++;
      if (ch === "k") bk++;
      if ((ch === "p" || ch === "P") && (r === 0 || r === 7)) return { ok: false, error: "Há peões na primeira ou na última fileira." };
    }
  }
  if (wk !== 1 || bk !== 1) return { ok: false, error: "Cada lado precisa ter exatamente um rei." };
  let c: Chess;
  try {
    c = new Chess(f);
  } catch (e) {
    return { ok: false, error: traduzirErroFen(String((e as Error).message)) };
  }
  // the side that is NOT to move may not be in check
  const other = turn === "w" ? "b" : "w";
  const kingSq = findKing(c, other);
  if (kingSq && c.isAttacked(kingSq as never, turn as Color)) {
    return { ok: false, error: "O lado que não tem a vez está em xeque — posição impossível." };
  }
  return { ok: true };
}

function traduzirErroFen(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("6 space")) return "A FEN precisa ter 6 campos separados por espaço.";
  if (m.includes("move number")) return "Número do lance inválido.";
  if (m.includes("half move") || m.includes("half-move")) return "Contador de meio-lances inválido.";
  if (m.includes("en-passant") || m.includes("en passant")) return "Casa de en passant inválida.";
  if (m.includes("castling")) return "Direitos de roque inválidos.";
  if (m.includes("side to move") || m.includes("turn")) return "Indique quem joga: w (brancas) ou b (pretas).";
  if (m.includes("8 rows") || m.includes("rank")) return "O tabuleiro precisa ter 8 fileiras com 8 casas cada.";
  if (m.includes("king")) return "Posição de reis inválida.";
  return "FEN inválida.";
}

export function findKing(c: Chess, color: Color): string | null {
  const b = c.board();
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = b[r][f];
      if (p && p.type === "k" && p.color === color) return p.square;
    }
  return null;
}

export interface Status {
  over: boolean;
  result: GameResult;
  reason?: EndReason;
}

export function gameStatus(c: Chess): Status {
  if (c.isCheckmate()) return { over: true, result: c.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
  if (c.isStalemate()) return { over: true, result: "1/2-1/2", reason: "stalemate" };
  if (c.isInsufficientMaterial()) return { over: true, result: "1/2-1/2", reason: "insufficient" };
  if (c.isThreefoldRepetition()) return { over: true, result: "1/2-1/2", reason: "repetition" };
  if (c.isDrawByFiftyMoves()) return { over: true, result: "1/2-1/2", reason: "fifty" };
  return { over: false, result: "*" };
}

/** Can `color` still checkmate with the material it has (for timeouts, FIDE 6.9)? */
export function canStillMate(c: Chess, color: Color): boolean {
  const own: PieceType[] = [];
  for (const row of c.board()) for (const p of row) if (p && p.color === color && p.type !== "k") own.push(p.type);
  if (own.length === 0) return false;
  if (own.some((t) => t === "p" || t === "r" || t === "q")) return true;
  if (own.length === 1) {
    // lone minor piece can only mate if the opponent has blocking material
    const opp: PieceType[] = [];
    for (const row of c.board()) for (const p of row) if (p && p.color !== color && p.type !== "k") opp.push(p.type);
    return opp.length > 0;
  }
  return true;
}

export const REASON_TEXT: Record<EndReason, string> = {
  checkmate: "por xeque-mate",
  stalemate: "por afogamento",
  repetition: "por repetição tripla",
  fifty: "pela regra dos 50 lances",
  insufficient: "por material insuficiente",
  timeout: "por tempo",
  "timeout-insufficient": "tempo esgotado contra material insuficiente",
  resign: "por desistência",
  agreement: "por acordo",
  abandoned: "partida abandonada",
};

export function toRecord(m: Move): MoveRecord {
  return {
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ""),
    from: m.from,
    to: m.to,
    color: m.color,
    piece: m.piece as PieceType,
    captured: m.captured as PieceType | undefined,
    promotion: m.promotion as PieceType | undefined,
    fenBefore: m.before,
    fenAfter: m.after,
  };
}

export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

/** Plays a UCI move list from a FEN; returns null if any move is illegal. */
export function playUciLine(fen: string, ucis: string[]): { chess: Chess; records: MoveRecord[] } | null {
  const c = new Chess(fen);
  const records: MoveRecord[] = [];
  for (const u of ucis) {
    try {
      records.push(toRecord(c.move(parseUci(u))));
    } catch {
      return null;
    }
  }
  return { chess: c, records };
}

export function sanLineFromUci(fen: string, ucis: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of ucis) {
    try {
      out.push(c.move(parseUci(u)).san);
    } catch {
      break;
    }
  }
  return out;
}

export interface PgnHeaders {
  [k: string]: string;
}

export function buildPgn(startFen: string, sans: string[], headers: PgnHeaders, result: GameResult = "*"): string {
  const c = new Chess(startFen);
  const h: PgnHeaders = {
    Event: "Partida casual",
    Site: "Lance Certo",
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    Round: "-",
    White: "?",
    Black: "?",
    ...headers,
    Result: result,
  };
  if (startFen !== START_FEN) {
    h.SetUp = "1";
    h.FEN = startFen;
  }
  for (const [k, v] of Object.entries(h)) c.setHeader(k, v);
  for (const s of sans) c.move(s);
  let pgn = c.pgn({ maxWidth: 80 });
  if (!/(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(pgn)) pgn += " " + result;
  return pgn;
}

export interface ParsedPgn {
  startFen: string;
  records: MoveRecord[];
  headers: Record<string, string>;
}

export function parsePgn(text: string): ParsedPgn {
  const c = new Chess();
  try {
    c.loadPgn(text.trim());
  } catch (e) {
    throw new Error("PGN inválido: " + String((e as Error).message).slice(0, 120));
  }
  const headers = c.getHeaders() as Record<string, string>;
  const startFen = headers.FEN && headers.SetUp !== "0" ? headers.FEN : START_FEN;
  const verbose = c.history({ verbose: true });
  return { startFen, records: verbose.map(toRecord), headers };
}

export function materialCount(fen: string): { w: number; b: number; capturedByW: PieceType[]; capturedByB: PieceType[] } {
  const counts: Record<string, number> = {};
  for (const ch of fen.split(" ")[0]) if (/[pnbrqkPNBRQK]/.test(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
  const full: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const capturedByW: PieceType[] = [];
  const capturedByB: PieceType[] = [];
  let w = 0,
    b = 0;
  for (const t of ["q", "r", "b", "n", "p"] as PieceType[]) {
    const wc = counts[t.toUpperCase()] ?? 0;
    const bc = counts[t] ?? 0;
    w += wc * PIECE_VALUE[t];
    b += bc * PIECE_VALUE[t];
    for (let i = bc; i < full[t]; i++) capturedByW.push(t);
    for (let i = wc; i < full[t]; i++) capturedByB.push(t);
  }
  return { w, b, capturedByW, capturedByB };
}

export function turnOf(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export function moveNumberLabel(plyIndexFromStart: number, startFen: string): string {
  const startMove = +startFen.split(" ")[5] || 1;
  const startBlack = turnOf(startFen) === "b";
  const ply = plyIndexFromStart + (startBlack ? 1 : 0);
  const n = startMove + Math.floor(ply / 2);
  return ply % 2 === 0 ? `${n}.` : `${n}...`;
}
