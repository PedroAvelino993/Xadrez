import { Cpu, RotateCcw } from "lucide-react";
import type { EngineResult } from "../types";
import { formatScore, describeScore } from "../engine/score";
import { sanLineFromUci, moveNumberLabel } from "../chess/rules";
import { getAnalysisEngine } from "../engine/stockfish";

interface Props {
  fen: string;
  result: EngineResult | null;
  running: boolean;
  error: string | null;
  terminal?: string | null;
  enabled: boolean;
  onToggle?: (v: boolean) => void;
  onPlayLine?: (pv: string[], upTo: number) => void;
  targetDepth: number;
}

export default function EngineLines({ fen, result, running, error, terminal, enabled, onToggle, onPlayLine, targetDepth }: Props) {
  const top = result?.lines[0];
  return (
    <div className="engine-box">
      <div className="engine-head">
        <span className="big" style={{ color: top ? undefined : "var(--text-3)" }}>
          {terminal ? terminal.replace("1/2-1/2", "½-½") : top ? formatScore(top.score) : "–"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small" style={{ fontWeight: 650 }}>
            {terminal ? (terminal === "1/2-1/2" ? "Empate" : "Xeque-mate") : top ? describeScore(top.score) : enabled ? "Calculando…" : "Motor desligado"}
          </div>
          <div className="xs faint row" style={{ gap: 6 }}>
            <Cpu size={12} /> Stockfish 18 · profundidade {result?.depth ?? 0}/{targetDepth}
            {running && <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} aria-label="Analisando" />}
          </div>
        </div>
        {onToggle && (
          <label className="switch" title="Ligar/desligar motor">
            <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} aria-label="Motor ligado" />
            <span className="track" />
          </label>
        )}
      </div>
      {error && (
        <div className="feedback bad" style={{ margin: 10 }}>
          <div>
            <p>{error}</p>
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => getAnalysisEngine().restart()}>
              <RotateCcw size={14} /> Reiniciar motor
            </button>
          </div>
        </div>
      )}
      {enabled &&
        !terminal &&
        result?.lines.map((l) => {
          const sans = sanLineFromUci(fen, l.pv.slice(0, 12));
          const whiteAdv = l.score.mate !== undefined ? l.score.mate > 0 : (l.score.cp ?? 0) >= 0;
          return (
            <div
              key={l.multipv}
              className="pvline"
              role="button"
              tabIndex={0}
              onClick={() => onPlayLine?.(l.pv, 1)}
              onKeyDown={(e) => e.key === "Enter" && onPlayLine?.(l.pv, 1)}
              title="Clique para jogar o primeiro lance desta linha"
            >
              <span className={`sc ${whiteAdv ? "w" : "b"}`}>{formatScore(l.score)}</span>
              <span className="moves">
                {sans.map((s, i) => (
                  <span key={i}>
                    {i === 0 || (moveNumberLabel(i, fen).endsWith(".") && !moveNumberLabel(i, fen).endsWith("...")) ? <span className="faint">{moveNumberLabel(i, fen)} </span> : null}
                    {i === 0 ? <b>{s}</b> : s}{" "}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
    </div>
  );
}
