import { useRef } from "react";
import type { Classification, Score } from "../types";
import { winPctWhite, formatScore } from "../engine/score";

interface Props {
  scores: Score[]; // one per position (start … end), White POV
  classes?: (Classification | undefined)[]; // per move
  current: number; // move index (-1 = start)
  onSelect: (moveIndex: number) => void;
}

const MARK: Partial<Record<Classification, string>> = {
  inaccuracy: "var(--c-inaccuracy)",
  mistake: "var(--c-mistake)",
  blunder: "var(--c-blunder)",
};

export default function EvalGraph({ scores, classes, current, onSelect }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 600,
    H = 120;
  const n = scores.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (s: Score) => H - (winPctWhite(s) / 100) * H;
  const pts = scores.map((s, i) => `${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");
  const area = `0,${H} ${pts} ${W},${H}`;
  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / r.width) * (n - 1));
    onSelect(Math.max(-1, Math.min(n - 2, i - 1)));
  };
  return (
    <div className="eval-graph-wrap">
    <svg
      ref={ref}
      className="eval-graph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      onClick={(e) => pick(e.clientX)}
      role="img"
      aria-label="Gráfico da avaliação ao longo da partida (acima: brancas melhor; abaixo: pretas melhor)"
    >
      <rect x="0" y="0" width={W} height={H} fill="#2b2f31" />
      <polygon points={area} fill="#e9ebe6" />
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(128,128,128,0.55)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <line x1={x(current + 1)} y1="0" x2={x(current + 1)} y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <title>{`Lance atual: ${formatScore(scores[current + 1])}`}</title>
    </svg>
      {classes?.map((c, i) =>
        c && MARK[c] ? (
          <span
            key={i}
            className={`eg-mark ${c}`}
            style={{ left: `${(x(i + 1) / W) * 100}%`, top: `${(y(scores[i + 1]) / H) * 100}%`, background: MARK[c] }}
            onClick={() => onSelect(i)}
            title={`Lance ${i + 1}`}
          />
        ) : null
      )}
    </div>
  );
}
