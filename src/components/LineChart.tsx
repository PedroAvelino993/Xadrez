interface Props {
  values: number[];
  height?: number;
  label: string;
  color?: string;
  format?: (v: number) => string;
}

/** Minimal responsive SVG line chart. */
export default function LineChart({ values, height = 120, label, color = "var(--accent)", format = (v) => String(Math.round(v)) }: Props) {
  if (values.length < 2) return <div className="empty small">Dados insuficientes para o gráfico.</div>;
  const W = 600;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 10;
  const lo = min - pad,
    hi = max + pad;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <figure className="linechart" aria-label={`${label}: de ${format(values[0])} a ${format(values[values.length - 1])}`}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${pts} ${W},${height}`} fill="url(#lc-fill)" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="row between xs faint">
        <span>
          mín. {format(min)} · máx. {format(max)}
        </span>
        <span>atual {format(values[values.length - 1])}</span>
      </figcaption>
    </figure>
  );
}
