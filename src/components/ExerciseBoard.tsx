import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import Board, { type Arrow, type BoardMove } from "./Board";
import type { Goal, LessonArrow, Mark } from "../lessons/types";
import { checkGoal, goalLabel } from "../lessons/checkGoal";
import { play, playForSan } from "../sound/sound";
import type { Color } from "../types";

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
}

export default function ExerciseBoard({ fen, goal, prompt, hint, success, orientation, arrows, marks, solved: alreadySolved, onSolved }: Props) {
  const side = (fen.split(" ")[1] === "b" ? "b" : "w") as Color;
  const [cur, setCur] = useState(fen);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"play" | "wait" | "fail" | "done">("play");
  const [msg, setMsg] = useState<string | null>(null);
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [extra, setExtra] = useState<Record<string, "good" | "bad" | "hint" | "target">>({});
  const [showHint, setShowHint] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  function reset() {
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
      setStatus("done");
      setMsg(null);
      onSolved?.();
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
  if (showHint && status !== "done") {
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
        <Board fen={cur} orientation={orientation ?? side} movable={status === "play" ? side : "none"} onMove={onMove} lastMove={last} marks={boardMarks} arrows={boardArrows} mated={new Chess(cur).isCheckmate()} />
      </div>
      <div aria-live="polite">
        {status === "done" && (
          <div className="feedback ok">
            <CheckCircle2 size={20} color="var(--accent)" />
            <div>
              <h3>Muito bem!</h3>
              <p>{success}</p>
            </div>
          </div>
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
        {status !== "done" && (
          <button className="btn sm" onClick={() => setShowHint(true)} disabled={showHint}>
            <Lightbulb size={15} /> Dica
          </button>
        )}
        <button className="btn sm ghost" onClick={reset}>
          <RotateCcw size={15} /> {status === "done" ? "Repetir" : "Recomeçar"}
        </button>
      </div>
    </div>
  );
}
