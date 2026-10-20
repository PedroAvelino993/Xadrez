import { useEffect, useRef } from "react";
import type { Classification, MoveRecord } from "../types";
import { ClassIcon, San } from "./ui";
import { turnOf } from "../chess/rules";

interface Props {
  records: MoveRecord[];
  startFen: string;
  /** index of the move currently shown (-1 = start position) */
  current: number;
  onSelect?: (i: number) => void;
  classes?: (Classification | null | undefined)[];
  emptyText?: string;
}

export default function MoveList({ records, startFen, current, onSelect, classes, emptyText = "Nenhum lance ainda." }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".mv.current");
    if (el && ref.current) {
      const box = ref.current;
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTo({ top: top - box.clientHeight / 2, behavior: "smooth" });
    }
  }, [current, records.length]);

  const blackFirst = turnOf(startFen) === "b";
  const startNo = +startFen.split(" ")[5] || 1;
  const rows: { no: number; w?: number; b?: number }[] = [];
  let i = 0;
  if (blackFirst && records.length) {
    rows.push({ no: startNo, b: 0 });
    i = 1;
  }
  for (; i < records.length; i += 2) {
    rows.push({ no: startNo + Math.floor((i + (blackFirst ? 1 : 0)) / 2), w: i, b: i + 1 < records.length ? i + 1 : undefined });
  }

  const cell = (idx: number | undefined) => {
    if (idx === undefined) return <span className="mv empty" />;
    const r = records[idx];
    const c = classes?.[idx];
    return (
      <button
        className={`mv ${idx === current ? "current" : ""}`}
        onClick={() => onSelect?.(idx)}
        aria-current={idx === current ? "step" : undefined}
        aria-label={`Lance ${r.san}`}
      >
        <San san={r.san} color={r.color} />
        {c && <ClassIcon kind={c} size={15} />}
      </button>
    );
  };

  return (
    <div className="movelist" ref={ref} role="list" aria-label="Histórico de lances">
      {records.length === 0 && <div className="empty">{emptyText}</div>}
      {rows.map((row) => (
        <div className="mvrow" key={row.no + "-" + (row.w ?? "x")} role="listitem">
          <span className="mvno">{row.no}.</span>
          {row.w === undefined ? <span className="mv empty">…</span> : cell(row.w)}
          {cell(row.b)}
        </div>
      ))}
    </div>
  );
}
