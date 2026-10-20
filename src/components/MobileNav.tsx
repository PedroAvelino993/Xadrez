import type { ReactNode } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

/** Compact move navigation shown right under the board on phones. */
export default function MobileNav({ index, length, onGo, label, extra }: { index: number; length: number; onGo: (i: number) => void; label?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mnav mobile-only">
      <button className="icon-btn" onClick={() => onGo(-1)} disabled={index <= -1} aria-label="Início">
        <ChevronFirst size={20} />
      </button>
      <button className="icon-btn" onClick={() => onGo(index - 1)} disabled={index <= -1} aria-label="Lance anterior">
        <ChevronLeft size={22} />
      </button>
      <div className="cur">{label}</div>
      <button className="icon-btn" onClick={() => onGo(index + 1)} disabled={index >= length - 1} aria-label="Próximo lance">
        <ChevronRight size={22} />
      </button>
      <button className="icon-btn" onClick={() => onGo(length - 1)} disabled={index >= length - 1} aria-label="Último lance">
        <ChevronLast size={20} />
      </button>
      {extra}
    </div>
  );
}
