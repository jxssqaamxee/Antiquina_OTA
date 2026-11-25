// Offline copy of the weekly timetable for the installed app (PWA).
// The service worker never caches /api (private data), so the screen keeps its own copy, in the same
// account-scoped store as the logbook. Only the last few weeks are kept. Nothing here leaves the device.
import { getStorage, setStorage } from "./storage";

const INDEX = "timetable-cache-index";

// Who is signed in on this phone (AuthContext keeps "occ_me" while signed in and removes it on sign-out).
// A copy is only ever read back for the same signed-in account, and never after sign-out.
const me = () => { try { const u = JSON.parse(localStorage.getItem("occ_me") || "null"); return u && (u.sub ?? u.id) != null ? String(u.sub ?? u.id) : null; } catch { return null; } };
const KEEP = 12;

export function saveTimetable(scope, week, data) {
  const who = me();
  if (!who || !data) return;
  const key = `timetable::${who}::${scope || "self"}::${week || "current"}`;
  setStorage(key, { savedAt: Date.now(), data });
  const idx = (getStorage(INDEX) || []).filter((k) => k !== key);
  idx.push(key);
  while (idx.length > KEEP) { const old = idx.shift(); try { localStorage.removeItem(`ojt_${old}`); localStorage.removeItem(`ojt_${old}__backup`); } catch { /* ignore */ } }
  setStorage(INDEX, idx);
}

export function loadTimetable(scope, week) {
  const who = me();
  if (!who) return null;
  return getStorage(`timetable::${who}::${scope || "self"}::${week || "current"}`);
}

/** Forget every saved copy (called on sign-out paths that want a clean phone). */
export function clearTimetableCache() {
  (getStorage(INDEX) || []).forEach((k) => { try { localStorage.removeItem(`ojt_${k}`); localStorage.removeItem(`ojt_${k}__backup`); } catch { /* ignore */ } });
  setStorage(INDEX, []);
}
