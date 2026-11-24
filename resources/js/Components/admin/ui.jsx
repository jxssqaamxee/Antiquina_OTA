import React, { useEffect, useState } from "react";
import { LayoutList, Table2, RefreshCw, Search, X } from "lucide-react";
import { errorMessage } from "../../config/axiosConfig";
import { useMediaQuery } from "../../hooks/useIsPhone";
import { TableSkeleton } from "./Dashboard";
import { useToast } from "../../context/ToastContext";

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
export const Field = ({ label, children, className = "" }) => (
  <label className={`st-field ${className}`.trim()}><span>{label}</span>{children}</label>
);
export const Row = ({ children }) => <div className="st-flex">{children}</div>;
export const Check = ({ children, ...p }) => <label className="st-check"><input type="checkbox" {...p} />{children}</label>;

/** "Refresh" button for a list / panel (same job as sclf_APP's RefreshButton). `onRefresh` may return a promise: the icon spins until it settles. */
export function RefreshButton({ onRefresh, loading = false, updatedAt, label = "Refresh" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const spinning = busy || loading;
  const click = async () => {
    if (spinning || !onRefresh) return;
    setBusy(true);
    try {
      await onRefresh();
      toast.success("Showing the latest data.", { title: "Refreshed", key: "admin-refreshed" });
    } catch { /* the panel shows its own error */ }
    finally { setBusy(false); }
  };
  return (
    <>
      {updatedAt && !spinning && <small className="st-updated" title="Data refreshes by itself while this page is open">Updated {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>}
      <button type="button" className="btn st-btn st-refresh" onClick={click} disabled={spinning} aria-label={label} title="Load the latest data now">
        <RefreshCw size={15} className={spinning ? "st-spin" : ""} /> <span>{spinning ? "Refreshing…" : label}</span>
      </button>
    </>
  );
}

/** Search box with a clear button. */
export function SearchBox({ value, onChange, placeholder = "Search…", label = "Search", className = "" }) {
  return (
    <div className={`st-search ${className}`.trim()} role="search">
      <Search size={15} aria-hidden="true" />
      <input type="search" className="st-inp" value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" className="st-search-clear" aria-label="Clear search" onClick={() => onChange("")}><X size={14} /></button>}
    </div>
  );
}

// Everything readable in a row (names, ids, emails, nested course/section...) joined into one lowercase string.
const haystack = (v, depth = 0) => {
  if (v == null || depth > 3) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => haystack(x, depth + 1)).join(" ");
  if (typeof v === "object") return Object.values(v).map((x) => haystack(x, depth + 1)).join(" ");
  return "";
};
export const matchesSearch = (row, q) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(row).toLowerCase();
  return words.every((w) => hay.includes(w));
};

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

export function Table({ cols, rows: allRows, empty = "Nothing here yet.", toggle = true, searchable = true }) {
  const [saved, setView] = useViewMode(cols.map((c) => c.h).join("|").slice(0, 80));
  const [q, setQ] = useState("");
  const rows = allRows == null ? allRows : q ? allRows.filter((r) => matchesSearch(r, q)) : allRows;
  // The search box appears once a list is long enough to need it (or while a search is active).
  const showSearch = searchable && allRows != null && (allRows.length >= 5 || !!q);
  const phone = useMediaQuery("(max-width: 600px)");
  // rows == null means "still loading" (every screen starts with null/undefined), so show the skeleton, not "nothing here".
  if (rows == null) return <TableSkeleton cols={cols.length} />;
  if (!allRows.length) return <p className="st-empty">{empty}</p>;
  // Phones always get the stacked-card table, so the switch only exists on larger screens.
  const view = phone || !toggle ? "table" : saved;
  const actionCol = cols.length > 1 && !cols[cols.length - 1].h ? cols[cols.length - 1] : null;
  const shown = actionCol ? cols.slice(0, -1) : cols;
  const [first, ...rest] = shown;
  return (
    <div className="st-data" data-view={view}>
      {(showSearch || (toggle && !phone)) && (
        <div className="st-list-head-row">
          {showSearch ? <SearchBox value={q} onChange={setQ} placeholder="Search this list…" /> : <span />}
          {toggle && !phone && <ViewToggle mode={saved} onChange={setView} />}
        </div>
      )}
      {showSearch && q && <p className="st-muted st-search-count" role="status">{rows.length} of {allRows.length} match “{q}”</p>}
      {!rows.length ? <p className="st-empty">No results for “{q}”. <button type="button" className="st-linkbtn" onClick={() => setQ("")}>Clear search</button></p> : view === "cards" ? (
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

/**
 * Result of a screen's last action ({ text, bad }). It no longer draws an inline strip:
 * it raises the same toast the trainee screens use, so every role gets one consistent look.
 * The key includes the text, so the same message twice in a row still shows again (instead of
 * being de-duplicated) while an identical toast already on screen is replaced, not stacked.
 */
export function Notice({ msg }) {
  const toast = useToast();
  useEffect(() => {
    if (!msg?.text) return;
    const type = ["success", "error", "warning", "info"].includes(msg.type) ? msg.type : msg.bad ? "error" : "success";
    toast[type](msg.text, { key: `notice:${type}:${msg.text}` });
  }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

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
