import { useEffect } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface Props {
  index: number; // -1..len-1
  length: number;
  onGo: (i: number) => void;
  onFlip?: () => void;
  extra?: React.ReactNode;
  /** enable ←/→/Home/End shortcuts on the window */
  keys?: boolean;
}

export default function NavControls({ index, length, onGo, onFlip, extra, keys = true }: Props) {
  useEffect(() => {
    if (!keys) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.closest(".board"))) return;
      if (e.key === "ArrowLeft") onGo(Math.max(-1, index - 1));
      else if (e.key === "ArrowRight") onGo(Math.min(length - 1, index + 1));
      else if (e.key === "Home") onGo(-1);
      else if (e.key === "End") onGo(length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [index, length, onGo, keys]);
  return (
    <div className="navcontrols">
      <button className="icon-btn" onClick={() => onGo(-1)} disabled={index <= -1} aria-label="Início da partida" title="Início (Home)">
        <ChevronFirst size={20} />
      </button>
      <button className="icon-btn" onClick={() => onGo(index - 1)} disabled={index <= -1} aria-label="Lance anterior" title="Anterior (←)">
        <ChevronLeft size={20} />
      </button>
      <button className="icon-btn" onClick={() => onGo(index + 1)} disabled={index >= length - 1} aria-label="Próximo lance" title="Próximo (→)">
        <ChevronRight size={20} />
      </button>
      <button className="icon-btn" onClick={() => onGo(length - 1)} disabled={index >= length - 1} aria-label="Último lance" title="Fim (End)">
        <ChevronLast size={20} />
      </button>
      {onFlip && (
        <button className="icon-btn" onClick={onFlip} aria-label="Girar tabuleiro" title="Girar tabuleiro">
          <RefreshCw size={18} />
        </button>
      )}
      {extra}
    </div>
  );
}
