import { useState } from "react";
import { Moon, Sun, Volume2, Trash2, Cpu, Palette, Accessibility, Info } from "lucide-react";
import Board from "../components/Board";
import { BOARD_THEMES, PIECE_SETS, pieceUrl } from "../components/boardThemes";
import { Modal, Seg, Switch, toast } from "../components/ui";
import { resetAll, updateSettings, useSettings } from "../storage/store";
import { play } from "../sound/sound";
import "./settings.css";

const PREVIEW_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

export default function SettingsPage() {
  const s = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="page settings-page">
      <div className="settings-grid">
        <div className="stack-lg">
          <section className="card pad stack">
            <h2 className="row" style={{ gap: 8 }}>
              <Palette size={18} /> Aparência
            </h2>
            <div>
              <div className="label">Tema do aplicativo</div>
              <Seg
                value={s.theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  {
                    value: "dark",
                    label: (
                      <span className="row" style={{ gap: 6 }}>
                        <Moon size={14} /> Escuro
                      </span>
                    ),
                  },
                  {
                    value: "light",
                    label: (
                      <span className="row" style={{ gap: 6 }}>
                        <Sun size={14} /> Claro
                      </span>
                    ),
                  },
                ]}
              />
            </div>
            <div>
              <div className="label">Tabuleiro</div>
              <div className="theme-swatches">
                {BOARD_THEMES.map((t) => (
                  <button key={t.id} className={`swatch ${s.boardTheme === t.id ? "on" : ""}`} onClick={() => updateSettings({ boardTheme: t.id })} aria-pressed={s.boardTheme === t.id} aria-label={`Tema ${t.name}`}>
                    <span className="sw-board">
                      {[0, 1, 2, 3].map((i) => (
                        <i key={i} style={{ background: (i + Math.floor(i / 2)) % 2 ? t.dark : t.light }} />
                      ))}
                    </span>
                    <span className="xs">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label">Peças</div>
              <div className="theme-swatches">
                {PIECE_SETS.map((p) => (
                  <button key={p.id} className={`swatch ${s.pieceSet === p.id ? "on" : ""}`} onClick={() => updateSettings({ pieceSet: p.id })} aria-pressed={s.pieceSet === p.id} title={p.credit}>
                    <span className="sw-pieces">
                      <img src={pieceUrl(p.id, "w", "n")} alt="" />
                      <img src={pieceUrl(p.id, "b", "q")} alt="" />
                    </span>
                    <span className="xs">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <Switch checked={s.coords} onChange={(v) => updateSettings({ coords: v })} label="Mostrar coordenadas" />
            <Switch checked={s.showLegal} onChange={(v) => updateSettings({ showLegal: v })} label="Mostrar lances possíveis" />
            <Switch checked={s.highlightLast} onChange={(v) => updateSettings({ highlightLast: v })} label="Destacar o último lance" />
          </section>

          <section className="card pad stack">
            <h2 className="row" style={{ gap: 8 }}>
              <Accessibility size={18} /> Jogo e acessibilidade
            </h2>
            <div>
              <div className="label">Animações</div>
              <Seg
                value={s.animation}
                onChange={(v) => updateSettings({ animation: v })}
                options={[
                  { value: "normal", label: "Normais" },
                  { value: "fast", label: "Rápidas" },
                  { value: "off", label: "Desligadas" },
                ]}
              />
              <p className="xs faint" style={{ marginTop: 6 }}>
                A configuração “reduzir movimento” do sistema também é respeitada.
              </p>
            </div>
            <Switch checked={s.autoQueen} onChange={(v) => updateSettings({ autoQueen: v })} label="Promover automaticamente para dama" />
            <Switch checked={s.confirmResign} onChange={(v) => updateSettings({ confirmResign: v })} label="Confirmar antes de desistir" />
            <Switch checked={s.playEvalBar} onChange={(v) => updateSettings({ playEvalBar: v })} label="Mostrar avaliação do motor durante as partidas" />
            <p className="xs faint">
              Teclado: no tabuleiro, use as setas para escolher a casa e Enter para selecionar/mover; fora dele, ← e → navegam pelos lances.
            </p>
          </section>
        </div>

        <div className="stack-lg">
          <section className="card pad stack">
            <h2 className="row" style={{ gap: 8 }}>
              <Volume2 size={18} /> Sons
            </h2>
            <Switch checked={s.soundEnabled} onChange={(v) => updateSettings({ soundEnabled: v })} label="Sons ligados" />
            <label className="field">
              Volume ({Math.round(s.volume * 100)}%)
              <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => updateSettings({ volume: +e.target.value })} disabled={!s.soundEnabled} />
            </label>
            <Switch checked={s.soundBoard} onChange={(v) => updateSettings({ soundBoard: v })} label="Sons do tabuleiro (lances, capturas, xeque)" />
            <Switch checked={s.soundPuzzle} onChange={(v) => updateSettings({ soundPuzzle: v })} label="Sons de acerto e erro nos puzzles" />
            <div className="row wrap">
              {(
                [
                  ["move", "Lance"],
                  ["capture", "Captura"],
                  ["check", "Xeque"],
                  ["mate", "Mate"],
                  ["correct", "Acerto"],
                  ["wrong", "Erro"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className="btn sm" onClick={() => play(k)} disabled={!s.soundEnabled}>
                  {l}
                </button>
              ))}
            </div>
          </section>

          <section className="card pad stack">
            <h2 className="row" style={{ gap: 8 }}>
              <Cpu size={18} /> Motor de análise
            </h2>
            <label className="field">
              Profundidade da análise livre: {s.analysisDepth}
              <input type="range" min={10} max={26} step={1} value={s.analysisDepth} onChange={(e) => updateSettings({ analysisDepth: +e.target.value })} />
            </label>
            <label className="field">
              Profundidade da revisão de partidas: {s.reviewDepth}
              <input type="range" min={10} max={20} step={1} value={s.reviewDepth} onChange={(e) => updateSettings({ reviewDepth: +e.target.value })} />
            </label>
            <p className="xs faint">Profundidades maiores são mais precisas, mas demoram mais (especialmente no celular). O motor roda em segundo plano e não trava a tela.</p>
          </section>

          <section className="card pad stack">
            <h3>Prévia</h3>
            <div style={{ maxWidth: 320 }}>
              <Board fen={PREVIEW_FEN} lastMove={{ from: "d1", to: "h5" }} arrows={[{ from: "h5", to: "f7", color: "red" }]} />
            </div>
          </section>

          <section className="card pad stack">
            <h2 className="row" style={{ gap: 8 }}>
              <Info size={18} /> Dados e créditos
            </h2>
            <p className="small muted">Todo o progresso fica salvo localmente neste navegador. Para fazer backup ou levar a outro aparelho, use os botões em Progresso.</p>
            <button className="btn danger" onClick={() => setConfirmReset(true)}>
              <Trash2 size={16} /> Apagar todo o progresso
            </button>
            <ul className="credits xs faint">
              <li>Motor: Stockfish 18 (stockfish.js, WebAssembly) — GPLv3.</li>
              <li>Regras: chess.js — licença BSD-2.</li>
              <li>Peças: Colin M.L. Burnett (GPLv2+), Armando H. Marroquin (GPLv2+), Alexis Luengas (Apache 2.0), Maurizio Monge (MIT), via Lichess.</li>
              <li>Aberturas: lichess-org/chess-openings — CC0.</li>
              <li>Ícones: Lucide — ISC.</li>
            </ul>
          </section>
        </div>
      </div>
      {confirmReset && (
        <Modal
          title="Apagar todo o progresso?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmReset(false)}>
                Cancelar
              </button>
              <button
                className="btn primary"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                  toast("Progresso apagado", "ok");
                }}
              >
                Apagar tudo
              </button>
            </>
          }
        >
          <p className="muted">Partidas, puzzles, lições, favoritos e configurações serão apagados deste aparelho. Isso não pode ser desfeito.</p>
        </Modal>
      )}
    </div>
  );
}
