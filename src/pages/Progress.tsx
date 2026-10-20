import { useMemo, useRef, useState } from "react";
import { Download, Upload, Pencil, Check, Trophy, Clock, GraduationCap, Puzzle as PuzzleIcon, Swords, ShieldAlert } from "lucide-react";
import { Avatar, UserAvatar, formatDuration, toast } from "../components/ui";
import LineChart from "../components/LineChart";
import { BOTS, botById } from "../bots/bots";
import { performanceVsBots } from "../bots/stats";
import { getState, hydrate, setState, todayKey, useAppState } from "../storage/store";
import { REASON_TEXT } from "../chess/rules";
import { navigate } from "../hooks/useRoute";
import { themeLabel } from "../puzzles/logic";
import { useModules } from "./Learn";
import "./progress.css";

export default function ProgressPage() {
  const s = useAppState((x) => x);
  const mods = useModules();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.profileName);
  const fileRef = useRef<HTMLInputElement>(null);

  const g = s.games;
  const wins = g.filter((x) => x.outcome === "win").length;
  const losses = g.filter((x) => x.outcome === "loss").length;
  const draws = g.filter((x) => x.outcome === "draw").length;
  const perf = performanceVsBots(g);
  const attempts = Object.values(s.puzzles.attempts);
  const firstTry = attempts.filter((a) => a.firstTry).length;
  const themeRows = Object.entries(s.puzzles.themeStats)
    .map(([id, st]) => ({ id, ...st, total: st.ok + st.fail, pct: st.ok / Math.max(1, st.ok + st.fail) }))
    .filter((t) => t.total >= 1);
  const mastered = themeRows.filter((t) => t.total >= 3 && t.pct >= 0.7);
  const practice = themeRows.filter((t) => t.pct < 0.5);
  const lessonsDone = Object.keys(s.lessons.done).length;
  const lessonsTotal = mods?.reduce((a, m) => a + m.lessons.length, 0) ?? 0;

  const last7 = useMemo(() => {
    const out: { day: string; sec: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = todayKey(d);
      out.push({ day: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), sec: s.studyByDay[k] ?? 0 });
    }
    return out;
  }, [s.studyByDay]);
  const maxDay = Math.max(60, ...last7.map((d) => d.sec));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lance-certo-backup-${todayKey()}.json`;
    a.click();
  };
  const importData = (f: File) => {
    f.text()
      .then((t) => {
        const data = JSON.parse(t);
        if (!data || typeof data !== "object" || data.version !== 1) throw new Error("formato");
        setState(() => hydrate(data));
        toast("Progresso importado", "ok");
      })
      .catch(() => toast("Arquivo de backup inválido", "err"));
  };

  return (
    <div className="page stack-lg">
      <div className="card pad profile-head">
        <UserAvatar name={s.profileName} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div className="row">
              <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label="Seu nome" autoFocus onKeyDown={(e) => e.key === "Enter" && (setState((x) => ({ ...x, profileName: name.trim() || "Jogador" })), setEditing(false))} />
              <button
                className="btn sm primary"
                onClick={() => {
                  setState((x) => ({ ...x, profileName: name.trim() || "Jogador" }));
                  setEditing(false);
                }}
              >
                <Check size={15} />
              </button>
            </div>
          ) : (
            <h1 className="row" style={{ gap: 8 }}>
              {s.profileName}
              <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar nome">
                <Pencil size={16} />
              </button>
            </h1>
          )}
          <p className="small faint">Perfil local: os dados ficam salvos só neste navegador e neste aparelho. Para levar para outro aparelho, use o backup.</p>
        </div>
        <div className="row wrap">
          <button className="btn sm" onClick={exportData}>
            <Download size={15} /> Backup
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Restaurar
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </div>
      </div>

      <div className="kpis">
        <Kpi icon={<Swords size={18} />} label="Partidas" value={g.length} sub={`${wins}V · ${draws}E · ${losses}D`} />
        <Kpi icon={<Trophy size={18} />} label="Taxa de vitória" value={g.length ? `${Math.round((wins / g.length) * 100)}%` : "–"} sub={perf ? `Desempenho estimado vs bots ≈ ${perf}` : "Jogue 5 partidas para estimar"} />
        <Kpi icon={<PuzzleIcon size={18} />} label="Puzzles resolvidos" value={attempts.filter((a) => a.solved).length} sub={attempts.length ? `${Math.round((firstTry / attempts.length) * 100)}% de primeira` : "Nenhum ainda"} />
        <Kpi icon={<PuzzleIcon size={18} />} label="Pontuação de puzzles" value={Math.round(s.puzzles.rating)} sub={`${s.puzzles.points} pontos · recorde de sequência ${s.puzzles.bestStreak}`} />
        <Kpi icon={<Clock size={18} />} label="Tempo de estudo" value={formatDuration(s.studySeconds)} sub="Aprender, puzzles, análise e aberturas" />
        <Kpi icon={<GraduationCap size={18} />} label="Lições concluídas" value={`${lessonsDone}${lessonsTotal ? `/${lessonsTotal}` : ""}`} sub={`${Object.keys(s.lessons.exercises).length} exercícios resolvidos`} />
      </div>

      <div className="note xs faint row" style={{ gap: 6 }}>
        <ShieldAlert size={14} /> O desempenho contra bots e a pontuação de puzzles são estimativas deste aplicativo, calculadas separadamente. Não são ratings oficiais (FIDE, CBX ou de outros sites).
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Evolução da pontuação de puzzles</h3>
          </div>
          <div className="card-body">
            <LineChart values={[1200, ...s.puzzles.ratingHistory.map((h) => h.r)]} label="Pontuação de puzzles" />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Estudo nos últimos 7 dias</h3>
          </div>
          <div className="card-body">
            <div className="bars" role="img" aria-label="Minutos de estudo por dia">
              {last7.map((d, i) => (
                <div key={i} className="bar-col">
                  <div className="bar" style={{ height: `${(d.sec / maxDay) * 100}%` }} title={formatDuration(d.sec)} />
                  <span className="xs faint">{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Partidas por adversário</h3>
          </div>
          <div className="card-body stack">
            {BOTS.map((b) => {
              const bg = g.filter((x) => x.botId === b.id);
              const w = bg.filter((x) => x.outcome === "win").length;
              const d = bg.filter((x) => x.outcome === "draw").length;
              const l = bg.length - w - d;
              return (
                <div key={b.id} className="bot-row">
                  <Avatar piece={b.piece} color={b.color} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row between small">
                      <b>{b.name}</b>
                      <span className="faint xs">{bg.length ? `${w}V ${d}E ${l}D` : "—"}</span>
                    </div>
                    <div className="wdl">
                      {bg.length > 0 && (
                        <>
                          <span className="w" style={{ width: `${(w / bg.length) * 100}%` }} />
                          <span className="d" style={{ width: `${(d / bg.length) * 100}%` }} />
                          <span className="l" style={{ width: `${(l / bg.length) * 100}%` }} />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Temas táticos</h3>
          </div>
          <div className="card-body stack">
            <div>
              <div className="label">Dominados (70%+ em 3 ou mais)</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {mastered.length ? mastered.map((t) => <span key={t.id} className="chip green">{themeLabel(t.id)}</span>) : <span className="small faint">Nenhum ainda.</span>}
              </div>
            </div>
            <div>
              <div className="label">Precisam de prática</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {practice.length ? (
                  practice.map((t) => (
                    <button key={t.id} className="chip red quick" onClick={() => navigate(`/puzzles/tema/${t.id}`)}>
                      {themeLabel(t.id)} · {Math.round(t.pct * 100)}%
                    </button>
                  ))
                ) : (
                  <span className="small faint">Nada por enquanto.</span>
                )}
              </div>
            </div>
            {mods && (
              <div>
                <div className="label">Lições por módulo</div>
                {mods.map((m) => {
                  const d = m.lessons.filter((l) => s.lessons.done[l.id]).length;
                  return (
                    <div key={m.id} className="row small" style={{ gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 110 }}>{m.title}</span>
                      <div className="progress" style={{ flex: 1 }}>
                        <span style={{ width: `${(d / m.lessons.length) * 100}%` }} />
                      </div>
                      <span className="faint xs">
                        {d}/{m.lessons.length}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Partidas recentes</h3>
          <span className="xs faint">clique para revisar</span>
        </div>
        {g.length === 0 ? (
          <div className="empty">
            Nenhuma partida ainda. <a href="#/jogar">Jogar agora</a>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Adversário</th>
                  <th>Cor</th>
                  <th>Resultado</th>
                  <th>Lances</th>
                  <th>Ritmo</th>
                </tr>
              </thead>
              <tbody>
                {g.slice(0, 25).map((x) => (
                  <tr key={x.id} className="click" onClick={() => navigate(`/revisao/${x.id}`)}>
                    <td className="nowrap">{new Date(x.date).toLocaleDateString("pt-BR")}</td>
                    <td>{botById(x.botId).name}</td>
                    <td>{x.playerColor === "w" ? "Brancas" : "Pretas"}</td>
                    <td>
                      <span className={`chip ${x.outcome === "win" ? "green" : x.outcome === "loss" ? "red" : ""}`}>{x.outcome === "win" ? "Vitória" : x.outcome === "loss" ? "Derrota" : "Empate"}</span> <span className="xs faint">{REASON_TEXT[x.reason]}</span>
                    </td>
                    <td className="num">{Math.ceil(x.moves.length / 2)}</td>
                    <td className="xs">{x.timeControl === "none" ? "sem relógio" : x.timeControl.replace("+", " | ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="row xs faint" style={{ gap: 6 }}>
        {icon} {label}
      </div>
      <b className="num">{value}</b>
      {sub && <span className="xs faint">{sub}</span>}
    </div>
  );
}
