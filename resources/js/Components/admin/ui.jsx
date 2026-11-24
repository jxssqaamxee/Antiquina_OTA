import React, { useState } from "react";
import { errorMessage } from "../../config/axiosConfig";

// Admin / Coordinator building blocks, styled by styles/admin.css + theme.css (sclf_APP look).

export const Card = ({ title, children, actions }) => (
  <section className="st-card">
    {(title || actions) && (
      <div className="st-card-head">
        <h2>{title}</h2>
        <div className="st-card-actions">{actions}</div>
      </div>
    )}
    {children}
  </section>
);

export function Btn({ kind, className = "", ...p }) {
  const k = kind === "danger" ? " btn-danger" : kind === "primary" ? " btn-primary" : "";
  return <button type="button" {...p} className={`btn st-btn${k} ${className}`.trim()} />;
}

export const Input = ({ className = "", ...p }) => <input {...p} className={`st-inp ${className}`.trim()} />;
export const Textarea = ({ className = "", ...p }) => <textarea {...p} className={`st-inp ${className}`.trim()} />;
export const Select = ({ children, className = "", ...p }) => <select {...p} className={`st-inp ${className}`.trim()}>{children}</select>;
export const Field = ({ label, children }) => (
  <label className="st-field"><span>{label}</span>{children}</label>
);
export const Row = ({ children }) => <div className="st-flex">{children}</div>;
export const Check = ({ children, ...p }) => <label className="st-check"><input type="checkbox" {...p} />{children}</label>;

export function Table({ cols, rows, empty = "Nothing here yet." }) {
  if (!rows?.length) return <p className="st-empty">{empty}</p>;
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead><tr>{cols.map((c) => <th key={c.h}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id ?? i}>{cols.map((c) => <td key={c.h}>{c.render(r)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <nav className="st-tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k}
          className={`st-tab${value === k ? " is-active" : ""}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </nav>
  );
}

export const Chip = ({ children, tone }) => <span className={`st-chip${tone ? ` is-${tone}` : ""}`}>{children}</span>;
export const statusTone = (s) => ({ approved: "good", rejected: "bad", submitted: "warn", active: "good", pending_placement: "warn" }[s]);

/** Small status line for a screen's last action. */
export const Notice = ({ msg }) => !msg ? null : <p role={msg.bad ? "alert" : "status"} className={`st-notice${msg.bad ? " is-bad" : ""}`}>{msg.text}</p>;

/** Runs an async action, tracks busy + a result message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); if (okText) setMsg({ text: okText }); return r; }
    catch (e) { setMsg({ bad: true, text: errorMessage(e) }); return undefined; }
    finally { setBusy(false); }
  };
  return { busy, msg, run, setMsg };
}

/** KPI tiles for the Overview pages. `k` is the `kpis` object from /api/{admin|coordinator}/overview. */
export function KpiGrid({ k, scope = "admin" }) {
  if (!k) return null;
  const pct = Math.max(0, Math.min(100, Number(k.avg_percent) || 0));
  const tiles = [
    { label: "Trainees", value: k.trainees, hint: `${k.completed} completed OJT` },
    { label: "Verified hours", value: k.verified_hours, hint: `of ${k.required_hours} required` },
    { label: "Awaiting review", value: k.awaiting_review, hint: "entries submitted", tone: k.awaiting_review ? "warn" : "" },
    { label: "Rejected entries", value: k.rejected_entries, hint: "need trainee correction", tone: k.rejected_entries ? "bad" : "" },
    { label: "Placed in host", value: k.placed, hint: `${k.unplaced} not placed yet`, tone: k.unplaced ? "warn" : "" },
    { label: "No verified hours", value: k.not_started, hint: "not started yet", tone: k.not_started ? "warn" : "" },
  ];
  if (scope === "admin") {
    tiles.push(
      { label: "Unassigned students", value: k.unassigned, hint: "no section yet", tone: k.unassigned ? "warn" : "" },
      { label: "Idle coordinators", value: k.coordinators_unassigned, hint: "no section assigned", tone: k.coordinators_unassigned ? "warn" : "" },
    );
  }
  return (
    <>
      <div className="st-kpi-progress" role="group" aria-label="Average OJT completion">
        <div className="st-kpi-progress-top"><b>{pct}%</b><span>Average OJT completion</span></div>
        <div className="st-kpi-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="st-kpi-grid">
        {tiles.map((t) => (
          <div key={t.label} className={`st-stat st-kpi ${t.tone ? `is-${t.tone}` : ""}`}>
            <b>{t.value ?? "—"}</b><span>{t.label}</span><small>{t.hint}</small>
          </div>
        ))}
      </div>
    </>
  );
}
