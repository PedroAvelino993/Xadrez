import { describe, expect, it } from "vitest";
import { acceptMove, decideGoal, decideGoalForObjective, goalReached } from "./convert";
import type { Puzzle } from "./logic";

const base: Puzzle = { id: "t", fen: "", moves: [], solverFirst: false, themes: ["winMaterial"], rating: 1000, idea: ["."] };

describe("fase de conversão", () => {
  it("final de peões vencedor continua até promover", () => {
    const fen = "8/8/8/2k5/8/4K3/4P3/8 b - - 0 1";
    expect(decideGoal({ ...base, themes: ["pawnEndgame"], goal: "win" }, fen, "w", { cp: 600 })).toBe("promote");
  });
  it("tática que já está decisiva termina; tática ainda pequena continua", () => {
    const fen = "r3k3/8/8/8/8/8/8/4K2R b - - 0 1";
    expect(decideGoal(base, fen, "w", { cp: 800 })).toBeNull();
    expect(decideGoal(base, fen, "w", { cp: 250 })).toBe("decisive");
  });
  it("puzzle de empate pede para segurar; defensivo não continua", () => {
    const fen = "8/8/8/2k5/8/4K3/4P3/8 b - - 0 1";
    expect(decideGoal({ ...base, goal: "draw", themes: ["pawnEndgame"] }, fen, "b", { cp: 0 })).toBe("hold");
    expect(decideGoal({ ...base, themes: ["defense"] }, fen, "w", { cp: 0 })).toBeNull();
  });
  it("aceita lances que mantêm a vantagem e recusa os que a jogam fora", () => {
    expect(acceptMove("decisive", "w", { cp: 400 }, { cp: 380 })).toBe(true);
    expect(acceptMove("decisive", "w", { cp: 400 }, { cp: 50 })).toBe(false);
    expect(acceptMove("decisive", "b", { cp: -400 }, { cp: -390 })).toBe(true);
    expect(acceptMove("promote", "w", { mate: 5 }, { mate: 4 })).toBe(true);
    expect(acceptMove("mate", "w", { mate: 3 }, { cp: 2000 })).toBe(false);
    expect(acceptMove("hold", "b", { cp: 0 }, { cp: 40 })).toBe(true);
    expect(acceptMove("hold", "b", { cp: 0 }, { cp: 500 })).toBe(false);
  });
  it("reconhece o objetivo alcançado", () => {
    expect(goalReached("promote", "w", "4Q3/8/8/2k5/8/4K3/8/8 b - - 0 1", true, { cp: 900 })).toBe(true);
    expect(goalReached("promote", "w", "8/4P3/8/2k5/8/4K3/8/8 b - - 0 1", false, { cp: 900 })).toBe(false);
    expect(goalReached("mate", "w", "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", false, { cp: 100000 })).toBe(true);
    expect(goalReached("decisive", "w", "4k3/8/8/8/8/8/8/3QK3 b - - 0 1", false, { cp: 900 })).toBe(true);
  });
  it("posições da biblioteca usam o objetivo escrito", () => {
    const fen = "8/8/8/2k5/8/4K3/4P3/8 b - - 0 1";
    expect(decideGoalForObjective("Brancas jogam e vencem", true, fen, "w", { cp: 700 })).toBe("promote");
    expect(decideGoalForObjective("Negras jogam e empatam", true, fen, "b", { cp: 0 })).toBe("hold");
    expect(decideGoalForObjective("Brancas jogam e dão mate em 3", false, "6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1", "w", { mate: 2 })).toBe("mate");
    expect(decideGoalForObjective("Brancas jogam: escolha o final certo", true, fen, "w", { cp: 700 })).toBeNull();
  });
});
