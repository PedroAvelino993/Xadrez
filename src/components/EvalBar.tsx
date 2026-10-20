import type { Color, Score } from "../types";
import { evalBarPct, formatScore, describeScore } from "../engine/score";

export default function EvalBar({ score, orientation, loading }: { score: Score | null; orientation: Color; loading?: boolean }) {
  const white = evalBarPct(score);
  const label = formatScore(score).replace("+", "");
  const whiteAhead = score ? (score.mate !== undefined ? score.mate > 0 : (score.cp ?? 0) >= 0) : true;
  return (
    <div
      className={`evalbar ${orientation === "b" ? "flipped" : ""} ${loading ? "loading" : ""}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-label={`Avaliação: ${describeScore(score)} (${formatScore(score)})`}
    >
      <div className="evalbar-white" style={{ height: `${white}%` }} />
      <span className={`evalbar-label ${whiteAhead ? "w" : "b"}`}>{label}</span>
    </div>
  );
}
