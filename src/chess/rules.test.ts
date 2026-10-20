import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { canStillMate, gameStatus, parsePgn, buildPgn, validateFen, materialCount, START_FEN, playUciLine } from "./rules";

describe("legalidade e regras", () => {
  it("recusa lance ilegal e aceita legal", () => {
    const c = new Chess();
    expect(() => c.move({ from: "e2", to: "e5" })).toThrow();
    expect(c.move({ from: "e2", to: "e4" }).san).toBe("e4");
  });

  it("não permite mover peça cravada", () => {
    // bispo preto em b4 crava o cavalo branco de c3 contra o rei em e1
    const c = new Chess("rnbqk1nr/pppp1ppp/8/4p3/1b2P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3");
    expect(c.moves({ square: "c3" }).length).toBeGreaterThan(0); // cavalo pode sair (cravada relativa? não: rei em e1, b4-c3-d2-e1)
    const c2 = new Chess("4k3/8/8/8/1b6/8/3N4/4K3 w - - 0 1");
    expect(c2.moves({ square: "d2" })).toHaveLength(0);
  });

  it("detecta xeque-mate", () => {
    const c = new Chess();
    for (const m of ["f3", "e5", "g4", "Qh4#"]) c.move(m);
    expect(gameStatus(c)).toMatchObject({ over: true, result: "0-1", reason: "checkmate" });
  });

  it("detecta afogamento", () => {
    const c = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(gameStatus(c)).toMatchObject({ over: true, result: "1/2-1/2", reason: "stalemate" });
  });

  it("detecta material insuficiente e regra dos 50 lances", () => {
    expect(gameStatus(new Chess("8/8/4k3/8/8/3K4/8/8 w - - 0 1")).reason).toBe("insufficient");
    expect(gameStatus(new Chess("8/8/4k3/8/8/3K4/8/7R w - - 100 80")).reason).toBe("fifty");
  });

  it("detecta repetição tripla", () => {
    const c = new Chess();
    for (const m of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) c.move(m);
    expect(gameStatus(c).reason).toBe("repetition");
  });

  it("roque: permitido e proibido ao atravessar casa atacada", () => {
    const ok = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(ok.moves()).toContain("O-O");
    expect(ok.moves()).toContain("O-O-O");
    const attacked = new Chess("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1"); // f1? torre em f2 ataca f1
    expect(attacked.moves()).not.toContain("O-O");
    const inCheck = new Chess("r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1");
    expect(inCheck.moves()).not.toContain("O-O");
  });

  it("en passant só no lance imediato", () => {
    const c = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    const ep = c.moves({ verbose: true }).find((m) => m.flags.includes("e"));
    expect(ep?.to).toBe("d6");
    const late = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1");
    expect(late.moves({ verbose: true }).some((m) => m.flags.includes("e"))).toBe(false);
  });

  it("promoção para qualquer peça", () => {
    const c = new Chess("8/P7/8/8/8/8/k7/4K3 w - - 0 1");
    const promos = c.moves({ verbose: true }).filter((m) => m.promotion).map((m) => m.promotion);
    expect(promos.sort()).toEqual(["b", "n", "q", "r"]);
  });

  it("tempo esgotado contra material insuficiente", () => {
    expect(canStillMate(new Chess("8/8/4k3/8/8/3K4/8/7R w - - 0 1"), "w")).toBe(true);
    expect(canStillMate(new Chess("8/8/4k3/8/8/3K4/8/7R w - - 0 1"), "b")).toBe(false);
    expect(canStillMate(new Chess("8/8/4k3/8/8/3K4/8/7N w - - 0 1"), "w")).toBe(false);
  });
});

describe("FEN", () => {
  it("valida posições", () => {
    expect(validateFen(START_FEN).ok).toBe(true);
    expect(validateFen("8/8/8/8/8/8/8/8 w - - 0 1").ok).toBe(false); // sem reis
    expect(validateFen("4k3/8/8/8/8/8/8/P3K3 w - - 0 1").ok).toBe(false); // peão na 1ª fileira
    expect(validateFen("4k3/8/8/8/8/8/8/4KR2 b - - 0 1").ok).toBe(true);
    expect(validateFen("4k3/8/8/8/8/8/8/4R1K1 w - - 0 1").ok).toBe(false); // rei preto em xeque e brancas jogam
    expect(validateFen("lixo").ok).toBe(false);
  });
});

describe("PGN", () => {
  it("exporta e importa ida e volta", () => {
    const pgn = buildPgn(START_FEN, ["e4", "e5", "Nf3", "Nc6"], { White: "A", Black: "B" }, "*");
    expect(pgn).toContain("1. e4 e5 2. Nf3 Nc6");
    const p = parsePgn(pgn);
    expect(p.records.map((r) => r.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(p.headers.White).toBe("A");
  });
  it("PGN de posição personalizada guarda a FEN", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const pgn = buildPgn(fen, ["e4"], {}, "*");
    expect(pgn).toContain('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]');
    expect(parsePgn(pgn).startFen).toBe(fen);
  });
  it("recusa PGN com lance ilegal", () => {
    expect(() => parsePgn("1. e4 e5 2. Ke3 Qh4 3. Kxh7")).toThrow();
  });
  it("linha UCI ilegal retorna null", () => {
    expect(playUciLine(START_FEN, ["e2e4", "e7e5", "e1e3"])).toBeNull();
  });
});

describe("material", () => {
  it("conta material e peças capturadas", () => {
    const m = materialCount("4k3/8/8/8/8/8/8/4K2Q w - - 0 1");
    expect(m.w).toBe(9);
    expect(m.b).toBe(0);
    expect(m.capturedByW).toHaveLength(15);
  });
});
