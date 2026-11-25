import React, { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import useLoad from "../../hooks/useLoad";
import "../../styles/timetable.css";

/**
 * Weekly duty timetable of one trainee, used by the coordinator, the administrator and the trainee's own profile.
 * `fetcher(week)` answers the JSON of TimetableController (week = "YYYY-MM-DD" or undefined for this week).
 * Colours always come with words (On time / 12 min late / Absent), so nothing depends on colour alone.
 */

const SLOTS = [["am", "Morning"], ["pm", "Afternoon"], ["ev", "Evening / overtime"]];
const TYPE = { public: "Public", private: "Private", custom: "Custom" };
const STATUS = { draft: "Draft", submitted: "Waiting for review", approved: "Approved", rejected: "Returned" };
const DAY_NAME = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
const RANK = { very_late: 4, late: 3, ontime: 2, overtime: 1, logged: 0 };

export const fmt12 = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
export const dur = (hours) => {
  const min = Math.round((hours || 0) * 60);
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : m ? `${m} m` : "0 h";
};
const minText = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const daysText = (days) => (days || []).map((d) => DAY_NAME[d]).join(", ");

function pillText(c) {
  if (c.state === "ontime") return "On time";
  if (c.state === "late") return `${minText(c.late_minutes)} late`;
  if (c.state === "very_late") return `Very late · ${minText(c.late_minutes)}`;
  if (c.state === "overtime") return "Overtime";
  return "Logged";
}

function Card({ c, slotLabel }) {
  const label = (c.state === "late" || c.state === "very_late") && c.expected_in ? `should start ${fmt12(c.expected_in)}` : null;
  return (
    <div className={`tt-card is-${c.state}${c.status === "rejected" ? " is-rejected" : ""}`} title={label || undefined}>
      <span className="tt-slot-label">{slotLabel}</span>
      <div className="tt-card-time"><span>{fmt12(c.in)} – {fmt12(c.out)}</span><b>{dur(c.hours)}</b></div>
      <div className="tt-card-meta">{c.host || "No host client"}{c.type ? ` · ${TYPE[c.type] || c.type}` : ""}</div>
      <div className="tt-card-tags">
        <span className="tt-pill">{pillText(c)}</span>
        {label && <span className="tt-note">{label}</span>}
        {c.status !== "approved" && <span className="tt-status">{STATUS[c.status] || c.status}</span>}
      </div>
    </div>
  );
}

function Ghost({ slotLabel, exp, tone }) {
  return exp.map((e, i) => (
    <div key={i} className={`tt-ghost${tone ? ` is-${tone}` : ""}`}>
      <span className="tt-slot-label">{slotLabel}</span>
      {tone === "off" ? "Not logged" : `Expected ${fmt12(e[0])} – ${fmt12(e[1])}`}
    </div>
  ));
}

function DayRow({ d }) {
  const live = d.cards.filter((c) => c.status !== "rejected");
  const worst = live.reduce((w, c) => (RANK[c.state] > RANK[w] ? c.state : w), "logged");
  const waiting = d.status === "upcoming" || d.status === "not_logged" || d.is_today;
  const expText = d.expected.map((e) => [e.am && `${fmt12(e.am[0])} – ${fmt12(e.am[1])}`, e.pm && `${fmt12(e.pm[0])} – ${fmt12(e.pm[1])}`].filter(Boolean).join("  ·  ")).filter(Boolean)[0];

  return (
    <div role="row" className={`tt-row is-${d.status}${d.is_today ? " is-today" : ""}`}>
      <div role="rowheader" className="tt-day"><b>{d.label}</b><span>{d.day}</span>{d.is_today && <em>Today</em>}</div>
      {d.status === "absent" ? (
        <div role="cell" className="tt-span"><div className="tt-ghost is-absent"><b>Absent</b> No duty logged{expText ? ` · expected ${expText}` : ""}</div></div>
      ) : SLOTS.map(([k, label]) => {
        const cards = d.cards.filter((c) => c.slot === k);
        const exp = k === "ev" ? [] : d.expected.map((e) => e[k]).filter(Boolean);
        return (
          <div role="cell" key={k} className={`tt-cell tt-slot-${k}`}>
            {cards.map((c) => <Card key={`${c.entry_id}${k}`} c={c} slotLabel={label} />)}
            {!cards.length && exp.length > 0 && <Ghost slotLabel={label} exp={exp} tone={waiting ? "" : "off"} />}
          </div>
        );
      })}
      <div role="cell" className={`tt-hours${d.status === "absent" ? " is-absent" : ` is-${worst}`}`}>
        {d.hours > 0 ? dur(d.hours) : d.status === "absent" ? "0 h" : "—"}
      </div>
    </div>
  );
}

const Legend = ({ n }) => (
  <ul className="tt-legend" aria-label="Colour guide">
    <li className="is-ontime">On time</li>
    <li className="is-late">Up to {n} min late</li>
    <li className="is-very_late">Over {n} min late</li>
    <li className="is-overtime">Evening / overtime</li>
    <li className="is-absent">Absent</li>
  </ul>
);

export default function WeekTimetable({ fetcher, resetKey = "", interval = 0 }) {
  const [week, setWeek] = useState(null); // null = the current week
  const [data, reload, error, m] = useLoad(() => fetcher(week || undefined), { deps: [week, resetKey], interval });
  const w = data?.week;
  const t = data?.totals;

  return (
    <div className={`tt${m.loading && data ? " is-loading" : ""}`}>
      <div className="tt-bar">
        <div className="tt-nav">
          <button type="button" className="tt-btn" onClick={() => w && setWeek(w.prev)} disabled={!w} aria-label="Previous week"><ChevronLeft size={16} /></button>
          <strong aria-live="polite">{w ? w.label : "Loading…"}</strong>
          <button type="button" className="tt-btn" onClick={() => w && setWeek(w.next)} disabled={!w} aria-label="Next week"><ChevronRight size={16} /></button>
        </div>
        <div className="tt-nav">
          {w && !w.is_current && <button type="button" className="tt-btn tt-text" onClick={() => setWeek(null)}>This week</button>}
          <button type="button" className="tt-btn" onClick={reload} aria-label="Refresh timetable" title="Refresh"><RefreshCw size={15} className={m.loading ? "tt-spin" : ""} /></button>
        </div>
      </div>

      {error && !data && <p role="alert" className="tt-error">{error} <button type="button" className="tt-btn tt-text" onClick={reload}>Try again</button></p>}
      {m.stale && <p className="tt-stale" role="status">Couldn’t refresh just now. Showing the last timetable we loaded.</p>}
      {!data && !error && <div className="tt-skeleton" aria-hidden="true"><i /><i /><i /><i /></div>}

      {data && (
        <>
          {data.hosts.length > 0 ? (
            <ul className="tt-hosts" aria-label="Host clients">
              {data.hosts.map((h, i) => (
                <li key={i}><b>{h.name}</b><span className={`tt-type is-${h.type}`}>{TYPE[h.type] || h.type}</span><small>{daysText(h.days)} · {fmt12(h.time_in)} – {fmt12(h.time_out)}</small></li>
              ))}
            </ul>
          ) : <p className="tt-hint">No host client schedule is set up yet, so Monday to Friday is shown. Once a host client is added, only its duty days appear here.</p>}

          <Legend n={data.late_after_minutes} />

          <div className="tt-scroll">
            <div role="table" className="tt-grid" aria-label={`Duty timetable, ${w.label}`}>
              <div role="row" className="tt-head">
                <div role="columnheader">Day</div>
                {SLOTS.map(([k, label]) => <div role="columnheader" key={k}>{label}</div>)}
                <div role="columnheader">Hours</div>
              </div>
              {data.days.map((d) => <DayRow key={d.date} d={d} />)}
              <div role="row" className="tt-foot">
                <div role="rowheader" className="tt-foot-label">Week total</div>
                <div role="cell" className="tt-foot-sum">
                  <span>On time <b>{t.counts.ontime}</b></span><span>Late <b>{t.counts.late}</b></span><span>Very late <b>{t.counts.very_late}</b></span><span>Absent <b>{t.counts.absent}</b></span>
                </div>
                <div role="cell" className="tt-hours is-total">{dur(t.logged)}</div>
              </div>
            </div>
          </div>

          <dl className="tt-totals">
            <div><dt>Approved</dt><dd>{dur(t.verified)}</dd></div>
            <div><dt>Waiting for review</dt><dd>{dur(t.pending)}</dd></div>
            <div><dt>Draft</dt><dd>{dur(t.draft)}</dd></div>
            {t.rejected > 0 && <div><dt>Returned (not counted)</dt><dd>{dur(t.rejected)}</dd></div>}
          </dl>
          <p className="tt-hint">Late is worked out from the times written in the logbook compared with the host client’s start time.</p>
        </>
      )}
    </div>
  );
}
