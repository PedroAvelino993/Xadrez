import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag, Handshake, RotateCcw, Undo2, Volume2, VolumeX, RefreshCw, Microscope, Download, Copy, Play as PlayIcon, Swords, Shuffle } from "lucide-react";
import Board, { type BoardMove } from "../components/Board";
import MoveList from "../components/MoveList";
import NavControls from "../components/NavControls";
import MobileNav from "../components/MobileNav";
import EvalBar from "../components/EvalBar";
import { Avatar, Modal, PieceIcon, UserAvatar, copyText, downloadText, toast, Switch } from "../components/ui";
import { BOTS, botById, requestBotMove, type Bot } from "../bots/bots";
import { getAnalysisEngine, getPlayEngine, EngineCancelled } from "../engine/stockfish";
import { buildPgn, canStillMate, gameStatus, materialCount, REASON_TEXT, START_FEN, toRecord, parseUci, validateFen } from "../chess/rules";
import type { Color, EndReason, GameResult, MoveRecord, PieceType, SavedGame, Score } from "../types";
import { getState, setState, updateSettings, useAppState, useSettings, type OngoingGame } from "../storage/store";
import { play, playForSan } from "../sound/sound";
import { useRoute, navigate } from "../hooks/useRoute";
import { pieceUrl } from "../components/boardThemes";
import "./play.css";

export const TIME_CONTROLS = [
  { id: "1+0", label: "1 min", group: "Bullet", baseMs: 60000, incMs: 0 },
  { id: "2+1", label: "2 | 1", group: "Bullet", baseMs: 120000, incMs: 1000 },
  { id: "3+0", label: "3 min", group: "Blitz", baseMs: 180000, incMs: 0 },
  { id: "3+2", label: "3 | 2", group: "Blitz", baseMs: 180000, incMs: 2000 },
  { id: "5+0", label: "5 min", group: "Blitz", baseMs: 300000, incMs: 0 },
  { id: "5+3", label: "5 | 3", group: "Blitz", baseMs: 300000, incMs: 3000 },
  { id: "10+0", label: "10 min", group: "Rápido", baseMs: 600000, incMs: 0 },
  { id: "10+5", label: "10 | 5", group: "Rápido", baseMs: 600000, incMs: 5000 },
  { id: "15+10", label: "15 | 10", group: "Rápido", baseMs: 900000, incMs: 10000 },
  { id: "30+0", label: "30 min", group: "Clássico", baseMs: 1800000, incMs: 0 },
  { id: "30+20", label: "30 | 20", group: "Clássico", baseMs: 1800000, incMs: 20000 },
  { id: "none", label: "Sem relógio", group: "Livre", baseMs: 0, incMs: 0 },
];

type Phase = "setup" | "playing" | "over";

interface Result {
  result: GameResult;
  reason: EndReason;
  outcome: "win" | "loss" | "draw";
  gameId: string;
}

function fmtClock(ms: number): string {
  const m = Math.max(0, ms);
  if (m < 10000) return `0:${(m / 1000).toFixed(1).padStart(4, "0")}`;
  const s = Math.ceil(m / 1000);
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function PlayPage() {
  const { query } = useRoute();
  const settings = useSettings();
  const games = useAppState((s) => s.games);
  const ongoing = useAppState((s) => s.ongoing);

  // ----- setup state -----
  const [botId, setBotId] = useState(query.get("bot") ?? "bruno");
  const [colorChoice, setColorChoice] = useState<"w" | "b" | "r">((query.get("color") as "w" | "b") ?? "w");
  const [tcId, setTcId] = useState("10+0");
  const [custom, setCustom] = useState({ min: 10, inc: 0 });
  const [allowUndo, setAllowUndo] = useState(true);
  const presetFen = useMemo(() => {
    const f = query.get("fen");
    if (f && validateFen(f).ok) return f;
    const moves = query.get("moves");
    if (moves) {
      const c = new Chess();
      try {
        for (const u of moves.split(",")) c.move(parseUci(u));
        return c.fen();
      } catch {
        return START_FEN;
      }
    }
    return START_FEN;
  }, [query]);
  const presetName = query.get("name");

  // ----- game state -----
  const [phase, setPhase] = useState<Phase>("setup");
  const [startFen, setStartFen] = useState(presetFen);
  const [records, setRecords] = useState<MoveRecord[]>([]);
  const [view, setView] = useState(-1);
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [orientation, setOrientation] = useState<Color>("w");
  const [bot, setBot] = useState<Bot>(botById(botId));
  const [tc, setTc] = useState({ id: "10+0", baseMs: 600000, incMs: 0 });
  const [undoAllowed, setUndoAllowed] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [liveScore, setLiveScore] = useState<Score | null>(null);
  const [, setTick] = useState(0);

  const chessRef = useRef(new Chess(presetFen));
  const clock = useRef({ w: 0, b: 0, running: null as Color | null, since: 0 });
  const botHandle = useRef<{ cancel: () => void } | null>(null);
  const token = useRef(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (phase === "setup") {
      setStartFen(presetFen);
      chessRef.current = new Chess(presetFen);
      setOrientation(colorChoice === "b" ? "b" : "w");
    }
  }, [presetFen, phase, colorChoice]);

  const timed = tc.baseMs > 0;
  const fenNow = records.length ? records[records.length - 1].fenAfter : startFen;
  const shownFen = view < 0 ? startFen : records[view]?.fenAfter ?? fenNow;
  const atLatest = view === records.length - 1;
  const botColor: Color = playerColor === "w" ? "b" : "w";
  const turn: Color = chessRef.current.turn() as Color;

  const remaining = (c: Color) => {
    const k = clock.current;
    return k.running === c ? k[c] - (performance.now() - k.since) : k[c];
  };

  // ----- persistence of an ongoing game (recovery after closing the tab) -----
  const persistOngoing = useCallback(
    (recs: MoveRecord[]) => {
      const og: OngoingGame = {
        botId: bot.id,
        playerColor,
        timeControl: tc.id,
        baseMs: tc.baseMs,
        incMs: tc.incMs,
        startFen,
        moves: recs.map((r) => r.uci),
        clocks: { w: remaining("w"), b: remaining("b") },
        savedAt: Date.now(),
      };
      setState((s) => ({ ...s, ongoing: og }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bot.id, playerColor, tc, startFen]
  );

  // ----- finishing -----
  const finish = useCallback(
    (res: GameResult, reason: EndReason, recs: MoveRecord[]) => {
      botHandle.current?.cancel();
      token.current++;
      setThinking(false);
      clock.current.running = null;
      const outcome: Result["outcome"] = res === "1/2-1/2" ? "draw" : (res === "1-0") === (playerColor === "w") ? "win" : "loss";
      const id = `g${Date.now().toString(36)}`;
      const name = getState().profileName;
      const sans = recs.map((r) => r.san);
      const pgn = buildPgn(
        startFen,
        sans,
        {
          White: playerColor === "w" ? name : `${bot.name} (bot ${bot.levelName})`,
          Black: playerColor === "b" ? name : `${bot.name} (bot ${bot.levelName})`,
          TimeControl: tc.baseMs ? `${tc.baseMs / 1000}+${tc.incMs / 1000}` : "-",
          Termination: REASON_TEXT[reason],
        },
        res
      );
      const saved: SavedGame = {
        id,
        date: Date.now(),
        botId: bot.id,
        playerColor,
        result: res,
        reason,
        timeControl: tc.id,
        startFen,
        moves: sans,
        pgn,
        outcome,
      };
      setState((s) => ({ ...s, games: [saved, ...s.games].slice(0, 200), ongoing: null }));
      setResult({ result: res, reason, outcome, gameId: id });
      setPhase("over");
      setTimeout(() => setShowResult(true), reason === "checkmate" ? 700 : 250);
      if (reason !== "checkmate") play("gameEnd");
    },
    [playerColor, bot, tc, startFen]
  );

  // ----- applying a move (user or bot) -----
  const applyMove = useCallback(
    (m: { from: string; to: string; promotion?: string }): MoveRecord | null => {
      const c = chessRef.current;
      let mv;
      try {
        mv = c.move(m);
      } catch {
        return null;
      }
      const rec = toRecord(mv);
      const mover = mv.color as Color;
      if (timed) {
        const k = clock.current;
        if (k.running) {
          k[mover] = remaining(mover) + tc.incMs;
        }
        // clocks start after the first move of the game
        k.running = mover === "w" ? "b" : "w";
        k.since = performance.now();
        rec.clockMs = k[mover];
      }
      playForSan(rec.san, !!rec.promotion);
      const recs = [...records, rec];
      setRecords(recs);
      setView(recs.length - 1);
      const st = gameStatus(c);
      if (st.over) finish(st.result, st.reason!, recs);
      else persistOngoing(recs);
      return rec;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, timed, tc.incMs, finish, persistOngoing]
  );

  // ----- user move -----
  const onUserMove = (m: BoardMove) => {
    if (phase !== "playing" || !atLatest || chessRef.current.turn() !== playerColor) return false;
    const rec = applyMove(m);
    if (!rec) {
      play("illegal");
      return false;
    }
    return true;
  };

  // ----- bot move loop -----
  useEffect(() => {
    if (phase !== "playing") return;
    if (chessRef.current.turn() !== botColor) return;
    if (chessRef.current.isGameOver()) return;
    const my = ++token.current;
    const fen = chessRef.current.fen();
    setThinking(true);
    setEngineError(null);
    const t0 = performance.now();
    const h = requestBotMove({
      bot,
      fen,
      engine: getPlayEngine(),
      clock: timed ? { remaining: remaining(botColor), inc: tc.incMs } : undefined,
    });
    botHandle.current = h;
    h.promise
      .then(async (uci) => {
        const wait = Math.max(0, bot.minThinkMs - (performance.now() - t0));
        // never stall a bot that is short on time
        const capped = timed ? Math.min(wait, Math.max(0, remaining(botColor) / 40)) : wait;
        if (capped > 0) await new Promise((r) => setTimeout(r, capped));
        if (token.current !== my) return;
        setThinking(false);
        if (!applyMove(parseUci(uci))) setEngineError("O motor sugeriu um lance inválido; tente reiniciar a partida.");
      })
      .catch((e) => {
        if (e instanceof EngineCancelled || token.current !== my) return;
        setThinking(false);
        setEngineError(String((e as Error).message || e));
      });
    return () => {
      h.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, records.length, botColor, bot]);

  // ----- clock ticking & flag detection (timestamps, robust to tab suspension) -----
  useEffect(() => {
    if (phase !== "playing" || !timed) return;
    const check = () => {
      const k = clock.current;
      if (k.running && remaining(k.running) <= 0) {
        const flagged = k.running;
        k[flagged] = 0;
        const winner: Color = flagged === "w" ? "b" : "w";
        if (!canStillMate(chessRef.current, winner)) finish("1/2-1/2", "timeout-insufficient", records);
        else finish(winner === "w" ? "1-0" : "0-1", "timeout", records);
        return;
      }
      setTick((t) => (t + 1) % 1000000);
    };
    const id = setInterval(check, 100);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timed, records, finish]);

  // ----- optional live evaluation (off by default) -----
  useEffect(() => {
    if (!settings.playEvalBar || phase === "setup") {
      setLiveScore(null);
      return;
    }
    const h = getAnalysisEngine().search(shownFen, { depth: 14 });
    h.promise.then((r) => r.lines[0] && setLiveScore(r.lines[0].score)).catch(() => {});
    return () => h.cancel();
  }, [shownFen, settings.playEvalBar, phase]);

  useEffect(() => () => {
    botHandle.current?.cancel();
    token.current++;
  }, []);

  // ----- actions -----
  const start = (opts?: { swap?: boolean; resume?: OngoingGame }) => {
    const r = opts?.resume;
    const b = botById(r ? r.botId : botId);
    let pc: Color;
    if (r) pc = r.playerColor;
    else if (opts?.swap) pc = playerColor === "w" ? "b" : "w";
    else pc = colorChoice === "r" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice;
    const t = r
      ? { id: r.timeControl, baseMs: r.baseMs, incMs: r.incMs }
      : tcId === "custom"
        ? { id: `${custom.min}+${custom.inc}`, baseMs: Math.round(custom.min * 60000), incMs: custom.inc * 1000 }
        : (() => {
            const x = TIME_CONTROLS.find((x) => x.id === tcId)!;
            return { id: x.id, baseMs: x.baseMs, incMs: x.incMs };
          })();
    const sf = r ? r.startFen : opts?.swap ? startFen : presetFen;
    const c = new Chess(sf);
    const recs: MoveRecord[] = [];
    if (r) {
      for (const u of r.moves) {
        try {
          recs.push(toRecord(c.move(parseUci(u))));
        } catch {
          break;
        }
      }
    }
    token.current++;
    botHandle.current?.cancel();
    chessRef.current = c;
    clock.current = r
      ? { w: r.clocks.w, b: r.clocks.b, running: recs.length && t.baseMs ? (c.turn() as Color) : null, since: performance.now() }
      : { w: t.baseMs, b: t.baseMs, running: null, since: 0 };
    setBot(b);
    setPlayerColor(pc);
    setOrientation(pc);
    setTc(t);
    setUndoAllowed(t.baseMs === 0 && (r ? true : allowUndo));
    setStartFen(sf);
    setRecords(recs);
    setView(recs.length - 1);
    setResult(null);
    setShowResult(false);
    setEngineError(null);
    startedAt.current = Date.now();
    setPhase("playing");
    getPlayEngine().init().catch(() => setEngineError("Não foi possível carregar o Stockfish neste navegador."));
  };

  const takeBack = () => {
    if (!undoAllowed || phase !== "playing") return;
    botHandle.current?.cancel();
    token.current++;
    setThinking(false);
    const c = chessRef.current;
    const recs = [...records];
    // undo the bot reply (if any) and the player's last move
    let n = 0;
    while (recs.length && n < 2) {
      const last = recs[recs.length - 1];
      c.undo();
      recs.pop();
      n++;
      if (last.color === playerColor) break;
    }
    setRecords(recs);
    setView(recs.length - 1);
    persistOngoing(recs);
  };

  const offerDraw = async () => {
    if (phase !== "playing") return;
    toast(`${bot.name} está considerando o empate…`);
    try {
      const r = await getAnalysisEngine().search(chessRef.current.fen(), { depth: 12 }).promise;
      const s = r.lines[0]?.score;
      const cp = s ? (s.mate !== undefined ? (s.mate > 0 ? 10000 : -10000) : s.cp ?? 0) : 0;
      const botCp = botColor === "w" ? cp : -cp;
      const accept = botCp <= -150 || (Math.abs(botCp) <= 30 && records.length >= 60);
      if (accept && phase === "playing") {
        toast(`${bot.name} aceitou o empate.`, "ok");
        finish("1/2-1/2", "agreement", records);
      } else toast(`${bot.name} recusou o empate e quer continuar jogando.`, "info");
    } catch {
      toast("Não foi possível consultar o bot agora.", "err");
    }
  };

  const resign = () => {
    setConfirmResign(false);
    if (phase !== "playing") return;
    finish(playerColor === "w" ? "0-1" : "1-0", "resign", records);
  };

  const pgnNow = () =>
    buildPgn(
      startFen,
      records.map((r) => r.san),
      { White: playerColor === "w" ? getState().profileName : bot.name, Black: playerColor === "b" ? getState().profileName : bot.name },
      result?.result ?? "*"
    );

  // ----- derived for display -----
  const mat = materialCount(shownFen);
  const lastRec = view >= 0 ? records[view] : null;
  const shownChess = useMemo(() => new Chess(shownFen), [shownFen]);
  const mated = shownChess.isCheckmate();
  const botStats = (id: string) => {
    const g = games.filter((x) => x.botId === id);
    return { w: g.filter((x) => x.outcome === "win").length, l: g.filter((x) => x.outcome === "loss").length, d: g.filter((x) => x.outcome === "draw").length };
  };

  const topColor: Color = orientation === "w" ? "b" : "w";
  const playerBar = (color: Color) => {
    const isBot = phase !== "setup" ? color === botColor : color !== (colorChoice === "b" ? "b" : "w");
    const b = phase === "setup" ? botById(botId) : bot;
    const caps = color === "w" ? mat.capturedByW : mat.capturedByB;
    const adv = color === "w" ? mat.w - mat.b : mat.b - mat.w;
    const ms = timed && phase !== "setup" ? remaining(color) : null;
    const active = phase === "playing" && timed && clock.current.running === color;
    return (
      <div className="player-bar">
        {isBot ? <Avatar piece={b.piece} color={b.color} size={38} label={b.name} /> : <UserAvatar name={getState().profileName} size={38} />}
        <div className="who">
          <div className="name">
            {isBot ? b.name : getState().profileName}
            {isBot && <span className="chip">{b.levelName}</span>}
            {isBot && thinking && phase === "playing" && color === botColor && (
              <span className="thinking" aria-live="polite">
                <span className="thinking-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="sr-only">{b.name} está pensando</span>
              </span>
            )}
          </div>
          <div className="captured" aria-label="Peças capturadas">
            {caps.map((t: PieceType, i) => (
              <img key={i} src={pieceUrl(settings.pieceSet, color === "w" ? "b" : "w", t)} alt="" />
            ))}
            {adv > 0 && <span className="adv">+{adv}</span>}
          </div>
        </div>
        {ms !== null && <div className={`clock ${active ? "active" : ""} ${ms < 20000 ? "low" : ""} ${ms <= 0 ? "flag" : ""}`} aria-label={`Relógio: ${fmtClock(ms)}`}>{fmtClock(ms)}</div>}
      </div>
    );
  };

  const movable: Color | "none" = phase === "playing" && atLatest && !thinking ? playerColor : "none";

  return (
    <div className="page">
      <div className="game-layout">
        <div className={`board-col ${phase === "setup" ? "setup-hide-m" : "sticky-m"}`}>
          {playerBar(topColor)}
          <div className="board-row">
            {settings.playEvalBar && phase !== "setup" && <EvalBar score={liveScore} orientation={orientation} />}
            <div className="board-holder">
              <Board
                fen={phase === "setup" ? presetFen : shownFen}
                orientation={orientation}
                movable={movable}
                onMove={onUserMove}
                lastMove={lastRec ? { from: lastRec.from, to: lastRec.to } : null}
                mated={mated}
              />
            </div>
          </div>
          {playerBar(orientation)}
          {phase !== "setup" && (
            <MobileNav
              index={view}
              length={records.length}
              onGo={(i) => setView(Math.max(-1, Math.min(records.length - 1, i)))}
              label={
                phase === "over" ? (
                  <span className="small">{result ? (result.outcome === "win" ? "Você venceu" : result.outcome === "loss" ? "Derrota" : "Empate") : "Fim"}</span>
                ) : !atLatest ? (
                  <span className="small" style={{ color: "var(--warning)" }}>Vendo lance anterior</span>
                ) : (
                  <span className="small">{turn === playerColor ? "Sua vez" : thinking ? `${bot.name} pensando…` : "Vez do bot"}</span>
                )
              }
              extra={
                <button className="icon-btn" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))} aria-label="Girar tabuleiro">
                  <RefreshCw size={17} />
                </button>
              }
            />
          )}
        </div>

        <div className="side-panel">
          {phase === "setup" ? (
            <SetupPanel
              botId={botId}
              setBotId={setBotId}
              colorChoice={colorChoice}
              setColorChoice={(c) => {
                setColorChoice(c);
              }}
              tcId={tcId}
              setTcId={setTcId}
              custom={custom}
              setCustom={setCustom}
              allowUndo={allowUndo}
              setAllowUndo={setAllowUndo}
              botStats={botStats}
              onStart={() => start()}
              ongoing={ongoing}
              onResume={() => ongoing && start({ resume: ongoing })}
              onDiscard={() => setState((s) => ({ ...s, ongoing: null }))}
              presetName={presetName ?? (presetFen !== START_FEN ? "Posição personalizada" : null)}
            />
          ) : (
            <div className="card">
              <div className="card-head desktop-only">
                <div className="row" style={{ minWidth: 0 }}>
                  <Avatar piece={bot.piece} color={bot.color} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <b>{bot.name}</b>
                    <div className="xs faint">
                      {bot.levelName} · ≈{bot.rating} (estimado) · {tc.baseMs ? tc.id.replace("+", " | ") : "sem relógio"}
                    </div>
                  </div>
                </div>
                {phase === "playing" ? (
                  <span className={`chip ${turn === playerColor ? "green" : ""}`}>{turn === playerColor ? "Sua vez" : thinking ? "Pensando…" : "Vez do bot"}</span>
                ) : (
                  <span className="chip">Partida encerrada</span>
                )}
              </div>
              {engineError && (
                <div className="feedback bad" style={{ margin: 12 }}>
                  <div>
                    <h3>Problema com o motor</h3>
                    <p>{engineError}</p>
                    <button
                      className="btn sm"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        setEngineError(null);
                        getPlayEngine()
                          .restart()
                          .then(() => setRecords((r) => [...r]))
                          .catch(() => setEngineError("O motor não pôde ser reiniciado."));
                      }}
                    >
                      <RotateCcw size={15} /> Reiniciar motor
                    </button>
                  </div>
                </div>
              )}
              <MoveList records={records} startFen={startFen} current={view} onSelect={setView} />
              <div className="desktop-only">
                <NavControls index={view} length={records.length} onGo={(i) => setView(Math.max(-1, Math.min(records.length - 1, i)))} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
              </div>
              <div className="actions-grid">
                {phase === "playing" ? (
                  <>
                    <button className="btn sm" onClick={takeBack} disabled={!undoAllowed || records.length === 0} title={undoAllowed ? "Desfazer seu último lance" : "Desfazer só é permitido em partidas sem relógio"}>
                      <Undo2 size={16} /> <span className="lbl">Desfazer</span>
                    </button>
                    <button className="btn sm" onClick={offerDraw} disabled={records.length < 2}>
                      <Handshake size={16} /> <span className="lbl">Empate</span>
                    </button>
                    <button className="btn sm danger" onClick={() => (settings.confirmResign ? setConfirmResign(true) : resign())}>
                      <Flag size={16} /> <span className="lbl">Desistir</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn sm primary" onClick={() => result && navigate(`/revisao/${result.gameId}`)}>
                      <Microscope size={16} /> <span className="lbl">Analisar</span>
                    </button>
                    <button className="btn sm" onClick={() => start({ swap: false })}>
                      <RotateCcw size={16} /> <span className="lbl">Revanche</span>
                    </button>
                    <button className="btn sm" onClick={() => setPhase("setup")}>
                      <Swords size={16} /> <span className="lbl">Novo jogo</span>
                    </button>
                  </>
                )}
              </div>
              <div className="icon-row">
                <button
                  className="icon-btn"
                  onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
                  aria-label={settings.soundEnabled ? "Desligar som" : "Ligar som"}
                  title={settings.soundEnabled ? "Desligar som" : "Ligar som"}
                >
                  {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button className="icon-btn" onClick={() => copyText(pgnNow(), "PGN copiado")} aria-label="Copiar PGN" title="Copiar PGN">
                  <Copy size={17} />
                </button>
                {phase === "playing" && (
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      if (records.length < 2 || confirm("Reiniciar a partida? A partida atual não será salva.")) {
                        setState((s) => ({ ...s, ongoing: null }));
                        start({ resume: undefined });
                      }
                    }}
                  >
                    <RefreshCw size={14} /> Reiniciar
                  </button>
                )}
                <label className="row xs faint" style={{ gap: 6, marginLeft: "auto" }}>
                  <input type="checkbox" checked={settings.playEvalBar} onChange={(e) => updateSettings({ playEvalBar: e.target.checked })} /> Avaliação
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmResign && (
        <Modal
          title="Desistir da partida?"
          onClose={() => setConfirmResign(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmResign(false)}>
                Continuar jogando
              </button>
              <button className="btn primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} onClick={resign}>
                Desistir
              </button>
            </>
          }
        >
          <p className="muted">A partida será registrada como derrota.</p>
        </Modal>
      )}

      {showResult && result && (
        <Modal title="Fim de partida" onClose={() => setShowResult(false)} wide>
          <div className="result-hero">
            <div className={`big ${result.outcome}`}>{result.outcome === "win" ? "Você venceu!" : result.outcome === "loss" ? `${bot.name} venceu` : "Empate"}</div>
            <div className="muted">
              {result.result.replace("1/2-1/2", "½-½")} · {REASON_TEXT[result.reason]}
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <b>{Math.ceil(records.length / 2)}</b>
              <span>Lances</span>
            </div>
            <div className="stat">
              <b>
                {(() => {
                  const v = playerColor === "w" ? mat.w - mat.b : mat.b - mat.w;
                  return v > 0 ? `+${v}` : `${v}`;
                })()}
              </b>
              <span>Material</span>
            </div>
            <div className="stat">
              <b>
                {(() => {
                  const s = botStats(bot.id);
                  return `${s.w}-${s.d}-${s.l}`;
                })()}
              </b>
              <span>V-E-D vs {bot.name}</span>
            </div>
          </div>
          <p className="xs faint" style={{ textAlign: "center" }}>
            A precisão de cada lance aparece em “Analisar partida”, calculada pelo Stockfish.
          </p>
          <div className="result-actions">
            <button className="btn primary lg" onClick={() => navigate(`/revisao/${result.gameId}`)}>
              <Microscope size={18} /> Analisar partida
            </button>
            <div className="row wrap" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => start()}>
                <RotateCcw size={16} /> Revanche
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowResult(false);
                  setPhase("setup");
                }}
              >
                <Swords size={16} /> Trocar adversário
              </button>
              <button className="btn" onClick={() => downloadText(`partida-${result.gameId}.pgn`, pgnNow())}>
                <Download size={16} /> Baixar PGN
              </button>
              <button className="btn" onClick={() => copyText(pgnNow(), "PGN copiado")}>
                <Copy size={16} /> Copiar PGN
              </button>
            </div>
            <p className="xs faint">A partida foi salva no seu histórico (Progresso).</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SetupProps {
  botId: string;
  setBotId: (id: string) => void;
  colorChoice: "w" | "b" | "r";
  setColorChoice: (c: "w" | "b" | "r") => void;
  tcId: string;
  setTcId: (id: string) => void;
  custom: { min: number; inc: number };
  setCustom: (c: { min: number; inc: number }) => void;
  allowUndo: boolean;
  setAllowUndo: (v: boolean) => void;
  botStats: (id: string) => { w: number; l: number; d: number };
  onStart: () => void;
  ongoing: OngoingGame | null;
  onResume: () => void;
  onDiscard: () => void;
  presetName: string | null;
}

function SetupPanel(p: SetupProps) {
  const bot = botById(p.botId);
  const s = p.botStats(bot.id);
  const total = s.w + s.l + s.d;
  const untimed = p.tcId === "none";
  return (
    <>
      {p.ongoing && (
        <div className="card pad">
          <div className="row between wrap">
            <div>
              <b>Partida em andamento</b>
              <div className="xs faint">
                Contra {botById(p.ongoing.botId).name} · {Math.ceil(p.ongoing.moves.length / 2)} lances
              </div>
            </div>
            <div className="row">
              <button className="btn sm ghost" onClick={p.onDiscard}>
                Descartar
              </button>
              <button className="btn sm primary" onClick={p.onResume}>
                <PlayIcon size={15} /> Continuar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card setup-card">
        <div className="card-body setup-body">
          {p.presetName && (
            <div className="feedback info">
              <p>
                <b>Começando de uma posição:</b> {p.presetName}
              </p>
            </div>
          )}
          <div>
            <div className="label">Adversário</div>
            <div className="bot-grid" role="group" aria-label="Escolha o adversário">
              {BOTS.map((b) => (
                <button key={b.id} className="bot-tile" aria-pressed={b.id === p.botId} onClick={() => p.setBotId(b.id)} title={b.description}>
                  <Avatar piece={b.piece} color={b.color} size={38} />
                  <b>{b.name.replace("Stockfish 18", "Stockfish")}</b>
                  <span>{b.levelName}</span>
                </button>
              ))}
            </div>
            <div className="bot-summary">
              <div className="row between" style={{ gap: 8 }}>
                <b>
                  {bot.name} <span className="faint xs">· ≈{bot.rating} (estimado)</span>
                </b>
                <LevelDots level={bot.level} />
              </div>
              <p className="xs muted">{bot.description}</p>
              {total > 0 && (
                <p className="xs faint">
                  Você contra {bot.name}: {s.w}V · {s.d}E · {s.l}D
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="label">Jogar com</div>
            <div className="color-pick" role="group" aria-label="Cor">
              <button aria-pressed={p.colorChoice === "w"} onClick={() => p.setColorChoice("w")}>
                <PieceIcon type="k" color="w" size={22} /> Brancas
              </button>
              <button aria-pressed={p.colorChoice === "r"} onClick={() => p.setColorChoice("r")}>
                <Shuffle size={18} /> Sortear
              </button>
              <button aria-pressed={p.colorChoice === "b"} onClick={() => p.setColorChoice("b")}>
                <PieceIcon type="k" color="b" size={22} /> Pretas
              </button>
            </div>
          </div>

          <div>
            <div className="label">Tempo</div>
            <div className="tc-grid" role="group" aria-label="Controle de tempo">
              {TIME_CONTROLS.map((t) => (
                <button key={t.id} className={`tc-btn ${t.id === "none" ? "wide" : ""}`} aria-pressed={p.tcId === t.id} onClick={() => p.setTcId(t.id)} title={t.group}>
                  {t.id === "none" ? "Sem relógio" : t.label}
                </button>
              ))}
              <button className="tc-btn" aria-pressed={p.tcId === "custom"} onClick={() => p.setTcId("custom")}>
                Outro
              </button>
            </div>
            {p.tcId === "custom" && (
              <div className="grid-2" style={{ marginTop: 8, gap: 8 }}>
                <label className="field">
                  Minutos
                  <input className="input" type="number" min={0.5} max={180} step={0.5} value={p.custom.min} onChange={(e) => p.setCustom({ ...p.custom, min: Math.max(0.5, Math.min(180, +e.target.value || 1)) })} />
                </label>
                <label className="field">
                  Incremento (s)
                  <input className="input" type="number" min={0} max={60} value={p.custom.inc} onChange={(e) => p.setCustom({ ...p.custom, inc: Math.max(0, Math.min(60, +e.target.value || 0)) })} />
                </label>
              </div>
            )}
            {untimed && (
              <div style={{ marginTop: 10 }}>
                <Switch checked={p.allowUndo} onChange={p.setAllowUndo} label={<span className="small">Permitir desfazer lances</span>} />
              </div>
            )}
          </div>
        </div>
        <div className="setup-go">
          <button className="btn primary lg block" onClick={p.onStart}>
            <Swords size={18} /> Jogar contra {bot.name.replace("Stockfish 18", "o Stockfish")}
          </button>
        </div>
      </div>
    </>
  );
}

function LevelDots({ level }: { level: number }) {
  return (
    <span className="level-dots" aria-label={`Nível ${level} de 7`}>
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} className={i < level ? "on" : ""} />
      ))}
    </span>
  );
}
