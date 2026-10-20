import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardCopy, Cpu, FileInput, Info, Microscope, Search, Star, Swords, Trash2, AlertTriangle } from "lucide-react";
import Board, { type BoardMove } from "../components/Board";
import MoveList from "../components/MoveList";
import NavControls from "../components/NavControls";
import EngineLines from "../components/EngineLines";
import ImportModal from "../components/ImportModal";
import { copyText, San, toast } from "../components/ui";
import { loadBook, type Book, type Opening } from "../openings/book";
import { buildPgn, parseUci, START_FEN, toRecord } from "../chess/rules";
import type { Color, MoveRecord } from "../types";
import { setState, useAppState } from "../storage/store";
import { navigate } from "../hooks/useRoute";
import { useLiveAnalysis } from "../hooks/useLiveAnalysis";
import { playForSan } from "../sound/sound";
import "./openings.css";

const QUICK: { label: string; moves: string }[] = [
  { label: "Jogo Italiano", moves: "e2e4 e7e5 g1f3 b8c6 f1c4" },
  { label: "Ruy López", moves: "e2e4 e7e5 g1f3 b8c6 f1b5" },
  { label: "Defesa Siciliana", moves: "e2e4 c7c5" },
  { label: "Defesa Francesa", moves: "e2e4 e7e6" },
  { label: "Caro-Kann", moves: "e2e4 c7c6" },
  { label: "Gambito da Dama", moves: "d2d4 d7d5 c2c4" },
  { label: "Defesa Eslava", moves: "d2d4 d7d5 c2c4 c7c6" },
  { label: "Índia do Rei", moves: "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7" },
  { label: "Sistema Londres", moves: "d2d4 d7d5 c1f4" },
  { label: "Abertura Inglesa", moves: "c2c4" },
];

export default function OpeningsPage() {
  const [book, setBook] = useState<Book | null>(null);
  const [records, setRecords] = useState<MoveRecord[]>([]);
  const [view, setView] = useState(-1);
  const [orientation, setOrientation] = useState<Color>("w");
  const [query, setQuery] = useState("");
  const [engineOn, setEngineOn] = useState(false);
  const [importing, setImporting] = useState(false);
  const favs = useAppState((s) => s.favoriteLines);

  useEffect(() => {
    loadBook().then(setBook);
  }, []);

  const shown = records.slice(0, view + 1);
  const fen = view < 0 ? START_FEN : records[view].fenAfter;
  const prefix = shown.map((r) => r.uci);
  const live = useLiveAnalysis(fen, engineOn, 16, 2);

  const info = useMemo(() => {
    if (!book) return null;
    // deepest named position along the line, and the first deviation from the library
    let named: Opening | undefined;
    let deviation = -1;
    for (let i = 0; i < shown.length; i++) {
      const pre = shown.slice(0, i).map((r) => r.uci);
      const inBook = book.next(pre).some((n) => n.uci === shown[i].uci) || !!book.lookup(shown[i].fenAfter);
      if (!inBook && deviation < 0) deviation = i;
      const n = book.lookup(shown[i].fenAfter);
      if (n && deviation < 0) named = n;
    }
    return { named, deviation, next: deviation < 0 ? book.next(prefix) : [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, view, records]);

  const setLine = (ucis: string[]) => {
    const c = new Chess();
    const recs: MoveRecord[] = [];
    for (const u of ucis) {
      try {
        recs.push(toRecord(c.move(parseUci(u))));
      } catch {
        break;
      }
    }
    setRecords(recs);
    setView(recs.length - 1);
  };

  const addMove = (m: BoardMove | string) => {
    const c = new Chess(fen);
    try {
      const mv = c.move(typeof m === "string" ? parseUci(m) : m);
      const r = toRecord(mv);
      playForSan(r.san, !!r.promotion);
      const next = [...records.slice(0, view + 1), r];
      setRecords(next);
      setView(next.length - 1);
      return true;
    } catch {
      return false;
    }
  };

  const results = useMemo(() => {
    if (!book || query.trim().length < 2) return [];
    const q = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return book.list.filter((o) => norm(o.namePt).includes(q) || norm(o.name).includes(q) || o.eco.toLowerCase() === q).slice(0, 40);
  }, [book, query]);

  const lineSans = shown.map((r) => r.san);
  const lineName = info?.named?.namePt ?? "Posição inicial";
  const pgn = () => buildPgn(START_FEN, lineSans, { Event: info?.named ? `${info.named.eco} ${info.named.name}` : "Abertura" });

  return (
    <div className="page">
      <div className="game-layout">
        <div className="board-col">
          <div className="board-row">
            <div className="board-holder">
              <Board fen={fen} orientation={orientation} movable="both" onMove={addMove} lastMove={view >= 0 ? { from: records[view].from, to: records[view].to } : null} arrows={info?.next.slice(0, 4).map((n, i) => ({ from: n.uci.slice(0, 2), to: n.uci.slice(2, 4), color: "blue" as const, opacity: 0.85 - i * 0.18 }))} />
            </div>
          </div>
          <div className="quick-row">
            {QUICK.map((q) => (
              <button key={q.label} className="chip quick" onClick={() => setLine(q.moves.split(" "))}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <div className="side-panel">
          <div className="card">
            <div className="card-head">
              <div style={{ minWidth: 0 }}>
                <div className="xs faint row" style={{ gap: 6 }}>
                  <BookOpen size={13} /> {info?.named ? info.named.eco : "Explorador de aberturas"}
                </div>
                <h3 className="opening-name">{lineName}</h3>
                {info?.named && info.named.namePt !== info.named.name && <div className="xs faint">{info.named.name}</div>}
              </div>
            </div>
            {info && info.deviation >= 0 && (
              <div className="feedback warn" style={{ margin: 12 }}>
                <AlertTriangle size={18} color="var(--warning)" />
                <div>
                  <h3>Desvio da biblioteca</h3>
                  <p>
                    {Math.floor(info.deviation / 2) + 1}
                    {shown[info.deviation].color === "w" ? "." : "..."} {shown[info.deviation].san} não está entre as linhas catalogadas. Isso não quer dizer que seja ruim: avalie com o motor.
                  </p>
                  <div className="row wrap" style={{ marginTop: 8 }}>
                    <button className="btn sm" onClick={() => setEngineOn(true)}>
                      <Cpu size={14} /> Avaliar aqui
                    </button>
                    <button className="btn sm" onClick={() => navigate(`/analisar?pgn=${encodeURIComponent(pgn())}`)}>
                      <Microscope size={14} /> Abrir na análise
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!book ? (
              <div className="row" style={{ padding: 16 }}>
                <span className="spinner" /> Carregando biblioteca…
              </div>
            ) : info && info.deviation < 0 ? (
              <div className="next-moves">
                <div className="xs faint next-head">
                  <span>Continuações catalogadas</span>
                  <span title="Quantidade de variantes com nome na biblioteca que seguem por este lance. Não é frequência em partidas.">variantes</span>
                </div>
                {info.next.length === 0 && <div className="empty small">Fim das linhas catalogadas para esta posição.</div>}
                {info.next.map((n) => {
                  const san = new Chess(fen).move(parseUci(n.uci)).san;
                  return (
                    <button key={n.uci} className="next-move" onClick={() => addMove(n.uci)}>
                      <span className="nm-san">
                        <San san={san} />
                      </span>
                      <span className="nm-name">{n.named?.namePt ?? ""}</span>
                      <span className="nm-count">{n.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <MoveList records={records} startFen={START_FEN} current={view} onSelect={setView} emptyText="Escolha um lance na lista ou jogue no tabuleiro." />
            <NavControls index={view} length={records.length} onGo={(i) => setView(Math.max(-1, Math.min(records.length - 1, i)))} onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))} />
            <div className="game-actions">
              <button className="btn sm primary" disabled={!shown.length} onClick={() => navigate(`/jogar?moves=${prefix.join(",")}&name=${encodeURIComponent(lineName)}&color=${orientation}`)}>
                <Swords size={15} /> Praticar contra bot
              </button>
              <button
                className="btn sm"
                disabled={!shown.length}
                onClick={() => {
                  setState((s) => ({ ...s, favoriteLines: [{ id: `l${Date.now()}`, name: lineName, moves: lineSans, date: Date.now() }, ...s.favoriteLines] }));
                  toast("Linha salva nas favoritas", "ok");
                }}
              >
                <Star size={15} /> Salvar linha
              </button>
              <button className="btn sm" onClick={() => setImporting(true)}>
                <FileInput size={15} /> Importar PGN
              </button>
              <button className="btn sm ghost" disabled={!shown.length} onClick={() => copyText(pgn(), "PGN copiado")}>
                <ClipboardCopy size={15} /> PGN
              </button>
            </div>
          </div>

          <div className="card">
            <label className="switch" style={{ padding: "10px 14px" }}>
              <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
              <span className="track" />
              <span className="small">Avaliação do Stockfish nesta posição</span>
            </label>
            {engineOn && <EngineLines fen={fen} result={live.result} running={live.running} error={live.error} terminal={live.terminal} enabled onPlayLine={(pv) => addMove(pv[0])} targetDepth={16} />}
          </div>

          <div className="card">
            <div className="card-body stack">
              <div className="row search">
                <Search size={16} className="faint" />
                <input className="input" placeholder="Buscar abertura (ex.: siciliana, najdorf, B90)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar abertura" />
              </div>
              {results.length > 0 && (
                <div className="search-results">
                  {results.map((o) => (
                    <button key={o.eco + o.name + o.uci.join("")} className="search-item" onClick={() => setLine(o.uci)}>
                      <span className="chip">{o.eco}</span>
                      <span>
                        {o.namePt}
                        <span className="xs faint" style={{ display: "block" }}>
                          {o.uci.length} meios-lances
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim().length >= 2 && !results.length && <p className="small faint">Nenhuma abertura encontrada.</p>}
            </div>
          </div>

          {favs.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>
                  <Star size={16} /> Linhas favoritas
                </h3>
              </div>
              <div className="card-body stack" style={{ paddingTop: 8 }}>
                {favs.map((f) => (
                  <div key={f.id} className="row between">
                    <button
                      className="link-btn"
                      onClick={() => {
                        const c = new Chess();
                        const ucis: string[] = [];
                        for (const s of f.moves) {
                          try {
                            const m = c.move(s);
                            ucis.push(m.from + m.to + (m.promotion ?? ""));
                          } catch {
                            break;
                          }
                        }
                        setLine(ucis);
                      }}
                    >
                      <b className="small">{f.name}</b>
                      <span className="xs faint" style={{ display: "block" }}>
                        {f.moves.slice(0, 8).join(" ")}
                        {f.moves.length > 8 ? " …" : ""}
                      </span>
                    </button>
                    <button className="icon-btn" onClick={() => setState((s) => ({ ...s, favoriteLines: s.favoriteLines.filter((x) => x.id !== f.id) }))} aria-label="Remover linha">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="xs faint row" style={{ gap: 6, alignItems: "flex-start" }}>
            <Info size={13} style={{ flex: "none", marginTop: 2 }} />
            Fonte: biblioteca de aberturas do Lichess (domínio público, CC0) com {book?.list.length ?? "…"} linhas nomeadas. Ela contém nomes e lances, não partidas — por isso este explorador não mostra porcentagens de vitória nem popularidade. Os números indicam quantas variantes catalogadas seguem por cada lance.
          </p>
        </div>
      </div>
      {importing && (
        <ImportModal
          initialTab="pgn"
          onClose={() => setImporting(false)}
          onPgn={(p) => {
            if (p.startFen !== START_FEN) {
              toast("O explorador só aceita partidas a partir da posição inicial.", "err");
              return;
            }
            setRecords(p.records);
            setView(p.records.length - 1);
            toast("Linha importada", "ok");
          }}
        />
      )}
    </div>
  );
}
