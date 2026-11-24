import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Radio, ChevronRight } from "lucide-react";
import { liveEntryProgress } from "../../utils/liveProgress";
import { formatHours, formatTime12 } from "../../utils/time";
import { useLiveClock } from "../../hooks/useLiveClock";
import { errorMessage } from "../../config/axiosConfig";
import { Skel } from "./Dashboard";
import { RefreshButton } from "./ui";

/**
 * Live duty board. The server sends today's logged entries (+ host client); which segment is running is worked
 * out here from the Philippine clock, every 15 s, so hours and progress move without a request. A refetch every
 * 15 s (paused while the tab is hidden) picks up days that trainees add or change while this page is open.
 */
export function useLiveBoard(fetcher) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const now = useLiveClock(15000);
  const load = useCallback(() => fetcher().then((d) => { setData(d); setError(""); setUpdatedAt(Date.now()); }).catch((e) => setError(errorMessage(e))), [fetcher]);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 15000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const rows = useMemo(() => (data?.trainees || []).map((t) => {
    const at = new Date(now);
    const prog = t.entries.map((e) => ({ e, p: liveEntryProgress(e, at) }));
    const running = prog.find((x) => x.p.status === "in-progress");
    const status = !t.entries.length ? "none" : running ? "on" : prog.some((x) => x.p.status === "upcoming") ? "soon" : "done";
    const seg = running?.p.segments.find((s) => s.status === "in-progress");
    const sched = prog.reduce((s, x) => s + x.p.scheduledHours, 0);
    const liveH = prog.reduce((s, x) => s + x.p.liveHours, 0);
    const first = (running || prog[0])?.e;
    return { ...t, status, seg, sched, liveH, pct: sched ? Math.min(100, (liveH / sched) * 100) : 0, host: first?.host || t.placement || null, entry: first };
  }), [data, now]);

  const counts = useMemo(() => rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), { on: 0, soon: 0, done: 0, none: 0 }), [rows]);
  return { data, rows, counts, error, updatedAt, reload: load };
}

const LABEL = { on: "On duty now", soon: "Starts later", done: "Finished", none: "No entry today" };
const schedText = (e) => e ? [[e.amIn, e.amOut], [e.pmIn, e.pmOut], [e.evIn, e.evOut]].filter(([a, b]) => a && b).map(([a, b]) => `${formatTime12(a)} – ${formatTime12(b)}`).join(" · ") || "—" : "—";

export const LiveBadge = ({ updatedAt, error }) => (
  <span className={`st-live ${error ? "is-error" : ""}`} role="status"><i />{error ? "Reconnecting…" : "Live"}{updatedAt && !error && <small>updated {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>}</span>
);

function Row({ r }) {
  return (
    <tr className={`st-live-row is-${r.status}`}>
      <td><b>{r.name}</b><div className="st-sub">{r.student_id}{r.section ? ` · ${r.section}` : ""}</div></td>
      <td>{r.host || <span className="st-sub">No host yet</span>}</td>
      <td>{schedText(r.entry)}{r.entry?.category && r.entry.category !== "regular" && <div className="st-sub">{r.entry.category}</div>}</td>
      <td><span className={`st-live-chip is-${r.status}`}>{r.status === "on" && <i />}{LABEL[r.status]}</span>{r.seg && <div className="st-sub">{r.seg.label} until {formatTime12(r.seg.key === "am" ? r.entry.amOut : r.seg.key === "pm" ? r.entry.pmOut : r.entry.evOut)}</div>}</td>
      <td className="st-live-prog">{r.status === "none" ? <span className="st-sub">—</span> : (
        <><div className="st-live-bar" role="progressbar" aria-valuenow={Math.round(r.pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${r.pct}%` }} /></div>
          <div className="st-sub">{formatHours(r.liveH)} of {formatHours(r.sched)}</div></>
      )}</td>
    </tr>
  );
}

const FILTERS = [["all", "Everyone"], ["on", "On duty"], ["soon", "Starts later"], ["done", "Finished"], ["none", "No entry"]];

/** Full board (its own sidebar tab). */
export function LiveDutyPanel({ fetcher }) {
  const { data, rows, counts, error, updatedAt, reload } = useLiveBoard(fetcher);
  const [f, setF] = useState("all");
  const shown = rows.filter((r) => f === "all" || r.status === f).sort((a, b) => ["on", "soon", "done", "none"].indexOf(a.status) - ["on", "soon", "done", "none"].indexOf(b.status));
  return (
    <section className="st-card">
      <div className="st-card-head">
        <h2>Duty today{data ? ` · ${data.date}` : ""}</h2>
        <div className="st-card-actions"><LiveBadge updatedAt={updatedAt} error={error} /><RefreshButton onRefresh={reload} /></div>
      </div>
      {error && <p role="alert" className="st-error">{error}</p>}
      <div className="st-live-tiles">
        {[["on", "On duty now"], ["soon", "Starts later"], ["done", "Finished"], ["none", "No entry today"]].map(([k, l]) => (
          <button key={k} type="button" className={`st-live-tile is-${k} ${f === k ? "is-active" : ""}`} onClick={() => setF(f === k ? "all" : k)}>
            <b>{data ? counts[k] : <Skel w={28} h={22} />}</b><span>{l}</span>
          </button>
        ))}
      </div>
      <div className="st-tabs st-tabs-tight" role="tablist">
        {FILTERS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={f === k} className={`st-tab${f === k ? " is-active" : ""}`} onClick={() => setF(k)}>{l}</button>)}
      </div>
      {!data && !error ? <div className="st-stack">{[0, 1, 2, 3].map((i) => <Skel key={i} w="100%" h={46} r={12} />)}</div>
        : !shown.length ? <p className="st-empty">{rows.length ? "Nobody matches this filter." : "No trainees to show yet."}</p> : (
          <div className="st-table-wrap">
            <table className="st-table st-live-table">
              <thead><tr><th>Trainee</th><th>Host client</th><th>Today’s schedule</th><th>Status</th><th>Progress today</th></tr></thead>
              <tbody>{shown.map((r) => <Row key={r.user_id} r={r} />)}</tbody>
            </table>
          </div>
        )}
      <p className="st-muted st-note">Times follow Philippine time. A trainee shows here once their day is saved on the server (it syncs a few seconds after they add it).</p>
    </section>
  );
}

/** Compact card for the Overview: who is on duty right now + counts, link to the full board. */
export function LiveDutyCard({ fetcher, onOpen }) {
  const { data, rows, counts, error, updatedAt, reload } = useLiveBoard(fetcher);
  const on = rows.filter((r) => r.status === "on").slice(0, 6);
  return (
    <section className="st-card st-chart st-live-card">
      <div className="st-chart-head">
        <span className="st-chart-icon"><Radio size={16} strokeWidth={2.2} /></span>
        <div><h2>On duty right now</h2><p>Trainees whose logged hours are running at this moment</p></div>
        <div className="st-chart-tools">
          <LiveBadge updatedAt={updatedAt} error={error} /><RefreshButton onRefresh={reload} />
          {onOpen && <button type="button" className="btn st-btn" onClick={onOpen}>Open board <ChevronRight size={14} /></button>}
        </div>
      </div>
      {!data && !error ? <Skel w="100%" h={90} r={14} /> : (
        <>
          <div className="st-live-mini">
            <span className="is-on"><b>{counts.on}</b>on duty</span><span className="is-soon"><b>{counts.soon}</b>starts later</span>
            <span className="is-done"><b>{counts.done}</b>finished</span><span className="is-none"><b>{counts.none}</b>no entry today</span>
          </div>
          {on.length ? (
            <ul className="st-live-list">
              {on.map((r) => (
                <li key={r.user_id}>
                  <div><b>{r.name}</b><div className="st-sub">{r.host || "No host yet"} · {r.seg?.label}</div></div>
                  <div className="st-live-prog"><div className="st-live-bar"><i style={{ width: `${r.pct}%` }} /></div><div className="st-sub">{formatHours(r.liveH)} of {formatHours(r.sched)}</div></div>
                </li>
              ))}
            </ul>
          ) : <p className="st-empty st-empty-flush">Nobody is on duty at the moment.</p>}
        </>
      )}
    </section>
  );
}
