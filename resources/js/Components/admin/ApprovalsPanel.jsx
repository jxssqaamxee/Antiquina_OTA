import React, { useState } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { Btn, Card, Chip, Input, Notice, RefreshButton, Table, useAction } from "./ui";
import { StatCard } from "./AdminShell";
import { TableSkeleton } from "./Dashboard";
import useLoad from "../../hooks/useLoad";
import { usePopup } from "../../context/PopupContext";

const num = (v) => Number(v) || 0;
const hrs = (v) => String(Math.round(num(v) * 100) / 100);
const day = (d) => { const x = new Date(`${d}T00:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); };
const shortDay = (d) => { const x = new Date(String(d).slice(0, 10) + "T00:00:00"); return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString([], { month: "short", day: "numeric" }); };
export const times = (e) => [[e.am_in, e.am_out], [e.pm_in, e.pm_out], [e.ev_in, e.ev_out]].filter(([i, o]) => i && o).map(([i, o]) => `${i}–${o}`).join(", ");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const CHUNK = 100; // the server takes at most 100 entries per request

/**
 * The entries of ONE trainee that wait for a decision. Tick days and approve / return them together, approve the
 * whole list, or decide a single day (with optional lower verified hours). Used by Logbook approvals and by the trainee page.
 */
export function PendingEntries({ entries, svc, name, onChanged }) {
  const [picked, setPicked] = useState([]);
  const [hours, setHours] = useState({});
  const { busy, msg, run, setMsg } = useAction();
  const popup = usePopup();
  const live = new Set(entries.map((e) => e.id));
  const sel = picked.filter((id) => live.has(id));
  const target = sel.length ? entries.filter((e) => sel.includes(e.id)) : entries;
  const targetHours = target.reduce((t, e) => t + num(e.hours), 0);
  const toggle = (id) => setPicked(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  const finish = async (r, verb) => {
    if (!r) return;
    setPicked([]);
    setMsg({ text: r.skipped ? `${plural(r.done, "entry", "entries")} ${verb}. ${plural(r.skipped, "entry was", "entries were")} already handled.` : `${plural(r.done, "entry", "entries")} ${verb}.` });
    await onChanged();
  };
  const batch = async (action, reason) => {
    const out = { done: 0, skipped: 0 };
    for (let i = 0; i < target.length; i += CHUNK) {
      const r = await svc.reviewBatch(action, target.slice(i, i + CHUNK).map((e) => e.id), reason);
      out.done += r.done; out.skipped += r.skipped;
    }
    return out;
  };

  const approveMany = async () => {
    const n = target.length;
    const ok = await popup.confirm({
      title: sel.length ? `Approve ${plural(n, "selected entry", "selected entries")}?` : `Approve all ${n} ${n === 1 ? "entry" : "entries"}?`,
      message: `${name}: ${hrs(targetHours)} h will be verified at the hours the trainee logged. Every approval is written to the audit log and ${name} gets one notice.`,
      okLabel: `Approve ${n}`,
    });
    if (ok) finish(await run(() => batch("approve")), "approved");
  };
  const returnMany = async () => {
    const reason = await popup.prompt({
      title: `Return ${plural(target.length, "entry", "entries")}?`,
      message: `${name} will see this reason on every returned day and can fix and resubmit.`,
      placeholder: "e.g. Time-out doesn't match the attendance sheet",
      okLabel: "Return", required: true, minLength: 3, danger: true,
    });
    if (reason) finish(await run(() => batch("reject", reason)), "returned");
  };
  const approveOne = async (e) => {
    const v = hours[e.id];
    if (v !== undefined && v !== "" && (num(v) < 0 || num(v) > num(e.hours))) { setMsg({ bad: true, text: `Verified hours must be between 0 and ${hrs(e.hours)}.` }); return; }
    if (await run(() => svc.approve(e.id, v), `${day(e.date)} approved.`)) onChanged();
  };
  const rejectOne = async (e) => {
    const reason = await popup.prompt({ title: `Return ${day(e.date)}?`, message: "Tell the trainee why. They will see this reason.", placeholder: "e.g. Time-out doesn't match the attendance sheet", okLabel: "Return entry", required: true, minLength: 3, danger: true });
    if (reason && await run(() => svc.reject(e.id, reason), `${day(e.date)} returned.`)) onChanged();
  };

  return (
    <div className="rv">
      <Notice msg={msg} />
      <div className="rv-bar">
        <label className="st-check">
          <input type="checkbox" checked={sel.length === entries.length} ref={(el) => { if (el) el.indeterminate = sel.length > 0 && sel.length < entries.length; }}
            onChange={() => setPicked(sel.length === entries.length ? [] : entries.map((e) => e.id))} />
          {sel.length ? `${sel.length} of ${entries.length} selected` : `Select all ${entries.length}`}
        </label>
        <div className="rv-bar-actions">
          {sel.length > 0 && <Btn kind="danger" disabled={busy} onClick={returnMany}><Undo2 size={14} /> Return selected</Btn>}
          <Btn kind="primary" disabled={busy} onClick={approveMany}>
            <CheckCheck size={14} /> {sel.length ? `Approve selected (${sel.length})` : `Approve all (${entries.length})`} · {hrs(targetHours)} h
          </Btn>
        </div>
      </div>
      <ul className="st-list">
        {entries.map((e) => (
          <li key={e.id} className={`st-list-item rv-item${sel.includes(e.id) ? " is-picked" : ""}`}>
            <input type="checkbox" className="rv-pick" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${day(e.date)}`} />
            <div className="st-list-main">
              <p className="st-list-title">{day(e.date)} <span className="rv-hrs">{hrs(e.hours)} h</span></p>
              <div className="st-list-meta"><span><i>Time</i>{times(e) || "—"}</span><span><i>Task</i>{e.task || "—"}</span></div>
            </div>
            <div className="st-list-side rv-side">
              <Input className="st-w-xs" type="number" step="0.25" min="0" max={e.hours} placeholder={`hrs (${hrs(e.hours)})`} aria-label={`Verified hours for ${day(e.date)}`}
                value={hours[e.id] ?? ""} onChange={(ev) => setHours({ ...hours, [e.id]: ev.target.value })} />
              <Btn kind="primary" disabled={busy} onClick={() => approveOne(e)}>Approve</Btn>
              <Btn kind="danger" disabled={busy} onClick={() => rejectOne(e)}>Return</Btn>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Loads one trainee's entries and shows hours + the entries waiting for review. */
function TraineeQueue({ trainee, svc, onBack }) {
  const [data, reload, error, m] = useLoad(() => svc.traineeEntries(trainee.id), { interval: 20000, deps: [trainee.id] });
  const pending = data?.entries?.filter((e) => e.status === "submitted");
  const h = data?.hours;
  return (
    <Card title={`${trainee.name} · ${trainee.student_id}`} actions={<><RefreshButton onRefresh={reload} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} /><Btn onClick={onBack}>Back to all trainees</Btn></>}>
      {error && !data && <p role="alert" className="st-error">{error}</p>}
      {h && (
        <div className="st-stat-grid">
          <StatCard label="Waiting" value={pending ? pending.length : h.pending} /><StatCard label="Verified" value={h.verified} />
          <StatCard label="Required" value={h.required} /><StatCard label="Draft / returned" value={h.draft} />
        </div>
      )}
      {!pending ? <TableSkeleton cols={3} /> : pending.length
        ? <PendingEntries entries={pending} svc={svc} name={trainee.name} onChanged={reload} />
        : <p className="st-empty">{trainee.name} has nothing waiting. <button type="button" className="st-linkbtn" onClick={onBack}>Back to all trainees</button></p>}
    </Card>
  );
}

/** Logbook approvals: an inbox of trainees with entries waiting; open one to decide per entry or all at once. */
export function ApprovalsPanel({ svc }) {
  const [data, reload, error, m] = useLoad(() => svc.approvalSummary(), { interval: 20000 });
  const [open, setOpen] = useState(null);
  if (open) return <TraineeQueue trainee={open} svc={svc} onBack={() => { setOpen(null); reload(); }} />;
  const title = data ? `Waiting for review (${data.total_entries} from ${plural(data.trainees.length, "trainee", "trainees")})` : "Waiting for review";
  return (
    <Card title={title} actions={<RefreshButton onRefresh={reload} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />}>
      {error && !data && <p role="alert" className="st-error">{error}</p>}
      {m.stale && <p className="st-stale" role="status">Couldn’t refresh just now. Showing the last data we loaded.</p>}
      <Table empty="Nothing is waiting for review." rows={data?.trainees} cols={[
        { h: "Trainee", render: (t) => <><b>{t.name}</b> <span className="st-muted">{t.student_id}</span></> },
        { h: "Entries", render: (t) => <Chip tone="warn">{t.pending}</Chip> },
        { h: "Hours", render: (t) => hrs(t.pending_hours) },
        { h: "Waiting since", render: (t) => shortDay(t.oldest) },
        { h: "", render: (t) => <Btn kind="primary" onClick={() => setOpen(t)}>Review</Btn> },
      ]} />
    </Card>
  );
}
