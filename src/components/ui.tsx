import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { PieceType, Classification } from "../types";
import { pieceUrl } from "./boardThemes";
import { useSettings } from "../storage/store";
import { CLASS_BADGE } from "./Board";

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  dismissable = true,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("button, [href], input, select, textarea");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input, select, textarea");
        if (!f.length) return;
        const a = f[0],
          z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose, dismissable]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          {dismissable && (
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; text: string; kind: "ok" | "err" | "info" };
let toastListener: ((t: Toast[]) => void) | null = null;
let toasts: Toast[] = [];
let tid = 1;
export function toast(text: string, kind: Toast["kind"] = "info") {
  const t = { id: tid++, text, kind };
  toasts = [...toasts, t];
  toastListener?.(toasts);
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListener?.(toasts);
  }, 2600);
}
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    toastListener = setList;
    return () => {
      toastListener = null;
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export async function copyText(text: string, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} para a área de transferência`, "ok");
  } catch {
    // fallback for browsers without clipboard permission
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast(`${label} para a área de transferência`, "ok");
    } catch {
      toast("Não foi possível copiar automaticamente", "err");
    }
    ta.remove();
  }
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/x-chess-pgn" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Pieces / avatars ----------
export function PieceIcon({ type, color = "w", size = 18 }: { type: PieceType; color?: "w" | "b"; size?: number }) {
  const s = useSettings();
  return <img src={pieceUrl(s.pieceSet, color, type)} width={size} height={size} alt="" style={{ verticalAlign: "-0.22em" }} draggable={false} />;
}

export function Avatar({ piece, color, size = 40, label }: { piece: PieceType; color: string; size?: number; label?: string }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: color, borderRadius: size * 0.26 }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <img src={pieceUrl("cburnett", "w", piece)} alt="" draggable={false} />
    </div>
  );
}

export function UserAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className="avatar user" style={{ width: size, height: size, borderRadius: size * 0.26, fontSize: size * 0.38 }} aria-hidden>
      {initials || "J"}
    </div>
  );
}

// ---------- Classification icon ----------
export const CLASS_LABEL: Record<Classification, string> = {
  best: "Melhor lance",
  excellent: "Excelente",
  good: "Bom",
  book: "Teórico",
  inaccuracy: "Imprecisão",
  mistake: "Erro",
  blunder: "Erro grave",
  forced: "Lance forçado",
};

export function ClassIcon({ kind, size = 18 }: { kind: Classification; size?: number }) {
  const b = CLASS_BADGE[kind];
  return (
    <span
      className="class-icon"
      style={{ width: size, height: size, background: b.color, fontSize: size * 0.56 }}
      title={b.label}
      aria-label={b.label}
      role="img"
    >
      {kind === "book" ? (
        <svg viewBox="0 0 24 24" width="64%" height="64%" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
        </svg>
      ) : (
        b.sym
      )}
    </span>
  );
}

/** SAN with a figurine image for the piece letter. */
export function San({ san }: { san: string; color?: "w" | "b" }) {
  const theme = useSettings().theme;
  const m = san.match(/^([KQRBN])(.*)$/);
  if (!m) return <span className="san">{san}</span>;
  // figurines use the colour that contrasts with the page, like printed notation
  return (
    <span className="san">
      <PieceIcon type={m[1].toLowerCase() as PieceType} color={theme === "light" ? "b" : "w"} size={15} />
      {m[2]}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span>{label}</span>
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${Math.round(sec)} s`;
}
