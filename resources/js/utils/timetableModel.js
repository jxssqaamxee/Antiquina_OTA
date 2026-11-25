// Shared timetable logic: used by the calendar (WeekTimetable.jsx), the PNG/PDF export (timetableImage.js)
// and the offline copy. Pure functions, no React, no DOM.

export const TYPE = { public: "Public", private: "Private", custom: "Custom" };
export const STATUS = { draft: "Draft", submitted: "Waiting for review", approved: "Approved", rejected: "Returned" };
export const DAY_FULL = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" };
export const DAY_NAME = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

// One colour per state. Always shown together with words, never colour alone.
export const COLORS = {
  ontime: { rgb: [22, 163, 74], name: "On time" },
  late: { rgb: [217, 119, 6], name: "Late" },
  very_late: { rgb: [220, 38, 38], name: "Very late" },
  overtime: { rgb: [37, 99, 235], name: "Evening / overtime" },
  logged: { rgb: [100, 116, 139], name: "Logged" },
  absent: { rgb: [100, 116, 139], name: "Absent" },
  expected: { rgb: [100, 116, 139], name: "Expected" },
};

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
// Compact length for the one-line time range inside a card ("3h 48m"): keeps it on one line in narrow columns.
export const durShort = (hours) => dur(hours).replace(/ h/g, "h").replace(/ m/g, "m");
export const minText = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
export const toMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
export const daysText = (days) => (days || []).map((d) => DAY_NAME[d]).join(", ");

export function pillText(c) {
  if (c.state === "ontime") return "On time";
  if (c.state === "late") return `${minText(c.late_minutes)} late`;
  if (c.state === "very_late") return `Very late · ${minText(c.late_minutes)}`;
  if (c.state === "overtime") return "Overtime";
  return "Logged";
}

/**
 * Turns the TimetableController JSON into flat blocks, one per drawn rectangle.
 * block = { id, dow, date, start, end (minutes), kind: "card" | "expected" | "absent", state, title, lines[], rejected }
 * Always covers Monday to Sunday (the grid has 7 columns); days the API did not send simply have no blocks.
 */
export function buildBlocks(data) {
  const blocks = [];
  (data?.days || []).forEach((d) => {
    const live = d.cards.filter((c) => c.status !== "rejected");
    const missing = (slot) => !d.cards.some((c) => c.slot === slot);
    if (d.status === "absent") {
      d.expected.forEach((e, i) => ["am", "pm"].forEach((k) => e[k] && blocks.push({
        id: `${d.date}-abs-${i}${k}`, dow: d.dow, date: d.date, start: toMin(e[k][0]), end: toMin(e[k][1]), kind: "absent", state: "absent",
        title: "Absent", lines: [`${fmt12(e[k][0])} – ${fmt12(e[k][1])}`, e.host || ""].filter(Boolean),
      })));
      return;
    }
    d.cards.forEach((c) => {
      const should = (c.state === "late" || c.state === "very_late") && c.expected_in ? `Should start ${fmt12(c.expected_in)}` : "";
      blocks.push({
        id: `${d.date}-${c.entry_id}-${c.slot}`, dow: d.dow, date: d.date, start: toMin(c.in), end: toMin(c.out), kind: "card", state: c.state,
        rejected: c.status === "rejected",
        title: pillText(c),
        lines: [`${fmt12(c.in)} – ${fmt12(c.out)} · ${durShort(c.hours)}`, c.host ? `${c.host}${c.type ? ` · ${TYPE[c.type] || c.type}` : ""}` : "No host client", should, c.status !== "approved" ? STATUS[c.status] || c.status : ""].filter(Boolean),
      });
    });
    // Expected blocks that have no log yet (future days, or today): drawn dashed.
    d.expected.forEach((e, i) => ["am", "pm"].forEach((k) => {
      if (!e[k] || !missing(k) || (!d.is_today && d.status !== "upcoming" && d.status !== "not_logged")) return;
      blocks.push({
        id: `${d.date}-exp-${i}${k}`, dow: d.dow, date: d.date, start: toMin(e[k][0]), end: toMin(e[k][1]), kind: "expected", state: "expected",
        title: "Expected", lines: [`${fmt12(e[k][0])} – ${fmt12(e[k][1])}`, e.host || ""].filter(Boolean),
      });
    }));
    void live;
  });
  return blocks;
}

/** Visible hour range: 7 AM – 10 PM like the screenshot, widened if a block falls outside it. */
export function hourRange(blocks, min = 7, max = 22) {
  let lo = min, hi = max;
  blocks.forEach((b) => { lo = Math.min(lo, Math.floor(b.start / 60)); hi = Math.max(hi, Math.ceil(b.end / 60)); });
  return [Math.max(0, lo), Math.min(24, hi)];
}

export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;

export function fileBase(data) {
  const who = (data?.trainee?.name || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return ["timetable", who, data?.week?.start || "week"].filter(Boolean).join("-");
}
