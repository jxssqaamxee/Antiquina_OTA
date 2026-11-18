// Duty Time Record PDF (A4 portrait). Built from finished entries only, so every
// number on the page ties out: summary = sum of the log = sum of the breakdowns.
import { LOGO_BASE64 } from "../assets/logoBase64";
import { completionFor, STANDARD_SEGMENT_HOURS } from "./dutyStatus";
import { scheduleDaysLabel, normalizeClient } from "./schedule";
import {
  formatHours, formatTime12, formatDateLong, formatDateTimePH, hoursBetween,
  startOfWeek, monthKey, formatWeekRange, formatMonthLabel,
} from "./time";

const INK = [22, 33, 28];
const MUTED = [96, 108, 100];
const LINE = [212, 219, 213];
const SOFT = [243, 246, 243];
const GOLD = [169, 131, 47];
const OK = [31, 122, 92];
const BAD = [193, 67, 46];
const M = 40; // page margin (pt)

const PERIOD_LABEL = { daily: "Daily Log", weekly: "Weekly Summary", monthly: "Monthly Summary" };
const TYPE_LABEL = { regular: "Regular", evening: "Evening", overtime: "Overtime" };

const segText = (a, b) => (a && b ? `${formatTime12(a)} - ${formatTime12(b)}` : null);

export function buildDutyReport({ jsPDF, autoTable, entries, clients, studentName, targetHours, exportPeriod, clientName, selectedClient = null, now = new Date() }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const CW = W - M * 2;

  // Oldest first, so the log reads like a record and the period is correct.
  const rows = entries.slice().sort((a, b) => a.date.localeCompare(b.date));
  const totalHours = rows.reduce((s, e) => s + (e.hours || 0), 0);
  const overtime = rows.filter((e) => e.category === "overtime").reduce((s, e) => s + e.hours, 0);
  // Single host client report: only that host's entries are in `rows`, so
  // "remaining vs required" (a whole-OJT figure) is replaced with "days logged".
  const single = !!selectedClient;
  const remaining = Math.max(targetHours - totalHours, 0);
  const percent = targetHours > 0 ? Math.min((totalHours / targetHours) * 100, 100) : 0;
  const completeDays = rows.filter((e) => completionFor(e).met).length;
  const periodText = rows.length
    ? rows[0].date === rows[rows.length - 1].date
      ? formatDateLong(rows[0].date)
      : `${formatDateLong(rows[0].date)} to ${formatDateLong(rows[rows.length - 1].date)}`
    : "-";

  const txt = (s, x, y, o) => doc.text(String(s), x, y, o);
  const font = (style = "normal", size = 9, color = INK) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
  };
  const section = (title, y, note) => {
    font("bold", 11); txt(title, M, y);
    doc.setDrawColor(...GOLD); doc.setLineWidth(1.5); doc.line(M, y + 5, M + 28, y + 5);
    if (note) { font("normal", 8, MUTED); txt(note, W - M, y, { align: "right" }); }
    return y + 16;
  };
  const ensure = (y, need) => { if (y + need > H - 50) { doc.addPage(); return 50; } return y; };
  const tableBase = {
    margin: { left: M, right: M, bottom: 50 },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: "middle" },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [249, 250, 249] },
    footStyles: { fillColor: SOFT, textColor: INK, fontStyle: "bold" },
    showFoot: "lastPage",
  };

  // ---- Header band ----
  doc.setFillColor(...INK); doc.rect(0, 0, W, 86, "F");
  doc.setFillColor(...GOLD); doc.rect(0, 86, W, 3, "F");
  try { doc.addImage(LOGO_BASE64, "PNG", M, 16, 54, 54); } catch { /* logo is optional */ }
  font("bold", 15, [255, 255, 255]); txt("Opol Community College", M + 66, 38);
  font("normal", 10, [255, 255, 255]); txt("On-the-Job Training  |  Official Duty Time Record", M + 66, 54);
  font("normal", 8, [205, 212, 206]); txt(`Generated ${formatDateTimePH(now)}`, M + 66, 70);
  font("bold", 9, [255, 255, 255]); txt(PERIOD_LABEL[exportPeriod].toUpperCase(), W - M, 38, { align: "right" });

  // ---- Trainee information ----
  let y = section("Trainee Information", 114);
  const hostSource = single ? clients.filter((c) => c.id === selectedClient.id) : clients;
  const hostLines = single && !hostSource.length
    ? [selectedClient.name]
    : hostSource.length
    ? hostSource.map((c) => { const n = normalizeClient(c); return `${c.name} (${scheduleDaysLabel(n)}, ${formatTime12(n.timeIn)} - ${formatTime12(n.timeOut)})`; })
    : ["-"];
  const info = [
    ["Trainee", studentName || "-", "Report type", PERIOD_LABEL[exportPeriod]],
    ["Required hours", `${targetHours}h`, "Report period", periodText],
  ];
  const colX = [M, M + 80, M + CW / 2 + 6, M + CW / 2 + 86];
  info.forEach((r) => {
    font("normal", 8, MUTED); txt(r[0], colX[0], y); txt(r[2], colX[2], y);
    font("bold", 9); txt(doc.splitTextToSize(r[1], CW / 2 - 90)[0], colX[1], y);
    txt(doc.splitTextToSize(r[3], CW / 2 - 90)[0], colX[3], y);
    y += 16;
  });
  font("normal", 8, MUTED); txt(single ? "Host client" : "Host client(s)", colX[0], y);
  font("bold", 9);
  const hostWrapped = hostLines.flatMap((l) => doc.splitTextToSize(l, CW - 80));
  hostWrapped.forEach((l, i) => txt(l, colX[1], y + i * 12));
  y += Math.max(hostWrapped.length * 12, 12) + 10;

  // ---- Summary cards + progress bar ----
  const cards = [
    ["Hours completed", formatHours(totalHours)],
    single ? ["Days logged", String(rows.length)] : ["Hours remaining", formatHours(remaining)],
    ["Overtime logged", formatHours(overtime)],
    ["Days complete", `${completeDays} of ${rows.length}`],
  ];
  const gap = 8, bw = (CW - gap * 3) / 4;
  cards.forEach(([label, value], i) => {
    const x = M + i * (bw + gap);
    doc.setFillColor(...SOFT); doc.roundedRect(x, y, bw, 44, 5, 5, "F");
    font("bold", 13, GOLD); txt(value, x + bw / 2, y + 20, { align: "center" });
    font("normal", 7.5, MUTED); txt(label.toUpperCase(), x + bw / 2, y + 34, { align: "center" });
  });
  y += 58;
  doc.setFillColor(226, 231, 226); doc.roundedRect(M, y, CW, 8, 4, 4, "F");
  if (percent > 0) { doc.setFillColor(...OK); doc.roundedRect(M, y, Math.max(CW * (percent / 100), 8), 8, 4, 4, "F"); }
  font("normal", 8, MUTED);
  txt(single ? `${selectedClient.name}: ${Math.round(percent)}% of the ${targetHours}h required (this host client only)` : `Progress: ${Math.round(percent)}% of ${targetHours}h required`, M, y + 20);
  y += 38;

  // ---- Main table ----
  if (exportPeriod === "daily") {
    y = section("Duty Log", y, "Oldest to newest");
    const body = rows.map((e) => {
      const c = completionFor(e);
      const times = [
        segText(e.amIn, e.amOut) && `Morning    ${segText(e.amIn, e.amOut)}`,
        segText(e.pmIn, e.pmOut) && `Afternoon  ${segText(e.pmIn, e.pmOut)}`,
        segText(e.evIn, e.evOut) && `Evening     ${segText(e.evIn, e.evOut)}`,
      ].filter(Boolean).join("\n");
      return [
        `${formatDateLong(e.date)}\n${TYPE_LABEL[e.category] || "Regular"}`,
        times || "-",
        clientName(e.client),
        formatHours(e.hours),
        c.met ? "Complete" : `Short ${formatHours(Math.abs(c.delta))}`,
        e.task || "-",
      ];
    });
    autoTable(doc, {
      ...tableBase, startY: y,
      head: [["Date / Type", "Time Record", "Host Client", "Hours", "Status", "Task / Remarks"]],
      body,
      foot: [["Total", "", "", formatHours(totalHours), `${completeDays}/${rows.length} complete`, ""]],
      columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 126, fontSize: 7.8 }, 2: { cellWidth: 74 }, 3: { cellWidth: 42, halign: "center" }, 4: { cellWidth: 66, halign: "center", fontSize: 8 }, 5: { cellWidth: "auto" } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 4) {
          d.cell.styles.textColor = d.cell.raw === "Complete" ? OK : BAD; d.cell.styles.fontStyle = "bold";
        }
        if (d.section === "body" && d.column.index === 0) d.cell.styles.fontStyle = "bold";
      },
    });
  } else {
    const weekly = exportPeriod === "weekly";
    y = section(weekly ? "Weekly Summary" : "Monthly Summary", y, "Oldest to newest");
    const groups = new Map();
    for (const e of rows) {
      const key = weekly ? startOfWeek(e.date) : monthKey(e.date);
      if (!groups.has(key)) groups.set(key, { key, days: 0, am: 0, pm: 0, ev: 0, hours: 0, complete: 0 });
      const g = groups.get(key);
      g.days += 1; g.hours += e.hours;
      if (e.amIn && e.amOut) g.am += hoursBetween(e.amIn, e.amOut);
      if (e.pmIn && e.pmOut) g.pm += hoursBetween(e.pmIn, e.pmOut);
      if (e.evIn && e.evOut) g.ev += hoursBetween(e.evIn, e.evOut);
      if (completionFor(e).met) g.complete += 1;
    }
    const gs = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
    autoTable(doc, {
      ...tableBase, startY: y,
      head: [[weekly ? "Week" : "Month", "Days", "Morning", "Afternoon", "Evening", "Total Hours", "Days Complete"]],
      body: gs.map((g) => [weekly ? formatWeekRange(g.key) : formatMonthLabel(g.key), g.days, formatHours(g.am), formatHours(g.pm), formatHours(g.ev), formatHours(g.hours), `${g.complete} / ${g.days}`]),
      foot: [["Total", rows.length, formatHours(gs.reduce((s, g) => s + g.am, 0)), formatHours(gs.reduce((s, g) => s + g.pm, 0)), formatHours(gs.reduce((s, g) => s + g.ev, 0)), formatHours(totalHours), `${completeDays} / ${rows.length}`]],
      columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center", fontStyle: "bold" }, 6: { halign: "center" } },
    });
  }
  y = doc.lastAutoTable.finalY + 8;
  font("normal", 7.5, MUTED);
  const legend = `Complete = the day reached the standard hours for the shifts it covers (Morning ${STANDARD_SEGMENT_HOURS.am}h, Afternoon ${STANDARD_SEGMENT_HOURS.pm}h, Evening ${STANDARD_SEGMENT_HOURS.ev}h). Lunch (12:00-1:00 PM) is not counted.`;
  doc.splitTextToSize(legend, CW).forEach((l, i) => txt(l, M, y + i * 10));
  y += 30;

  // ---- Breakdown: hours by host client + by shift ----
  y = ensure(y, 130);
  y = section("Hours Breakdown", y);
  const byClient = new Map();
  const part = { am: 0, pm: 0, ev: 0 };
  for (const e of rows) {
    const k = e.client || "none";
    if (!byClient.has(k)) byClient.set(k, { name: clientName(e.client), days: 0, hours: 0 });
    const b = byClient.get(k); b.days += 1; b.hours += e.hours;
    if (e.amIn && e.amOut) part.am += hoursBetween(e.amIn, e.amOut);
    if (e.pmIn && e.pmOut) part.pm += hoursBetween(e.pmIn, e.pmOut);
    if (e.evIn && e.evOut) part.ev += hoursBetween(e.evIn, e.evOut);
  }
  const shiftBody = [["Morning", formatHours(part.am)], ["Afternoon", formatHours(part.pm)], ["Evening", formatHours(part.ev)]];
  if (single) {
    // One host client selected: no per-client split, just that client's shifts.
    autoTable(doc, {
      ...tableBase, startY: y, tableWidth: CW / 2,
      head: [["Shift (" + selectedClient.name + ")", "Hours"]],
      body: shiftBody,
      foot: [["Total", formatHours(totalHours)]],
      columnStyles: { 1: { halign: "center", cellWidth: 70 } },
    });
    y = doc.lastAutoTable.finalY + 36;
  } else {
    const half = (CW - 14) / 2;
    const startY = y;
    autoTable(doc, {
      ...tableBase, startY, margin: { left: M, right: M + half + 14, bottom: 50 }, tableWidth: half,
      head: [["Host Client", "Days", "Hours"]],
      body: [...byClient.values()].sort((a, b) => b.hours - a.hours).map((b) => [b.name, b.days, formatHours(b.hours)]),
      columnStyles: { 1: { halign: "center", cellWidth: 36 }, 2: { halign: "center", cellWidth: 60 } },
    });
    const leftEnd = doc.lastAutoTable.finalY;
    const leftPage = doc.getNumberOfPages();
    doc.setPage(leftPage);
    autoTable(doc, {
      ...tableBase, startY, margin: { left: M + half + 14, right: M, bottom: 50 }, tableWidth: half,
      head: [["Shift", "Hours"]],
      body: shiftBody,
      columnStyles: { 1: { halign: "center", cellWidth: 70 } },
    });
    y = Math.max(leftEnd, doc.lastAutoTable.finalY) + 36;
  }

  // ---- Signatures ----
  y = ensure(y, 80);
  y = section("Certification", y);
  font("normal", 8, MUTED);
  txt("I certify that the hours above are a true and correct record of my on-the-job training.", M, y);
  y += 44;
  const sw = (CW - 40) / 2;
  doc.setDrawColor(...INK); doc.setLineWidth(0.7);
  doc.line(M, y, M + sw, y); doc.line(M + sw + 40, y, M + CW, y);
  font("bold", 9); txt(studentName || "", M + sw / 2, y - 4, { align: "center" });
  font("normal", 8, MUTED);
  txt("Trainee - signature over printed name", M + sw / 2, y + 12, { align: "center" });
  txt("Supervisor / OJT Coordinator - signature", M + sw + 40 + sw / 2, y + 12, { align: "center" });
  txt("Date: ____________________", M, y + 34); txt("Date: ____________________", M + sw + 40, y + 34);

  // ---- Footer on every page, once ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, H - 36, W - M, H - 36);
    font("normal", 7.5, MUTED);
    txt(`${studentName || "Trainee"}  |  OCC OJT Duty Time Record`, M, H - 24);
    txt(`Page ${p} of ${pages}`, W - M, H - 24, { align: "right" });
  }
  return doc;
}
