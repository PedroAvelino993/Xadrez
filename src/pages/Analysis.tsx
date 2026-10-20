import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Download, FileInput, Lightbulb, Microscope, PencilRuler, RotateCcw, Swords, Trash2 } from "lucide-react";
import Board, { type Arrow, type BoardMove } from "../components/Board";
import EvalBar from "../components/EvalBar";
import EngineLines from "../components/EngineLines";
import MoveList from "../components/MoveList";
import NavControls from "../components/NavControls";
import MoveVerdict from "../components/MoveVerdict";
import ImportModal from "../components/ImportModal";
import { copyText, downloadText, toast } from "../components/ui";
import { useLiveAnalysis, useEvalOnce } from "../hooks/useLiveAnalysis";
import { buildPgn, parsePgn, parseUci, START_FEN, toRecord, validateFen } from "../chess/rules";
import type { Color, MoveRecord } from "../types";
import { updateSettings, useSettings } from "../storage/store";
import { playForSan } from "../sound/sound";
import { navigate } from "../hooks/useRoute";
import { classify } from "../analysis/classify";
import { explainMove } from "../analysis/explain";
import { setImportedGame } from "./Review";

export default function AnalysisPage({ fen, pgn }: { fen?: string; pgn?: string }) {
  const settings = useSettings();
  const initial = useMemo(() => {
    if (pgn) {
      try {
        const p = parsePgn(pgn);
        return { startFen: p.startFen, records: p.records };
      } catch {
        /* fall through */
      }
    }
    if (fen && validateFen(fen).ok) return { startFen: fen, records: [] as MoveRecord[] };
    return { startFen: START_FEN, records: [] as MoveRecord[] };
  }, [fen, pgn]);

  const [startFen, setStartFen] = useState(initial.startFen);
  const [records, setRecords] = useState<MoveRecord[]>(initial.records);
  const [view, setView] = useState(initial.records.length - 1);
  const [orientation, setOrientation] = useState<Color>("w");
  const [engineOn, setEngineOn] = useState(true);
  const [showArrow, setShowArrow] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setStartFen(initial.startFen);
    setRecords(initial.records);
    setView(initial.records.length - 1);
  }, [initial]);

  const current = view < 0 ? startFen : records[view].fenAfter;
  const live = useLiveAnalysis(current, engineOn, settings.analysisDepth, settings.analysisLines);
  const rec = view >= 0 ? records[view] : null;
  const beforeEval = useEvalOnce(rec ? rec.fenBefore : null, Math.min(16, settings.analysisDepth), engineOn && !!rec && !live.running);

  const onMove = (m: BoardMove) => {
    const c = new Chess(current);
    let mv;
    try {
      mv = c.move(m);
    } catch {
      return false;
    }
    const r = toRecord(mv);
    playForSan(r.san, !!r.promotion);
    // playing from an earlier position replaces the continuation
    const next = [...records.slice(0, view + 1), r];
    setRecords(next);
    setView(next.length - 1);
    return true;
  };

  const playLine = (pv: string[], upTo: number) => {
    const c = new Chess(current);
    const add: MoveRecord[] = [];
    for (const u of pv.slice(0, upTo)) {
      try {
        add.push(toRecord(c.move(parseUci(u))));
      } catch {
        break;
      }
    }
    if (!add.length) return;
    playForSan(add[add.length - 1].san);
    const next = [...records.slice(0, view + 1), ...add];
    setRecords(next);
    setView(next.length - 1);
  };

  const top = live.result?.lines[0];
  const arrows: Arrow[] = [];
  if (engineOn && showArrow && top?.pv[0]) arrows.push({ from: top.pv[0].slice(0, 2), to: top.pv[0].slice(2, 4), color: "green" });

  // verdict for the move that led to the current position
  const verdict = useMemo(() => {
    if (!rec || !beforeEval?.lines[0] || !live.result?.lines[0] || live.running) return null;
    const legal = new Chess(rec.fenBefore).moves().length;
    const before = beforeEval.lines[0].score;
    const after = live.result.lines[0].score;
    const cls = classify({ mover: rec.color, before, after, played: rec.uci, best: beforeEval.bestmove, legalCount: legal, isBook: false });
    return {
      cls,
      before,
      after,
      bestPv: beforeEval.lines[0].pv,
      explanation: explainMove({
        fenBefore: rec.fenBefore,
        fenAfter: rec.fenAfter,
        played: rec.uci,
        san: rec.san,
        mover: rec.color,
        before,
        after,
        bestPv: beforeEval.lines[0].pv,
        replyPv: live.result.lines[0].pv,
        cls,
        ply: view,
      }),
    };
  }, [rec, beforeEval, live.result, live.running, view]);

  const pgnText = () => buildPgn(startFen, records.map((r) => r.san), { Event: "Análise" });

  return (
    <div className="page">
      <div className="game-layout">
        <div className="board-col">
          <div className="board-row">
            <EvalBar score={engineOn ? top?.score ?? null : null} orientation={orientation} loading={live.running} />
            <div className="board-holder">
              <Board fen={current} orientation={orientation} movable="both" onMove={onMove} lastMove={rec ? { from: rec.from, to: rec.to } : null} arrows={arrows} badge={verdict && rec ? { square: rec.to, kind: verdict.cls } : null} />
            </div>
          </div>
          <div className="row wrap toolbar">
            <button className="btn sm" onClick={() => setImporting(true)}>
              <FileInput size={15} /> Importar FEN/PGN
            </button>
            <button className="btn sm" onClick={() => copyText(current, "FEN copiada")}>
              <ClipboardCopy size={15} /> Copiar FEN
            </button>
            <button className="btn sm" onClick={() => copyText(pgnText(), "PGN copiado")} disabled={!records.length}>
              <ClipboardCopy size={15} /> Copiar PGN
            </button>
            <button className="btn sm" onClick={() => downloadText("analise.pgn", pgnText())} disabled={!records.length}>
              <Download size={15} /> PGN
            </button>
          </div>
        </div>
        <div className="side-panel">
          <div className="card">
            <EngineLines
              fen={current}
              result={live.result}
              running={live.running}
              error={live.error}
              terminal={live.terminal}
              enabled={engineOn}
              onToggle={setEngineOn}
              onPlayLine={playLine}
              targetDepth={settings.analysisDepth}
            />
            <div className="row between engine-opts">
              <label className="row xs" style={{ gap: 6 }}>
                Linhas
                <select className="select sm-select" value={settings.analysisLines} onChange={(e) => updateSettings({ analysisLines: +e.target.value })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="row xs" style={{ gap: 6 }}>
                Profundidade
                <select className="select sm-select" value={settings.analysisDepth} onChange={(e) => updateSettings({ analysisDepth: +e.target.value })}>
                  {[12, 14, 16, 18, 20, 22, 24].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="row xs" style={{ gap: 6 }}>
                <input type="checkbox" checked={showArrow} onChange={(e) => setShowArrow(e.target.checked)} /> Seta
              </label>
            </div>
          </div>

          {rec && engineOn && (
            <div className="card">
              {verdict ? (
                <MoveVerdict
                  san={rec.san}
                  color={rec.color}
                  cls={verdict.cls}
                  before={verdict.before}
                  after={verdict.after}
                  explanation={verdict.explanation}
                  fenBefore={rec.fenBefore}
                  bestPv={verdict.bestPv}
                  playedUci={rec.uci}
                  onShowLine={() => {
                    // replace the played move with the engine's line, starting from the same position
                    const c = new Chess(rec.fenBefore);
                    const add: MoveRecord[] = [];
                    for (const u of verdict.bestPv.slice(0, 6)) {
                      try {
                        add.push(toRecord(c.move(parseUci(u))));
                      } catch {
                        break;
                      }
                    }
                    setRecords([...records.slice(0, view), ...add]);
                    setView(view);
                    toast("Linha do motor carregada. Use as setas para percorrê-la.", "info");
                  }}
                />
              ) : (
                <div className="row small muted" style={{ padding: 14 }}>
                  <span className="spinner" /> Avaliando o lance {rec.san}…
                </div>
              )}
            </div>
          )}

          <div className="card">
            <MoveList records={records} startFen={startFen} current={view} onSelect={setView} emptyText="Mova as peças para analisar. Os dois lados podem jogar." />
            <NavControls index={view} length={records.length} onGo={(i) => setView(Math.max(-1, Math.min(records.length - 1, i)))} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
            <div className="game-actions">
              <button className="btn sm" onClick={() => navigate(`/jogar?fen=${encodeURIComponent(current)}`)}>
                <Swords size={15} /> Jogar contra bot daqui
              </button>
              <button
                className="btn sm"
                disabled={records.length < 2}
                onClick={() => {
                  setImportedGame({ startFen, records });
                  navigate("/revisao/importada");
                }}
              >
                <Microscope size={15} /> Revisar partida
              </button>
              <button className="btn sm" onClick={() => navigate(`/posicoes/editor?fen=${encodeURIComponent(current)}`)}>
                <PencilRuler size={15} /> Editar posição
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  setRecords(records.slice(0, view + 1));
                }}
                disabled={view >= records.length - 1}
                title="Apagar os lances depois da posição atual"
              >
                <Trash2 size={15} /> Cortar depois
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  setStartFen(START_FEN);
                  setRecords([]);
                  setView(-1);
                }}
              >
                <RotateCcw size={15} /> Reiniciar
              </button>
            </div>
          </div>
          <div className="tip xs faint">
            <Lightbulb size={13} /> Clique com o botão direito para desenhar setas (Shift = vermelha) e círculos. Clique numa linha do motor para jogar o lance.
          </div>
        </div>
      </div>
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onFen={(f) => {
            setStartFen(f);
            setRecords([]);
            setView(-1);
            toast("Posição carregada", "ok");
          }}
          onPgn={(p) => {
            setStartFen(p.startFen);
            setRecords(p.records);
            setView(p.records.length - 1);
            toast(`Partida carregada (${p.records.length} lances)`, "ok");
          }}
        />
      )}
    </div>
  );
}
