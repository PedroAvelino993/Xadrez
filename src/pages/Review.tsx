import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Info, Pause, Play, X, Eye, EyeOff, Microscope, Copy } from "lucide-react";
import Board, { type Arrow, type BoardMove } from "../components/Board";
import EvalBar from "../components/EvalBar";
import EvalGraph from "../components/EvalGraph";
import MoveList from "../components/MoveList";
import NavControls from "../components/NavControls";
import MoveVerdict from "../components/MoveVerdict";
import EngineLines from "../components/EngineLines";
import { Avatar, ClassIcon, CLASS_LABEL, Modal, UserAvatar, copyText, downloadText } from "../components/ui";
import { buildReview, evaluatePositions, ReviewControl, type GameReview, type PositionEval } from "../analysis/review";
import { EngineCancelled } from "../engine/stockfish";
import { formatScore } from "../engine/score";
import { parseUci, toRecord, sanLineFromUci, REASON_TEXT } from "../chess/rules";
import type { Classification, Color, MoveRecord } from "../types";
import { getState, useAppState, useSettings } from "../storage/store";
import { botById } from "../bots/bots";
import { playForSan } from "../sound/sound";
import { useLiveAnalysis } from "../hooks/useLiveAnalysis";
import "./review.css";

let imported: { startFen: string; records: MoveRecord[] } | null = null;
export function setImportedGame(g: { startFen: string; records: MoveRecord[] }) {
  imported = g;
}

const SHOWN: Classification[] = ["best", "excellent", "good", "book", "inaccuracy", "mistake", "blunder", "forced"];

function cacheKey(id: string) {
  return `lance-certo:review:${id}`;
}
function loadCached(id: string, depth: number, n: number): PositionEval[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as { depth: number; positions: PositionEval[] };
    if (d.depth < depth || d.positions.length !== n) return null;
    return d.positions;
  } catch {
    return null;
  }
}
function saveCached(id: string, depth: number, positions: PositionEval[]) {
  try {
    const slim = positions.map((p) => ({ ...p, pv: p.pv.slice(0, 10), second: p.second ? { score: p.second.score, pv: p.second.pv.slice(0, 2) } : undefined }));
    localStorage.setItem(cacheKey(id), JSON.stringify({ depth, positions: slim }));
  } catch {
    /* quota: skip caching */
  }
}

export default function ReviewPage({ gameId }: { gameId?: string }) {
  const settings = useSettings();
  const games = useAppState((s) => s.games);
  const saved = games.find((g) => g.id === gameId);

  const game = useMemo(() => {
    if (gameId === "importada" && imported) return { id: "importada", startFen: imported.startFen, records: imported.records, saved: null };
    if (!saved) return null;
    const c = new Chess(saved.startFen);
    const records: MoveRecord[] = [];
    for (const san of saved.moves) {
      try {
        records.push(toRecord(c.move(san)));
      } catch {
        break;
      }
    }
    return { id: saved.id, startFen: saved.startFen, records, saved };
  }, [gameId, saved]);

  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "moves">("summary");
  const [view, setView] = useState(-1);
  const [showBefore, setShowBefore] = useState(false);
  const [auto, setAuto] = useState(false);
  const [orientation, setOrientation] = useState<Color>(game?.saved?.playerColor ?? "w");
  const [explore, setExplore] = useState<{ startFen: string; records: MoveRecord[]; view: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const ctl = useRef<ReviewControl | null>(null);

  const run = async () => {
    if (!game) return;
    setError(null);
    setReview(null);
    const fens = [game.startFen, ...game.records.map((r) => r.fenAfter)];
    const depth = settings.reviewDepth;
    const cached = loadCached(game.id, depth, fens.length);
    try {
      let positions = cached;
      if (!positions) {
        ctl.current?.cancel();
        const c = new ReviewControl();
        ctl.current = c;
        setProgress({ done: 0, total: fens.length });
        positions = await evaluatePositions(fens, depth, c, (done, total) => setProgress({ done, total }));
        if (game.id !== "importada") saveCached(game.id, depth, positions);
      }
      setProgress(null);
      const r = await buildReview(game.startFen, game.records, positions, depth);
      setReview(r);
    } catch (e) {
      setProgress(null);
      if (e instanceof EngineCancelled) return;
      setError(String((e as Error).message ?? e));
    }
  };

  useEffect(() => {
    if (game) void run();
    return () => ctl.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  // autoplay
  useEffect(() => {
    if (!auto || !game) return;
    const id = setInterval(() => {
      setView((v) => {
        if (v >= game.records.length - 1) {
          setAuto(false);
          return v;
        }
        const nv = v + 1;
        playForSan(game.records[nv].san);
        return nv;
      });
    }, 1400);
    return () => clearInterval(id);
  }, [auto, game]);

  const exploreFen = explore ? (explore.view < 0 ? explore.startFen : explore.records[explore.view].fenAfter) : null;
  const live = useLiveAnalysis(exploreFen, !!explore, Math.min(settings.analysisDepth, 20), 3);

  if (!game) {
    return (
      <div className="page">
        <div className="card pad empty">
          Partida não encontrada. As partidas jogadas aparecem em <a href="#/progresso">Progresso</a>; você também pode colar um PGN em <a href="#/analisar">Analisar</a>.
        </div>
      </div>
    );
  }

  const rec = view >= 0 ? game.records[view] : null;
  const mv = review && view >= 0 ? review.moves[view] : null;
  const positionScore = review ? review.positions[view + 1]?.score : null;

  // ----- board state -----
  let boardFen = rec ? (showBefore ? rec.fenBefore : rec.fenAfter) : game.startFen;
  let lastMove = rec && !showBefore ? { from: rec.from, to: rec.to } : null;
  const arrows: Arrow[] = [];
  if (mv && mv.best && mv.best !== rec!.uci && mv.cls !== "book" && mv.cls !== "best") {
    arrows.push({ from: mv.best.slice(0, 2), to: mv.best.slice(2, 4), color: "green" });
    if (showBefore) arrows.push({ from: rec!.from, to: rec!.to, color: mv.cls === "blunder" || mv.cls === "mistake" ? "red" : "yellow", opacity: 0.85 });
  }
  if (explore) {
    boardFen = exploreFen!;
    const er = explore.view >= 0 ? explore.records[explore.view] : null;
    lastMove = er ? { from: er.from, to: er.to } : null;
    arrows.length = 0;
    const top = live.result?.lines[0];
    if (top?.pv[0]) arrows.push({ from: top.pv[0].slice(0, 2), to: top.pv[0].slice(2, 4), color: "green" });
  }

  const startExplore = () => {
    if (!rec || !mv) return;
    const c = new Chess(rec.fenBefore);
    const recs: MoveRecord[] = [];
    for (const u of mv.bestPv.slice(0, 10)) {
      try {
        recs.push(toRecord(c.move(parseUci(u))));
      } catch {
        break;
      }
    }
    setAuto(false);
    setExplore({ startFen: rec.fenBefore, records: recs, view: recs.length ? 0 : -1 });
  };

  const onExploreMove = (m: BoardMove) => {
    if (!explore) return false;
    const c = new Chess(exploreFen!);
    try {
      const r = toRecord(c.move(m));
      playForSan(r.san);
      const recs = [...explore.records.slice(0, explore.view + 1), r];
      setExplore({ ...explore, records: recs, view: recs.length - 1 });
      return true;
    } catch {
      return false;
    }
  };

  const annotatedPgn = () => {
    const h = game.saved?.pgn ? game.saved.pgn.split("\n\n")[0] : `[Event "Partida importada"]\n[Site "Lance Certo"]\n${game.startFen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w") ? "" : `[SetUp "1"]\n[FEN "${game.startFen}"]\n`}`;
    const parts: string[] = [];
    game.records.forEach((r, i) => {
      const num = r.color === "w" ? `${Math.floor(i / 2) + 1}. ` : i === 0 ? "1... " : "";
      const m = review?.moves[i];
      const nag = m ? ({ blunder: " $4", mistake: " $2", inaccuracy: " $6", excellent: " $1", best: "", good: "", book: "", forced: "" } as Record<Classification, string>)[m.cls] : "";
      let com = "";
      if (m) {
        const best = m.best && m.best !== r.uci && !["best", "book"].includes(m.cls) ? ` Melhor: ${sanLineFromUci(r.fenBefore, [m.best])[0]}.` : "";
        com = ` { ${CLASS_LABEL[m.cls]}. [%eval ${formatScore(m.after).replace("M", "#").replace("+", "")}]${best} }`;
      }
      parts.push(`${num}${r.san}${nag}${com}`);
    });
    const result = game.saved?.result ?? "*";
    return `${h.trim()}\n[Annotator "Lance Certo · Stockfish 18 (profundidade ${review?.depth ?? "-"})"]\n\n${parts.join(" ")} ${result}\n`;
  };

  const playerName = (c: Color) => {
    if (!game.saved) return c === "w" ? "Brancas" : "Pretas";
    return c === game.saved.playerColor ? getState().profileName : botById(game.saved.botId).name;
  };
  const playerAvatar = (c: Color) => {
    if (!game.saved) return null;
    if (c === game.saved.playerColor) return <UserAvatar name={getState().profileName} size={34} />;
    const b = botById(game.saved.botId);
    return <Avatar piece={b.piece} color={b.color} size={34} />;
  };

  const classes = review?.moves.map((m) => m.cls);

  return (
    <div className="page">
      <div className="game-layout">
        <div className="board-col">
          <div className="board-row">
            <EvalBar score={explore ? live.result?.lines[0]?.score ?? null : showBefore && mv ? mv.before : positionScore ?? null} orientation={orientation} loading={!!progress || live.running} />
            <div className="board-holder">
              <Board
                fen={boardFen}
                orientation={orientation}
                movable={explore ? "both" : "none"}
                onMove={onExploreMove}
                lastMove={lastMove}
                arrows={arrows}
                badge={!explore && mv && rec && !showBefore ? { square: rec.to, kind: mv.cls } : null}
                mated={new Chess(boardFen).isCheckmate()}
              />
            </div>
          </div>
          {review && !explore && <EvalGraph scores={review.positions.map((p) => p.score)} classes={classes} current={view} onSelect={(i) => { setView(i); setTab("moves"); }} />}
        </div>

        <div className="side-panel">
          {progress && (
            <div className="card pad">
              <div className="row between">
                <h3 className="row">
                  <span className="spinner" /> Analisando a partida…
                </h3>
                <button className="btn sm ghost" onClick={() => ctl.current?.cancel()}>
                  <X size={15} /> Cancelar
                </button>
              </div>
              <div className="progress" style={{ margin: "14px 0 8px" }}>
                <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <div className="xs faint">
                Posição {progress.done} de {progress.total} · Stockfish 18, profundidade {settings.reviewDepth}. A análise roda em segundo plano; você pode navegar pelos lances enquanto isso.
              </div>
            </div>
          )}
          {!progress && !review && (
            <div className="card pad stack">
              {error ? (
                <div className="feedback bad">
                  <div>
                    <h3>A análise não terminou</h3>
                    <p>{error}</p>
                  </div>
                </div>
              ) : (
                <p className="muted">Análise cancelada.</p>
              )}
              <button className="btn primary" onClick={run}>
                <Microscope size={16} /> Analisar partida
              </button>
            </div>
          )}

          {explore ? (
            <div className="card">
              <div className="card-head">
                <h3>Explorando uma linha</h3>
                <button className="btn sm" onClick={() => setExplore(null)}>
                  <ArrowLeft size={15} /> Voltar à revisão
                </button>
              </div>
              <EngineLines
                fen={exploreFen!}
                result={live.result}
                running={live.running}
                error={live.error}
                terminal={live.terminal}
                enabled
                onPlayLine={(pv) => {
                  const c = new Chess(exploreFen!);
                  try {
                    const r = toRecord(c.move(parseUci(pv[0])));
                    const recs = [...explore.records.slice(0, explore.view + 1), r];
                    setExplore({ ...explore, records: recs, view: recs.length - 1 });
                  } catch {
                    /* ignore */
                  }
                }}
                targetDepth={Math.min(settings.analysisDepth, 20)}
              />
              <MoveList records={explore.records} startFen={explore.startFen} current={explore.view} onSelect={(i) => setExplore({ ...explore, view: i })} emptyText="Jogue lances para explorar." />
              <NavControls index={explore.view} length={explore.records.length} onGo={(i) => setExplore({ ...explore, view: Math.max(-1, Math.min(explore.records.length - 1, i)) })} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
            </div>
          ) : (
            review && (
              <div className="card">
                <div className="tabs" role="tablist">
                  <button role="tab" aria-selected={tab === "summary"} onClick={() => setTab("summary")}>
                    Resumo
                  </button>
                  <button role="tab" aria-selected={tab === "moves"} onClick={() => setTab("moves")}>
                    Lance a lance
                  </button>
                </div>

                {tab === "summary" ? (
                  <div className="card-body stack">
                    <div className="acc-row">
                      {(["w", "b"] as Color[]).map((c) => (
                        <div key={c} className={`acc ${c}`}>
                          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                            {playerAvatar(c)}
                            <span className="small" style={{ fontWeight: 650 }}>
                              {playerName(c)}
                            </span>
                          </div>
                          <div className="acc-num">{review.accuracy[c] !== null ? review.accuracy[c]!.toFixed(1) : "–"}</div>
                          <div className="xs faint">precisão estimada</div>
                        </div>
                      ))}
                    </div>
                    {game.saved && (
                      <div className="small muted" style={{ textAlign: "center" }}>
                        Resultado: <b>{game.saved.result.replace("1/2-1/2", "½-½")}</b> {REASON_TEXT[game.saved.reason]}
                      </div>
                    )}
                    {review.opening && (
                      <div className="small" style={{ textAlign: "center" }}>
                        <span className="faint">Abertura:</span> {review.opening}
                      </div>
                    )}
                    <table className="table class-table">
                      <thead>
                        <tr>
                          <th className="num">{playerName("w")}</th>
                          <th style={{ textAlign: "center" }}>Classificação</th>
                          <th className="num" style={{ textAlign: "right" }}>
                            {playerName("b")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {SHOWN.map((k) => (
                          <tr key={k}>
                            <td className="num">{review.counts.w[k]}</td>
                            <td>
                              <span className="row" style={{ gap: 8, justifyContent: "center" }}>
                                <ClassIcon kind={k} size={18} /> {CLASS_LABEL[k]}
                              </span>
                            </td>
                            <td className="num" style={{ textAlign: "right" }}>
                              {review.counts.b[k]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div>
                      <h3 style={{ marginBottom: 8 }}>Momentos decisivos</h3>
                      {review.keyMoments.length === 0 ? (
                        <p className="small faint">Nenhum lance perdeu 10% ou mais de chance de vitória. Partida bem jogada pelos dois lados!</p>
                      ) : (
                        <div className="moments">
                          {review.keyMoments.map((i) => {
                            const m = review.moves[i];
                            return (
                              <button
                                key={i}
                                className="moment"
                                onClick={() => {
                                  setView(i);
                                  setTab("moves");
                                }}
                              >
                                <ClassIcon kind={m.cls} size={20} />
                                <span>
                                  <b>
                                    {Math.floor(i / 2) + 1}
                                    {m.record.color === "w" ? "." : "..."} {m.record.san}
                                  </b>{" "}
                                  <span className="faint small">
                                    {formatScore(m.before)} → {formatScore(m.after)}
                                  </span>
                                  <span className="xs muted" style={{ display: "block" }}>
                                    {m.explanation[0]}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="row wrap">
                      <button
                        className="btn primary"
                        onClick={() => {
                          setView(0);
                          setTab("moves");
                        }}
                      >
                        <Play size={16} /> Revisar lance a lance
                      </button>
                      <button className="btn" onClick={() => downloadText(`revisao-${game.id}.pgn`, annotatedPgn())}>
                        <Download size={16} /> PGN anotado
                      </button>
                      <button className="btn ghost" onClick={() => copyText(annotatedPgn(), "PGN anotado copiado")}>
                        <Copy size={16} />
                      </button>
                      <button className="btn ghost" onClick={() => setAboutOpen(true)}>
                        <Info size={16} /> Como é calculado
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {mv && rec ? (
                      <MoveVerdict
                        san={rec.san}
                        color={rec.color}
                        cls={mv.cls}
                        before={mv.before}
                        after={mv.after}
                        explanation={mv.explanation}
                        fenBefore={rec.fenBefore}
                        bestPv={mv.bestPv}
                        playedUci={rec.uci}
                        onShowLine={startExplore}
                      />
                    ) : (
                      <div className="verdict">
                        <p className="muted small">Posição inicial. Use → ou clique num lance para começar.</p>
                      </div>
                    )}
                    <MoveList records={game.records} startFen={game.startFen} current={view} onSelect={setView} classes={classes} />
                    <NavControls
                      index={view}
                      length={game.records.length}
                      onGo={(i) => {
                        setAuto(false);
                        setView(Math.max(-1, Math.min(game.records.length - 1, i)));
                      }}
                      onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
                      extra={
                        <>
                          <button className={`icon-btn ${auto ? "active" : ""}`} onClick={() => setAuto((a) => !a)} aria-label={auto ? "Pausar reprodução" : "Reproduzir partida"} title={auto ? "Pausar" : "Reprodução automática"}>
                            {auto ? <Pause size={18} /> : <Play size={18} />}
                          </button>
                          <button className={`icon-btn ${showBefore ? "active" : ""}`} onClick={() => setShowBefore((b) => !b)} disabled={!rec} aria-label="Alternar posição antes/depois do lance" title={showBefore ? "Mostrando a posição ANTES do lance" : "Mostrar a posição antes do lance"}>
                            {showBefore ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </>
                      }
                    />
                    {showBefore && rec && <div className="xs faint" style={{ padding: "0 14px 10px", textAlign: "center" }}>Posição antes de {rec.san}: seta verde = melhor lance; seta vermelha/amarela = lance jogado.</div>}
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>
      {aboutOpen && (
        <Modal title="Como a análise é calculada" onClose={() => setAboutOpen(false)} wide>
          <div className="stack small muted">
            <p>
              Cada posição da partida é avaliada pelo <b>Stockfish 18</b> (versão WebAssembly, profundidade {review?.depth ?? settings.reviewDepth}, ajustável em Configurações). A avaliação é convertida em <b>chance de vitória</b> com o modelo logístico publicado pelo Lichess:
              <span className="mono"> 50 + 50·(2/(1+e^(−0,00368·cp)) − 1)</span>.
            </p>
            <p>
              A classificação de um lance usa a <b>perda de chance de vitória</b> de quem jogou, comparando a melhor avaliação antes do lance com a avaliação depois dele. Assim o contexto conta: perder um peão numa posição equilibrada pesa muito mais do que numa posição já ganha. Um lance nunca é chamado de erro só por ser diferente da 1ª sugestão do motor.
            </p>
            <ul>
              <li>Melhor lance: o lance do motor ou outro que mantém a mesma avaliação</li>
              <li>Excelente: perde menos de 2%</li>
              <li>Bom: menos de 5%</li>
              <li>Imprecisão: menos de 10%</li>
              <li>Erro: menos de 20%</li>
              <li>Erro grave: 20% ou mais</li>
              <li>Teórico: posição presente na biblioteca de aberturas do Lichess (CC0)</li>
              <li>Forçado: era o único lance legal</li>
            </ul>
            <p>
              A <b>precisão</b> usa a fórmula pública do Lichess por lance (103,17·e^(−0,0435·perda) − 3,17) e a média entre uma média ponderada pela volatilidade e uma média harmônica. É uma <b>estimativa deste aplicativo</b>, não uma métrica oficial e não é comparável diretamente com outros sites.
            </p>
            <p>As explicações só descrevem fatos verificados na posição: capturas e ataques reais, mates encontrados pelo motor e o material ganho ao longo da linha principal.</p>
          </div>
        </Modal>
      )}
      {review && !explore && tab === "moves" && view === game.records.length - 1 && game.saved && (
        <div className="sr-only" aria-live="polite">
          Fim da partida
        </div>
      )}
    </div>
  );
}
