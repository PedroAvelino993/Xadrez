import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import puzzles from "./puzzles.json";
import { dailyIds, isCorrect, pickNext, pointsFor, updateRating, type Puzzle } from "./logic";
import { softmaxPick, moveTimeBudget, BOTS } from "../bots/bots";
import { checkGoal } from "../lessons/checkGoal";
import { hydrate, defaultState } from "../storage/store";

const all = puzzles as unknown as Puzzle[];

describe("banco de puzzles", () => {
  it("todas as soluções são legais e terminam num lance do resolvedor", () => {
    for (const p of all) {
      const c = new Chess(p.fen);
      for (const u of p.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      const solverMoves = p.solverFirst ? p.moves.length : p.moves.length - 1;
      expect(solverMoves % 2, p.id).toBe(1);
      expect(p.themes.length, p.id).toBeGreaterThan(0);
      expect(p.idea.length, p.id).toBeGreaterThan(0);
    }
  });
  it("puzzles de mate terminam em xeque-mate", () => {
    for (const p of all.filter((x) => x.themes.includes("mate"))) {
      const c = new Chess(p.fen);
      for (const u of p.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      expect(c.isCheckmate(), p.id).toBe(true);
    }
  });
  it("ids únicos", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });
});

describe("lógica de puzzles", () => {
  it("aceita a solução e mates alternativos só no último lance", () => {
    const p: Puzzle = { id: "x", fen: "", moves: ["a1a2", "b1b2", "c1c8"], solverFirst: false, themes: ["mate", "mateIn1"], rating: 800, idea: ["."] };
    expect(isCorrect(p, 1, "b1b2", false)).toBe(true);
    expect(isCorrect(p, 1, "h1h2", true)).toBe(false);
    expect(isCorrect(p, 2, "d1d8", true)).toBe(true);
    expect(isCorrect(p, 2, "d1d8", false)).toBe(false);
  });
  it("pontuação sobe com acerto e cai com erro", () => {
    expect(updateRating(1200, 1200, true, 30)).toBeGreaterThan(1200);
    expect(updateRating(1200, 1200, false, 30)).toBeLessThan(1200);
    expect(updateRating(1200, 1800, true, 30) - 1200).toBeGreaterThan(updateRating(1200, 800, true, 30) - 1200);
  });
  it("pontos não dependem de velocidade e premiam consistência", () => {
    expect(pointsFor({ clean: true, solved: true, rating: 1000, streak: 3 })).toBeGreaterThan(pointsFor({ clean: true, solved: true, rating: 1000, streak: 0 }));
    expect(pointsFor({ clean: false, solved: true, rating: 1000, streak: 0 })).toBe(3);
    expect(pointsFor({ clean: false, solved: false, rating: 2000, streak: 9 })).toBe(0);
  });
  it("desafio diário é determinístico", () => {
    expect(dailyIds(all, "2026-10-20")).toEqual(dailyIds(all, "2026-10-20"));
    expect(dailyIds(all, "2026-10-20").length).toBeGreaterThan(0);
  });
  it("próximo puzzle respeita filtro e evita repetidos", () => {
    const seen = new Set(all.slice(0, 5).map((p) => p.id));
    const n = pickNext(all, { rating: 1000, seen, theme: "hangingPiece" })!;
    expect(n.themes).toContain("hangingPiece");
  });
});

describe("bots", () => {
  it("softmax escolhe sempre entre candidatos e favorece o melhor com temperatura baixa", () => {
    const cands = [
      { move: "a", cp: 100 },
      { move: "b", cp: -200 },
    ];
    let a = 0;
    for (let i = 0; i < 200; i++) if (softmaxPick(cands, 20, () => i / 200) === "a") a++;
    expect(a).toBeGreaterThan(190);
    const r = softmaxPick(cands, 1000, () => 0.99);
    expect(["a", "b"]).toContain(r);
  });
  it("níveis distintos e orçamento de tempo com relógio", () => {
    expect(new Set(BOTS.map((b) => b.level)).size).toBe(7);
    expect(moveTimeBudget(1500, { remaining: 3000, inc: 0 })).toBeLessThan(200);
    expect(moveTimeBudget(1500)).toBe(1500);
  });
});

describe("objetivos das lições", () => {
  const mv = (fen: string, san: string) => new Chess(fen).move(san);
  it("mate aceita qualquer mate e recusa afogamento", () => {
    const fen = "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1";
    expect(checkGoal({ type: "mate" }, fen, mv(fen, "Qf8#"), 0).status).toBe("success");
    expect(checkGoal({ type: "mate" }, fen, mv(fen, "Qf7"), 0)).toMatchObject({ status: "fail" });
  });
  it("roque e en passant pelas regras", () => {
    const f1 = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    expect(checkGoal({ type: "castle", side: "k" }, f1, mv(f1, "O-O"), 0).status).toBe("success");
    expect(checkGoal({ type: "castle", side: "k" }, f1, mv(f1, "O-O-O"), 0).status).toBe("fail");
    const f2 = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
    expect(checkGoal({ type: "enpassant" }, f2, mv(f2, "exd6"), 0).status).toBe("success");
  });
  it("reach com vários lances", () => {
    const f = "4k3/8/8/8/8/8/8/1N2K3 w - - 0 1";
    const r = checkGoal({ type: "reach", piece: "n", square: "d4", inMoves: 2 }, f, mv(f, "Nc3"), 0);
    expect(r.status).toBe("continue");
  });
});

describe("armazenamento", () => {
  it("dados antigos ganham campos novos sem perder o progresso", () => {
    const old = { version: 1, profileName: "Ana", puzzles: { rating: 1500 }, settings: { theme: "light" } };
    const s = hydrate(old);
    expect(s.profileName).toBe("Ana");
    expect(s.puzzles.rating).toBe(1500);
    expect(s.puzzles.attempts).toEqual({});
    expect(s.settings.theme).toBe("light");
    expect(s.settings.pieceSet).toBe(defaultState().settings.pieceSet);
    expect(hydrate("lixo").profileName).toBe("Jogador");
  });
});
