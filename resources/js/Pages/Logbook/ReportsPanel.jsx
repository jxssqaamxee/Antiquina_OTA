import React, { useMemo } from "react";
import { Sun, Sunset, Moon, Users, CheckCircle2, AlertTriangle, Clock3, CalendarClock } from "lucide-react";
import { formatHours, hoursBetween, formatTime12, formatDateReport } from "../../utils/time";
import { completionFor, COVERAGE_SHORT_LABEL } from "../../utils/dutyStatus";
import { liveEntryProgress } from "../../utils/liveProgress";

const CATEGORY_META = {
  regular: { label: "Regular", swatch: "var(--accent-text)" },
  evening: { label: "Evening", swatch: "var(--ev)" },
  overtime: { label: "Overtime", swatch: "var(--warn)" },
};

// Reports are a record of what's actually happened, not what's been typed
// in — so every figure on this tab is driven off each entry's real-time
// progress (see utils/liveProgress.js) rather than its raw stored `hours`.
// An entry scheduled for later today (or a future date) contributes
// nothing yet; an entry mid-shift right now contributes only what's
// elapsed so far and ticks upward live; only a finished entry counts its
// full hours.
export default function ReportsPanel({ entries, clients, now = new Date(), blockingExport = false }) {
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "Unassigned";

  // Real-time status for every entry, recomputed each time `now` ticks.
  const progressById = useMemo(() => {
    const map = new Map();
    for (const e of entries) map.set(e.id, liveEntryProgress(e, now));
    return map;
  }, [entries, now]);

  // Entries that have actually started — anything still purely "upcoming"
  // (a future date, or dated today but its start time hasn't arrived) isn't
  // real data yet, so it's excluded from every figure below rather than
  // being counted as if it already happened.
  const activeEntries = useMemo(
    () => entries.filter((e) => progressById.get(e.id)?.status !== "upcoming"),
    [entries, progressById]
  );
  const upcomingCount = entries.length - activeEntries.length;

  // Live hours to actually credit an entry with right now: full stored
  // hours once it's complete, only the elapsed portion while in progress.
  const liveHoursOf = (e) => progressById.get(e.id)?.liveHours ?? e.hours;

  const byClient = useMemo(() => {
    const map = new Map();
    for (const e of activeEntries) {
      const key = e.client || "unassigned";
      if (!map.has(key)) map.set(key, { id: key, hours: 0, days: 0, last: null });
      const bucket = map.get(key);
      bucket.hours += liveHoursOf(e);
      bucket.days += 1;
      if (!bucket.last || e.date > bucket.last) bucket.last = e.date;
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [activeEntries, progressById]);

  const byCategory = useMemo(() => {
    const totals = { regular: 0, evening: 0, overtime: 0 };
    for (const e of activeEntries) totals[e.category] = (totals[e.category] || 0) + liveHoursOf(e);
    return totals;
  }, [activeEntries, progressById]);

  const grandTotal = activeEntries.reduce((s, e) => s + liveHoursOf(e), 0);
  const maxClientHours = Math.max(1, ...byClient.map((b) => b.hours));
  const maxCategoryHours = Math.max(1, ...Object.values(byCategory));

  const dayPart = useMemo(() => {
    let morning = 0;
    let afternoon = 0;
    let evening = 0;
    for (const e of activeEntries) {
      const p = progressById.get(e.id);
      for (const seg of p?.segments || []) {
        if (seg.key === "am") morning += seg.live;
        if (seg.key === "pm") afternoon += seg.live;
        if (seg.key === "ev") evening += seg.live;
      }
    }
    return { morning, afternoon, evening };
  }, [activeEntries, progressById]);
  const maxDayPart = Math.max(1, dayPart.morning, dayPart.afternoon, dayPart.evening);

  // Chronological (newest-first) breakdown of every entry that's actually
  // started — exact date, weekday, and the precise time range for
  // whichever segment(s) (Morning / Afternoon / Evening) that entry
  // covers, plus its real-time status. This is the "detailed report" view:
  // what, when, how long, and whether it's still running right now.
  const detailedLog = useMemo(() => {
    return activeEntries
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => {
        const segments = [];
        if (e.amIn && e.amOut)
          segments.push({ key: "am", label: "Morning", Icon: Sun, range: `${formatTime12(e.amIn)} – ${formatTime12(e.amOut)}`, hours: hoursBetween(e.amIn, e.amOut) });
        if (e.pmIn && e.pmOut)
          segments.push({ key: "pm", label: "Afternoon", Icon: Sunset, range: `${formatTime12(e.pmIn)} – ${formatTime12(e.pmOut)}`, hours: hoursBetween(e.pmIn, e.pmOut) });
        if (e.evIn && e.evOut)
          segments.push({ key: "ev", label: "Evening", Icon: Moon, range: `${formatTime12(e.evIn)} – ${formatTime12(e.evOut)}`, hours: hoursBetween(e.evIn, e.evOut) });
        const progress = progressById.get(e.id);
        return {
          ...e,
          segments,
          progress,
          liveHours: progress?.liveHours ?? e.hours,
          completion: progress?.status === "complete" ? completionFor(e) : null,
        };
      });
  }, [activeEntries, progressById]);

  // Did each *finished* day actually meet the standard hours for the shift
  // coverage it was logged under (Whole day / Morning only / Afternoon →
  // Evening…)? Still-running entries aren't judged met/short yet — there's
  // no verdict to give until the clock says the shift is actually over.
  const completionSummary = useMemo(() => {
    const finished = activeEntries.filter((e) => progressById.get(e.id)?.status === "complete");
    const byCoverage = new Map();
    let metCount = 0;
    for (const e of finished) {
      const c = completionFor(e);
      if (c.met) metCount += 1;
      if (!byCoverage.has(c.coverage)) byCoverage.set(c.coverage, { coverage: c.coverage, met: 0, short: 0, shortfallHours: 0 });
      const bucket = byCoverage.get(c.coverage);
      if (c.met) bucket.met += 1;
      else {
        bucket.short += 1;
        bucket.shortfallHours += Math.abs(c.delta);
      }
    }
    return {
      total: finished.length,
      met: metCount,
      short: finished.length - metCount,
      byCoverage: [...byCoverage.values()].sort((a, b) => b.met + b.short - (a.met + a.short)),
    };
  }, [activeEntries, progressById]);

  // No report to show at all until at least one entry has actually started
  // against the clock — scheduled-but-not-yet-due entries aren't data yet.
  if (activeEntries.length === 0) {
    return (
      <div className="empty">
        <b>No report yet</b>
        {entries.length === 0
          ? "No entries for this selection yet — add a day with the + button to see your reports."
          : "Your logged shift hasn't started yet — this report fills in live once it does."}
      </div>
    );
  }

  const stats = [
    { label: "Hours logged", value: formatHours(grandTotal), icon: Clock3 },
    { label: "Days logged", value: activeEntries.length, icon: CalendarClock },
    { label: "Days complete", value: completionSummary.met, icon: CheckCircle2 },
    { label: "Days short", value: completionSummary.short, icon: AlertTriangle },
  ];

  const Bar = ({ icon: Icon, name, value, pct, color }) => (
    <div className="bar-row">
      <div className="bar-row-head">
        <span className="bar-name">{Icon && <Icon size={15} />}{name}</span>
        <span className="bar-value">{formatHours(value)}</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, ...(color ? { background: color } : null) }} /></div>
    </div>
  );

  return (
    <div className="reports">
      <div className="stats" role="list" style={{ marginTop: 0 }}>
        {stats.map(({ label, value, icon: Icon }) => (
          <div className="stat" role="listitem" key={label}>
            <span className="stat-ico" aria-hidden="true"><Icon size={72} strokeWidth={1.3} /></span>
            <b>{value}</b>
            <small>{label}</small>
          </div>
        ))}
      </div>

      {blockingExport && (
        <div className="live-note is-progress">
          <Clock3 size={16} />
          <span>Today's shift is still running — these numbers update live and PDF export is locked until it finishes.</span>
        </div>
      )}
      {upcomingCount > 0 && (
        <div className="live-note is-upcoming">
          <CalendarClock size={16} />
          <span>{upcomingCount} scheduled {upcomingCount === 1 ? "entry hasn't" : "entries haven't"} started yet and {upcomingCount === 1 ? "isn't" : "aren't"} counted below.</span>
        </div>
      )}

      <section className="card report-card">
        <h3 className="card-title">Morning · afternoon · evening</h3>
        <div className="bar-list">
          <Bar icon={Sun} name="Morning" value={dayPart.morning} pct={(dayPart.morning / maxDayPart) * 100} color="var(--am)" />
          <Bar icon={Sunset} name="Afternoon" value={dayPart.afternoon} pct={(dayPart.afternoon / maxDayPart) * 100} color="var(--pm)" />
          <Bar icon={Moon} name="Evening" value={dayPart.evening} pct={(dayPart.evening / maxDayPart) * 100} color="var(--ev)" />
        </div>
      </section>

      <section className="card report-card">
        <h3 className="card-title">Hours by host client</h3>
        <div className="bar-list">
          {byClient.map((b) => (
            <div key={b.id}>
              <Bar name={b.id === "unassigned" ? "Unassigned" : clientName(b.id)} value={b.hours} pct={(b.hours / maxClientHours) * 100} />
              <div className="bar-meta">{b.days} {b.days === 1 ? "entry" : "entries"} · last logged {b.last}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card report-card">
        <h3 className="card-title">Hours by shift type</h3>
        <div className="bar-list">
          {Object.entries(byCategory).map(([key, hours]) => (
            <Bar key={key} icon={() => <i className="dot" style={{ background: CATEGORY_META[key].swatch }} />} name={CATEGORY_META[key].label} value={hours} pct={(hours / maxCategoryHours) * 100} color={CATEGORY_META[key].swatch} />
          ))}
        </div>
        <div className="report-total"><span>Total logged</span><strong>{formatHours(grandTotal)}</strong></div>
      </section>

      <section className="card report-card">
        <h3 className="card-title">Shift coverage completion</h3>
        <div className="completion-summary">
          <div className="completion-stat completion-stat--met">
            <CheckCircle2 size={20} />
            <div><strong>{completionSummary.met}</strong><span>day{completionSummary.met === 1 ? "" : "s"} met their hours</span></div>
          </div>
          <div className="completion-stat completion-stat--short">
            <AlertTriangle size={20} />
            <div><strong>{completionSummary.short}</strong><span>day{completionSummary.short === 1 ? "" : "s"} came in short</span></div>
          </div>
        </div>
        <div className="bar-list">
          {completionSummary.byCoverage.map((b) => {
            const total = b.met + b.short;
            return (
              <div key={b.coverage}>
                <div className="bar-row-head">
                  <span className="bar-name">{COVERAGE_SHORT_LABEL[b.coverage] || b.coverage}</span>
                  <span className="bar-value">{b.met}/{total} complete</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(b.met / total) * 100}%`, background: b.met === total ? "var(--ok)" : "var(--warn)" }} /></div>
                {b.short > 0 && <div className="bar-meta">Short a combined {formatHours(b.shortfallHours)} across {b.short} {b.short === 1 ? "day" : "days"}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card report-card">
        <h3 className="card-title">Detailed duty log</h3>
        <p className="report-sub">Every entry, most recent first, with the exact time range for each segment.</p>
        <div className="timeline-list">
          {detailedLog.map((e) => (
            <div className="timeline-item" key={e.id}>
              <div className="timeline-head">
                <span className="timeline-date">{formatDateReport(e.date)}</span>
                <span className="timeline-head-tags">
                  <span className={`badge ${e.category === "evening" ? "ev" : e.category === "overtime" ? "warn" : ""}`}>{CATEGORY_META[e.category].label}</span>
                  {e.progress?.status === "in-progress" ? (
                    <span className="badge warn"><span className="live-dot" /> In progress</span>
                  ) : e.completion ? (
                    <span className={`badge ${e.completion.met ? "ok" : "bad"}`}>{e.completion.met ? "Complete" : `−${formatHours(Math.abs(e.completion.delta))}`}</span>
                  ) : null}
                </span>
              </div>
              <div className="timeline-segs">
                {e.segments.map((s) => {
                  const segProgress = e.progress?.segments?.find((x) => x.key === s.key);
                  const segLive = segProgress?.status === "in-progress";
                  return (
                    <span className={`timeline-seg${segLive ? " is-live" : ""}`} key={s.key}>
                      <s.Icon size={13} /> {s.label}: {s.range} <em>({segLive ? `${formatHours(segProgress.live)} so far` : formatHours(s.hours)})</em>
                    </span>
                  );
                })}
              </div>
              <div className="timeline-meta">
                <span className="timeline-client"><Users size={12} /> {clientName(e.client)}</span>
                <span>{e.progress?.status === "in-progress" ? "Elapsed so far" : "Total"}: {formatHours(e.liveHours)}</span>
              </div>
              {e.task && <div className="timeline-task">“{e.task}”</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
