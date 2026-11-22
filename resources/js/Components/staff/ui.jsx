import React, { useState } from "react";
import { errorMessage } from "../../config/axiosConfig";

// Admin / Coordinator building blocks, styled by styles/staff.css + theme.css (sclf_APP look).

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
