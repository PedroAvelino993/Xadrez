import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import Board, { type Arrow, type BoardMove } from "./Board";
import type { Goal, LessonArrow, Mark } from "../lessons/types";
import { checkGoal, goalLabel } from "../lessons/checkGoal";
import { play, playForSan } from "../sound/sound";
import type { Color } from "../types";
import { useConversion } from "../puzzles/useConversion";
import { goalText as convertGoalText, solverCp, type ConvertGoal, type EngineView } from "../puzzles/convert";
import { formatScore } from "../engine/score";

interface Props {
  fen: string;
  goal: Goal;
  prompt: string;
  hint: string;
  success: string;
  orientation?: Color;
  arrows?: LessonArrow[];
  marks?: Mark[];
  solved?: boolean;
  onSolved?: () => void;
  compact?: boolean;
  /** after the exercise is solved, keep playing against the engine until this goal (see puzzles/convert.ts) */
  convert?: (fenAfter: string, view: EngineView) => ConvertGoal | null;
}

export default function ExerciseBoard({ fen, goal, prompt, hint, success, orientation, arrows, marks, solved: alreadySolved, onSolved, convert }: Props) {
  const side = (fen.split(" ")[1] === "b" ? "b" : "w") as Color;
  const [cur, setCur] = useState(fen);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"play" | "wait" | "fail" | "done" | "convert">("play");
  const [msg, setMsg] = useState<string | null>(null);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [extra, setExtra] = useState<Record<string, "good" | "bad" | "hint" | "target">>({});
  const [showHint, setShowHint] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const cv = useConversion({ solver: side, setFen: setCur, setLast, setMarks: (m) => setExtra(m) });
  const { sync } = cv;
  useEffect(() => sync(cur), [cur, sync]);
  useEffect(() => {
    if (status === "convert" && cv.phase === "done") setStatus("done");
  }, [cv.phase, status]);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  function reset() {
    cv.reset();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCur(fen);
    setStep(0);
    setStatus("play");
    setMsg(null);
    setLast(null);
    setExtra({});
    setShowHint(false);
  }

  const onMove = (m: BoardMove) => {
    if (status === "convert") {
      if (cv.phase !== "turn") return false;
      const c = new Chess(cur);
      try {
        void cv.move(c, c.move(m));
        return true;
      } catch {
        return false;
      }
    }
    if (status !== "play") return false;
    const c = new Chess(cur);
    let mv;
    try {
      mv = c.move(m);
    } catch {
      return false;
    }
    const r = checkGoal(goal, cur, mv, step);
    setCur(mv.after);
    setLast({ from: mv.from, to: mv.to });
    if (r.status === "success") {
      playForSan(mv.san, !!mv.promotion);
      play("correct");
      setExtra({ [mv.to]: "good" });
      setMsg(null);
      onSolved?.();
      if (convert && !new Chess(mv.after).isGameOver()) {
        setStatus("convert");
        void cv.start(mv.after, (view) => convert(mv.after, view)).then((started) => {
          if (!started) setStatus("done");
        });
      } else setStatus("done");
    } else if (r.status === "continue") {
      playForSan(mv.san, !!mv.promotion);
      setStep(step + 1);
      setExtra({ [mv.to]: "good" });
      if (r.reply) {
        setStatus("wait");
        timers.current.push(
          setTimeout(() => {
            setCur(r.fen);
            setLast({ from: r.reply!.slice(0, 2), to: r.reply!.slice(2, 4) });
            playForSan(new Chess(mv.after).move({ from: r.reply!.slice(0, 2), to: r.reply!.slice(2, 4), promotion: r.reply![4] }).san);
            setExtra({});
            setStatus("play");
          }, 450)
        );
      } else {
        // free-movement exercises: same side moves again
        timers.current.push(setTimeout(() => setCur(r.fen), 0));
      }
    } else {
      play("wrong");
      setExtra({ [mv.to]: "bad" });
      setStatus("fail");
      setMsg(r.message);
      const back = cur;
      timers.current.push(
        setTimeout(() => {
          setCur(back);
          setLast(null);
          setExtra({});
          setStatus("play");
        }, 900)
      );
    }
    return true;
  };

  const boardMarks: Record<string, "good" | "bad" | "hint" | "target"> = {};
  for (const m of marks ?? []) boardMarks[m.sq] = m.type;
  if (goal.type === "reach" || goal.type === "capture") boardMarks[goal.square] = "target";
  if (showHint && status !== "done" && status !== "convert") {
    const first = goal.type === "moves" ? goal.accept[0] : goal.type === "sequence" ? goal.moves[step * 2] : null;
    if (first) boardMarks[first.slice(0, 2)] = "hint";
    if (goal.type === "safe") boardMarks[goal.square] = "hint";
  }
  Object.assign(boardMarks, extra);
  const boardArrows: Arrow[] = status === "play" && step === 0 ? (arrows ?? []).map((a) => ({ ...a })) : [];

  return (
    <div className="exercise">
      <div className="ex-prompt">
        <span className="chip green">{goalLabel(goal)}</span>
        <p>{prompt}</p>
      </div>
      <div className="ex-board">
        <Board fen={cur} orientation={orientation ?? side} movable={status === "play" || (status === "convert" && cv.phase === "turn") ? side : "none"} onMove={onMove} lastMove={last} marks={boardMarks} arrows={boardArrows} mated={new Chess(cur).isCheckmate()} />
      </div>
      <div aria-live="polite">
        {(status === "done" || status === "convert") && (
          <div className="feedback ok">
            <CheckCircle2 size={20} color="var(--accent)" />
            <div>
              <h3>{status === "convert" ? "Isso mesmo!" : cv.conv?.outcome === "reached" ? (cv.conv.goal === "promote" ? "Promovido! Exercício completo." : cv.conv.goal === "hold" ? "Empate garantido!" : cv.conv.goal === "mate" ? "Xeque-mate! Exercício completo." : "Vantagem decisiva!") : "Muito bem!"}</h3>
              <p>{success}</p>
            </div>
          </div>
        )}
        {status === "convert" && cv.conv && (
          <div className={`feedback ${cv.phase === "wrong" ? "bad" : "info"}`}>
            {cv.phase === "wrong" ? <XCircle size={20} color="var(--danger)" /> : <Lightbulb size={20} color="var(--info)" />}
            <div>
              <p>{cv.phase === "wrong" && cv.conv.msg ? cv.conv.msg : convertGoalText(cv.conv.goal)}</p>
              <p className="xs faint" style={{ marginTop: 4 }}>
                {cv.phase === "wait" ? "Stockfish pensando…" : `Seu lance ${cv.conv.step + 1} de no máximo ${cv.conv.max}`}
                {cv.conv.before && cv.phase === "turn" && ` · avaliação para você ${formatScore({ cp: solverCp(cv.conv.before.score, side) })}`}
              </p>
            </div>
          </div>
        )}
        {status === "convert" && !cv.conv && (
          <p className="xs faint">Verificando a posição com o Stockfish…</p>
        )}
        {status === "fail" && msg && (
          <div className="feedback bad">
            <XCircle size={20} color="var(--danger)" />
            <p>{msg}</p>
          </div>
        )}
        {showHint && status !== "done" && (
          <div className="feedback info">
            <Lightbulb size={20} color="var(--info)" />
            <p>{hint}</p>
          </div>
        )}
        {alreadySolved && status !== "done" && <p className="xs faint">Você já resolveu este exercício antes. Pode repetir quando quiser.</p>}
      </div>
      <div className="row wrap">
        {status === "convert" ? (
          <>
            <button className="btn sm" onClick={cv.hint} disabled={cv.phase !== "turn"}>
              <Lightbulb size={15} /> Dica
            </button>
            <button className="btn sm" onClick={cv.playEngine} disabled={cv.phase !== "turn"}>
              Lance do motor
            </button>
            <button className="btn sm ghost" onClick={() => cv.finish("skipped")}>
              Encerrar aqui
            </button>
          </>
        ) : (
          status !== "done" && (
            <button className="btn sm" onClick={() => setShowHint(true)} disabled={showHint}>
              <Lightbulb size={15} /> Dica
            </button>
          )
        )}
        <button className="btn sm ghost" onClick={reset}>
          <RotateCcw size={15} /> {status === "done" ? "Repetir" : "Recomeçar"}
        </button>
      </div>
    </div>
  );
}
