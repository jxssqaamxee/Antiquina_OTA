// Draws the weekly timetable as a picture (PNG) or a one-page PDF, so a trainee can keep it in the phone's gallery,
// send it in a chat, or print it. Drawn straight on a canvas from the same data as the screen: it works offline and
// on every phone (no screenshot library, no network).
import { isIos } from "./pwaInstall";
import { buildBlocks, hourRange, fileBase, fmt12, COLORS, DAY_FULL, dur } from "./timetableModel";

const S = 2;            // pixel density of the picture
const W = 1400;         // CSS-pixel width of the picture
const GUTTER = 64;      // hour labels
const HEAD = 44;        // weekday row
const TOP = 78;         // title block
const HOUR = 60;        // height of one hour
const FOOT = 64;        // legend

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, "…"); }
  return lines;
}

export function drawTimetable(data) {
  const blocks = buildBlocks(data);
  const [h0, h1] = hourRange(blocks);
  const gridH = (h1 - h0) * HOUR;
  const H = TOP + HEAD + gridH + FOOT;
  const colW = (W - GUTTER - 24) / 7;
  const canvas = document.createElement("canvas");
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);
  const font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#0f172a"; ctx.font = font(700, 24); ctx.textBaseline = "alphabetic";
  ctx.fillText(data?.trainee?.name ? `${data.trainee.name} · Duty timetable` : "Duty timetable", 24, 38);
  ctx.fillStyle = "#475569"; ctx.font = font(500, 15);
  ctx.fillText(`${data?.week?.label || ""}${data?.trainee?.student_id ? `  ·  ${data.trainee.student_id}` : ""}`, 24, 62);
  const t = data?.totals;
  if (t) { ctx.textAlign = "right"; ctx.fillStyle = "#0f172a"; ctx.font = font(700, 16); ctx.fillText(`Total ${dur(t.logged)}`, W - 24, 38); ctx.fillStyle = "#475569"; ctx.font = font(500, 13); ctx.fillText(`Approved ${dur(t.verified)} · Waiting ${dur(t.pending)}`, W - 24, 62); ctx.textAlign = "left"; }

  const gx = GUTTER, gy = TOP + HEAD;
  // Frame + weekday header
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1;
  ctx.strokeRect(12.5, TOP + 0.5, W - 25, HEAD + gridH);
  const todayDow = (data?.days || []).find((d) => d.is_today)?.dow;
  const dates = {}; (data?.days || []).forEach((d) => { dates[d.dow] = d.day; });
  for (let i = 0; i < 7; i++) {
    const x = gx + i * colW;
    if (todayDow === i + 1) { ctx.fillStyle = "#eff6ff"; ctx.fillRect(x, TOP + 1, colW, HEAD + gridH - 1); }
    ctx.fillStyle = todayDow === i + 1 ? "#1d4ed8" : "#0f172a"; ctx.font = font(700, 14); ctx.textAlign = "center";
    ctx.fillText(DAY_FULL[i + 1], x + colW / 2, TOP + 20);
    ctx.fillStyle = "#64748b"; ctx.font = font(500, 12); ctx.fillText(dates[i + 1] || "", x + colW / 2, TOP + 36);
    ctx.strokeStyle = "#cbd5e1"; ctx.beginPath(); ctx.moveTo(x + 0.5, TOP); ctx.lineTo(x + 0.5, gy + gridH); ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.beginPath(); ctx.moveTo(12, gy + 0.5); ctx.lineTo(W - 12, gy + 0.5); ctx.stroke();

  // Hour lines (solid) and half-hour lines (dashed)
  for (let h = h0; h <= h1; h++) {
    const y = gy + (h - h0) * HOUR;
    ctx.strokeStyle = "#cbd5e1"; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(gx, y + 0.5); ctx.lineTo(W - 12, y + 0.5); ctx.stroke();
    if (h < h1) { ctx.strokeStyle = "#dbe3f0"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(gx, y + HOUR / 2 + 0.5); ctx.lineTo(W - 12, y + HOUR / 2 + 0.5); ctx.stroke(); ctx.setLineDash([]); }
    if (h < h1) { ctx.fillStyle = "#64748b"; ctx.font = font(500, 12); ctx.textAlign = "right"; ctx.fillText(fmt12(`${h}:00`).replace(":00", ""), gx - 8, y + 14); ctx.textAlign = "left"; }
  }

  // Blocks: solid colour outline all round, soft fill, no side stripe.
  blocks.forEach((b) => {
    const [r, g, bl] = COLORS[b.state]?.rgb || COLORS.logged.rgb;
    const x = gx + (b.dow - 1) * colW + 4;
    const y = gy + ((b.start - h0 * 60) / 60) * HOUR + 1;
    const w = colW - 8;
    const h = Math.max(22, ((b.end - b.start) / 60) * HOUR - 2);
    ctx.globalAlpha = b.rejected ? 0.5 : 1;
    // Solid fill (the colour mixed with white), so grid lines never show through the card.
    const mix = (c) => Math.round(255 - (255 - c) * 0.14);
    ctx.fillStyle = b.kind === "expected" ? "#ffffff" : `rgb(${mix(r)},${mix(g)},${mix(bl)})`;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = `rgb(${r},${g},${bl})`; ctx.lineWidth = 1.5; ctx.setLineDash(b.kind === "expected" ? [5, 4] : []);
    ctx.beginPath(); ctx.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 6); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = `rgb(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(bl * 0.7)})`; ctx.font = font(700, 12.5);
    let ty = y + 17; ctx.fillText(b.title, x + 8, ty);
    ctx.fillStyle = "#334155"; ctx.font = font(500, 11.5);
    b.lines.forEach((l) => wrap(ctx, l, w - 16, 2).forEach((ln) => { ty += 14; if (ty < y + h - 2) ctx.fillText(ln, x + 8, ty); }));
    ctx.restore(); ctx.globalAlpha = 1;
  });

  // Legend
  let lx = 24; const ly = gy + gridH + 38;
  [["ontime", "On time"], ["late", `Up to ${data?.late_after_minutes ?? 30} min late`], ["very_late", `Over ${data?.late_after_minutes ?? 30} min late`], ["overtime", "Evening / overtime"], ["absent", "Absent"]].forEach(([k, label]) => {
    const [r, g, bl] = COLORS[k].rgb;
    ctx.fillStyle = `rgba(${r},${g},${bl},0.14)`; ctx.fillRect(lx, ly - 11, 14, 14);
    ctx.strokeStyle = `rgb(${r},${g},${bl})`; ctx.lineWidth = 1.5; ctx.strokeRect(lx + 0.75, ly - 10.25, 12.5, 12.5);
    ctx.fillStyle = "#334155"; ctx.font = font(500, 13); ctx.fillText(label, lx + 22, ly);
    lx += 22 + ctx.measureText(label).width + 22;
  });
  return canvas;
}

const toBlob = (canvas, type = "image/png") => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not make the picture."))), type));

export async function timetablePng(data) { return toBlob(drawTimetable(data)); }

export async function timetablePdf(data) {
  const { jsPDF } = await import("jspdf");
  const canvas = drawTimetable(data);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const m = 24, ratio = Math.min((pw - m * 2) / canvas.width, (ph - m * 2) / canvas.height);
  // JPEG, not PNG: the picture has a solid background, and PNG made the PDF about 18 MB (too big to send on mobile data).
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", m, m, canvas.width * ratio, canvas.height * ratio, undefined, "FAST");
  return pdf.output("blob");
}

/**
 * Hands the file to the phone: the share sheet where it exists (Android, iPhone: Save Image, WhatsApp, Messenger,
 * Files...), otherwise a normal download. Returns "shared" | "saved" | "opened".
 */
export async function saveOrShare(blob, filename, { share = true } = {}) {
  const file = new File([blob], filename, { type: blob.type });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "shared"; /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  // iPhone/iPad Safari: when the share sheet is refused, a picture is best opened in a tab, where
  // press-and-hold > Save Image always works (an a[download] on iOS can silently do nothing for images).
  if (isIos() && /^image\//.test(blob.type) && window.open(url, "_blank")) {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "opened";
  }
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}

export { fileBase };
