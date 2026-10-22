import { Chess, type Square as CjsSquare } from "chess.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Classification, Color, PieceType } from "../types";
import { useSettings } from "../storage/store";
import { boardTheme, pieceUrl } from "./boardThemes";
import { FILES, PIECE_NAME, findKing } from "../chess/rules";
import "./board.css";

export interface Arrow {
  from: string;
  to: string;
  color?: "green" | "red" | "blue" | "yellow" | "gray";
  opacity?: number;
}

export interface BoardMove {
  from: string;
  to: string;
  promotion?: PieceType;
}

export interface BoardProps {
  fen: string;
  orientation?: Color;
  /** which side the user may move; "none" makes the board read-only */
  movable?: Color | "both" | "none";
  /** return false to reject the move (it is then animated back) */
  onMove?: (m: BoardMove) => boolean | void;
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  marks?: Record<string, "good" | "bad" | "hint" | "target">;
  badge?: { square: string; kind: Classification } | null;
  /** highlight the mated king */
  mated?: boolean;
  /** free mode (position editor): any piece can go anywhere */
  editor?: {
    onDrop: (from: string | null, to: string | null, piece?: { color: Color; type: PieceType }) => void;
    onSquareClick: (sq: string) => void;
  };
  className?: string;
  ariaLabel?: string;
}

interface PieceState {
  id: number;
  color: Color;
  type: PieceType;
  sq: string;
  fading?: boolean;
}

let nextId = 1;
const PROMO_GUARD_MS = 350;

function placement(fen: string): Map<string, { color: Color; type: PieceType }> {
  const m = new Map<string, { color: Color; type: PieceType }>();
  const rows = fen.split(" ")[0].split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r] ?? "") {
      if (/\d/.test(ch)) f += +ch;
      else {
        const color: Color = ch === ch.toUpperCase() ? "w" : "b";
        m.set(FILES[f] + (8 - r), { color, type: ch.toLowerCase() as PieceType });
        f++;
      }
    }
  }
  return m;
}

const dist = (a: string, b: string) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(+a[1] - +b[1]);

/** Reuse piece ids between positions so React keeps the DOM node and the CSS transition animates the move. */
function diffPieces(prev: PieceState[], fen: string): PieceState[] {
  const next = placement(fen);
  const alive = prev.filter((p) => !p.fading);
  const result: PieceState[] = [];
  const unmatchedOld: PieceState[] = [];
  const takenSquares = new Set<string>();
  for (const p of alive) {
    const n = next.get(p.sq);
    if (n && n.color === p.color && n.type === p.type) {
      result.push({ ...p });
      takenSquares.add(p.sq);
    } else unmatchedOld.push(p);
  }
  const newcomers = [...next.entries()].filter(([sq]) => !takenSquares.has(sq));
  for (const [sq, n] of newcomers) {
    let best: PieceState | null = null;
    for (const o of unmatchedOld) {
      const sameKind = o.color === n.color && (o.type === n.type || (o.type === "p" && (sq[1] === "8" || sq[1] === "1")));
      if (!sameKind) continue;
      if (!best || dist(o.sq, sq) < dist(best.sq, sq)) best = o;
    }
    if (best) {
      unmatchedOld.splice(unmatchedOld.indexOf(best), 1);
      result.push({ ...best, sq, type: n.type });
    } else result.push({ id: nextId++, color: n.color, type: n.type, sq });
  }
  for (const o of unmatchedOld) result.push({ ...o, fading: true });
  return result;
}

const ARROW_COLORS: Record<NonNullable<Arrow["color"]>, string> = {
  green: "rgba(98, 178, 72, 0.85)",
  red: "rgba(226, 80, 70, 0.85)",
  blue: "rgba(70, 140, 220, 0.85)",
  yellow: "rgba(235, 180, 40, 0.9)",
  gray: "rgba(30, 30, 30, 0.55)",
};

const BADGE: Record<Classification, { sym: string; color: string; label: string }> = {
  best: { sym: "★", color: "var(--c-best)", label: "Melhor lance" },
  excellent: { sym: "!", color: "var(--c-excellent)", label: "Excelente" },
  good: { sym: "✓", color: "var(--c-good)", label: "Bom" },
  book: { sym: "", color: "var(--c-book)", label: "Teórico" },
  inaccuracy: { sym: "?!", color: "var(--c-inaccuracy)", label: "Imprecisão" },
  mistake: { sym: "?", color: "var(--c-mistake)", label: "Erro" },
  blunder: { sym: "??", color: "var(--c-blunder)", label: "Erro grave" },
  forced: { sym: "□", color: "var(--c-forced)", label: "Lance forçado" },
};
export { BADGE as CLASS_BADGE };

export default function Board({
  fen,
  orientation = "w",
  movable = "none",
  onMove,
  lastMove,
  arrows = [],
  marks,
  badge,
  mated,
  editor,
  className = "",
  ariaLabel,
}: BoardProps) {
  const settings = useSettings();
  const theme = boardTheme(settings.boardTheme);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<PieceState[]>(() => diffPieces([], fen));
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: number; from: string; x: number; y: number; over: string | null } | null>(null);
  const [noAnimId, setNoAnimId] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string; color: Color; openedAt: number } | null>(null);
  const [promoReady, setPromoReady] = useState(false);
  // a promotion choice only counts if the touch started on that button after the menu opened
  const promoPress = useRef<string | null>(null);
  const [shakeId, setShakeId] = useState<number | null>(null);
  const [userArrows, setUserArrows] = useState<Arrow[]>([]);
  const [userCircles, setUserCircles] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string>(orientation === "w" ? "e2" : "e7");
  const [announce, setAnnounce] = useState("");
  const pointer = useRef<{ x: number; y: number; sq: string; wasSelected: boolean; button: number; started: boolean } | null>(null);
  const flip = orientation === "b";

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const legal = useMemo(() => {
    const map = new Map<string, { to: string; promotion?: string }[]>();
    if (!chess) return map;
    for (const m of chess.moves({ verbose: true })) {
      const arr = map.get(m.from) ?? [];
      arr.push({ to: m.to, promotion: m.promotion });
      map.set(m.from, arr);
    }
    return map;
  }, [chess]);

  const turn: Color = chess ? (chess.turn() as Color) : "w";
  const canMoveColor = (c: Color) => !editor && (movable === "both" ? c === turn : movable === c && c === turn);

  // Re-diff pieces whenever the position changes.
  useLayoutEffect(() => {
    setPieces((prev) => diffPieces(prev, fen));
    setSelected(null);
    setPromo(null);
    setUserArrows([]);
    setUserCircles([]);
  }, [fen]);

  // Drop fading (captured) pieces after their animation.
  useEffect(() => {
    if (!pieces.some((p) => p.fading)) return;
    const t = setTimeout(() => setPieces((ps) => ps.filter((p) => !p.fading)), 260);
    return () => clearTimeout(t);
  }, [pieces]);

  useEffect(() => {
    if (!promo) return;
    const t = setTimeout(() => setPromoReady(true), PROMO_GUARD_MS);
    return () => clearTimeout(t);
  }, [promo]);

  useEffect(() => {
    if (noAnimId === null) return;
    const t = setTimeout(() => setNoAnimId(null), 60);
    return () => clearTimeout(t);
  }, [noAnimId]);

  const sqFromPoint = useCallback(
    (clientX: number, clientY: number): string | null => {
      const el = rootRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const fx = Math.floor(((clientX - r.left) / r.width) * 8);
      const fy = Math.floor(((clientY - r.top) / r.height) * 8);
      if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
      const file = flip ? 7 - fx : fx;
      const rank = flip ? fy : 7 - fy;
      return FILES[file] + (rank + 1);
    },
    [flip]
  );

  const coords = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = +sq[1] - 1;
    return { x: flip ? 7 - f : f, y: flip ? r : 7 - r };
  };

  const pieceAt = (sq: string) => pieces.find((p) => p.sq === sq && !p.fading);

  const reject = (sq: string) => {
    const p = pieceAt(sq);
    if (p) {
      setShakeId(p.id);
      setTimeout(() => setShakeId(null), 380);
    }
  };

  const tryMove = (from: string, to: string, viaDrag: boolean): boolean => {
    const dests = legal.get(from) ?? [];
    const options = dests.filter((d) => d.to === to);
    if (!options.length) return false;
    const mover = pieceAt(from);
    if (viaDrag && mover) setNoAnimId(mover.id);
    if (options.some((o) => o.promotion)) {
      if (settings.autoQueen) return commit({ from, to, promotion: "q" }, from);
      promoPress.current = null;
      setPromoReady(false);
      setPromo({ from, to, color: turn, openedAt: performance.now() });
      return true;
    }
    return commit({ from, to }, from);
  };

  const commit = (m: BoardMove, from: string): boolean => {
    setSelected(null);
    const ok = onMove?.(m);
    if (ok === false) {
      reject(from);
      return false;
    }
    return true;
  };

  const select = (sq: string | null) => {
    setSelected(sq);
    if (sq) {
      const p = pieceAt(sq);
      const n = (legal.get(sq) ?? []).length;
      if (p) setAnnounce(`${PIECE_NAME[p.type]} ${p.color === "w" ? "branco" : "preto"} em ${sq} selecionado. ${n} ${n === 1 ? "lance possível" : "lances possíveis"}.`);
    }
  };

  // ---------- pointer handling ----------
  const onPointerDown = (e: React.PointerEvent) => {
    setKbMode(false);
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (e.button === 2) {
      pointer.current = { x: e.clientX, y: e.clientY, sq, wasSelected: false, button: 2, started: false };
      return;
    }
    if (e.button !== 0) return;
    if (promo) return;
    setUserArrows([]);
    setUserCircles([]);
    if (editor) {
      const p = pieceAt(sq);
      pointer.current = { x: e.clientX, y: e.clientY, sq, wasSelected: false, button: 0, started: false };
      if (p) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const p = pieceAt(sq);
    // clicking a legal destination of the selected piece moves there
    if (selected && selected !== sq && (legal.get(selected) ?? []).some((d) => d.to === sq) && !(p && p.color === turn && canMoveColor(p.color))) {
      tryMove(selected, sq, false);
      pointer.current = null;
      return;
    }
    if (p && canMoveColor(p.color)) {
      const wasSelected = selected === sq;
      select(sq);
      pointer.current = { x: e.clientX, y: e.clientY, sq, wasSelected, button: 0, started: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      if (selected && p && !canMoveColor(p.color)) reject(selected);
      select(null);
      pointer.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = pointer.current;
    if (!pt || pt.button !== 0) return;
    if (!pt.started && Math.hypot(e.clientX - pt.x, e.clientY - pt.y) < 5) return;
    const p = pieceAt(pt.sq);
    if (!p) return;
    pt.started = true;
    const r = rootRef.current!.getBoundingClientRect();
    setDrag({ id: p.id, from: pt.sq, x: e.clientX - r.left, y: e.clientY - r.top, over: sqFromPoint(e.clientX, e.clientY) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const pt = pointer.current;
    pointer.current = null;
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (pt && pt.button === 2) {
      if (!sq) return;
      if (sq === pt.sq) setUserCircles((c) => (c.includes(sq) ? c.filter((x) => x !== sq) : [...c, sq]));
      else {
        const color: Arrow["color"] = e.shiftKey ? "red" : e.altKey ? "blue" : "green";
        setUserArrows((a) => {
          const exists = a.find((x) => x.from === pt.sq && x.to === sq);
          return exists ? a.filter((x) => x !== exists) : [...a, { from: pt.sq, to: sq, color }];
        });
      }
      return;
    }
    if (!pt) return;
    if (editor) {
      setDrag(null);
      if (pt.started) {
        const p = pieceAt(pt.sq);
        if (p) setNoAnimId(p.id);
        editor.onDrop(pt.sq, sq, p ? { color: p.color, type: p.type } : undefined);
      } else editor.onSquareClick(pt.sq);
      return;
    }
    if (pt.started) {
      setDrag(null);
      if (!sq || sq === pt.sq) return; // dropped back: keep selection for click-move
      if (!tryMove(pt.sq, sq, true)) {
        reject(pt.sq);
        select(null);
      }
      return;
    }
    // simple click on an already selected piece toggles selection off
    if (pt.wasSelected && sq === pt.sq) select(null);
  };

  const onPointerCancel = () => {
    pointer.current = null;
    setDrag(null);
  };

  // ---------- keyboard ----------
  const onKeyDown = (e: React.KeyboardEvent) => {
    setKbMode(true);
    const f = FILES.indexOf(cursor[0]);
    const r = +cursor[1] - 1;
    const d = flip ? -1 : 1;
    let nf = f,
      nr = r;
    if (e.key === "ArrowLeft") nf -= d;
    else if (e.key === "ArrowRight") nf += d;
    else if (e.key === "ArrowUp") nr += d;
    else if (e.key === "ArrowDown") nr -= d;
    else if (e.key === "Escape") {
      select(null);
      return;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (editor) {
        editor.onSquareClick(cursor);
        return;
      }
      const p = pieceAt(cursor);
      if (selected && selected !== cursor && (legal.get(selected) ?? []).some((x) => x.to === cursor)) tryMove(selected, cursor, false);
      else if (p && canMoveColor(p.color)) select(selected === cursor ? null : cursor);
      else select(null);
      return;
    } else return;
    e.preventDefault();
    nf = Math.max(0, Math.min(7, nf));
    nr = Math.max(0, Math.min(7, nr));
    const ns = FILES[nf] + (nr + 1);
    setCursor(ns);
    const p = pieceAt(ns);
    setAnnounce(`${ns}${p ? `, ${PIECE_NAME[p.type]} ${p.color === "w" ? "branco" : "preto"}` : ", vazia"}`);
  };

  const [focused, setFocused] = useState(false);
  const [kbMode, setKbMode] = useState(false);

  // ---------- derived visuals ----------
  const dests = selected ? legal.get(selected) ?? [] : [];
  const destSet = new Set(dests.map((d) => d.to));
  const checkSq = chess && chess.inCheck() ? findKing(chess, chess.turn() as Color) : null;
  const allArrows = [...arrows, ...userArrows];

  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const file = flip ? 7 - x : x;
      const rank = flip ? y : 7 - y;
      const sq = FILES[file] + (rank + 1);
      const light = (file + rank) % 2 === 1;
      const cls = ["sq", light ? "light" : "dark"];
      const style: CSSProperties = { left: `${x * 12.5}%`, top: `${y * 12.5}%` };
      const isLast = settings.highlightLast && lastMove && (lastMove.from === sq || lastMove.to === sq);
      squares.push(
        <div key={sq} className={cls.join(" ")} style={style} data-square={sq}>
          {isLast && <div className="hl last" />}
          {selected === sq && <div className="hl sel" />}
          {marks?.[sq] && <div className={`mark ${marks[sq]}`} />}
          {checkSq === sq && <div className={`check ${mated ? "mated" : ""}`} />}
          {drag && drag.over === sq && drag.from !== sq && <div className="hover-ring" />}
          {focused && kbMode && cursor === sq && <div className="kb-cursor" />}
          {settings.showLegal && destSet.has(sq) && <div className={pieceAt(sq) || (chess && isEnPassantTarget(chess, selected!, sq)) ? "dest capture" : "dest"} />}
          {userCircles.includes(sq) && <div className="user-circle" />}
          {settings.coords && x === 0 && <span className="coord rank">{rank + 1}</span>}
          {settings.coords && y === 7 && <span className="coord file">{FILES[file]}</span>}
        </div>
      );
    }
  }

  const anim = settings.animation === "off" ? 0 : settings.animation === "fast" ? 110 : 200;

  /** Ignore the finger that is still on the screen from the move itself. */
  const promoAccepts = (e: React.MouseEvent, key: string) => {
    if (e.detail === 0) return true; // keyboard activation
    if (!promo || performance.now() - promo.openedAt < PROMO_GUARD_MS) return false;
    const ok = promoPress.current === key;
    promoPress.current = null;
    return ok;
  };

  return (
    <div
      ref={rootRef}
      className={`board ${editor ? "editor" : ""} ${className}`}
      style={
        {
          "--sq-light": theme.light,
          "--sq-dark": theme.dark,
          "--sq-hl": theme.highlight,
          "--coord-light": theme.coordLight,
          "--coord-dark": theme.coordDark,
          "--anim": `${anim}ms`,
        } as CSSProperties
      }
      tabIndex={0}
      role="application"
      aria-label={ariaLabel ?? `Tabuleiro de xadrez. ${turn === "w" ? "Brancas" : "Pretas"} jogam. Use as setas para navegar e Enter para selecionar.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {squares}
      {pieces.map((p) => {
        const isDrag = drag && drag.id === p.id;
        const { x, y } = coords(p.sq);
        const style: CSSProperties = isDrag
          ? { transform: `translate(calc(${drag!.x}px - 50%), calc(${drag!.y}px - 50%)) scale(1.1)`, transition: "none", zIndex: 30 }
          : {
              transform: `translate(${x * 100}%, ${y * 100}%)`,
              transition: noAnimId === p.id ? "none" : undefined,
            };
        return (
          <div
            key={p.id}
            className={`piece ${p.fading ? "fading" : ""} ${shakeId === p.id ? "shake" : ""} ${selected === p.sq && !p.fading ? "lifted" : ""}`}
            style={{ ...style, backgroundImage: `url(${pieceUrl(settings.pieceSet, p.color, p.type)})` }}
            aria-hidden
          />
        );
      })}
      {badge && <BadgeIcon square={badge.square} kind={badge.kind} pos={coords(badge.square)} />}
      {allArrows.length > 0 && (
        <svg className="arrows" viewBox="0 0 8 8" aria-hidden>
          {allArrows.map((a, i) => (
            <ArrowShape key={i} a={a} from={coords(a.from)} to={coords(a.to)} />
          ))}
        </svg>
      )}
      {promo && (
        <div className={`promo-layer ${promoReady ? "ready" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
          <div
            className="promo-dim"
            onPointerDown={() => (promoPress.current = "dim")}
            onClick={(e) => promoAccepts(e, "dim") && setPromo(null)}
          />
          <div
            className="promo-col"
            style={{
              left: `${coords(promo.to).x * 12.5}%`,
              top: coords(promo.to).y === 0 ? 0 : undefined,
              bottom: coords(promo.to).y === 7 ? 0 : undefined,
              flexDirection: coords(promo.to).y === 0 ? "column" : "column-reverse",
            }}
            role="dialog"
            aria-label="Escolha a peça da promoção"
          >
            {(["q", "n", "r", "b"] as PieceType[]).map((t) => (
              <button
                key={t}
                className="promo-btn"
                aria-label={PIECE_NAME[t]}
                autoFocus={t === "q"}
                onPointerDown={() => (promoPress.current = t)}
                onClick={(e) => {
                  if (!promoAccepts(e, t)) return;
                  const pr = promo;
                  setPromo(null);
                  commit({ from: pr.from, to: pr.to, promotion: t }, pr.from);
                }}
                style={{ backgroundImage: `url(${pieceUrl(settings.pieceSet, promo.color, t)})` }}
              />
            ))}
            <button className="promo-cancel" onPointerDown={() => (promoPress.current = "cancel")} onClick={(e) => promoAccepts(e, "cancel") && setPromo(null)} aria-label="Cancelar promoção">
              ×
            </button>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function isEnPassantTarget(c: Chess, from: string, to: string): boolean {
  const p = c.get(from as CjsSquare);
  return !!p && p.type === "p" && from[0] !== to[0] && !c.get(to as CjsSquare);
}

function BadgeIcon({ kind, pos }: { square: string; kind: Classification; pos: { x: number; y: number } }) {
  const b = BADGE[kind];
  return (
    <div className="move-badge" style={{ left: `calc(${(pos.x + 1) * 12.5}% - 4.2%)`, top: `calc(${pos.y * 12.5}% - 1.4%)`, background: b.color }} title={b.label}>
      {kind === "book" ? <BookGlyph /> : b.sym}
    </div>
  );
}

function BookGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
    </svg>
  );
}

function ArrowShape({ a, from, to }: { a: Arrow; from: { x: number; y: number }; to: { x: number; y: number } }) {
  const color = ARROW_COLORS[a.color ?? "green"];
  const x1 = from.x + 0.5,
    y1 = from.y + 0.5,
    x2 = to.x + 0.5,
    y2 = to.y + 0.5;
  const dx = x2 - x1,
    dy = y2 - y1;
  const knight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  const w = 0.16;
  const head = 0.42;
  const opacity = a.opacity ?? 1;
  if (knight) {
    // L-shaped: go along the longer axis first
    const cx = Math.abs(dy) > Math.abs(dx) ? x1 : x2;
    const cy = Math.abs(dy) > Math.abs(dx) ? y2 : y1;
    const lx = x2 - cx,
      ly = y2 - cy;
    const len = Math.hypot(lx, ly);
    const ux = lx / len,
      uy = ly / len;
    const ex = x2 - ux * head,
      ey = y2 - uy * head;
    return (
      <g opacity={opacity}>
        <polyline points={`${x1},${y1} ${cx},${cy} ${ex},${ey}`} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round" />
        <polygon points={headPoints(ex, ey, ux, uy, head)} fill={color} />
      </g>
    );
  }
  const len = Math.hypot(dx, dy);
  const ux = dx / len,
    uy = dy / len;
  const sx = x1 + ux * 0.18,
    sy = y1 + uy * 0.18;
  const ex = x2 - ux * head,
    ey = y2 - uy * head;
  return (
    <g opacity={opacity}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={w} />
      <polygon points={headPoints(ex, ey, ux, uy, head)} fill={color} />
    </g>
  );
}

function headPoints(ex: number, ey: number, ux: number, uy: number, head: number) {
  const px = -uy,
    py = ux;
  const hw = 0.26;
  return `${ex + px * hw},${ey + py * hw} ${ex + ux * head},${ey + uy * head} ${ex - px * hw},${ey - py * hw}`;
}
