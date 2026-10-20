import { describe, expect, it } from "vitest";
import { classify, gameAccuracy, moveAccuracy, winLoss } from "./classify";
import { explainMove, forkTargets, mateInOne, pvMaterialGain } from "./explain";
import { winPctWhite, formatScore, scoreCp } from "../engine/score";
import { Chess } from "chess.js";

describe("modelo de chance de vitória", () => {
  it("é simétrico e limitado", () => {
    expect(winPctWhite({ cp: 0 })).toBeCloseTo(50);
    expect(winPctWhite({ cp: 300 }) + winPctWhite({ cp: -300 })).toBeCloseTo(100);
    expect(winPctWhite({ mate: 3 })).toBe(100);
    expect(winPctWhite({ mate: -2 })).toBe(0);
  });
  it("formata avaliações", () => {
    expect(formatScore({ cp: 123 })).toBe("+1.2");
    expect(formatScore({ cp: -50 })).toBe("-0.5");
    expect(formatScore({ mate: 2 })).toBe("M2");
    expect(formatScore({ mate: -4 })).toBe("-M4");
    expect(formatScore({ cp: 100000 })).toBe("1-0");
    expect(scoreCp({ mate: 1 })).toBeGreaterThan(scoreCp({ mate: 5 }));
  });
});

describe("classificação dos lances", () => {
  const base = { played: "e2e4", best: "d2d4", legalCount: 20, isBook: false };
  it("melhor lance quando igual à escolha do motor", () => {
    expect(classify({ ...base, mover: "w", before: { cp: 30 }, after: { cp: 10 }, played: "d2d4" })).toBe("best");
  });
  it("não pune lance diferente que mantém a avaliação", () => {
    expect(classify({ ...base, mover: "w", before: { cp: 30 }, after: { cp: 28 } })).toBe("best");
  });
  it("mesma perda pesa mais em posição equilibrada do que em posição ganha", () => {
    const equal = classify({ ...base, mover: "w", before: { cp: 0 }, after: { cp: -300 } });
    const won = classify({ ...base, mover: "w", before: { cp: 1200 }, after: { cp: 900 } });
    expect(equal).toBe("blunder");
    expect(["best", "excellent", "good"]).toContain(won);
  });
  it("considera o ponto de vista das pretas", () => {
    expect(classify({ ...base, mover: "b", before: { cp: 0 }, after: { cp: 400 } })).toBe("blunder");
    expect(classify({ ...base, mover: "b", before: { cp: 0 }, after: { cp: -40 } })).not.toBe("blunder");
  });
  it("permitir mate é erro grave; lance único é forçado; teoria é teórico", () => {
    expect(classify({ ...base, mover: "w", before: { cp: 50 }, after: { mate: -1 } })).toBe("blunder");
    expect(classify({ ...base, mover: "w", before: { cp: 50 }, after: { mate: -1 }, legalCount: 1 })).toBe("forced");
    expect(classify({ ...base, mover: "w", before: { cp: 20 }, after: { cp: 20 }, isBook: true })).toBe("book");
  });
  it("gradua imprecisão, erro e erro grave", () => {
    const l = (after: number) => classify({ ...base, mover: "w", before: { cp: 0 }, after: { cp: after } });
    expect(l(-60)).toBe("inaccuracy");
    expect(l(-150)).toBe("mistake");
    expect(l(-350)).toBe("blunder");
    expect(winLoss({ mover: "w", before: { cp: 0 }, after: { cp: 100 } })).toBe(0);
  });
});

describe("precisão", () => {
  it("lance perfeito ≈ 100 e perda grande ≈ 0", () => {
    expect(moveAccuracy(0)).toBeGreaterThan(99.9);
    expect(moveAccuracy(60)).toBeLessThan(5);
  });
  it("partida sem erros tem precisão alta para os dois", () => {
    const seq = [50, 51, 50, 52, 51, 50, 51];
    expect(gameAccuracy(seq, "w", "w")!).toBeGreaterThan(95);
    expect(gameAccuracy(seq, "w", "b")!).toBeGreaterThan(95);
  });
  it("erro grave derruba a precisão de quem errou", () => {
    // the drop from 50 to 10 happens on move index 2, a White move
    const seq = [50, 50, 50, 10, 10, 10];
    expect(gameAccuracy(seq, "w", "w")!).toBeLessThan(gameAccuracy(seq, "w", "b")!);
  });
});

describe("explicações verificáveis", () => {
  it("encontra mate em um", () => {
    expect(mateInOne("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1")).toBe("Ra8#");
    expect(mateInOne("6k1/5pp1/7p/8/8/8/8/R5K1 w - - 0 1")).toBeNull();
  });
  it("detecta garfo de cavalo", () => {
    const c = new Chess("r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1");
    c.move("Nc7+");
    expect(forkTargets(c, "c7").map((t) => t.type).sort()).toEqual(["k", "r"]);
  });
  it("mede material ganho ao longo da linha", () => {
    expect(pvMaterialGain("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1", ["d1d5", "e8e7", "e1e2"], "w")).toBe(9);
  });
  it("explica peça deixada sem defesa com fatos da posição", () => {
    // Brancas jogam Bg5?? deixando o bispo atacado pela dama preta sem defesa
    const fenBefore = "rnb1kbnr/pppp1ppp/8/4p3/4P1q1/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
    const c = new Chess(fenBefore);
    const mv = c.move("Nf3");
    const text = explainMove({
      fenBefore,
      fenAfter: mv.after,
      played: "g1f3",
      san: "Nf3",
      mover: "w",
      before: { cp: 200 },
      after: { cp: 200 },
      bestPv: ["g1f3"],
      replyPv: [],
      cls: "best",
      ply: 4,
    });
    expect(text.join(" ")).toContain("Desenvolve");
  });
  it("mate entregue é descrito como mate", () => {
    const fenBefore = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
    const after = new Chess(fenBefore);
    const m = after.move("Ra8#");
    expect(explainMove({ fenBefore, fenAfter: m.after, played: "a1a8", san: "Ra8#", mover: "w", before: { mate: 1 }, after: { cp: 100000 }, bestPv: ["a1a8"], replyPv: [], cls: "best", ply: 30 })[0]).toContain("Xeque-mate");
  });
});
