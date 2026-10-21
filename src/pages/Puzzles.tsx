import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Eye, Flame, Lightbulb, RotateCcw, Target, Trophy, XCircle, Shuffle, SlidersHorizontal, ArrowLeft } from "lucide-react";
import Board, { type Arrow, type BoardMove } from "../components/Board";
import { PieceIcon } from "../components/ui";
import { buildPgn, parseUci, toRecord } from "../chess/rules";
import { decideGoal, goalText as convertGoalText, solverCp } from "../puzzles/convert";
import { useConversion } from "../puzzles/useConversion";
import { formatScore } from "../engine/score";
import type { Color } from "../types";
import { DIFFICULTIES, THEMES, dailyIds, isCorrect, loadPuzzles, pickNext, pointsFor, themeLabel, updateRating, type Puzzle } from "../puzzles/logic";
import { getState, setState, todayKey, useAppState } from "../storage/store";
import { play, playForSan } from "../sound/sound";
import { navigate, useRoute } from "../hooks/useRoute";
import "./puzzles.css";

export default function PuzzlesPage(_: { mode?: string }) {
  const { parts, query } = useRoute();
  const [all, setAll] = useState<Puzzle[] | null>(null);
  useEffect(() => {
    loadPuzzles().then(setAll);
  }, []);
  if (!all)
    return (
      <div className="page row" style={{ justifyContent: "center", paddingTop: 60 }}>
        <span className="spinner" /> Carregando puzzles…
      </div>
    );
  const mode = parts[1];
  if (!mode) return <PuzzleHub all={all} />;
  return <PuzzleRunner key={parts.join("/") + query.toString()} all={all} mode={mode} arg={parts[2]} query={query} />;
}

// ---------------------------------------------------------------------------

function PuzzleHub({ all }: { all: Puzzle[] }) {
  const pz = useAppState((s) => s.puzzles);
  const attempts = Object.values(pz.attempts);
  const solved = attempts.filter((a) => a.solved).length;
  const clean = attempts.filter((a) => a.firstTry).length;
  const avgTime = attempts.length ? attempts.reduce((s, a) => s + a.timeMs, 0) / attempts.length / 1000 : 0;
  const today = todayKey();
  const daily = dailyIds(all, today);
  const doneToday = daily.filter((id) => pz.attempts[id]?.solved).length;
  const [custom, setCustom] = useState({ min: 800, max: 1400 });
  const counts = (id: string) => all.filter((p) => p.themes.includes(id)).length;

  return (
    <div className="page stack-lg">
      <div className="pz-stats">
        <Stat icon={<Target size={18} />} label="Pontuação de puzzles" value={Math.round(pz.rating)} hint="Estimativa própria, separada do desempenho em partidas" />
        <Stat icon={<Trophy size={18} />} label="Pontos" value={pz.points} />
        <Stat icon={<CheckCircle2 size={18} />} label="Resolvidos" value={`${solved}/${all.length}`} />
        <Stat icon={<CheckCircle2 size={18} />} label="Acerto de primeira" value={attempts.length ? `${Math.round((clean / attempts.length) * 100)}%` : "–"} />
        <Stat icon={<Flame size={18} />} label="Sequência" value={`${pz.streak} (recorde ${pz.bestStreak})`} />
        <Stat icon={<RotateCcw size={18} />} label="Tempo médio" value={attempts.length ? `${avgTime.toFixed(0)} s` : "–"} />
      </div>

      <div className="grid-2">
        <button className="card pad mode-card" onClick={() => navigate("/puzzles/treino")}>
          <div className="mode-icon green">
            <Shuffle size={22} />
          </div>
          <div>
            <h2>Treino</h2>
            <p className="muted small">Puzzles perto da sua pontuação. Acertos de primeira aumentam a pontuação; erros diminuem.</p>
          </div>
          <ArrowRight className="go" size={20} />
        </button>
        <button className="card pad mode-card" onClick={() => navigate("/puzzles/diario")}>
          <div className="mode-icon yellow">
            <CalendarDays size={22} />
          </div>
          <div>
            <h2>Desafio diário</h2>
            <p className="muted small">
              3 puzzles por dia (fácil, médio e difícil). Hoje: {doneToday}/{daily.length} resolvidos.
            </p>
          </div>
          <ArrowRight className="go" size={20} />
        </button>
      </div>

      <section>
        <div className="section-title">
          <h2>Por dificuldade</h2>
        </div>
        <div className="diff-row">
          {DIFFICULTIES.map((d) => {
            const n = all.filter((p) => p.rating >= d.min && p.rating <= d.max).length;
            return (
              <button key={d.id} className="card diff-card" onClick={() => navigate(`/puzzles/nivel/${d.id}`)} disabled={!n}>
                <b>{d.label}</b>
                <span className="xs faint">
                  {d.max > 5000 ? `${d.min}+` : `${d.min}–${d.max}`} · {n} puzzles
                </span>
              </button>
            );
          })}
          <div className="card diff-card custom">
            <b className="row" style={{ gap: 6 }}>
              <SlidersHorizontal size={15} /> Personalizado
            </b>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" type="number" step={100} value={custom.min} onChange={(e) => setCustom({ ...custom, min: +e.target.value })} aria-label="Dificuldade mínima" />
              <span className="faint">–</span>
              <input className="input" type="number" step={100} value={custom.max} onChange={(e) => setCustom({ ...custom, max: +e.target.value })} aria-label="Dificuldade máxima" />
            </div>
            <button className="btn sm primary" onClick={() => navigate(`/puzzles/nivel/custom?min=${custom.min}&max=${custom.max}`)} disabled={!all.some((p) => p.rating >= custom.min && p.rating <= custom.max)}>
              Começar
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">
          <h2>Por tema</h2>
          <span className="xs faint">{all.length} puzzles verificados pelo Stockfish</span>
        </div>
        <div className="grid-auto">
          {THEMES.filter((t) => counts(t.id) > 0).map((t) => {
            const st = pz.themeStats[t.id];
            const total = st ? st.ok + st.fail : 0;
            const pct = total ? Math.round((st!.ok / total) * 100) : null;
            return (
              <button key={t.id} className="card theme-card" onClick={() => navigate(`/puzzles/tema/${t.id}`)}>
                <div className="row between">
                  <b>{t.label}</b>
                  <span className="chip">{counts(t.id)}</span>
                </div>
                <p className="xs muted">{t.desc}</p>
                {pct !== null ? (
                  <div className="row xs" style={{ gap: 8 }}>
                    <div className="progress" style={{ flex: 1 }}>
                      <span style={{ width: `${pct}%`, background: pct >= 70 ? "var(--accent)" : pct >= 40 ? "var(--warning)" : "var(--danger)" }} />
                    </div>
                    <span className="faint">{pct}%</span>
                  </div>
                ) : (
                  <div className="xs faint">Ainda não praticado</div>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <p className="xs faint">
        Como os puzzles foram feitos: as posições vêm de partidas do Stockfish contra si mesmo e de finais montados aleatoriamente. Cada uma foi conferida por buscas profundas do motor: em todos os passos, o lance da solução é o único que ganha (ou, nos puzzles defensivos e de empate, o único que salva). Nenhuma posição foi escrita à mão.
      </p>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card pz-stat" title={hint}>
      <span className="faint">{icon}</span>
      <div>
        <div className="xs faint">{label}</div>
        <b className="num">{value}</b>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Status = "intro" | "your-turn" | "wrong" | "solved" | "revealed" | "convert-wait" | "convert-turn" | "convert-wrong" | "converted";

function PuzzleRunner({ all, mode, arg, query }: { all: Puzzle[]; mode: string; arg?: string; query: URLSearchParams }) {
  const pzState = useAppState((s) => s.puzzles);
  const queue = useMemo(() => (mode === "diario" ? dailyIds(all, todayKey()) : null), [all, mode]);
  const filter = useMemo(() => {
    if (mode === "tema") return { theme: arg };
    if (mode === "nivel") {
      if (arg === "custom") return { min: +(query.get("min") ?? 0), max: +(query.get("max") ?? 9999) };
      const d = DIFFICULTIES.find((x) => x.id === arg) ?? DIFFICULTIES[0];
      return { min: d.min, max: d.max };
    }
    return {};
  }, [mode, arg, query]);

  const choose = useCallback(
    (exclude?: string): Puzzle | null => {
      const s = getState().puzzles;
      if (mode === "id") return all.find((p) => p.id === arg) ?? null;
      if (queue) {
        const next = queue.find((id) => !s.attempts[id]?.solved && id !== exclude) ?? null;
        return next ? all.find((p) => p.id === next) ?? null : null;
      }
      return pickNext(all, { rating: s.rating, seen: new Set(Object.keys(s.attempts)), exclude, ...filter });
    },
    [all, mode, arg, queue, filter]
  );

  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => choose());
  const title =
    mode === "diario" ? "Desafio diário" : mode === "tema" ? themeLabel(arg ?? "") : mode === "nivel" ? (DIFFICULTIES.find((d) => d.id === arg)?.label ?? "Personalizado") : mode === "id" ? "Puzzle" : "Treino";

  if (!puzzle) {
    return (
      <div className="page">
        <div className="card pad empty stack">
          {mode === "diario" ? <p>Você resolveu todos os desafios de hoje! Volte amanhã para um novo conjunto.</p> : <p>Nenhum puzzle encontrado com esse filtro.</p>}
          <button className="btn" onClick={() => navigate("/puzzles")}>
            <ArrowLeft size={16} /> Voltar aos puzzles
          </button>
        </div>
      </div>
    );
  }
  return (
    <Solver
      key={puzzle.id}
      puzzle={puzzle}
      title={title}
      dailyProgress={queue ? { done: queue.filter((id) => pzState.attempts[id]?.solved).length, total: queue.length } : null}
      onNext={() => setPuzzle(choose(puzzle.id))}
    />
  );
}

function Solver({ puzzle, title, onNext, dailyProgress }: { puzzle: Puzzle; title: string; onNext: () => void; dailyProgress: { done: number; total: number } | null }) {
  const startFen = puzzle.fen;
  const solverColor: Color = useMemo(() => {
    const c = new Chess(startFen);
    return (puzzle.solverFirst ? c.turn() : c.turn() === "w" ? "b" : "w") as Color;
  }, [puzzle, startFen]);
  const [fen, setFen] = useState(startFen);
  const [idx, setIdx] = useState(0); // next index into puzzle.moves
  const [status, setStatus] = useState<Status>("intro");
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [marks, setMarks] = useState<Record<string, "good" | "bad" | "hint">>({});
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [showIdea, setShowIdea] = useState(false);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const played = useRef<string[]>([]);
  const cv = useConversion({ solver: solverColor, setFen, setLast, setMarks, onPlayed: (u) => played.current.push(u) });
  const conv = cv.conv;
  const t0 = useRef(performance.now());
  const recorded = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (f: () => void, ms: number) => timers.current.push(setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const playIndex = useCallback(
    (fenNow: string, i: number) => {
      const c = new Chess(fenNow);
      const m = c.move(parseUci(puzzle.moves[i]));
      played.current.push(puzzle.moves[i]);
      playForSan(m.san, !!m.promotion);
      setFen(c.fen());
      setLast({ from: m.from, to: m.to });
      return c.fen();
    },
    [puzzle]
  );

  // opening move by the opponent
  useEffect(() => {
    if (puzzle.solverFirst) {
      setStatus("your-turn");
      t0.current = performance.now();
      return;
    }
    later(() => {
      playIndex(startFen, 0);
      setIdx(1);
      setStatus("your-turn");
      t0.current = performance.now();
    }, 650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const record = (solved: boolean, clean: boolean) => {
    if (recorded.current) return;
    recorded.current = true;
    const timeMs = performance.now() - t0.current;
    setState((s) => {
      const p = s.puzzles;
      const firstTime = !p.attempts[puzzle.id];
      const streak = clean ? p.streak + 1 : 0;
      const rating = firstTime ? updateRating(p.rating, puzzle.rating, clean, Object.keys(p.attempts).length) : p.rating;
      const themeStats = { ...p.themeStats };
      if (firstTime)
        for (const t of puzzle.themes) {
          const cur = themeStats[t] ?? { ok: 0, fail: 0 };
          themeStats[t] = clean ? { ...cur, ok: cur.ok + 1 } : { ...cur, fail: cur.fail + 1 };
        }
      const prev = p.attempts[puzzle.id];
      return {
        ...s,
        puzzles: {
          ...p,
          rating,
          ratingHistory: firstTime ? [...p.ratingHistory, { t: Date.now(), r: rating }].slice(-500) : p.ratingHistory,
          streak,
          bestStreak: Math.max(p.bestStreak, streak),
          points: p.points + (firstTime ? pointsFor({ clean, solved, rating: puzzle.rating, streak }) : 0),
          themeStats,
          attempts: {
            ...p.attempts,
            [puzzle.id]: {
              solved: solved || !!prev?.solved,
              firstTry: firstTime ? clean : prev!.firstTry,
              timeMs: firstTime ? timeMs : prev!.timeMs,
              date: Date.now(),
              hints: hints,
            },
          },
        },
      };
    });
  };

  const startConversion = async (fenAfterLine: string) => {
    setStatus("convert-wait");
    const started = await cv.start(fenAfterLine, (view) => decideGoal(puzzle, fenAfterLine, solverColor, view.score));
    if (!started) setStatus("solved");
  };
  const finishConversion = (o: "skipped") => cv.finish(o);
  const convertHint = cv.hint;
  const convertPlayEngine = cv.playEngine;

  const onMove = (m: BoardMove) => {
    if (status === "convert-turn") {
      const c = new Chess(fen);
      let mv;
      try {
        mv = c.move(m);
      } catch {
        return false;
      }
      void cv.move(c, mv);
      return true;
    }
    if (status !== "your-turn") return false;
    const c = new Chess(fen);
    let mv;
    try {
      mv = c.move(m);
    } catch {
      return false;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? "");
    if (isCorrect(puzzle, idx, uci, c.isCheckmate())) {
      played.current.push(uci);
      playForSan(mv.san, !!mv.promotion);
      setFen(c.fen());
      setLast({ from: mv.from, to: mv.to });
      setMarks({ [mv.to]: "good" });
      setArrows([]);
      const next = idx + 1;
      if (next >= puzzle.moves.length) {
        play("correct");
        record(true, mistakes === 0 && hints === 0);
        if (c.isGameOver()) setStatus("solved");
        else void startConversion(c.fen());
        return true;
      }
      setIdx(next + 1);
      setStatus("intro");
      later(() => {
        playIndex(c.fen(), next);
        setMarks({});
        setStatus("your-turn");
      }, 450);
      return true;
    }
    // wrong: show it briefly, then take it back (no penalty beyond losing the clean solve)
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    setMarks({ [mv.to]: "bad" });
    setStatus("wrong");
    setMistakes((x) => x + 1);
    play("wrong");
    later(() => {
      setFen(fen);
      setLast(null);
      setMarks({});
      setStatus("your-turn");
    }, 750);
    return true;
  };

  const hint = () => {
    const u = puzzle.moves[idx];
    if (!u) return;
    setHints((h) => h + 1);
    setMarks({ [u.slice(0, 2)]: "hint" });
  };

  const reveal = () => {
    record(false, false);
    setStatus("revealed");
    let f = fen;
    puzzle.moves.slice(idx).forEach((_, k) => {
      later(() => {
        f = playIndex(f, idx + k);
      }, 500 + k * 750);
    });
    setIdx(puzzle.moves.length);
    setShowIdea(true);
  };

  const retry = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cv.reset();
    played.current = [];
    setFen(startFen);
    setIdx(0);
    setMarks({});
    setArrows([]);
    setLast(null);
    setStatus("intro");
    if (puzzle.solverFirst) setStatus("your-turn");
    else
      later(() => {
        playIndex(startFen, 0);
        setIdx(1);
        setStatus("your-turn");
      }, 500);
  };

  // while converting, the hook owns the phase
  useEffect(() => {
    const map = { wait: "convert-wait", turn: "convert-turn", wrong: "convert-wrong", done: "converted" } as const;
    if (cv.phase !== "idle") setStatus(map[cv.phase]);
  }, [cv.phase]);
  const { sync } = cv;
  useEffect(() => sync(fen), [fen, sync]);
  const done = status === "solved" || status === "revealed" || status === "converted";
  const converting = status === "convert-turn" || status === "convert-wait" || status === "convert-wrong";
  const sideName = solverColor === "w" ? "Brancas" : "Pretas";
  const goalText = puzzle.goal === "draw" ? "Encontre o único lance que garante o empate" : puzzle.goal === "win" ? "Encontre o único lance que vence" : puzzle.themes.some((t) => t.startsWith("mateIn")) ? `Dê mate em ${puzzle.themes.find((t) => t.startsWith("mateIn"))!.slice(-1)}` : puzzle.themes.includes("defense") ? "Encontre o único lance que salva a posição" : "Encontre o melhor lance";
  const solutionSans = useMemo(() => {
    const c = new Chess(startFen);
    return puzzle.moves.map((u) => {
      try {
        return toRecord(c.move(parseUci(u))).san;
      } catch {
        return u;
      }
    });
  }, [puzzle, startFen]);

  return (
    <div className="page">
      <div className="game-layout">
        <div className="board-col sticky-m">
          <div className="board-row">
            <div className="board-holder">
              <Board fen={fen} orientation={solverColor} movable={status === "your-turn" || status === "convert-turn" ? solverColor : "none"} onMove={onMove} lastMove={last} marks={marks} arrows={arrows} mated={new Chess(fen).isCheckmate()} />
            </div>
          </div>
        </div>
        <div className="side-panel">
          <div className="card">
            <div className="card-head">
              <div className="row">
                <button className="icon-btn" onClick={() => navigate("/puzzles")} aria-label="Voltar aos puzzles">
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <b>{title}</b>
                  <div className="xs faint">
                    Dificuldade estimada {puzzle.rating}
                    {dailyProgress && ` · ${dailyProgress.done}/${dailyProgress.total} hoje`}
                  </div>
                </div>
              </div>
              <span className="chip">
                <Target size={13} /> {Math.round(getState().puzzles.rating)}
              </span>
            </div>
            <div className="card-body stack">
              <div className="turn-banner">
                <PieceIcon type="k" color={solverColor} size={34} />
                <div>
                  <b>Você joga com as {sideName}</b>
                  <div className="small muted">{goalText}.</div>
                </div>
              </div>
              {status === "intro" && !done && idx === 0 && (
                <div className="feedback info">
                  <p>Observe o lance do adversário…</p>
                </div>
              )}
              {status === "wrong" && (
                <div className="feedback bad">
                  <XCircle size={20} color="var(--danger)" />
                  <div>
                    <h3>Não é esse lance</h3>
                    <p>Tente de novo. Pense em xeques, capturas e ameaças.</p>
                  </div>
                </div>
              )}
              {status === "your-turn" && mistakes > 0 && (
                <div className="feedback warn">
                  <p>
                    Você ainda pode resolver! {mistakes} {mistakes === 1 ? "tentativa errada" : "tentativas erradas"} até agora.
                  </p>
                </div>
              )}
              {status === "your-turn" && idx > 1 && mistakes === 0 && (
                <div className="feedback ok">
                  <CheckCircle2 size={20} color="var(--accent)" />
                  <p>Certo! Continue a sequência.</p>
                </div>
              )}
              {converting && conv && (
                <div className="feedback info">
                  <CheckCircle2 size={20} color="var(--accent)" />
                  <div>
                    <h3>
                      Parte principal resolvida! {conv.goal === "promote" ? "Agora promova" : conv.goal === "hold" ? "Agora segure" : conv.goal === "mate" ? "Agora dê o mate" : "Agora converta"}
                    </h3>
                    <p>{convertGoalText(conv.goal)}</p>
                    <p className="xs faint" style={{ marginTop: 4 }}>
                      {status === "convert-wait" ? "Stockfish pensando…" : `Seu lance ${conv.step + 1} de no máximo ${conv.max}`}
                      {conv.before && status !== "convert-wait" && ` · avaliação para você ${formatScore({ cp: solverCp(conv.before.score, solverColor) })}`}
                    </p>
                  </div>
                </div>
              )}
              {status === "convert-wrong" && conv?.msg && (
                <div className="feedback bad">
                  <XCircle size={20} color="var(--danger)" />
                  <p>{conv.msg}</p>
                </div>
              )}
              {status === "converted" && conv && (
                <div className={`feedback ${conv.outcome === "reached" ? "ok" : "info"}`}>
                  <CheckCircle2 size={22} color="var(--accent)" />
                  <div>
                    <h3>{conv.outcome === "reached" ? (conv.goal === "promote" ? "Promovido! Puzzle completo." : conv.goal === "hold" ? "Empate garantido!" : conv.goal === "mate" ? "Xeque-mate! Puzzle completo." : "Vantagem decisiva! Puzzle completo.") : conv.outcome === "skipped" ? "Puzzle encerrado" : "Puzzle completo"}</h3>
                    <p>
                      {conv.outcome === "reached"
                        ? "Você levou a ideia até o fim."
                        : conv.outcome === "kept"
                          ? conv.msg ?? "Você manteve a vantagem até o fim da sequência."
                          : conv.msg ?? "A parte principal conta como resolvida."}
                    </p>
                    <p className="xs faint">{mistakes === 0 && hints === 0 ? "A parte principal foi resolvida de primeira." : "A parte principal conta como resolvida, mas não de primeira."}</p>
                  </div>
                </div>
              )}
              {status === "solved" && (
                <div className="feedback ok">
                  <CheckCircle2 size={22} color="var(--accent)" />
                  <div>
                    <h3>{mistakes === 0 && hints === 0 ? "Resolvido de primeira!" : "Resolvido!"}</h3>
                    <p>{mistakes === 0 && hints === 0 ? "Sua pontuação de puzzles aumentou." : "Conta como resolvido, mas não como acerto de primeira."}</p>
                  </div>
                </div>
              )}
              {status === "revealed" && (
                <div className="feedback warn">
                  <Eye size={20} color="var(--warning)" />
                  <div>
                    <h3>Solução</h3>
                    <p>{solutionSans.slice(puzzle.solverFirst ? 0 : 1).join(" ")}</p>
                  </div>
                </div>
              )}
              {(showIdea || done) && puzzle.idea.length > 0 && (
                <div className="feedback info">
                  <Lightbulb size={20} color="var(--info)" />
                  <div>
                    <h3>A ideia</h3>
                    {puzzle.idea.map((t, i) => (
                      <p key={i}>{t}</p>
                    ))}
                  </div>
                </div>
              )}
              {done && (
                <div className="row wrap" style={{ gap: 6 }}>
                  {puzzle.themes.map((t) => (
                    <span key={t} className="chip">
                      {themeLabel(t)}
                    </span>
                  ))}
                </div>
              )}
              <div className="row wrap">
                {converting ? (
                  <>
                    <button className="btn" onClick={convertHint} disabled={status !== "convert-turn"}>
                      <Lightbulb size={16} /> Dica
                    </button>
                    <button className="btn" onClick={convertPlayEngine} disabled={status !== "convert-turn"}>
                      Jogar o lance do motor
                    </button>
                    <button className="btn ghost" onClick={() => finishConversion("skipped")}>
                      Encerrar aqui
                    </button>
                  </>
                ) : !done ? (
                  <>
                    <button className="btn" onClick={hint} disabled={status !== "your-turn"}>
                      <Lightbulb size={16} /> Dica
                    </button>
                    {mistakes > 0 && !showIdea && (
                      <button className="btn" onClick={() => setShowIdea(true)}>
                        Ver a ideia
                      </button>
                    )}
                    <button className="btn ghost" onClick={reveal} disabled={status === "intro"}>
                      <Eye size={16} /> Mostrar solução
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={onNext}>
                      Próximo <ArrowRight size={16} />
                    </button>
                    <button className="btn" onClick={retry}>
                      <RotateCcw size={16} /> Refazer
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        // open the line in the analysis board at the position where the solver moves, seen from the solver's side
                        let sans: string[] = [];
                        try {
                          const c = new Chess(startFen);
                          sans = played.current.map((u) => c.move(parseUci(u)).san);
                        } catch {
                          /* keep what was valid */
                        }
                        const pgn = buildPgn(startFen, sans, { Event: `Puzzle ${puzzle.id}` });
                        navigate(`/analisar?pgn=${encodeURIComponent(pgn)}&ply=${puzzle.solverFirst ? -1 : 0}&o=${solverColor}`);
                      }}
                    >
                      Analisar posição
                    </button>
                  </>
                )}
              </div>
              {hints > 0 && !done && <p className="xs faint">Dica: a casa destacada em azul mostra a peça que deve se mover.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
