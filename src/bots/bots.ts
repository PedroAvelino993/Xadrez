// Bot opponents. Every move comes from a Stockfish search of the real position:
//  - levels 1–6 ask for several candidate moves (MultiPV) at a limited depth
//    and pick one with a softmax over their evaluations ("temperature"):
//    weaker bots search shallower and accept bigger evaluation losses, so
//    their mistakes are plausible, legal moves rather than random ones;
//    (Stockfish's own UCI_Elo limiter is supported by the engine wrapper, but
//    in our matches it played below the depth-limited levels, so it is unused);
//  - level 7 is the engine without artificial limits (only a time budget).
// The ordering of the levels is checked with bot-vs-bot matches
// (scripts/bot-match.ts). Ratings are rough estimates, not official ratings.
import type { Color, PieceType } from "../types";
import type { Engine, SearchOptions } from "../engine/stockfish";
import { scoreCp } from "../engine/score";

export interface Bot {
  id: string;
  name: string;
  level: number;
  levelName: string;
  rating: number; // estimated
  piece: PieceType;
  color: string;
  style: string;
  description: string;
  /** minimum wall-clock "thinking" time so instant replies don't feel abrupt */
  minThinkMs: number;
  policy:
    | { kind: "softmax"; depth: number; multipv: number; temperature: number }
    | { kind: "elo"; elo: number; movetime: number }
    | { kind: "full"; movetime: number };
}

export const BOTS: Bot[] = [
  {
    id: "pipo",
    name: "Pipo",
    level: 1,
    levelName: "Iniciante",
    rating: 400,
    piece: "p",
    color: "#7aa35a",
    style: "Aprendendo as regras",
    description: "Conhece os movimentos, mas ainda deixa peças sem defesa e quase não percebe ameaças. Ótimo para os primeiros jogos.",
    minThinkMs: 650,
    policy: { kind: "softmax", depth: 2, multipv: 12, temperature: 320 },
  },
  {
    id: "lia",
    name: "Lia",
    level: 2,
    levelName: "Fácil",
    rating: 800,
    piece: "n",
    color: "#5aa0a3",
    style: "Ataques simples",
    description: "Gosta de atacar e captura peças soltas, mas ainda comete erros táticos de vez em quando.",
    minThinkMs: 650,
    policy: { kind: "softmax", depth: 4, multipv: 10, temperature: 170 },
  },
  {
    id: "bruno",
    name: "Bruno",
    level: 3,
    levelName: "Intermediário",
    rating: 1200,
    piece: "b",
    color: "#6b84c9",
    style: "Jogo equilibrado",
    description: "Desenvolve as peças, faz roque e aproveita erros grosseiros. Comete imprecisões em posições complicadas.",
    minThinkMs: 700,
    policy: { kind: "softmax", depth: 6, multipv: 7, temperature: 90 },
  },
  {
    id: "clara",
    name: "Clara",
    level: 4,
    levelName: "Avançado",
    rating: 1500,
    piece: "r",
    color: "#a07ac9",
    style: "Posicional e paciente",
    description: "Joga com planos claros e pune descuidos, mas ainda deixa escapar algumas oportunidades.",
    minThinkMs: 700,
    policy: { kind: "softmax", depth: 9, multipv: 5, temperature: 40 },
  },
  {
    id: "rafael",
    name: "Rafael",
    level: 5,
    levelName: "Especialista",
    rating: 1900,
    piece: "q",
    color: "#c98a5a",
    style: "Tático e agressivo",
    description: "Calcula combinações com cuidado e explora fraquezas no rei. Raramente erra feio.",
    minThinkMs: 600,
    policy: { kind: "softmax", depth: 11, multipv: 4, temperature: 22 },
  },
  {
    id: "helena",
    name: "Helena",
    level: 6,
    levelName: "Mestre",
    rating: 2300,
    piece: "k",
    color: "#c95a6b",
    style: "Técnica de mestre",
    description: "Converte vantagens com precisão e defende bem. Calcula fundo e quase não erra.",
    minThinkMs: 500,
    policy: { kind: "softmax", depth: 15, multipv: 2, temperature: 6 },
  },
  {
    id: "stockfish",
    name: "Stockfish 18",
    level: 7,
    levelName: "Força máxima",
    rating: 3000,
    piece: "k",
    color: "#3b4249",
    style: "Motor sem limitação",
    description: "O motor Stockfish 18 (versão leve para navegador) sem limitação artificial de força. Só o tempo de cálculo é limitado.",
    minThinkMs: 300,
    policy: { kind: "full", movetime: 1500 },
  },
];

export function botById(id: string): Bot {
  return BOTS.find((b) => b.id === id) ?? BOTS[2];
}

/** Time budget for one move given the bot's clock (ms). */
export function moveTimeBudget(defaultMs: number, clock?: { remaining: number; inc: number }): number {
  if (!clock) return defaultMs;
  const share = clock.remaining / 30 + clock.inc * 0.8;
  return Math.max(80, Math.min(defaultMs, share));
}

/** Weighted choice among engine candidates (exported for tests). */
export function softmaxPick(cands: { move: string; cp: number }[], temperature: number, rnd = Math.random): string {
  const best = Math.max(...cands.map((c) => c.cp));
  const weights = cands.map((c) => Math.exp(-(best - c.cp) / Math.max(1, temperature)));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < cands.length; i++) {
    x -= weights[i];
    if (x <= 0) return cands[i].move;
  }
  return cands[cands.length - 1].move;
}

export interface BotMoveRequest {
  bot: Bot;
  fen: string;
  engine: Engine;
  clock?: { remaining: number; inc: number };
}

export interface BotMoveHandle {
  promise: Promise<string>;
  cancel: () => void;
}

export function requestBotMove({ bot, fen, engine, clock }: BotMoveRequest): BotMoveHandle {
  const p = bot.policy;
  const mover: Color = fen.split(" ")[1] === "b" ? "b" : "w";
  let opts: SearchOptions;
  if (p.kind === "softmax") opts = { depth: p.depth, multipv: p.multipv };
  else if (p.kind === "elo") opts = { elo: p.elo, movetime: moveTimeBudget(p.movetime, clock) };
  else opts = { movetime: moveTimeBudget(p.movetime, clock) };
  const h = engine.search(fen, opts);
  const promise = h.promise.then((res) => {
    if (p.kind === "softmax" && res.lines.length > 1) {
      // keep only lines searched at the final depth so evaluations are comparable
      const d = Math.max(...res.lines.map((l) => l.depth));
      const cands = res.lines
        .filter((l) => l.depth >= d - 1 && l.pv.length)
        .map((l) => ({ move: l.pv[0], cp: (mover === "w" ? 1 : -1) * scoreCp(l.score) }));
      return softmaxPick(cands, p.temperature);
    }
    if (!res.bestmove) throw new Error("O motor não encontrou lance.");
    return res.bestmove;
  });
  return { promise, cancel: h.cancel };
}
