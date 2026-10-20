import { useState } from "react";
import { Modal, Seg } from "./ui";
import { parsePgn, validateFen, type ParsedPgn } from "../chess/rules";

interface Props {
  onClose: () => void;
  onFen?: (fen: string) => void;
  onPgn?: (p: ParsedPgn) => void;
  initialTab?: "fen" | "pgn";
}

export default function ImportModal({ onClose, onFen, onPgn, initialTab = "fen" }: Props) {
  const [tab, setTab] = useState<"fen" | "pgn">(onFen ? initialTab : "pgn");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const t = text.trim();
    if (!t) {
      setError("Cole uma FEN ou um PGN.");
      return;
    }
    if (tab === "fen") {
      const v = validateFen(t);
      if (!v.ok) return setError(v.error ?? "FEN inválida.");
      onFen?.(t.replace(/\s+/g, " "));
      onClose();
    } else {
      try {
        const p = parsePgn(t);
        if (!p.records.length && !onFen) return setError("O PGN não contém lances.");
        onPgn?.(p);
        onClose();
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  return (
    <Modal
      title="Importar posição ou partida"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit}>
            Importar
          </button>
        </>
      }
    >
      <div className="stack">
        {onFen && onPgn && (
          <Seg
            value={tab}
            onChange={(v) => {
              setTab(v);
              setError(null);
            }}
            options={[
              { value: "fen", label: "FEN" },
              { value: "pgn", label: "PGN" },
            ]}
            ariaLabel="Formato"
          />
        )}
        <textarea
          className="input"
          rows={tab === "pgn" ? 9 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tab === "fen" ? "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" : '[Event "..."]\n\n1. e4 e5 2. Nf3 Nc6 *'}
          aria-label={tab === "fen" ? "Texto FEN" : "Texto PGN"}
          spellCheck={false}
        />
        {error && (
          <div className="feedback bad">
            <p>{error}</p>
          </div>
        )}
        <p className="xs faint">Tudo é validado pelas regras do xadrez antes de carregar. Lances ilegais ou FEN impossíveis são recusados.</p>
      </div>
    </Modal>
  );
}
