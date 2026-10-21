import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, GraduationCap, RotateCcw, Sparkles } from "lucide-react";
import Board from "../components/Board";
import ExerciseBoard from "../components/ExerciseBoard";
import { decideGoalForObjective } from "../puzzles/convert";
import type { Lesson, Module, Step } from "../lessons/types";
import { setState, useAppState } from "../storage/store";
import { navigate } from "../hooks/useRoute";
import { parseUci } from "../chess/rules";
import "./learn.css";

const ORDER = ["fundamentos", "tatica", "estrategia", "aberturas", "finais"];
const files = import.meta.glob<{ default: Module }>("../lessons/data/*.json");

let modulesCache: Promise<Module[]> | null = null;
export function loadModules(): Promise<Module[]> {
  return (modulesCache ??= Promise.all(Object.values(files).map((load) => load().then((m) => m.default))).then((mods) => mods.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))));
}

export function useModules() {
  const [mods, setMods] = useState<Module[] | null>(null);
  useEffect(() => {
    loadModules().then(setMods);
  }, []);
  return mods;
}

export default function LearnPage({ lessonId }: { lessonId?: string }) {
  const mods = useModules();
  if (!mods)
    return (
      <div className="page row" style={{ justifyContent: "center", paddingTop: 60 }}>
        <span className="spinner" /> Carregando lições…
      </div>
    );
  if (lessonId) {
    const all = mods.flatMap((m) => m.lessons.map((l) => ({ m, l })));
    const i = all.findIndex((x) => x.l.id === lessonId);
    if (i < 0)
      return (
        <div className="page">
          <div className="card pad empty">
            Lição não encontrada. <a href="#/aprender">Ver todas as lições</a>
          </div>
        </div>
      );
    return <LessonView key={lessonId} module={all[i].m} lesson={all[i].l} next={all[i + 1]?.l} prev={all[i - 1]?.l} />;
  }
  return <LearnHub mods={mods} />;
}

function LearnHub({ mods }: { mods: Module[] }) {
  const done = useAppState((s) => s.lessons.done);
  const total = mods.reduce((s, m) => s + m.lessons.length, 0);
  const nDone = mods.reduce((s, m) => s + m.lessons.filter((l) => done[l.id]).length, 0);
  const recommended = mods.flatMap((m) => m.lessons).find((l) => !done[l.id]);
  return (
    <div className="page stack-lg">
      <div className="card pad learn-hero">
        <div className="mode-icon green" style={{ width: 54, height: 54 }}>
          <GraduationCap size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Trilha de aprendizado</h1>
          <p className="muted">Do movimento das peças às técnicas de final. Todas as lições estão liberadas; a recomendação segue a ordem do curso.</p>
          <div className="row" style={{ marginTop: 10, gap: 12 }}>
            <div className="progress" style={{ flex: 1, maxWidth: 360 }}>
              <span style={{ width: `${total ? (nDone / total) * 100 : 0}%` }} />
            </div>
            <span className="small faint">
              {nDone} de {total} lições
            </span>
          </div>
        </div>
        {recommended && (
          <button className="btn primary lg" onClick={() => navigate(`/aprender/${recommended.id}`)}>
            <Sparkles size={18} /> {nDone ? "Continuar" : "Começar"}: {recommended.title}
          </button>
        )}
      </div>
      {mods.map((m, mi) => {
        const md = m.lessons.filter((l) => done[l.id]).length;
        return (
          <section key={m.id}>
            <div className="section-title">
              <h2>
                Módulo {mi + 1} · {m.title}
              </h2>
              <span className="xs faint">
                {m.level} · {md}/{m.lessons.length} concluídas
              </span>
            </div>
            <p className="small muted" style={{ marginBottom: 12 }}>
              {m.description}
            </p>
            <div className="grid-auto">
              {m.lessons.map((l, li) => {
                const exs = l.steps.filter((s) => s.kind === "exercise").length;
                return (
                  <button key={l.id} className={`card lesson-card ${done[l.id] ? "done" : ""} ${recommended?.id === l.id ? "rec" : ""}`} onClick={() => navigate(`/aprender/${l.id}`)}>
                    <div className="row between">
                      <span className="xs faint">Lição {li + 1}</span>
                      {done[l.id] ? <CheckCircle2 size={18} color="var(--accent)" /> : recommended?.id === l.id ? <span className="chip green">Recomendada</span> : null}
                    </div>
                    <b>{l.title}</b>
                    <p className="xs muted">{l.intro}</p>
                    <div className="row xs faint" style={{ gap: 10, marginTop: "auto" }}>
                      <span className="row" style={{ gap: 4 }}>
                        <Clock size={12} /> {l.minutes} min
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        <BookOpenCheck size={12} /> {exs} exercícios
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LessonView({ module, lesson, next, prev }: { module: Module; lesson: Lesson; next?: Lesson; prev?: Lesson }) {
  const [i, setI] = useState(0);
  const exercises = useAppState((s) => s.lessons.exercises);
  const done = useAppState((s) => !!s.lessons.done[lesson.id]);
  const step = lesson.steps[i];
  const last = i === lesson.steps.length - 1;

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [i]);

  const complete = () => setState((s) => ({ ...s, lessons: { ...s.lessons, done: { ...s.lessons.done, [lesson.id]: Date.now() } } }));
  useEffect(() => {
    if (step.kind === "summary") complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <div className="page lesson-page">
      <div className="lesson-top">
        <button className="btn sm ghost" onClick={() => navigate("/aprender")}>
          <ArrowLeft size={16} /> {module.title}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="lesson-title">{lesson.title}</h1>
        </div>
        {done && (
          <span className="chip green">
            <CheckCircle2 size={13} /> Concluída
          </span>
        )}
      </div>
      <div className="step-dots" role="tablist" aria-label="Etapas da lição">
        {lesson.steps.map((s, k) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === i}
            aria-label={`Etapa ${k + 1}`}
            className={`dot ${k === i ? "on" : ""} ${k < i ? "past" : ""} ${s.kind === "exercise" && exercises[s.id] ? "solved" : ""} ${s.kind}`}
            onClick={() => setI(k)}
          />
        ))}
      </div>

      <div key={i} className="step-wrap">
        <StepView step={step} moduleId={module.id} solved={step.kind === "exercise" ? !!exercises[step.id] : false} />
      </div>

      <div className="lesson-nav">
        <button className="btn" onClick={() => (i > 0 ? setI(i - 1) : prev && navigate(`/aprender/${prev.id}`))} disabled={i === 0 && !prev}>
          <ChevronLeft size={16} /> {i > 0 ? "Anterior" : "Lição anterior"}
        </button>
        <span className="small faint">
          {i + 1} / {lesson.steps.length}
        </span>
        {!last ? (
          <button className="btn primary" onClick={() => setI(i + 1)}>
            Próximo <ChevronRight size={16} />
          </button>
        ) : next ? (
          <button className="btn primary" onClick={() => navigate(`/aprender/${next.id}`)}>
            Próxima lição: {next.title} <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn primary" onClick={() => navigate("/aprender")}>
            Voltar à trilha <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function rich(t: string) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
}

function StepView({ step, solved, moduleId }: { step: Step; solved: boolean; moduleId: string }) {
  if (step.kind === "text")
    return (
      <div className="card pad lesson-text">
        {step.title && <h2>{step.title}</h2>}
        {step.body.map((p, i) => (
          <p key={i}>{rich(p)}</p>
        ))}
      </div>
    );
  if (step.kind === "summary")
    return (
      <div className="card pad lesson-text">
        <h2 className="row" style={{ gap: 8 }}>
          <CheckCircle2 size={22} color="var(--accent)" /> Resumo
        </h2>
        <ul className="summary-list">
          {step.points.map((p, i) => (
            <li key={i}>{rich(p)}</li>
          ))}
        </ul>
        <p className="small faint">Lição marcada como concluída. Você pode voltar e repetir os exercícios quando quiser.</p>
      </div>
    );
  if (step.kind === "board") return <DemoBoard step={step} />;
  return (
    <div className="lesson-split">
      <ExerciseBoard
        fen={step.fen}
        goal={step.goal}
        prompt={step.prompt}
        hint={step.hint}
        success={step.success}
        orientation={step.orientation}
        arrows={step.arrows}
        marks={step.marks}
        solved={solved}
        onSolved={() => setState((s) => ({ ...s, lessons: { ...s.lessons, exercises: { ...s.lessons.exercises, [step.id]: true } } }))}
        convert={
          // engine-verified exercises in the tactics and endgame modules continue until the idea is completed
          (step.goal.type === "moves" || step.goal.type === "sequence") && (moduleId === "finais" || moduleId === "tatica")
            ? (fenAfter, view) => {
                const side = step.fen.split(" ")[1] === "b" ? "b" : "w";
                if (moduleId !== "finais") return decideGoalForObjective(step.prompt, false, fenAfter, side, view.score);
                // endgame lessons: defend → hold the draw; otherwise, if the engine says it is won, play it out
                const o = step.prompt.toLowerCase();
                if (o.includes("empat") || o.includes("defend")) return decideGoalForObjective("empatam", true, fenAfter, side, view.score);
                return decideGoalForObjective("vencem", true, fenAfter, side, view.score);
              }
            : undefined
        }
      />
    </div>
  );
}

function DemoBoard({ step }: { step: Extract<Step, { kind: "board" }> }) {
  const [k, setK] = useState(0);
  const positions = useMemo(() => {
    const c = new Chess(step.fen);
    const out: { fen: string; last: { from: string; to: string } | null; san?: string }[] = [{ fen: step.fen, last: null }];
    for (const u of step.moves ?? []) {
      try {
        const m = c.move(parseUci(u));
        out.push({ fen: c.fen(), last: { from: m.from, to: m.to }, san: m.san });
      } catch {
        break;
      }
    }
    return out;
  }, [step]);
  const pos = positions[k];
  const marks: Record<string, "good" | "bad" | "hint" | "target"> = {};
  if (k === 0) for (const m of step.marks ?? []) marks[m.sq] = m.type;
  return (
    <div className="lesson-split">
      <div className="ex-board">
        <Board fen={pos.fen} orientation={step.orientation ?? "w"} lastMove={pos.last} arrows={k === 0 ? step.arrows : []} marks={marks} mated={new Chess(pos.fen).isCheckmate()} />
      </div>
      <div className="card pad lesson-text">
        {step.title && <h2>{step.title}</h2>}
        <p>{rich(step.caption)}</p>
        {positions.length > 1 && (
          <div className="demo-moves">
            <div className="row wrap" style={{ gap: 4 }}>
              {positions.slice(1).map((p, j) => (
                <button key={j} className={`mv ${j + 1 === k ? "current" : ""}`} onClick={() => setK(j + 1)} style={{ minHeight: 26 }}>
                  {p.san}
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => setK(Math.max(0, k - 1))} disabled={k === 0}>
                <ChevronLeft size={15} />
              </button>
              <button className="btn sm primary" onClick={() => setK(Math.min(positions.length - 1, k + 1))} disabled={k === positions.length - 1}>
                {k === 0 ? "Ver lances" : "Próximo lance"} <ChevronRight size={15} />
              </button>
              <button className="btn sm ghost" onClick={() => setK(0)} disabled={k === 0}>
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
