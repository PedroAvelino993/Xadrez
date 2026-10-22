import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BookOpen, Crosshair, GraduationCap, Home, LayoutGrid, Microscope, Puzzle, Settings as SettingsIcon, Swords, TrendingUp, Flame } from "lucide-react";
import { useRoute } from "./hooks/useRoute";
import { addStudyTime, useAppState, useSettings } from "./storage/store";
import { Toasts, UserAvatar } from "./components/ui";
import HomePage from "./pages/Home";
import ErrorBoundary from "./components/ErrorBoundary";

const PlayPage = lazy(() => import("./pages/Play"));
const LearnPage = lazy(() => import("./pages/Learn"));
const PuzzlesPage = lazy(() => import("./pages/Puzzles"));
const AnalysisPage = lazy(() => import("./pages/Analysis"));
const ReviewPage = lazy(() => import("./pages/Review"));
const PositionsPage = lazy(() => import("./pages/Positions"));
const OpeningsPage = lazy(() => import("./pages/Openings"));
const ProgressPage = lazy(() => import("./pages/Progress"));
const SettingsPage = lazy(() => import("./pages/Settings"));

interface NavDef {
  path: string;
  label: string;
  icon: ReactNode;
  study?: boolean;
}

const NAV: NavDef[] = [
  { path: "/", label: "Início", icon: <Home size={19} /> },
  { path: "/jogar", label: "Jogar", icon: <Swords size={19} /> },
  { path: "/aprender", label: "Aprender", icon: <GraduationCap size={19} />, study: true },
  { path: "/puzzles", label: "Puzzles", icon: <Puzzle size={19} />, study: true },
  { path: "/analisar", label: "Analisar", icon: <Microscope size={19} />, study: true },
  { path: "/posicoes", label: "Posições", icon: <LayoutGrid size={19} />, study: true },
  { path: "/aberturas", label: "Aberturas", icon: <BookOpen size={19} />, study: true },
  { path: "/progresso", label: "Progresso", icon: <TrendingUp size={19} /> },
  { path: "/configuracoes", label: "Configurações", icon: <SettingsIcon size={19} /> },
];

function sectionOf(path: string): NavDef {
  if (path.startsWith("/revisao")) return { path: "/analisar", label: "Revisão da partida", icon: null, study: true };
  return NAV.slice(1).find((n) => path.startsWith(n.path)) ?? NAV[0];
}

export default function App() {
  const { path, parts, query } = useRoute();
  const settings = useSettings();
  const name = useAppState((s) => s.profileName);
  const puzzleRating = useAppState((s) => s.puzzles.rating);
  const streak = useAppState((s) => s.puzzles.streak);
  const section = sectionOf(path);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.motion = settings.animation === "off" ? "reduced" : "normal";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", settings.theme === "light" ? "#eef0ee" : "#15181a");
  }, [settings.theme, settings.animation]);

  useEffect(() => {
    document.title = `${section.label} · Lance Certo`;
    document.querySelector(".main")?.scrollTo(0, 0);
  }, [section.label, path]);

  // Study time: counted while a study section is open and the tab is visible.
  useEffect(() => {
    if (!section.study) return;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") addStudyTime(Math.min(60, Math.round((now - last) / 1000)));
      last = now;
    };
    const id = setInterval(tick, 30000);
    const vis = () => {
      if (document.visibilityState === "hidden") tick();
      else last = Date.now();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      tick();
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [section.study]);

  let page: ReactNode;
  const sub = parts.slice(1);
  switch (parts[0]) {
    case undefined:
      page = <HomePage />;
      break;
    case "jogar":
      page = <PlayPage />;
      break;
    case "aprender":
      page = <LearnPage lessonId={sub[0]} />;
      break;
    case "puzzles":
      page = <PuzzlesPage mode={sub[0]} />;
      break;
    case "analisar":
      page = <AnalysisPage fen={query.get("fen") ?? undefined} pgn={query.get("pgn") ?? undefined} ply={query.get("ply") ?? undefined} side={query.get("o") ?? undefined} />;
      break;
    case "revisao":
      page = <ReviewPage gameId={sub[0]} />;
      break;
    case "posicoes":
      page = <PositionsPage positionId={sub[0]} />;
      break;
    case "aberturas":
      page = <OpeningsPage />;
      break;
    case "progresso":
      page = <ProgressPage />;
      break;
    case "configuracoes":
      page = <SettingsPage />;
      break;
    default:
      page = (
        <div className="page">
          <div className="card pad empty">
            Página não encontrada. <a href="#/">Voltar ao início</a>
          </div>
        </div>
      );
  }

  const isActive = (n: NavDef) => (n.path === "/" ? path === "/" : section.path === n.path);

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <a className="brand" href="#/">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span>
            Lance Certo<small>Escola de xadrez</small>
          </span>
        </a>
        {NAV.slice(0, 7).map((n) => (
          <a key={n.path} className="nav-item" href={`#${n.path}`} aria-current={isActive(n) ? "page" : undefined}>
            {n.icon}
            {n.label}
          </a>
        ))}
        <div className="nav-sep" />
        {NAV.slice(7).map((n) => (
          <a key={n.path} className="nav-item" href={`#${n.path}`} aria-current={isActive(n) ? "page" : undefined}>
            {n.icon}
            {n.label}
          </a>
        ))}
        <div className="grow" />
        <div className="sidebar-foot">Motor: Stockfish 18 (WASM)</div>
      </aside>
      <header className="topbar">
        <div className="title">{section.label}</div>
        <div className="spacer" />
        <a className="stat-pill hide-sm" href="#/puzzles" title="Pontuação de puzzles (não é rating de partidas)">
          <Crosshair size={14} /> Puzzles <b>{Math.round(puzzleRating)}</b>
        </a>
        {streak > 0 && (
          <span className="stat-pill" title="Sequência atual de puzzles resolvidos">
            <Flame size={14} color="var(--warning)" /> <b>{streak}</b>
          </span>
        )}
        <a className="avatar-btn" href="#/progresso" aria-label="Perfil e progresso" style={{ padding: 0, overflow: "hidden" }}>
          <UserAvatar name={name} size={34} />
        </a>
      </header>
      <main className="main" id="conteudo">
        <Suspense
          fallback={
            <div className="page row" style={{ justifyContent: "center", paddingTop: 80 }}>
              <span className="spinner" /> <span className="muted">Carregando…</span>
            </div>
          }
        >
          <ErrorBoundary resetKey={path}>{page}</ErrorBoundary>
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Navegação">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} aria-current={isActive(n) ? "page" : undefined}>
            {n.icon}
            {n.label === "Configurações" ? "Ajustes" : n.label}
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
