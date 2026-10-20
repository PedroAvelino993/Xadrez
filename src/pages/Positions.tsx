import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardCopy, Eraser, Microscope, RotateCcw, Star, StarOff, Swords, Trash2, CheckCircle2, AlertTriangle, Hand, FlipVertical } from "lucide-react";
import Board from "../components/Board";
import ExerciseBoard from "../components/ExerciseBoard";
import { copyText, PieceIcon, Seg, toast } from "../components/ui";
import { FILES, START_FEN, parseUci, validateFen } from "../chess/rules";
import type { Color, PieceType } from "../types";
import { setState, useAppState } from "../storage/store";
import { navigate, useRoute } from "../hooks/useRoute";
import "./positions.css";

export interface LibraryPosition {
  id: string;
  title: string;
  category: "famosa" | "tatica" | "estrategia" | "finais";
  difficulty: string;
  objective: string;
  fen: string;
  best: string[];
  explanation: string[];
  variations: { name: string; moves: string[]; comment?: string }[];
  source?: string;
}

const CATS: { id: LibraryPosition["category"] | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "famosa", label: "Famosas" },
  { id: "tatica", label: "Táticas" },
  { id: "estrategia", label: "Estratégicas" },
  { id: "finais", label: "Finais" },
];

const libFiles = import.meta.glob<{ default: LibraryPosition[] }>("../positions/library.json");
function useLibrary(): LibraryPosition[] | null {
  const [lib, setLib] = useState<LibraryPosition[] | null>(null);
  useEffect(() => {
    const load = Object.values(libFiles)[0];
    if (!load) setLib([]);
    else load().then((m) => setLib(m.default));
  }, []);
  return lib;
}

export default function PositionsPage({ positionId }: { positionId?: string }) {
  const { query } = useRoute();
  const lib = useLibrary();
  const [tab, setTab] = useState<"biblioteca" | "editor" | "favoritas">(positionId === "editor" ? "editor" : "biblioteca");
  useEffect(() => {
    if (positionId === "editor") setTab("editor");
  }, [positionId]);

  if (positionId && positionId !== "editor") {
    if (!lib) return <Loading />;
    const p = lib.find((x) => x.id === positionId);
    if (!p)
      return (
        <div className="page">
          <div className="card pad empty">
            Posição não encontrada. <a href="#/posicoes">Voltar</a>
          </div>
        </div>
      );
    return <PositionDetail key={p.id} p={p} />;
  }

  return (
    <div className="page stack">
      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        {(
          [
            ["biblioteca", "Biblioteca"],
            ["editor", "Montar posição"],
            ["favoritas", "Favoritas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              if (id !== "editor" && positionId === "editor") navigate("/posicoes");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "biblioteca" && (lib ? <Library lib={lib} /> : <Loading />)}
      {tab === "editor" && <Editor initialFen={query.get("fen") ?? undefined} />}
      {tab === "favoritas" && <Favorites />}
    </div>
  );
}

function Loading() {
  return (
    <div className="row" style={{ justifyContent: "center", padding: 40 }}>
      <span className="spinner" /> Carregando…
    </div>
  );
}

// ---------------------------------------------------------------------------

function Library({ lib }: { lib: LibraryPosition[] }) {
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("todas");
  const items = lib.filter((p) => cat === "todas" || p.category === cat);
  return (
    <div className="stack">
      <div className="row between wrap">
        <Seg value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c.id, label: c.label }))} ariaLabel="Categoria" />
        <span className="xs faint">Cada melhor lance foi conferido pelo Stockfish.</span>
      </div>
      <div className="grid-auto pos-grid">
        {items.map((p) => (
          <button key={p.id} className="card pos-card" onClick={() => navigate(`/posicoes/${p.id}`)}>
            <div className="pos-thumb">
              <Board fen={p.fen} orientation={p.fen.split(" ")[1] as Color} className="thumb" />
            </div>
            <div className="pos-meta">
              <b>{p.title}</b>
              <span className="xs muted">{p.objective}</span>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                <span className="chip">{CATS.find((c) => c.id === p.category)?.label}</span>
                <span className={`chip ${p.difficulty === "Fácil" ? "green" : p.difficulty === "Médio" ? "blue" : p.difficulty === "Difícil" ? "yellow" : "red"}`}>{p.difficulty}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {!items.length && <div className="empty card">Nenhuma posição nesta categoria.</div>}
    </div>
  );
}

function PositionDetail({ p }: { p: LibraryPosition }) {
  const [solved, setSolved] = useState(false);
  const [variation, setVariation] = useState<number | null>(null);
  const favs = useAppState((s) => s.favoritePositions);
  const isFav = favs.some((f) => f.fen === p.fen);
  const side = p.fen.split(" ")[1] === "w" ? "Brancas" : "Pretas";
  return (
    <div className="page">
      <div className="lesson-top">
        <button className="btn sm ghost" onClick={() => navigate("/posicoes")}>
          <ArrowLeft size={16} /> Biblioteca
        </button>
        <h1 className="lesson-title" style={{ flex: 1 }}>
          {p.title}
        </h1>
        <span className="chip">{p.difficulty}</span>
      </div>
      {variation === null ? (
        <div className="lesson-split">
          <ExerciseBoard
            key={p.id}
            fen={p.fen}
            goal={{ type: "moves", accept: p.best }}
            prompt={`${p.objective} (${side} jogam)`}
            hint="Procure primeiro os lances forçantes: xeques, capturas e ameaças. Pense no que o adversário quer fazer."
            success={p.explanation.join(" ")}
            onSolved={() => setSolved(true)}
          />
        </div>
      ) : (
        <VariationView p={p} index={variation} onBack={() => setVariation(null)} />
      )}
      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card pad stack">
          <h3>Explicação</h3>
          {solved || variation !== null ? (
            p.explanation.map((t, i) => (
              <p key={i} className="small muted">
                {t}
              </p>
            ))
          ) : (
            <p className="small faint">Tente encontrar o lance primeiro. A explicação aparece quando você acertar (ou abra uma variante abaixo).</p>
          )}
          {p.source && <p className="xs faint">Fonte: {p.source}</p>}
        </div>
        <div className="card pad stack">
          <h3>Variantes</h3>
          {p.variations.map((v, i) => (
            <button key={i} className="moment" onClick={() => setVariation(i)}>
              <span>
                <b>{v.name}</b>
                {v.comment && <span className="xs muted" style={{ display: "block" }}>{v.comment}</span>}
              </span>
            </button>
          ))}
          <div className="row wrap" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => navigate(`/analisar?fen=${encodeURIComponent(p.fen)}`)}>
              <Microscope size={15} /> Analisar com o motor
            </button>
            <button className="btn sm" onClick={() => navigate(`/jogar?fen=${encodeURIComponent(p.fen)}&name=${encodeURIComponent(p.title)}&color=${p.fen.split(" ")[1]}`)}>
              <Swords size={15} /> Jogar contra bot
            </button>
            <button className="btn sm ghost" onClick={() => copyText(p.fen, "FEN copiada")}>
              <ClipboardCopy size={15} /> FEN
            </button>
            <button
              className="btn sm ghost"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  favoritePositions: isFav ? s.favoritePositions.filter((f) => f.fen !== p.fen) : [{ id: `f${Date.now()}`, title: p.title, fen: p.fen, date: Date.now() }, ...s.favoritePositions],
                }))
              }
            >
              {isFav ? <StarOff size={15} /> : <Star size={15} />} {isFav ? "Remover favorita" : "Favoritar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VariationView({ p, index, onBack }: { p: LibraryPosition; index: number; onBack: () => void }) {
  const v = p.variations[index];
  const steps = useMemo(() => {
    const c = new Chess(p.fen);
    const out: { fen: string; last: { from: string; to: string } | null; san: string }[] = [{ fen: p.fen, last: null, san: "" }];
    for (const u of v.moves) {
      try {
        const m = c.move(parseUci(u));
        out.push({ fen: c.fen(), last: { from: m.from, to: m.to }, san: m.san });
      } catch {
        break;
      }
    }
    return out;
  }, [p, v]);
  const [k, setK] = useState(0);
  return (
    <div className="lesson-split">
      <div className="ex-board">
        <Board fen={steps[k].fen} orientation={p.fen.split(" ")[1] as Color} lastMove={steps[k].last} mated={new Chess(steps[k].fen).isCheckmate()} />
      </div>
      <div className="card pad stack">
        <h3>{v.name}</h3>
        {v.comment && <p className="small muted">{v.comment}</p>}
        <div className="row wrap" style={{ gap: 4 }}>
          {steps.slice(1).map((s, j) => (
            <button key={j} className={`mv ${j + 1 === k ? "current" : ""}`} onClick={() => setK(j + 1)} style={{ minHeight: 26 }}>
              {s.san}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => setK(Math.max(0, k - 1))} disabled={k === 0}>
            <ChevronLeft size={15} />
          </button>
          <button className="btn sm primary" onClick={() => setK(Math.min(steps.length - 1, k + 1))} disabled={k === steps.length - 1}>
            Próximo <ChevronRight size={15} />
          </button>
          <button className="btn sm ghost" onClick={onBack}>
            Voltar ao exercício
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Placement = Map<string, { color: Color; type: PieceType }>;

function toPlacement(fen: string): Placement {
  const m: Placement = new Map();
  const rows = fen.split(" ")[0].split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r] ?? "") {
      if (/\d/.test(ch)) f += +ch;
      else {
        m.set(FILES[f] + (8 - r), { color: ch === ch.toUpperCase() ? "w" : "b", type: ch.toLowerCase() as PieceType });
        f++;
      }
    }
  }
  return m;
}

function fromPlacement(p: Placement): string {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = "",
      empty = 0;
    for (let f = 0; f < 8; f++) {
      const x = p.get(FILES[f] + r);
      if (!x) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += x.color === "w" ? x.type.toUpperCase() : x.type;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join("/");
}

interface EditorState {
  placement: Placement;
  turn: Color;
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  ep: string;
  half: number;
  full: number;
}

function parseEditor(fen: string): EditorState {
  const parts = fen.trim().split(/\s+/);
  const cast = parts[2] ?? "-";
  return {
    placement: toPlacement(fen),
    turn: parts[1] === "b" ? "b" : "w",
    castling: { K: cast.includes("K"), Q: cast.includes("Q"), k: cast.includes("k"), q: cast.includes("q") },
    ep: parts[3] && parts[3] !== "-" ? parts[3] : "-",
    half: +(parts[4] ?? 0) || 0,
    full: +(parts[5] ?? 1) || 1,
  };
}

function castlingAllowed(p: Placement) {
  const is = (sq: string, color: Color, type: PieceType) => p.get(sq)?.color === color && p.get(sq)?.type === type;
  return {
    K: is("e1", "w", "k") && is("h1", "w", "r"),
    Q: is("e1", "w", "k") && is("a1", "w", "r"),
    k: is("e8", "b", "k") && is("h8", "b", "r"),
    q: is("e8", "b", "k") && is("a8", "b", "r"),
  };
}

function buildFen(s: EditorState): string {
  const allow = castlingAllowed(s.placement);
  const c = (["K", "Q", "k", "q"] as const).filter((k) => s.castling[k] && allow[k]).join("") || "-";
  return `${fromPlacement(s.placement)} ${s.turn} ${c} ${s.ep} ${s.half} ${s.full}`;
}

function epOptions(s: EditorState): string[] {
  // en passant target squares that make sense for the side to move
  const out: string[] = [];
  const rank = s.turn === "w" ? 6 : 3; // target rank
  const pawnRank = s.turn === "w" ? 5 : 4; // rank of the pawn that just moved
  for (const f of FILES) {
    const pawn = s.placement.get(f + pawnRank);
    if (pawn && pawn.type === "p" && pawn.color !== s.turn && !s.placement.get(f + rank)) out.push(f + rank);
  }
  return out;
}

const PALETTE: PieceType[] = ["k", "q", "r", "b", "n", "p"];

function Editor({ initialFen }: { initialFen?: string }) {
  const [st, setSt] = useState<EditorState>(() => parseEditor(initialFen && validateFen(initialFen).ok ? initialFen : START_FEN));
  const [tool, setTool] = useState<{ color: Color; type: PieceType } | "erase" | "move">("move");
  const [orientation, setOrientation] = useState<Color>("w");
  const [fenText, setFenText] = useState("");
  const [title, setTitle] = useState("");
  const fen = buildFen(st);
  const check = validateFen(fen);
  useEffect(() => setFenText(fen), [fen]);
  const allow = castlingAllowed(st.placement);
  const eps = epOptions(st);

  const update = (patch: Partial<EditorState>) => setSt((s) => ({ ...s, ...patch }));
  const setPlacement = (f: (p: Placement) => void) =>
    setSt((s) => {
      const p = new Map(s.placement);
      f(p);
      return { ...s, placement: p, ep: "-" };
    });

  const loadFen = (text: string) => {
    const v = validateFen(text);
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2 || !/^[1-8pnbrqkPNBRQK/]+$/.test(parts[0]) || parts[0].split("/").length !== 8) {
      toast("FEN mal formada", "err");
      return;
    }
    setSt(parseEditor(text));
    if (!v.ok) toast(`Carregada, mas inválida: ${v.error}`, "err");
    else toast("Posição carregada", "ok");
  };

  return (
    <div className="game-layout">
      <div className="board-col">
        <div className="palette" role="toolbar" aria-label="Peças">
          {(["w", "b"] as Color[]).map((color) => (
            <div key={color} className="palette-row">
              {PALETTE.map((t) => (
                <button key={t} className={`pal ${typeof tool === "object" && tool.color === color && tool.type === t ? "on" : ""}`} onClick={() => setTool({ color, type: t })} aria-label={`Colocar ${t} ${color === "w" ? "branco" : "preto"}`}>
                  <PieceIcon type={t} color={color} size={30} />
                </button>
              ))}
            </div>
          ))}
          <div className="palette-row">
            <button className={`pal ${tool === "move" ? "on" : ""}`} onClick={() => setTool("move")} aria-label="Mover peças" title="Arrastar peças">
              <Hand size={20} />
            </button>
            <button className={`pal ${tool === "erase" ? "on" : ""}`} onClick={() => setTool("erase")} aria-label="Apagar peças" title="Apagar">
              <Eraser size={20} />
            </button>
          </div>
        </div>
        <div className="board-row">
          <div className="board-holder">
            <Board
              fen={fen.split(" ").length === 6 ? fen : START_FEN}
              orientation={orientation}
              editor={{
                onSquareClick: (sq) => {
                  if (tool === "erase") setPlacement((p) => p.delete(sq));
                  else if (typeof tool === "object") {
                    setPlacement((p) => {
                      const cur = p.get(sq);
                      if (cur && cur.color === tool.color && cur.type === tool.type) p.delete(sq);
                      else p.set(sq, tool);
                    });
                  }
                },
                onDrop: (from, to, piece) => {
                  if (!from || !piece) return;
                  setPlacement((p) => {
                    p.delete(from);
                    if (to) p.set(to, piece);
                  });
                },
              }}
              ariaLabel="Editor de posição: escolha uma peça na paleta e clique numa casa; arraste para mover; arraste para fora para remover."
            />
          </div>
        </div>
        <p className="xs faint">Escolha uma peça e clique nas casas. Arraste peças para movê-las; arraste para fora do tabuleiro para removê-las. Clicar de novo com a mesma peça a remove.</p>
      </div>
      <div className="side-panel">
        <div className="card pad stack">
          <div className={`feedback ${check.ok ? "ok" : "bad"}`}>
            {check.ok ? <CheckCircle2 size={20} color="var(--accent)" /> : <AlertTriangle size={20} color="var(--danger)" />}
            <div>
              <h3>{check.ok ? "Posição válida" : "Posição inválida"}</h3>
              <p>{check.ok ? (new Chess(fen).isGameOver() ? "Válida, mas a partida já terminou nesta posição." : "Pronta para analisar ou jogar.") : check.error}</p>
            </div>
          </div>
          <div>
            <div className="label">Quem joga</div>
            <Seg
              value={st.turn}
              onChange={(v) => update({ turn: v, ep: "-" })}
              options={[
                { value: "w", label: "Brancas" },
                { value: "b", label: "Pretas" },
              ]}
            />
          </div>
          <div>
            <div className="label">Direitos de roque</div>
            <div className="castle-grid">
              {(
                [
                  ["K", "Brancas O-O"],
                  ["Q", "Brancas O-O-O"],
                  ["k", "Pretas O-O"],
                  ["q", "Pretas O-O-O"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={`row small ${allow[k] ? "" : "faint"}`} style={{ gap: 6 }} title={allow[k] ? "" : "Rei e torre precisam estar nas casas iniciais"}>
                  <input type="checkbox" checked={st.castling[k] && allow[k]} disabled={!allow[k]} onChange={(e) => update({ castling: { ...st.castling, [k]: e.target.checked } })} /> {label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid-3">
            <label className="field">
              En passant
              <select className="select" value={st.ep} onChange={(e) => update({ ep: e.target.value })}>
                <option value="-">Nenhum</option>
                {eps.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field" title="Meios-lances desde a última captura ou lance de peão (regra dos 50 lances)">
              Regra dos 50
              <input className="input" type="number" min={0} max={150} value={st.half} onChange={(e) => update({ half: Math.max(0, Math.min(150, +e.target.value || 0)) })} />
            </label>
            <label className="field">
              Nº do lance
              <input className="input" type="number" min={1} max={999} value={st.full} onChange={(e) => update({ full: Math.max(1, +e.target.value || 1) })} />
            </label>
          </div>
          <label className="field">
            FEN
            <div className="row">
              <input className="input mono" value={fenText} onChange={(e) => setFenText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadFen(fenText)} spellCheck={false} aria-label="FEN" />
              <button className="btn sm" onClick={() => loadFen(fenText)}>
                Carregar
              </button>
            </div>
          </label>
          <div className="row wrap">
            <button className="btn sm" onClick={() => setSt(parseEditor(START_FEN))}>
              <RotateCcw size={15} /> Inicial
            </button>
            <button className="btn sm" onClick={() => setSt({ ...parseEditor("8/8/8/8/8/8/8/8 w - - 0 1"), placement: new Map() })}>
              <Trash2 size={15} /> Limpar
            </button>
            <button className="btn sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <FlipVertical size={15} /> Girar
            </button>
            <button className="btn sm" onClick={() => copyText(fen, "FEN copiada")}>
              <ClipboardCopy size={15} /> Copiar FEN
            </button>
          </div>
          <div className="row wrap">
            <button className="btn primary" disabled={!check.ok} onClick={() => navigate(`/analisar?fen=${encodeURIComponent(fen)}`)}>
              <Microscope size={16} /> Analisar com o motor
            </button>
            <button className="btn" disabled={!check.ok || new Chess(check.ok ? fen : START_FEN).isGameOver()} onClick={() => navigate(`/jogar?fen=${encodeURIComponent(fen)}&color=${st.turn}`)}>
              <Swords size={16} /> Jogar contra bot
            </button>
          </div>
          <div className="row">
            <input className="input" placeholder="Nome da posição" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Nome para salvar" />
            <button
              className="btn"
              disabled={!check.ok}
              onClick={() => {
                setState((s) => ({ ...s, favoritePositions: [{ id: `f${Date.now()}`, title: title.trim() || "Posição sem nome", fen, date: Date.now() }, ...s.favoritePositions] }));
                toast("Posição salva nas favoritas", "ok");
                setTitle("");
              }}
            >
              <Star size={15} /> Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Favorites() {
  const favs = useAppState((s) => s.favoritePositions);
  if (!favs.length) return <div className="card empty">Nenhuma posição favorita ainda. Monte uma posição no editor ou favorite uma da biblioteca.</div>;
  return (
    <div className="grid-auto pos-grid">
      {favs.map((f) => (
        <div key={f.id} className="card pos-card static">
          <div className="pos-thumb">
            <Board fen={f.fen} className="thumb" />
          </div>
          <div className="pos-meta">
            <b>{f.title}</b>
            <span className="xs faint">{new Date(f.date).toLocaleDateString("pt-BR")}</span>
            <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
              <button className="btn sm" onClick={() => navigate(`/analisar?fen=${encodeURIComponent(f.fen)}`)}>
                Analisar
              </button>
              <button className="btn sm" onClick={() => navigate(`/posicoes/editor?fen=${encodeURIComponent(f.fen)}`)}>
                Editar
              </button>
              <button className="btn sm ghost" onClick={() => copyText(f.fen, "FEN copiada")} aria-label="Copiar FEN">
                <ClipboardCopy size={14} />
              </button>
              <button className="btn sm ghost danger" onClick={() => setState((s) => ({ ...s, favoritePositions: s.favoritePositions.filter((x) => x.id !== f.id) }))} aria-label="Remover">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
