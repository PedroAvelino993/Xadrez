import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, GraduationCap, LayoutGrid, Microscope, Play, Puzzle, Swords } from "lucide-react";
import Board from "../components/Board";
import { Avatar } from "../components/ui";
import { BOTS, botById } from "../bots/bots";
import { todayKey, useAppState } from "../storage/store";
import { navigate } from "../hooks/useRoute";
import { dailyIds, loadPuzzles, type Puzzle as PuzzleT } from "../puzzles/logic";
import { REASON_TEXT } from "../chess/rules";
import "./home.css";

const HERO_FEN = "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 8";

export default function HomePage() {
  const name = useAppState((s) => s.profileName);
  const games = useAppState((s) => s.games);
  const ongoing = useAppState((s) => s.ongoing);
  const attempts = useAppState((s) => s.puzzles.attempts);
  const lessonsDone = useAppState((s) => s.lessons.done);
  const [daily, setDaily] = useState<PuzzleT[]>([]);
  useEffect(() => {
    loadPuzzles().then((all) => {
      const ids = dailyIds(all, todayKey());
      setDaily(ids.map((id) => all.find((p) => p.id === id)!).filter(Boolean));
    });
  }, []);
  const doneDaily = daily.filter((p) => attempts[p.id]?.solved).length;
  const lastBot = games[0] ? botById(games[0].botId) : BOTS[1];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="page stack-lg">
      <div className="home-hero card">
        <div className="hero-text">
          <span className="chip green">Escola de xadrez</span>
          <h1>
            {greet}, {name}!
          </h1>
          <p className="muted">Jogue contra bots de vários níveis, resolva puzzles verificados pelo Stockfish e entenda cada lance com a análise da partida.</p>
          <div className="row wrap" style={{ marginTop: 6 }}>
            {ongoing ? (
              <button className="btn primary lg" onClick={() => navigate("/jogar")}>
                <Play size={18} /> Continuar partida
              </button>
            ) : (
              <button className="btn primary lg" onClick={() => navigate(`/jogar?bot=${lastBot.id}`)}>
                <Swords size={18} /> Jogar contra {lastBot.name}
              </button>
            )}
            <button className="btn lg" onClick={() => navigate("/aprender")}>
              <GraduationCap size={18} /> Aprender
            </button>
          </div>
        </div>
        <div className="hero-board">
          <Board fen={HERO_FEN} className="thumb" lastMove={{ from: "c1", to: "e3" }} arrows={[{ from: "c4", to: "d5", color: "green" }]} />
        </div>
      </div>

      <div className="home-grid">
        <button className="card pad mode-card" onClick={() => navigate("/puzzles/diario")}>
          <div className="mode-icon yellow">
            <CalendarDays size={22} />
          </div>
          <div>
            <h3>Desafio diário</h3>
            <p className="small muted">
              {daily.length ? `${doneDaily}/${daily.length} resolvidos hoje` : "Carregando…"}
            </p>
            {daily.length > 0 && (
              <div className="progress" style={{ marginTop: 8 }}>
                <span style={{ width: `${(doneDaily / daily.length) * 100}%` }} />
              </div>
            )}
          </div>
          <ArrowRight className="go" size={18} />
        </button>
        <button className="card pad mode-card" onClick={() => navigate("/puzzles/treino")}>
          <div className="mode-icon green">
            <Puzzle size={22} />
          </div>
          <div>
            <h3>Treinar táticas</h3>
            <p className="small muted">Puzzles no seu nível, com dicas e explicação da ideia.</p>
          </div>
          <ArrowRight className="go" size={18} />
        </button>
        <button className="card pad mode-card" onClick={() => navigate("/aprender")}>
          <div className="mode-icon blue">
            <GraduationCap size={22} />
          </div>
          <div>
            <h3>Lições</h3>
            <p className="small muted">{Object.keys(lessonsDone).length} concluídas · 5 módulos do básico aos finais.</p>
          </div>
          <ArrowRight className="go" size={18} />
        </button>
        <button className="card pad mode-card" onClick={() => navigate("/analisar")}>
          <div className="mode-icon red">
            <Microscope size={22} />
          </div>
          <div>
            <h3>Analisar</h3>
            <p className="small muted">Cole um PGN ou FEN e veja a avaliação do Stockfish.</p>
          </div>
          <ArrowRight className="go" size={18} />
        </button>
        <button className="card pad mode-card" onClick={() => navigate("/aberturas")}>
          <div className="mode-icon blue">
            <BookOpen size={22} />
          </div>
          <div>
            <h3>Aberturas</h3>
            <p className="small muted">Explore milhares de linhas com nome e pratique contra o bot.</p>
          </div>
          <ArrowRight className="go" size={18} />
        </button>
        <button className="card pad mode-card" onClick={() => navigate("/posicoes")}>
          <div className="mode-icon yellow">
            <LayoutGrid size={22} />
          </div>
          <div>
            <h3>Posições</h3>
            <p className="small muted">Posições famosas, finais clássicos e editor de posição.</p>
          </div>
          <ArrowRight className="go" size={18} />
        </button>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h3>Adversários</h3>
            <a className="small" href="#/jogar">
              Ver todos
            </a>
          </div>
          <div className="bot-strip">
            {BOTS.map((b) => (
              <button key={b.id} className="bot-chip" onClick={() => navigate(`/jogar?bot=${b.id}`)} title={b.description}>
                <Avatar piece={b.piece} color={b.color} size={44} />
                <b className="small">{b.name}</b>
                <span className="xs faint">{b.levelName}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Últimas partidas</h3>
            <a className="small" href="#/progresso">
              Progresso
            </a>
          </div>
          {games.length === 0 ? (
            <div className="empty">Suas partidas aparecerão aqui, prontas para revisão.</div>
          ) : (
            <div className="recent">
              {games.slice(0, 5).map((g) => (
                <button key={g.id} className="recent-row" onClick={() => navigate(`/revisao/${g.id}`)}>
                  <Avatar piece={botById(g.botId).piece} color={botById(g.botId).color} size={30} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b className="small">vs {botById(g.botId).name}</b>
                    <span className="xs faint" style={{ display: "block" }}>
                      {new Date(g.date).toLocaleDateString("pt-BR")} · {REASON_TEXT[g.reason]}
                    </span>
                  </span>
                  <span className={`chip ${g.outcome === "win" ? "green" : g.outcome === "loss" ? "red" : ""}`}>{g.outcome === "win" ? "Vitória" : g.outcome === "loss" ? "Derrota" : "Empate"}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
