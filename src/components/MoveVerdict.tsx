import { ArrowRight, PlayCircle } from "lucide-react";
import type { Classification, Score } from "../types";
import { ClassIcon, CLASS_LABEL, San } from "./ui";
import { formatScore } from "../engine/score";
import { sanLineFromUci } from "../chess/rules";

const VERB: Record<Classification, string> = {
  best: "é o melhor lance",
  excellent: "é excelente",
  good: "é um bom lance",
  book: "é um lance teórico",
  inaccuracy: "é uma imprecisão",
  mistake: "é um erro",
  blunder: "é um erro grave",
  forced: "é forçado",
};

interface Props {
  san: string;
  color: "w" | "b";
  cls: Classification;
  before: Score;
  after: Score;
  explanation: string[];
  fenBefore: string;
  bestPv: string[];
  playedUci: string;
  onShowLine?: () => void;
}

export default function MoveVerdict({ san, color, cls, before, after, explanation, fenBefore, bestPv, playedUci, onShowLine }: Props) {
  const bestSans = bestPv.length ? sanLineFromUci(fenBefore, bestPv.slice(0, 8)) : [];
  // only show an alternative that is legal in this position
  const showBest = bestSans.length > 0 && bestPv[0] !== playedUci && cls !== "best" && cls !== "book" && cls !== "forced";
  return (
    <div className={`verdict v-${cls}`}>
      <div className="verdict-head">
        <ClassIcon kind={cls} size={26} />
        <div style={{ minWidth: 0 }}>
          <div className="verdict-title">
            <San san={san} color={color} /> {VERB[cls]}
          </div>
          <div className="xs faint row" style={{ gap: 6 }}>
            {CLASS_LABEL[cls]} · avaliação {formatScore(before)} <ArrowRight size={11} /> {formatScore(after)}
          </div>
        </div>
      </div>
      <ul className="verdict-why">
        {explanation.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      {showBest && (
        <div className="verdict-best">
          <div className="xs faint">Melhor alternativa</div>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div className="best-line">
              <b>
                <San san={bestSans[0]} color={color} />
              </b>{" "}
              <span className="faint small">{bestSans.slice(1, 7).join(" ")}</span>
            </div>
            {onShowLine && (
              <button className="btn sm" onClick={onShowLine}>
                <PlayCircle size={15} /> Ver linha no tabuleiro
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
