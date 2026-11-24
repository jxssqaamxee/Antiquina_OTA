import React, { useMemo, useState } from "react";
import { Search, ArrowUpDown, Send } from "lucide-react";
import EntryCard from "../../Components/logbook/EntryCard";
import logo from "../../assets/images/site-logo.png";
import Tooltip from "../../Components/shared/Tooltip";
import {
  formatHours,
  formatDateLong,
  todayStr,
  startOfWeek,
  formatWeekRange,
  monthKey,
  formatMonthLabel,
} from "../../utils/time";

// A dedicated home for every entry from an earlier calendar day — the
// Logbook tab keeps today's (and any future-dated) rows, even once
// they're fully clocked out, so a trainee can still catch and fix a
// mistake right after finishing a shift. An entry only lands here once
// its date is no longer today — e.g. an entry dated July 28 moves here
// starting July 29, regardless of what time it was finished. By the time
// an entry's date is in the past, its segments have necessarily all
// elapsed, so its stored `hours` is already the final, settled value —
// no need to re-derive live status here the way LogbookPage does for
// today's still-moving entries.
const REVIEW_FILTERS = [
  { id: "any", label: "Any status" },
  { id: "todo", label: "To submit" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "returned", label: "Returned" },
];
const reviewKey = (e) => (e.status === "submitted" ? "pending" : e.status === "approved" ? "approved" : e.status === "rejected" ? "returned" : "todo");

export default function EntryHistoryPanel({ entries, clients, now = new Date(), scopedName = null, onSubmit = null, onSubmitAll = null }) {
  const [filterMode, setFilterMode] = useState("all"); // all | day | week | month
  const [filterDay, setFilterDay] = useState(() => todayStr(now));
  const [filterWeek, setFilterWeek] = useState(() => todayStr(now));
  const [filterMonth, setFilterMonth] = useState(() => monthKey(todayStr(now)));
  const [sortOrder, setSortOrder] = useState("desc"); // desc = newest on top, asc = oldest (Day 1) on top
  const [reviewFilter, setReviewFilter] = useState("any"); // any | todo | pending | approved | returned
  const [busy, setBusy] = useState(false);

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "Unassigned";

  const completed = useMemo(() => {
    const today = todayStr(now);
    return entries.filter((e) => e.date < today);
  }, [entries, now]);

  const filtered = useMemo(() => {
    let list = completed;
    if (filterMode === "day") {
      list = list.filter((e) => e.date === filterDay);
    } else if (filterMode === "week") {
      const wk = startOfWeek(filterWeek);
      list = list.filter((e) => startOfWeek(e.date) === wk);
    } else if (filterMode === "month") {
      list = list.filter((e) => monthKey(e.date) === filterMonth);
    }
    if (reviewFilter !== "any") list = list.filter((e) => reviewKey(e) === reviewFilter);
    return list
      .slice()
      .sort((a, b) => (sortOrder === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
  }, [completed, filterMode, filterDay, filterWeek, filterMonth, sortOrder, reviewFilter]);

  const counts = useMemo(() => {
    const c = { todo: 0, pending: 0, approved: 0, returned: 0 };
    for (const e of completed) c[reviewKey(e)] += 1;
    return c;
  }, [completed]);
  // Finished days that are still drafts (or returned) and have hours: these are what the coordinator is waiting for.
  const submittable = useMemo(() => completed.filter((e) => ["todo", "returned"].includes(reviewKey(e)) && Number(e.hours) > 0), [completed]);

  async function submitAll() {
    if (!onSubmitAll || busy) return;
    setBusy(true);
    try { await onSubmitAll(submittable.map((e) => e.id)); } finally { setBusy(false); }
  }

  const hostsInList = useMemo(() => {
    const counts = new Map();
    for (const e of completed) { const n = clientName(e.client); counts.set(n, (counts.get(n) || 0) + 1); }
    return [...counts.entries()].map(([n, c]) => `${n} (${c})`);
  }, [completed, clients]);

  const totalHoursShown = Math.round(filtered.reduce((s, e) => s + (e.hours || 0), 0) * 100) / 100;
  const weekLabel = formatWeekRange(startOfWeek(filterWeek));
  const monthLabel = formatMonthLabel(filterMonth);

  const modes = [
    { id: "all", label: "All" },
    { id: "day", label: "By day" },
    { id: "week", label: "By week" },
    { id: "month", label: "By month" },
  ];

  return (
    <div className="history">
      <section className="hero" style={{ "--hero-logo": `url("${logo}")` }} aria-label="Completed entries">
        <div className="hero-top">
          <div className="hero-who">
            <small>Completed entries</small>
            <b>{filtered.length} {filtered.length === 1 ? "day" : "days"}</b>
          </div>
        </div>
        <div className="hero-foot" style={{ marginTop: 12 }}>
          <b>{formatHours(totalHoursShown)} logged</b>
          {scopedName ? `Showing only ${scopedName}.` : "Finished shifts land here automatically once their day is over."}
        </div>
      </section>

      {!scopedName && hostsInList.length > 1 && (
        <p className="fld-hint" style={{ margin: "0 0 8px" }}>All host clients: {hostsInList.join(" · ")}. Each card shows its host client.</p>
      )}
      {onSubmit && submittable.length > 0 && (
        <div className="submit-banner" role="status">
          <div>
            <b>{submittable.length} finished {submittable.length === 1 ? "day needs" : "days need"} submitting</b>
            <span>Your coordinator only sees entries you submit. Hours count as verified once approved.</span>
          </div>
          {onSubmitAll && (
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={submitAll}>
              <Send size={14} /> {busy ? "Submitting…" : submittable.length > 1 ? "Submit all" : "Submit"}
            </button>
          )}
        </div>
      )}
      <div className="sec-head"><h2>Filter</h2></div>
      <div className="hist-filter">
        <div className="chips" role="tablist" aria-label="Filter completed entries">
          {modes.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={filterMode === m.id} className={`chip${filterMode === m.id ? " is-active" : ""}`} onClick={() => setFilterMode(m.id)}>
              {m.id === "all" && <Search size={14} />}{m.label}
            </button>
          ))}
          <Tooltip label={"Toggle chronological order"}><button type="button" className="chip" onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))} aria-label="Toggle chronological order">
            <ArrowUpDown size={14} /> {sortOrder === "asc" ? "Oldest first" : "Newest first"}
          </button></Tooltip>
        </div>

        <div className="chips" role="tablist" aria-label="Filter by review status">
          {REVIEW_FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={reviewFilter === f.id} className={`chip${reviewFilter === f.id ? " is-active" : ""}`} onClick={() => setReviewFilter(f.id)}>
              {f.label}{f.id !== "any" ? ` (${counts[f.id]})` : ""}
            </button>
          ))}
        </div>

        {filterMode === "day" && (
          <div className="fld"><label htmlFor="h-day">Day</label><input id="h-day" type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} /></div>
        )}
        {filterMode === "week" && (
          <div className="fld">
            <label htmlFor="h-week">Any day in the week</label>
            <input id="h-week" type="date" value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)} />
            <span className="hist-range">{weekLabel}</span>
          </div>
        )}
        {filterMode === "month" && (
          <div className="fld">
            <label htmlFor="h-month">Month</label>
            <input id="h-month" type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
            <span className="hist-range">{monthLabel}</span>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <b>{completed.length === 0 ? "No completed entries yet" : "Nothing matches this filter"}</b>
          {completed.length === 0
            ? "Finished shifts will land here automatically once their day is over."
            : "Try another day, week or month."}
        </div>
      ) : (
        <div className="entry-list">
          {filtered.map((e) => (
            <EntryCard key={e.id} entry={e} dateLabel={formatDateLong(e.date)} clientName={clientName(e.client)} onSubmit={onSubmit} />
          ))}
        </div>
      )}
    </div>
  );
}
