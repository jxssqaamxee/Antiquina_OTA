import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Download, FileImage, FileText, Maximize2, Minimize2, Minus, Plus, RefreshCw, WifiOff, X } from "lucide-react";
import useLoad from "../../hooks/useLoad";
import { TYPE, DAY_FULL, DAY_NAME, buildBlocks, hourRange, hhmm, fmt12, dur, daysText, fileBase } from "../../utils/timetableModel";
import { saveTimetable, loadTimetable } from "../../utils/timetableCache";
import { timetablePng, timetablePdf, saveOrShare } from "../../utils/timetableImage";
import "../../styles/timetable.css";

export { fmt12, dur };

/**
 * Weekly duty timetable of one trainee (coordinator, administrator and the trainee's own profile).
 * `fetcher(week)` answers the JSON of TimetableController (week = "YYYY-MM-DD" or undefined for this week).
 * Built on FullCalendar's time grid (Monday to Sunday). Cards are solid outlined boxes, no side stripe.
 * Colours always come with words (On time / 12 min late / Absent), so nothing depends on colour alone.
 * The last loaded weeks are kept on the device, so the installed app still shows them with no signal.
 * `canDownload` (default false) shows the Download menu: only the trainee's own profile turns it on.
 * Coordinators and administrators can view a trainee's timetable but cannot export it.
 */

const ZOOM = [60, 80, 100, 130, 160];   // % of the base hour height
const BASE_HOUR = 56;                   // px
const WIDE_COL = 190;                   // px: width of a widened day column
const WIDE_EXTRA = 80;                  // px: how much the calendar grows per widened day

function eventBody({ event }) {
  const p = event.extendedProps;
  return (
    <div className="tt-ev-in">
      <b>{p.title}</b>
      {p.lines.map((l, i) => <span key={i}>{l}</span>)}
    </div>
  );
}

export default function WeekTimetable({ fetcher, resetKey = "", interval = 0, canDownload = false }) {
  const [week, setWeek] = useState(null); // null = the current week
  const [zoom, setZoom] = useState(2);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine !== false);
  const cal = useRef(null);
  const [view, setView] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "day" : "week")); // phones start on one day
  const [dayDate, setDayDate] = useState(null);   // YYYY-MM-DD shown in day view
  const [sel, setSel] = useState(null);           // id of the tapped card (bottom sheet)
  const [full, setFull] = useState(false);        // whole timetable expanded to the full screen
  const [wide, setWide] = useState([]);           // weekdays (1 = Mon … 7 = Sun) whose column is widened a little
  const closeRef = useRef(null);
  const boxRef = useRef(null);

  const [live, reload, error, m] = useLoad(() => fetcher(week || undefined), { deps: [week, resetKey], interval });
  const [copy, setCopy] = useState(null);

  // Keep a copy of every good answer; when there is none yet (offline start) show the saved one.
  useEffect(() => { if (live) saveTimetable(String(resetKey), week, live); }, [live, week, resetKey]);
  useEffect(() => { setCopy(live ? null : loadTimetable(String(resetKey), week)); }, [live, week, resetKey]);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const data = live || copy?.data || null;
  const fromCopy = !live && !!copy?.data;
  const w = data?.week;
  const t = data?.totals;

  const blocks = useMemo(() => buildBlocks(data), [data]);
  const [h0, h1] = useMemo(() => hourRange(blocks), [blocks]);
  const events = useMemo(() => blocks.map((b) => ({
    id: b.id, start: `${b.date}T${hhmm(b.start)}`, end: `${b.date}T${hhmm(b.end)}`,
    classNames: [`tt-ev`, `is-${b.state}`, b.kind === "expected" ? "is-expected" : "", b.rejected ? "is-rejected" : ""],
    extendedProps: { title: b.title, lines: b.lines },
  })), [blocks]);

  // FullCalendar follows the week the server sent (Monday start).
  useEffect(() => { if (w?.start) cal.current?.getApi().gotoDate(w.start); }, [w?.start]);

  // Day view: default to today when it is in this week, else the first day of the week. Week change closes the sheet.
  useEffect(() => {
    if (!data?.days?.length) return;
    setDayDate((cur) => (cur && data.days.some((d) => d.date === cur) ? cur : (data.days.find((d) => d.is_today) || data.days[0]).date));
  }, [data]);
  useEffect(() => { setSel(null); }, [w?.start]);
  useEffect(() => {
    const api = cal.current?.getApi();
    if (!api || !w?.start) return;
    if (view === "day" && dayDate) api.changeView("timeGridDay", dayDate);
    else if (view === "week") api.changeView("timeGridWeek", w.start);
  }, [view, dayDate, w?.start]);
  useEffect(() => {
    if (!sel) return;
    closeRef.current?.focus();
    const esc = (e) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [sel]);
  useEffect(() => {
    if (!full) return undefined;
    const esc = (e) => e.key === "Escape" && !sel && setFull(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    const t = setTimeout(() => cal.current?.getApi().updateSize(), 60);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); clearTimeout(t); };
  }, [full, sel]);
  useEffect(() => { const t = setTimeout(() => cal.current?.getApi().updateSize(), 60); return () => clearTimeout(t); }, [view]);
  // FullCalendar only re-measures on window resize. Collapsing / expanding the sidebar changes this box's width
  // without a window resize, so watch the box itself and tell the calendar to re-fit (once per frame).
  const hasData = !!data;
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !hasData || typeof ResizeObserver === "undefined") return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => cal.current?.getApi().updateSize());
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [hasData]);
  const toggleWide = (dow) => setWide((cur) => (cur.includes(dow) ? cur.filter((x) => x !== dow) : [...cur, dow]));
  const wideKey = wide.join(",");
  useEffect(() => { const t = setTimeout(() => cal.current?.getApi().updateSize(), 60); return () => clearTimeout(t); }, [wideKey, w?.start]);
  // Widened columns: only that weekday's column gets wider (header + body); the calendar's own width grows by the same
  // amount so the other days keep their size and the box simply scrolls a little further sideways.
  const wideCss = useMemo(() => (data?.days || []).filter((d) => wide.includes(d.dow))
    .map((d) => `.tt-cal th[data-date="${d.date}"], .tt-cal td.fc-timegrid-col[data-date="${d.date}"] { width: ${WIDE_COL}px; min-width: ${WIDE_COL}px; }`).join("\n"), [data, wide]);
  const wideCount = view === "week" ? (data?.days || []).filter((d) => wide.includes(d.dow)).length : 0;
  const picked = sel ? blocks.find((b) => b.id === sel) : null;
  const pickedDay = picked ? data?.days?.find((d) => d.date === picked.date) : null;

  const exportAs = async (kind) => {
    setMenu(false); setNote("Preparing…");
    try {
      const blob = kind === "pdf" ? await timetablePdf(data) : await timetablePng(data);
      const r = await saveOrShare(blob, `${fileBase(data)}.${kind === "pdf" ? "pdf" : "png"}`);
      setNote(r === "shared" ? "" : r === "opened" ? "Press and hold the picture, then choose Save Image." : "Saved to your downloads.");
    } catch { setNote("Couldn’t make the file. Try again."); }
    setTimeout(() => setNote(""), 6000);
  };

  return (
    <div className={`tt${m.loading && data ? " is-loading" : ""}${full ? " is-full" : ""}`} style={{ "--tt-hour": `${(BASE_HOUR * ZOOM[zoom]) / 100}px` }}>
      <div className="tt-bar">
        <div className="tt-nav">
          <button type="button" className="tt-btn" onClick={() => w && setWeek(w.prev)} disabled={!w} aria-label="Previous week"><ChevronLeft size={16} /></button>
          <strong aria-live="polite">{w ? w.label : "Loading…"}</strong>
          <button type="button" className="tt-btn" onClick={() => w && setWeek(w.next)} disabled={!w} aria-label="Next week"><ChevronRight size={16} /></button>
          {w && !w.is_current && <button type="button" className="tt-btn tt-text" onClick={() => setWeek(null)}>This week</button>}
        </div>
        <div className="tt-nav">
          <div className="tt-zoom" role="group" aria-label="Zoom">
            <button type="button" className="tt-btn" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Zoom out"><Minus size={14} /></button>
            <span>{ZOOM[zoom]}%</span>
            <button type="button" className="tt-btn" onClick={() => setZoom((z) => Math.min(ZOOM.length - 1, z + 1))} disabled={zoom === ZOOM.length - 1} aria-label="Zoom in"><Plus size={14} /></button>
          </div>
          <button type="button" className="tt-btn" onClick={() => setFull((v) => !v)} aria-label={full ? "Close expanded timetable" : "Expand timetable"} aria-pressed={full} title={full ? "Close" : "Expand"}>{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          <button type="button" className="tt-btn" onClick={reload} aria-label="Refresh timetable" title="Refresh"><RefreshCw size={15} className={m.loading ? "tt-spin" : ""} /></button>
          {canDownload && <div className="tt-dl">
            <button type="button" className="tt-btn tt-primary" onClick={() => setMenu((v) => !v)} disabled={!data} aria-haspopup="menu" aria-expanded={menu}><Download size={15} /> Download</button>
            {menu && (
              <div className="tt-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => exportAs("png")}><FileImage size={15} /> Picture (PNG)</button>
                <button type="button" role="menuitem" onClick={() => exportAs("pdf")}><FileText size={15} /> PDF</button>
              </div>
            )}
          </div>}
        </div>
      </div>

      {note && <p className="tt-note-live" role="status">{note}</p>}
      {error && !data && <p role="alert" className="tt-error">{error} <button type="button" className="tt-btn tt-text" onClick={reload}>Try again</button></p>}
      {fromCopy && <p className="tt-stale" role="status"><WifiOff size={13} /> {online ? "Couldn’t refresh just now." : "You’re offline."} Showing the copy saved on this phone{copy.savedAt ? ` (${new Date(copy.savedAt).toLocaleString()})` : ""}.</p>}
      {live && m.stale && <p className="tt-stale" role="status">Couldn’t refresh just now. Showing the last timetable we loaded.</p>}
      {!data && !error && <div className="tt-skeleton" aria-hidden="true"><i /><i /><i /><i /></div>}

      {data && (
        <>
          {data.hosts.length > 0 ? (
            <ul className="tt-hosts" aria-label="Host clients">
              {data.hosts.map((h, i) => (
                <li key={i}><b>{h.name}</b><span className="tt-type">{TYPE[h.type] || h.type}</span><small>{daysText(h.days)} · {fmt12(h.time_in)} – {fmt12(h.time_out)}</small></li>
              ))}
            </ul>
          ) : <p className="tt-hint">No host client schedule is set up yet, so Monday to Friday is expected. Once a host client is added, only its duty days are expected here.</p>}

          <ul className="tt-legend" aria-label="Colour guide">
            <li className="is-ontime">On time</li>
            <li className="is-late">Up to {data.late_after_minutes} min late</li>
            <li className="is-very_late">Over {data.late_after_minutes} min late</li>
            <li className="is-overtime">Evening / overtime</li>
            <li className="is-absent">Absent</li>
            <li className="is-expected">Expected, not logged yet</li>
          </ul>

          <div className="tt-views">
            <div className="tt-seg" role="group" aria-label="Timetable view">
              <button type="button" className={view === "week" ? "on" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
              <button type="button" className={view === "day" ? "on" : ""} aria-pressed={view === "day"} onClick={() => setView("day")}><CalendarDays size={13} /> Day</button>
            </div>
            {view === "day" && (
              <div className="tt-days" role="group" aria-label="Choose a day">
                {data.days.map((d) => (
                  <button key={d.date} type="button" className={`${dayDate === d.date ? "on " : ""}${d.is_today ? "today" : ""}`} aria-pressed={dayDate === d.date} onClick={() => setDayDate(d.date)}>
                    <b>{DAY_NAME[d.dow]}</b><small>{d.day}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          {view === "week" && <p className="tt-swipe"><ArrowLeftRight size={13} aria-hidden="true" /> Swipe sideways to see every day.</p>}

          <div className="tt-scroll" ref={boxRef}>
            <div className={`tt-cal${view === "day" ? " is-day" : ""}`} style={{ "--tt-extra": `${wideCount * WIDE_EXTRA}px` }} aria-label={`Duty timetable, ${w.label}`}>
              {wideCss && view === "week" && <style>{wideCss}</style>}
              <FullCalendar
                ref={cal}
                plugins={[timeGridPlugin]}
                initialView={view === "day" ? "timeGridDay" : "timeGridWeek"}
                initialDate={w.start}
                firstDay={1}
                headerToolbar={false}
                allDaySlot={false}
                height="auto"
                expandRows={false}
                slotMinTime={`${String(h0).padStart(2, "0")}:00:00`}
                slotMaxTime={`${String(h1).padStart(2, "0")}:00:00`}
                slotDuration="00:30:00"
                slotLabelInterval="01:00"
                slotLabelFormat={{ hour: "numeric", hour12: true }}
                nowIndicator
                editable={false}
                selectable={false}
                eventOverlap
                slotEventOverlap={false}
                dayHeaderContent={(a) => {
                  const day = data.days.find((d) => d.dow === (a.date.getDay() || 7));
                  return (
                    <div className="tt-dh">
                      <div className="tt-dh-t"><b>{DAY_FULL[a.date.getDay() || 7]}</b><small>{day ? day.day : ""}{day?.is_today ? " · Today" : ""}</small></div>
                      {view === "week" && day && (() => { const on = wide.includes(day.dow); return <button type="button" className="tt-dh-x" aria-pressed={on} aria-label={`${on ? "Make" : "Widen"} ${DAY_FULL[a.date.getDay() || 7]} ${on ? "narrow again" : "a little"}`} title={on ? "Make narrow" : "Widen this day"} onClick={(e) => { e.stopPropagation(); toggleWide(day.dow); }}>{on ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>; })()}
                    </div>
                  );
                }}
                events={events}
                eventClick={(i) => setSel(i.event.id)}
                eventContent={eventBody}
                eventDidMount={(i) => i.el.setAttribute("title", `${i.event.extendedProps.title}\n${i.event.extendedProps.lines.join("\n")}`)}
              />
            </div>
          </div>

          <dl className="tt-totals">
            <div><dt>Week total</dt><dd>{dur(t.logged)}</dd></div>
            <div><dt>Approved</dt><dd>{dur(t.verified)}</dd></div>
            <div><dt>Waiting for review</dt><dd>{dur(t.pending)}</dd></div>
            <div><dt>Draft</dt><dd>{dur(t.draft)}</dd></div>
            {t.rejected > 0 && <div><dt>Returned (not counted)</dt><dd>{dur(t.rejected)}</dd></div>}
            <div><dt>On time / Late / Very late / Absent</dt><dd>{t.counts.ontime} / {t.counts.late} / {t.counts.very_late} / {t.counts.absent}</dd></div>
          </dl>
          <p className="tt-hint">Late is worked out from the times written in the logbook compared with the host client’s start time.</p>
        </>
      )}

      {picked && typeof document !== "undefined" && createPortal(
        <div className="tt tt-sheet-wrap" onClick={() => setSel(null)}>
          <div className={`tt-sheet is-${picked.state}`} role="dialog" aria-modal="true" aria-label={`${picked.title}, details`} onClick={(e) => e.stopPropagation()}>
            <div className="tt-sheet-head">
              <span className="tt-chip">{picked.title}</span>
              <button type="button" ref={closeRef} className="tt-btn" onClick={() => setSel(null)} aria-label="Close details"><X size={16} /></button>
            </div>
            <p className="tt-sheet-day">{pickedDay ? `${DAY_FULL[pickedDay.dow]}, ${pickedDay.day}` : picked.date}{pickedDay?.is_today ? " · Today" : ""}</p>
            <dl className="tt-sheet-list">
              {picked.lines.map((l, i) => <div key={i}><dt>{["Time", "Host", "Note"][Math.min(i, 2)]}</dt><dd>{l}</dd></div>)}
            </dl>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
