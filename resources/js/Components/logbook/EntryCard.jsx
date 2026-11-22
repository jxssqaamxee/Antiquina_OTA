import React from "react";
import { Sun, Sunset, Moon, Users, Pencil, Trash2, Send, Lock } from "lucide-react";
import { formatHours, formatTime12, weekdayOf } from "../../utils/time";
import { completionFor } from "../../utils/dutyStatus";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const CATEGORY_LABEL = { regular: "Regular", evening: "Evening", overtime: "Overtime" };
const CATEGORY_BADGE = { regular: "", evening: "ev", overtime: "warn" };

const SEGMENTS = [
  { key: "am", label: "Morning", Icon: Sun, a: "amIn", b: "amOut" },
  { key: "pm", label: "Afternoon", Icon: Sunset, a: "pmIn", b: "pmOut" },
  { key: "ev", label: "Evening", Icon: Moon, a: "evIn", b: "evOut" },
];

export function DateTile({ date }) {
  const [, m, d] = String(date).split("-");
  const wd = WEEK[(weekdayOf(date) || 1) - 1];
  return (
    <span className="date-tile" aria-hidden="true">
      <small>{MONTHS[Number(m) - 1] || ""}</small>
      <b>{Number(d)}</b>
      <i>{wd}</i>
    </span>
  );
}

// One duty day as a card: date tile · client · shift type, one row per
// Morning / Afternoon / Evening segment, live hours + status, and (on the
// Logbook tab) Edit / Delete.
// Review state comes from the server (`status` is absent on drafts). Submitted and approved entries are locked.
export function reviewBadge(e) {
  if (e.status === "submitted") return <span className="badge warn"><Lock size={11} /> Pending review</span>;
  if (e.status === "approved") return <span className="badge ok"><Lock size={11} /> Approved{typeof e.verifiedHours === "number" && e.verifiedHours !== e.hours ? ` · ${formatHours(e.verifiedHours)} verified` : ""}</span>;
  if (e.status === "rejected") return <span className="badge bad">Returned</span>;
  return null;
}

export default function EntryCard({ entry: e, clientName, progress, onEdit, onDelete, onSubmit, editing = false, dateLabel }) {
  const locked = e.status === "submitted" || e.status === "approved";
  const canSubmit = !!onSubmit && !locked && (!progress || progress.status === "done" || progress.status === "complete") && Number(e.hours) > 0;
  let status = null;
  let hours = e.hours;
  let livePct = null;

  if (progress && progress.status === "upcoming") {
    hours = 0;
    status = <span className="badge mute">Scheduled</span>;
  } else if (progress && progress.status === "in-progress") {
    hours = progress.liveHours;
    livePct = progress.scheduledHours > 0 ? Math.min((progress.liveHours / progress.scheduledHours) * 100, 100) : 0;
    status = <span className="badge warn"><span className="live-dot" /> In progress</span>;
  } else {
    const c = completionFor(e);
    status = c.met
      ? <span className="badge ok">Complete</span>
      : <span className="badge bad" title={`Short ${formatHours(Math.abs(c.delta))} of the expected ${formatHours(c.expected)}`}>−{formatHours(Math.abs(c.delta))}</span>;
  }

  const segs = SEGMENTS.filter((s) => e[s.a] && e[s.b]);

  return (
    <article className={`entry${editing ? " is-editing" : ""}`}>
      <div className="entry-top">
        <DateTile date={e.date} />
        <div className="entry-main">
          <h3>{dateLabel}</h3>
          <p><Users size={13} /> <span>{clientName}</span></p>
        </div>
        <span className={`badge ${CATEGORY_BADGE[e.category] || ""}`}>{CATEGORY_LABEL[e.category] || "Regular"}</span>
      </div>

      <ul className="entry-segs">
        {segs.map(({ key, label, Icon, a, b }) => (
          <li key={key} className={`seg-${key}`}>
            <span className="seg-ico"><Icon size={15} /></span>
            <span className="seg-name">{label}</span>
            <span className="seg-range">{formatTime12(e[a])} – {formatTime12(e[b])}</span>
          </li>
        ))}
      </ul>

      <div className="entry-hours">
        <div>
          <small>Hours</small>
          <b>{formatHours(hours)}</b>
        </div>
        {status}
      </div>
      {livePct !== null && (
        <div className="bar-track entry-live" aria-hidden="true"><div className="bar-fill" style={{ width: `${livePct}%` }} /></div>
      )}

      {e.task && <p className="entry-task">“{e.task}”</p>}
      {reviewBadge(e) && <div className="entry-review">{reviewBadge(e)}</div>}
      {e.status === "rejected" && e.reviewReason && <p className="entry-task" role="note">Coordinator: “{e.reviewReason}”</p>}

      {canSubmit && (
        <div className="entry-actions" style={{ gridTemplateColumns: "1fr" }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onSubmit(e.id)}><Send size={14} /> {e.status === "rejected" ? "Resubmit for review" : "Submit for review"}</button>
        </div>
      )}

      {!locked && (onEdit || onDelete) && (
        <div className="entry-actions">
          {onEdit && <button type="button" className="btn btn-sm" onClick={() => onEdit(e)}><Pencil size={14} /> Edit</button>}
          {onDelete && <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(e.id)}><Trash2 size={14} /> Delete</button>}
        </div>
      )}
    </article>
  );
}
