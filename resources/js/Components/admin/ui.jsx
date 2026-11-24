import React, { useEffect, useState } from "react";
import { LayoutList, Table2 } from "lucide-react";
import { errorMessage } from "../../config/axiosConfig";
import { useMediaQuery } from "../../hooks/useIsPhone";
import { TableSkeleton } from "./Dashboard";

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

/** Cards / Table switch (same pill as sclf_APP's ViewToggle). */
export function ViewToggle({ mode, onChange }) {
  return (
    <div className="st-view-toggle" role="group" aria-label="Switch between cards and table view">
      <button type="button" className={`st-view-btn${mode === "cards" ? " is-active" : ""}`} aria-pressed={mode === "cards"} onClick={() => onChange("cards")}><LayoutList size={14} /> Cards</button>
      <button type="button" className={`st-view-btn${mode === "table" ? " is-active" : ""}`} aria-pressed={mode === "table"} onClick={() => onChange("table")}><Table2 size={14} /> Table</button>
    </div>
  );
}

/** Remembers whether a list shows "cards" or "table" (per list, per browser). */
function useViewMode(key, fallback = "table") {
  const storageKey = `occ.viewMode.${key}`;
  const [mode, setMode] = useState(() => { try { const v = window.localStorage.getItem(storageKey); return v === "cards" || v === "table" ? v : fallback; } catch { return fallback; } });
  useEffect(() => { try { window.localStorage.setItem(storageKey, mode); } catch { /* storage can be blocked */ } }, [mode, storageKey]);
  return [mode, setMode];
}

/** A stat row: 2 up on phones, auto-fit on desktop (sclf_APP's .ds-stat-grid). */
export const StatGrid = ({ children }) => <div className="st-stat-grid">{children}</div>;

export function Table({ cols, rows, empty = "Nothing here yet.", toggle = true }) {
  const [saved, setView] = useViewMode(cols.map((c) => c.h).join("|").slice(0, 80));
  const phone = useMediaQuery("(max-width: 600px)");
  // rows == null means "still loading" (every screen starts with null/undefined), so show the skeleton, not "nothing here".
  if (rows == null) return <TableSkeleton cols={cols.length} />;
  if (!rows.length) return <p className="st-empty">{empty}</p>;
  // Phones always get the stacked-card table, so the switch only exists on larger screens.
  const view = phone || !toggle ? "table" : saved;
  const actionCol = cols.length > 1 && !cols[cols.length - 1].h ? cols[cols.length - 1] : null;
  const shown = actionCol ? cols.slice(0, -1) : cols;
  const [first, ...rest] = shown;
  return (
    <div className="st-data" data-view={view}>
      {toggle && !phone && (
        <div className="st-list-head-row"><ViewToggle mode={saved} onChange={setView} /></div>
      )}
      {view === "cards" ? (
        <ul className="st-list">
          {rows.map((r, i) => (
            <li key={r.id ?? i} className="st-list-item">
              <div className="st-list-main">
                <p className="st-list-title">{first.render(r)}</p>
                <div className="st-list-meta">{rest.map((c) => <span key={c.h}><i>{c.h}</i>{c.render(r)}</span>)}</div>
              </div>
              {actionCol && <div className="st-list-side">{actionCol.render(r)}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="st-table-wrap">
          <table className="st-table">
            <thead><tr>{cols.map((c, i) => <th key={c.h || i}>{c.h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.id ?? i}>{cols.map((c, j) => <td key={c.h || j} data-label={c.h}>{c.render(r)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
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
