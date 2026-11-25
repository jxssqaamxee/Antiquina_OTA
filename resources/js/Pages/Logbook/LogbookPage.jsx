import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Plus, Trash2, FileDown, Sun, Sunset, Moon, Pencil, Settings2, Info, Clock3, Hourglass, Zap, CalendarDays, Building2, ChevronRight, AlertTriangle, Lock } from "lucide-react";
import MobileTabBar from "../../Components/shared/MobileTabBar";
import AppBar from "../../Components/shared/AppBar";
import Sheet, { ConfirmSheet } from "../../Components/shared/Sheet";
import EntryCard from "../../Components/logbook/EntryCard";
import { EVENTS } from "../../config/constant";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useLiveClock } from "../../hooks/useLiveClock";
import { useToast } from "../../context/ToastContext";
import { usePopup } from "../../context/PopupContext";
import { OnboardingGuide } from "../../Components/shared/HelpGuide";
import ProgressRing from "../../Components/logbook/ProgressRing";
import TimeInput12 from "../../Components/logbook/TimeInput12";
const ReportsPanel = lazy(() => import("./ReportsPanel"));
const EntryHistoryPanel = lazy(() => import("./EntryHistoryPanel"));
import Footer from "../../Components/shared/Footer";
import { getUserStorage, setUserStorage, isStorageAvailable, getStorage, removeStorage } from "../../utils/storage";
import api from "../../config/axiosConfig";
import { flush as flushSync, hydrate as hydrateSync } from "../../utils/sync";
import logo from "../../assets/images/site-logo.png";
import { buildDutyReport } from "../../utils/pdfReport";
import {
  hoursBetween,
  toMinutes,
  formatHours,
  formatDateLong,
  formatTime12,
  todayStr,
  nowClock,
  uid,
  rangesOverlap,
  startOfWeek,
  formatWeekRange,
  monthKey,
  formatMonthLabel,
  formatDateTimePH,
  weekdayOf,
} from "../../utils/time";
import { completionFor } from "../../utils/dutyStatus";
import { liveEntryProgress } from "../../utils/liveProgress";
import { clientProblem, traineeNameProblem, targetHoursProblem, filterTraineeNameInput, MAX_TARGET_HOURS, CLIENT_NAME_MAX, clean } from "../../utils/validators";
import { COMPANY_TYPES, WEEKDAYS, normalizeClient, isWorkDay, dailyHoursFor, scheduleDaysLabel, defaultsForType, clientCoverage } from "../../utils/schedule";
import "./logbook.css";

import Tooltip from "../../Components/shared/Tooltip";
const STORAGE_KEY = "logbook-v2";
const MILESTONES_KEY = "milestones-v1";
const REMINDER_KEY = "shift-reminder-v1";
const ONBOARDING_KEY = "onboarding-seen-v1";
const END_REMINDER_KEY = "shift-end-reminder-v1"; // this phone only (not synced): the clock-out reminder already fired today
const END_REMINDER_MIN = 10; // minutes before the scheduled time out
const CLOCKED_OUT_WINDOW_MIN = 30; // a time out logged this close to the scheduled one counts as clocked out (same as OCC_CLOCK_OUT_WINDOW_MIN on the server)

const CATEGORIES = [
  { id: "regular", label: "Regular" },
  { id: "evening", label: "Evening" },
  { id: "overtime", label: "Overtime" },
];

const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "Regular";

// Shift-coverage options for the manual entry form. Each maps to a set of
// segments (Morning / Afternoon / Evening) the draft form will show, plus a
// short label used on the "Add ___" button so it's obvious what's about to
// be saved. "Evening" and "Afternoon → Evening" only surface once the shift
// type is Evening or Overtime — a Regular shift has no evening segment.
const COVERAGE_META = {
  full: { label: "Whole day", short: "Whole Day", icon: null },
  am: { label: "Morning only", short: "Morning", icon: Sun },
  pm: { label: "Afternoon only", short: "Afternoon", icon: Sunset },
  ev: { label: "Evening only", short: "Evening", icon: Moon },
  pmev: { label: "Afternoon → Evening", short: "Afternoon–Evening", icon: Moon },
};

// `restrictMorning` drops "full" and "am" from the list — used when the
// entry being composed is for TODAY and it's already past 12:00 PM
// Philippine time, so a fresh Morning (or a "whole day" that starts with
// one) no longer makes sense to pick. Afternoon/Evening stay available
// regardless of what time it currently is — picking Afternoon while it's
// still morning is a normal way to plan ahead for later in the same day.
// `clientCov` (from clientCoverage()) further narrows the list to whatever
// segments the selected host client's own hours actually fall into — e.g.
// a client whose hours are 1:00 PM–8:00 PM (no Morning) drops "full" and
// "am" even for a Regular/Overtime category that would otherwise allow
// them. Pass null when no client is selected yet, so the list isn't
// prematurely restricted before the trainee has picked one.
function coverageOptionsFor(category, restrictMorning, clientCov) {
  let opts;
  if (category === "evening") opts = ["ev", "pmev"];
  else if (category === "overtime") opts = ["full", "am", "pm", "ev", "pmev"];
  else opts = ["full", "am", "pm"];
  const morningOnlyClient = clientCov && clientCov.am && !clientCov.pm && !clientCov.ev;
  if (restrictMorning && !morningOnlyClient) opts = opts.filter((k) => k !== "full" && k !== "am");
  if (clientCov) {
    opts = opts.filter((key) => {
      if (key === "full") return clientCov.am && clientCov.pm;
      if (key === "am") return clientCov.am;
      if (key === "pm") return clientCov.pm;
      if (key === "ev") return clientCov.ev;
      if (key === "pmev") return clientCov.pm && clientCov.ev;
      return true;
    });
  }
  return opts;
}

const EVENING_STARTS_AT = 17 * 60; // 5:00 PM, in minutes — when "it's already evening"

// Standard OJT lunch boundary, in minutes-since-midnight, Philippine time —
// used by the manual entry form to decide when "Morning"/"Whole day"
// coverage for today is no longer a sensible option to offer.
const LUNCH_OUT_AT = 12 * 60; // 12:00 PM

function initialsOf(name) {
  if (!name) return "OJ";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "OJ";
}

// Each day is split into a Morning session (time in → lunch out) and an
// Afternoon session (lunch in → time out), matching a standard OJT DTR sheet.
// Either half can be left blank for a half-day entry.
const emptyDraft = () => ({
  date: todayStr(),
  amIn: "08:00",
  amOut: "12:00",
  pmIn: "13:00",
  pmOut: "17:00",
  evIn: "",
  evOut: "",
  client: "",
  category: "regular",
  task: "",
});

// Total hours across the morning + afternoon + evening segments of an entry-like object.
function segmentHours({ amIn, amOut, pmIn, pmOut, evIn, evOut }) {
  const am = amIn && amOut ? hoursBetween(amIn, amOut) : 0;
  const pm = pmIn && pmOut ? hoursBetween(pmIn, pmOut) : 0;
  const ev = evIn && evOut ? hoursBetween(evIn, evOut) : 0;
  return Math.round((am + pm + ev) * 100) / 100;
}

// The list of (label, start, end)-in-minutes segments a draft/entry actually
// fills in — used both to render the ledger and to check for overlaps.
function draftSegments(d) {
  const segs = [];
  if (d.amIn && d.amOut) segs.push({ label: "Morning", start: toMinutes(d.amIn), end: toMinutes(d.amOut) });
  if (d.pmIn && d.pmOut) segs.push({ label: "Afternoon", start: toMinutes(d.pmIn), end: toMinutes(d.pmOut) });
  if (d.evIn && d.evOut) segs.push({ label: "Evening", start: toMinutes(d.evIn), end: toMinutes(d.evOut) });
  return segs;
}

export default function LogbookPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotifications(); // bell history only (milestones + shift reminders)
  const toast = useToast();               // results: entry added, report exported…
  const popup = usePopup();               // things that must be read once or that block an action

  // The server refused something we tried to save (HTTP 422). The local copy is kept, but the
  // person must know it did not reach the account.
  useEffect(() => {
    const onRejected = (e) => toast.error(e.detail?.message || "Some changes could not be saved to your account.", { title: "Not saved to server", key: "sync-rejected" });
    window.addEventListener("occ-sync-rejected", onRejected);
    return () => window.removeEventListener("occ-sync-rejected", onRejected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const liveNow = useLiveClock(1000);

  // Stable per-account id — every piece of duty-log data below is scoped to
  // this, so two different accounts signed in on the same browser
  // never see or overwrite each other's hours. `sub` is the account's
  // permanent id; email is only a fallback for older sessions that predate
  // it being stored.
  const userId = user?.sub || user?.email || null;

  const [loaded, setLoaded] = useState(false);
  const [entrySheet, setEntrySheet] = useState(false); // add / edit a duty day
  const [clientSheet, setClientSheet] = useState(false); // add / edit a host client
  const [setupSheet, setSetupSheet] = useState(false); // trainee name + required hours
  const [studentName, setStudentName] = useState("");
  const [targetHours, setTargetHours] = useState(486);
  // Raw text the "Required hours" field displays, kept separate from the
  // numeric targetHours used everywhere else. Binding the input straight to
  // a number (value={targetHours}) hits a known React/browser quirk with
  // type="number": once the field shows "0" and you keep typing, the
  // browser's own text can end up as "0486" while React's numeric value is
  // already the correct 486 — so the progress ring shows 486 but the box
  // itself still shows the stray leading zero. Using a plain string here
  // sidesteps that entirely.
  const [targetHoursInput, setTargetHoursInput] = useState("486");
  const [clients, setClients] = useState([]);
  const [lastClientId, setLastClientId] = useState(null); // most recently clocked-in client — drives the shift-start reminder
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState(emptyDraft());
  // The open tab is part of the address: /logbook, /logbook/history, /logbook/reports.
  const { tab: tabParam } = useParams();
  const tab = ["history", "reports"].includes(tabParam) ? tabParam : "log";
  const setTab = useCallback((t) => navigate(t === "log" ? "/logbook" : `/logbook/${t}`), [navigate]);
  useEffect(() => {
    if (tabParam && !["history", "reports"].includes(tabParam)) navigate("/logbook", { replace: true }); // unknown tab
  }, [tabParam, navigate]);
  const [saveState, setSaveState] = useState("idle");
  const [newClientName, setNewClientName] = useState("");
  const [newClientType, setNewClientType] = useState("public"); // "public" | "private" | "custom"
  const [newClientDays, setNewClientDays] = useState(defaultsForType("public").days);
  const [newClientTimeIn, setNewClientTimeIn] = useState(defaultsForType("public").timeIn);
  const [newClientTimeOut, setNewClientTimeOut] = useState(defaultsForType("public").timeOut);
  const [editingClientId, setEditingClientId] = useState(null); // id of the client being edited, or null when adding a new one
  const [exporting, setExporting] = useState(false);
  const [exportPeriod, setExportPeriod] = useState("daily"); // "daily" | "weekly" | "monthly" — grouping used by the PDF export
  const [viewClientId, setViewClientId] = useState("all"); // "all" | host-client id | "none" — which host client the progress ring, stats and Reports tab are scoped to
  const [exportClientId, setExportClientId] = useState("all"); // "all" | host-client id | "none" (unassigned) — which host client the PDF report covers
  const [draftMode, setDraftMode] = useState("full"); // "full" | "am" | "pm" | "ev" | "pmev" — which segment(s) this manual entry covers
  const [editingId, setEditingId] = useState(null); // id of the entry currently being edited, or null when adding a new one
  const [confirmDialog, setConfirmDialog] = useState(null); // { kind: "entry" | "client", id }
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [clientError, setClientError] = useState(""); // inline error under the host-client form
  const [setupErrors, setSetupErrors] = useState({}); // inline errors for the trainee name field
  const [entryError, setEntryError] = useState(""); // banner at the top of the Add-day sheet
  const [clientNote, setClientNote] = useState(""); // inline hint under Host client (coverage auto-switched)
  const [categoryNote, setCategoryNote] = useState(""); // inline hint under Shift type (coverage auto-switched)
  const [hoursNote, setHoursNote] = useState(""); // inline hint under Required hours
  const entryBannerRef = useRef(null);
  const lunchSwitchedRef = useRef(false);

  const milestonesRef = useRef(new Set(getUserStorage(MILESTONES_KEY, userId) || []));
  // Date string (YYYY-MM-DD) the pre-shift reminder already fired for —
  // prevents it repeating every tick throughout the 10-minute window, and
  // resets naturally the next calendar day.
  const shiftReminderFiredRef = useRef(getUserStorage(REMINDER_KEY, userId));
  const endReminderFiredRef = useRef(getUserStorage(END_REMINDER_KEY, userId));

  useEffect(() => {
    const pageName = tab === "reports" ? "Reports" : tab === "history" ? "Entry History" : "Logbook";
    document.title = `${pageName} | Logbook - Opol Community College`;
  }, [tab]);

  // One-time heads-up if this browser can't reliably persist data (storage
  // disabled, full, or a private/incognito window that wipes on close).
  useEffect(() => {
    if (!isStorageAvailable()) {
      popup.once("occ_storage_warned", {
        type: "warning",
        title: "Browser storage unavailable",
        message: "Your entries won't be saved after this tab closes. Exit private/incognito mode, or allow site data, to keep your logbook.",
        okLabel: "I understand",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Right after signing in, LoginPage leaves occ_login_toast. Say "Welcome back"
  // once and remove the flag, so returning to this page never repeats it.
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem("occ_login_toast") === "1";
      if (flagged) sessionStorage.removeItem("occ_login_toast");
    } catch { /* storage blocked */ }
    if (!flagged) return;
    const first = (user?.first_name || user?.name || "").trim().split(/\s+/)[0];
    toast.success(first ? `Good to see you, ${first}.` : "You're signed in.", { title: "Welcome back", key: "welcome" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tab bar's "+" from another screen (Profile) lands here asking for the add sheet.
  useEffect(() => {
    if (location.state?.add) {
      setEntrySheet(true);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Load persisted logbook state — scoped to the signed-in account, and
  // re-run whenever the account changes (e.g. signing out of one
  // account and into another) so the new account never inherits data left
  // in state from the previous one.
  useEffect(() => {
    if (!userId) return;
    setLoaded(false);
    try {
      const raw = getUserStorage(STORAGE_KEY, userId);
      if (raw) {
        setStudentName(raw.studentName || user?.name || "");
        const savedHours = typeof raw.targetHours === "number" ? raw.targetHours : 486;
        setTargetHours(savedHours);
        setTargetHoursInput(String(savedHours));
        setClients(Array.isArray(raw.clients) ? raw.clients : []);
        setEntries(Array.isArray(raw.entries) ? raw.entries : []);
        setLastClientId(raw.lastClientId || null);
        setViewClientId(raw.viewClientId || "all");
        setExportClientId(raw.exportClientId || "all");
      } else {
        // Fresh account on this browser — reset everything rather than
        // keeping whatever the previously signed-in account had loaded.
        setStudentName(user?.name || "");
        setTargetHours(486);
        setTargetHoursInput("486");
        setClients([]);
        setEntries([]);
        setLastClientId(null);
        setViewClientId("all");
        setExportClientId("all");
      }
    } catch (e) {
      // start fresh
    } finally {
      setLoaded(true);
    }

    // First time this account has ever signed in here (or simply
    // hasn't completed the walkthrough yet) — show the onboarding guide
    // automatically. Checked per-account, not just "is this a fresh
    // browser", so it still shows for a new account even on a browser
    // that already has another trainee's data in it.
    const seenOnboarding = getUserStorage(ONBOARDING_KEY, userId);
    setShowOnboarding(!seenOnboarding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function finishOnboarding() {
    setUserStorage(ONBOARDING_KEY, userId, true);
    setShowOnboarding(false);
  }

  const persist = useCallback((next) => {
    if (!userId) return;
    setSaveState("saving");
    const ok = setUserStorage(STORAGE_KEY, userId, next);
    setSaveState(ok ? "saved" : "error");
  }, [userId]);

  // Debounced save. `pendingRef` holds an edit that is not written yet, so closing the app
  // or leaving the page within the 400 ms window can no longer drop the last change.
  const pendingRef = useRef(null);

  // ---- Server copy arrived (another device, or a conflict) ----------------------------------
  // sync.js already wrote the server's document into storage; here we re-read it into state.
  // `skipPersistRef` stops the debounced save below from writing the same data straight back
  // (that would bump the revision and ping-pong between devices).
  const skipPersistRef = useRef(false);

  const applyLogbook = useCallback((raw) => {
    if (!raw || typeof raw !== "object") return;
    skipPersistRef.current = true;
    pendingRef.current = null; // an unwritten local edit is superseded by the server copy
    setStudentName(raw.studentName || "");
    const hrs = typeof raw.targetHours === "number" ? raw.targetHours : 486;
    setTargetHours(hrs);
    setTargetHoursInput(String(hrs));
    setClients(Array.isArray(raw.clients) ? raw.clients : []);
    setEntries(Array.isArray(raw.entries) ? raw.entries : []);
    setLastClientId(raw.lastClientId || null);
    setViewClientId(raw.viewClientId || "all");
    setExportClientId(raw.exportClientId || "all");
  }, []);

  useEffect(() => {
    if (!userId) return;
    const onApplied = (e) => {
      const { key, conflict } = e.detail || {};
      if (key === STORAGE_KEY) applyLogbook(getUserStorage(STORAGE_KEY, userId));
      else if (key === MILESTONES_KEY) milestonesRef.current = new Set(getUserStorage(MILESTONES_KEY, userId) || []);
      else if (key === REMINDER_KEY) shiftReminderFiredRef.current = getUserStorage(REMINDER_KEY, userId);
      else if (key === ONBOARDING_KEY && getUserStorage(ONBOARDING_KEY, userId)) setShowOnboarding(false);

      if (conflict) {
        const slot = `sync-rejected::u_${userId}::${key}`;
        const hasRecovery = getStorage(slot) != null;
        const opts = {
          type: "warning",
          title: "Updated from another device",
          message: "Another device changed this logbook. Your last edit is kept in recovery.",
          key: "sync-conflict",
        };
        if (hasRecovery && key === STORAGE_KEY) {
          toast.undo({ ...opts, seconds: 30, undoLabel: "Restore my last edit", onUndo: () => restoreLastEditRef.current() });
        } else {
          toast.warning(opts.message, opts);
        }
      }
    };
    window.addEventListener("occ-sync-applied", onApplied);
    return () => window.removeEventListener("occ-sync-applied", onApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, applyLogbook]);

  // "Restore my last edit": put the value parked in the recovery slot back into the logbook.
  // It goes through the normal save path, so it syncs as a fresh edit on top of the server copy.
  const restoreLastEditRef = useRef(() => false);
  restoreLastEditRef.current = () => {
    const slot = `sync-rejected::u_${userId}::${STORAGE_KEY}`;
    const saved = getStorage(slot);
    if (!saved || typeof saved !== "object") {
      toast.info("There is no saved edit to restore.", { title: "Nothing to restore", key: "restore-none" });
      return true;
    }
    skipPersistRef.current = false;
    applyLogbook(saved);
    skipPersistRef.current = false; // this one SHOULD be saved and synced
    persist({
      studentName: saved.studentName || "",
      targetHours: typeof saved.targetHours === "number" ? saved.targetHours : 486,
      clients: Array.isArray(saved.clients) ? saved.clients : [],
      entries: Array.isArray(saved.entries) ? saved.entries : [],
      lastClientId: saved.lastClientId || null,
      viewClientId: saved.viewClientId || "all",
      exportClientId: saved.exportClientId || "all",
    });
    removeStorage(slot);
    toast.success("Your last edit was restored.", { title: "Restored", key: "restore-done" });
    return true;
  };

  useEffect(() => {
    if (!loaded) return;
    if (skipPersistRef.current) { skipPersistRef.current = false; return; } // state came from the server: do not echo it back
    pendingRef.current = { studentName, targetHours, clients, entries, lastClientId, viewClientId, exportClientId };
    const t = setTimeout(() => {
      if (pendingRef.current) { persist(pendingRef.current); pendingRef.current = null; }
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, studentName, targetHours, clients, entries, lastClientId, viewClientId, exportClientId, persist]);

  useEffect(() => {
    const writeNow = () => {
      if (pendingRef.current) { persist(pendingRef.current); pendingRef.current = null; }
    };
    window.addEventListener("pagehide", writeNow);
    window.addEventListener(EVENTS.flush, writeNow); // sent right before sign-out
    document.addEventListener("visibilitychange", writeNow);
    return () => {
      window.removeEventListener("pagehide", writeNow);
      window.removeEventListener(EVENTS.flush, writeNow);
      document.removeEventListener("visibilitychange", writeNow);
      writeNow(); // leaving the page (or switching account): save with THIS account's persist
    };
  }, [persist]);

  // The wall clock this render is anchored to — recomputed every tick of
  // useLiveClock() so every live-progress calculation below stays in sync
  // with real time, not just with whatever was true the moment an entry
  // was saved.
  const nowDate = useMemo(() => new Date(liveNow), [liveNow]);

  // Real-time progress for every saved entry: how much of its scheduled
  // Morning/Afternoon/Evening segments have actually elapsed against the
  // clock right now, rather than trusting the entry's stored `hours` the
  // instant it's added. A manually-added "8:00 AM–5:00 PM" entry for today
  // logged at 7:59 AM contributes 0 hours until 8:00 AM actually arrives,
  // then ticks up live as the day goes on.
  const entryProgress = useMemo(() => {
    const map = new Map();
    for (const e of entries) map.set(e.id, liveEntryProgress(e, nowDate));
    return map;
  }, [entries, nowDate]);

  // An entry stays in the Logbook tab's ledger for the rest of the calendar
  // day it's dated on — even after its last segment's end time has passed
  // and it's fully "complete" for hours purposes — so it's still easy to
  // find and correct (edit/delete) right after it's logged. It only moves
  // out to the Entry History tab once that date is no longer today, i.e.
  // starting the following day. Deliberately date-based, not status-based:
  // a same-day finished entry keeps status "complete" for hours/export
  // purposes (see utils/liveProgress.js) but that no longer decides which
  // tab it's shown in.
  const ledgerEntries = useMemo(
    () => entries.filter((e) => e.date >= todayStr(nowDate)),
    [entries, nowDate]
  );
  const completedCount = entries.length - ledgerEntries.length;

  // True the moment any entry has started but hasn't finished yet (its
  // scheduled end time is still in the future) — used to gate the Reports
  // tab and PDF export so a still-running shift can't be exported/viewed
  // as if it were already a finished day's record.
  const anyEntryInProgress = useMemo(
    () => [...entryProgress.values()].some((p) => p.status === "in-progress"),
    [entryProgress]
  );
  const blockingExport = anyEntryInProgress;

  const loggedHours = useMemo(
    () => Math.round([...entryProgress.values()].reduce((sum, p) => sum + p.liveHours, 0) * 100) / 100,
    [entryProgress]
  );
  const totalHours = loggedHours;
  const verifiedHours = useMemo(() => Math.round(entries.reduce((n, e) => n + (e.status === "approved" ? Number(e.verifiedHours ?? e.hours) || 0 : 0), 0) * 100) / 100, [entries]);
  const pendingReviewHours = useMemo(() => Math.round(entries.reduce((n, e) => n + (e.status === "submitted" ? Number(e.hours) || 0 : 0), 0) * 100) / 100, [entries]);
  const remaining = Math.max(targetHours - totalHours, 0);
  const percent = targetHours > 0 ? Math.min((totalHours / targetHours) * 100, 100) : 0;
  const complete = percent >= 100;
  // Same formula and rounding as the coordinator's report (ReportService::trainees): verified (approved) hours only, one decimal.
  // The ring above counts every logged hour, so it can read higher until entries are approved.
  const verifiedPercent = targetHours > 0 ? Math.round(Math.min((verifiedHours / targetHours) * 100, 100) * 10) / 10 : 0;
  const pct1 = (n) => Math.round(n * 10) / 10;

  const overtimeHours = useMemo(
    () => entries.filter((e) => e.category === "overtime").reduce((s, e) => s + e.hours, 0),
    [entries]
  );

  // ---- Host-client scoped view ----
  // Picking a host client scopes the ring, stats and Reports tab to that
  // client's entries only. Milestones/toasts above stay on the overall total.
  const entryInView = (e, id) => id === "all" || (id === "none" ? !(e.client && clients.some((c) => c.id === e.client)) : e.client === id);
  const hasUnassigned = useMemo(() => entries.some((e) => entryInView(e, "none")), [entries, clients]);
  const effectiveViewClientId =
    viewClientId === "all" || (viewClientId === "none" ? hasUnassigned : clients.some((c) => c.id === viewClientId)) ? viewClientId : "all";
  const scoped = effectiveViewClientId !== "all";
  const viewEntries = useMemo(
    () => (scoped ? entries.filter((e) => entryInView(e, effectiveViewClientId)) : entries),
    [entries, clients, effectiveViewClientId, scoped]
  );
  const viewClientName = effectiveViewClientId === "none" ? "Unassigned" : clients.find((c) => c.id === effectiveViewClientId)?.name || "";
  // Today & upcoming follows the same host-client scope as the progress ring.
  const viewLedgerEntries = useMemo(
    () => (scoped ? ledgerEntries.filter((e) => entryInView(e, effectiveViewClientId)) : ledgerEntries),
    [ledgerEntries, clients, effectiveViewClientId, scoped]
  );
  const hiddenLedgerCount = ledgerEntries.length - viewLedgerEntries.length;
  const viewCompletedCount = viewEntries.length - viewEntries.filter((e) => e.date >= todayStr(nowDate)).length;
  // Specific hint for the "All host clients" view: which clients the rows belong to.
  const allClientsHint = useMemo(() => {
    const counts = new Map();
    for (const e of ledgerEntries) {
      const k = entryInView(e, "none") ? "Unassigned" : clients.find((c) => c.id === e.client)?.name;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].map(([n, c]) => `${n} (${c})`).join(" · ");
  }, [ledgerEntries, clients]);
  const viewHours = useMemo(
    () => Math.round(viewEntries.reduce((sum, e) => sum + (entryProgress.get(e.id)?.liveHours || 0), 0) * 100) / 100,
    [viewEntries, entryProgress]
  );
  const viewPercent = targetHours > 0 ? Math.min((viewHours / targetHours) * 100, 100) : 0;
  const viewShare = totalHours > 0 ? Math.round((viewHours / totalHours) * 100) : 0;
  const viewOvertime = useMemo(
    () => viewEntries.filter((e) => e.category === "overtime").reduce((s, e) => s + e.hours, 0),
    [viewEntries]
  );

  // True only when composing a brand-new entry (not editing an existing
  // one) dated today, and it's already past 12:00 PM Philippine time — the
  // point at which picking "Morning" or "Whole day" coverage for today
  // stops making sense, since that window has already closed.
  const pastLunchToday =
    !editingId && draft.date === todayStr() && (toMinutes(nowClock(new Date(liveNow))) ?? 0) >= LUNCH_OUT_AT;

  // The Add-day form's currently-selected host client, and which Morning /
  // Afternoon / Evening segments that client's own hours actually cover —
  // used to keep the shift-coverage buttons honest for hosts whose hours
  // don't start in the morning (e.g. 1:00 PM–8:00 PM).
  const draftSelectedClient = clients.find((c) => c.id === draft.client) || null;
  const draftClientCoverage = draftSelectedClient ? clientCoverage(draftSelectedClient) : null;

  // True when the selected host client's own schedule doesn't include the
  // weekday of this entry's date — e.g. a Mon–Fri client picked for a
  // Saturday entry. The client can still be selected (some trainees do get
  // asked to cover an extra day), but the form surfaces a hint so it's
  // clear why, with a nudge to either add a separate host client for that
  // day or edit this one's schedule.
  const draftClientDayMismatch =
    draftSelectedClient && draft.date && !isWorkDay(draftSelectedClient, draft.date);
  const FULL_WEEKDAYS = {
    1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday",
  };
  const draftDateWeekdayLabel = draft.date ? FULL_WEEKDAYS[weekdayOf(draft.date)] : "";

  // Milestone notifications — fire once per threshold, remembered across reloads.
  useEffect(() => {
    if (!loaded) return;
    const thresholds = [25, 50, 75, 100];
    let changed = false;
    for (const t of thresholds) {
      if (percent >= t && !milestonesRef.current.has(t)) {
        milestonesRef.current.add(t);
        changed = true;
        const title = t === 100 ? "Target reached!" : `${t}% of your OJT hours logged`;
        const message =
          t === 100
            ? `You've logged ${formatHours(totalHours)} of your ${targetHours}h requirement.`
            : `${formatHours(totalHours)} logged so far — ${formatHours(remaining)} to go.`;
        // History (bell) + system notification, once per threshold (persisted).
        notify({ type: t === 100 ? "success" : "info", title, message, system: true, tag: `milestone-${t}` });
        // On screen: 25/50/75 are a quiet toast, finishing is a one-time popup.
        if (t === 100) popup({ type: "success", title, message, okLabel: "Great!" });
        else toast.info(message, { title, key: "milestone" });
      }
    }
    if (changed) setUserStorage(MILESTONES_KEY, userId, [...milestonesRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent, loaded]);

  // Pre-shift reminder — nudges the trainee about 20 minutes before their
  // scheduled start time so they remember their shift is about to begin.
  // Based on the host client they most recently logged hours under (their
  // Public/Private/Custom schedule set on the Host clients form), and only
  // on that client's actual working days — a public-office assignment
  // (Mon–Thu) won't nag on a Friday, for instance. Skipped once they've
  // already logged hours for that client today.
  //
  // This only fires while this tab is open and in the foreground — it's a
  // same-tab fallback. The real "reaches the phone even with the app
  // closed" reminder is the scheduled Web Push sent by the server
  // (php artisan push:reminders, every minute), with the same 20-minute
  // rule and the same tag, so it never shows twice.
  useEffect(() => {
    if (!loaded) return;
    const client = clients.find((c) => c.id === lastClientId);
    if (!client) return;
    const norm = normalizeClient(client);
    const today = todayStr();
    if (!isWorkDay(norm, today)) return;
    if (shiftReminderFiredRef.current === today) return;
    if (entries.some((e) => e.date === today && e.client === client.id)) return;

    const nowMin = toMinutes(nowClock(new Date(liveNow)));
    const startMin = toMinutes(norm.timeIn);
    if (nowMin === null || startMin === null) return;

    if (nowMin >= startMin - 20 && nowMin < startMin) {
      shiftReminderFiredRef.current = today;
      setUserStorage(REMINDER_KEY, userId, today);
      const reminder = {
        title: "Your OJT shift starts soon",
        message: `${client.name} starts at ${formatTime12(norm.timeIn)} — about ${startMin - nowMin} minute${startMin - nowMin === 1 ? "" : "s"} from now.`,
      };
      notify({ type: "info", ...reminder, system: true, tag: `shift-reminder-${today}` });
      toast.info(reminder.message, { title: reminder.title, key: "shift-reminder" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNow, loaded, clients, entries, lastClientId]);

  // Clock-out reminder — same style as the pre-shift one, about 10 minutes before the scheduled time
  // out of the client the trainee logged under most recently, on that client's working days only.
  // Skipped when a time out near the end of the shift is already logged today. Fires once per day.
  // While the app is closed the same reminder arrives as a real push (php artisan push:reminders);
  // both use the tag `shift-end-<date>`, so the phone shows a single notification.
  useEffect(() => {
    if (!loaded) return;
    const client = clients.find((c) => c.id === lastClientId);
    if (!client) return;
    const norm = normalizeClient(client);
    const today = todayStr();
    if (!isWorkDay(norm, today)) return;
    if (endReminderFiredRef.current === today) return;

    const nowMin = toMinutes(nowClock(new Date(liveNow)));
    const inMin = toMinutes(norm.timeIn);
    const outMin = toMinutes(norm.timeOut);
    if (nowMin === null || outMin === null || (inMin !== null && outMin <= inMin)) return;
    if (!(nowMin >= outMin - END_REMINDER_MIN && nowMin < outMin)) return;

    const clockedOut = entries.some((e) => e.date === today && e.client === client.id
      && [e.amOut, e.pmOut, e.evOut].some((t) => { const m = toMinutes(t); return m !== null && m >= outMin - Math.max(END_REMINDER_MIN, CLOCKED_OUT_WINDOW_MIN); }));
    if (clockedOut) return;

    endReminderFiredRef.current = today;
    setUserStorage(END_REMINDER_KEY, userId, today);
    const left = outMin - nowMin;
    const reminder = {
      title: "Time to clock out soon",
      message: `Your shift at ${client.name} ends at ${formatTime12(norm.timeOut)} — about ${left} minute${left === 1 ? "" : "s"} from now. Remember to log your time out.`,
    };
    notify({ type: "info", ...reminder, system: true, tag: `shift-end-${today}` });
    toast.info(reminder.message, { title: reminder.title, key: "shift-end-reminder" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNow, loaded, clients, entries, lastClientId]);

  // Past 12:00 PM, Morning / Whole day stops being valid for today's entry, so
  // the Add-day form moves itself to Afternoon — silently. The explanation is
  // the inline hint under "Shift coverage". This only runs while the sheet is
  // open and at most once per time it becomes true, so coming back to this page
  // (e.g. from Profile) can never repeat anything.
  useEffect(() => {
    if (!entrySheet || !pastLunchToday) {
      lunchSwitchedRef.current = false;
      return;
    }
    if (lunchSwitchedRef.current) return;
    lunchSwitchedRef.current = true;
    const morningOnly = draftClientCoverage && draftClientCoverage.am && !draftClientCoverage.pm && !draftClientCoverage.ev;
    if (!morningOnly && (draftMode === "am" || draftMode === "full")) setShiftMode("pm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySheet, pastLunchToday]);

  // Inline notes and the save banner only live while the sheet is open.
  useEffect(() => {
    if (!entrySheet) {
      setEntryError("");
      setClientNote("");
      setCategoryNote("");
    }
  }, [entrySheet]);

  useEffect(() => {
    if (entryError) entryBannerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [entryError]);

  // Switches which segment(s) of the day the manual-entry form captures.
  // Clears the fields for whichever segment doesn't apply, instead of
  // leaving stale default times sitting in a slot the client doesn't use.
  // The Morning time-in and Afternoon time-out defaults follow the draft's
  // selected host client's own schedule (e.g. 7:00 AM–6:00 PM) when one's
  // picked, falling back to the plain 8:00 AM–5:00 PM day otherwise. Lunch
  // itself (12:00 PM out, 1:00 PM resume) is always fixed.
  function setShiftMode(mode) {
    setDraftMode(mode);
    setDraft((d) => {
      const client = clients.find((c) => c.id === d.client);
      const norm = client ? normalizeClient(client) : null;
      const cov = norm ? clientCoverage(norm) : null;
      const defAmIn = norm ? norm.timeIn : "08:00";
      // Afternoon "in": resumes at 1:00 PM after lunch for a client that
      // also works mornings; for an afternoon-only host (e.g. 1:00 PM
      // start, no Morning segment) there's no lunch to resume from, so it
      // starts whenever that client's own hours start instead.
      const defPmIn = norm && cov && !cov.am ? norm.timeIn : "13:00";
      // Afternoon "out": the client's own end time — unless that end time
      // is in the evening, in which case 5:00 PM–onward belongs to the
      // Evening segment instead and Afternoon stops at 5:00 PM.
      const hasEvSeg = mode === "ev" || mode === "pmev";
      const defPmOut = norm ? (hasEvSeg ? "17:00" : norm.timeOut) : "17:00";
      // Evening "out" follows the client's own end time when the client
      // actually works evenings; "in" is always the fixed 5:00 PM
      // Afternoon/Evening boundary.
      const defEvIn = norm && cov && !cov.pm ? norm.timeIn : "17:00";
      const defEvOut = norm && cov && cov.ev ? norm.timeOut : "20:00";
      return {
        ...d,
        amIn: mode === "full" || mode === "am" ? d.amIn || defAmIn : "",
        amOut: mode === "full" || mode === "am" ? d.amOut || (norm && cov && !cov.pm ? norm.timeOut : "12:00") : "",
        pmIn: mode === "full" || mode === "pm" || mode === "pmev" ? d.pmIn || defPmIn : "",
        pmOut: mode === "full" || mode === "pm" || mode === "pmev" ? d.pmOut || defPmOut : "",
        evIn: mode === "ev" || mode === "pmev" ? d.evIn || defEvIn : "",
        evOut: mode === "ev" || mode === "pmev" ? d.evOut || defEvOut : "",
      };
    });
  }

  // Selecting (or changing) the host client re-derives this draft's Morning
  // time-in and Afternoon time-out from that client's own schedule — the
  // same 7:00 AM–6:00 PM (or whatever's set on the Host clients form). Only
  // touches whichever of those two fields is actually part of the current
  // shift coverage (a field left blank because that segment isn't covered
  // stays blank); the lunch break stays fixed at 12:00–1:00 PM either way.
  function handleClientChange(clientId) {
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    const norm = client ? normalizeClient(client) : null;
    const cov = norm ? clientCoverage(norm) : null;
    setDraft((d) => ({
      ...d,
      client: clientId,
      amIn: d.amIn && norm ? norm.timeIn : d.amIn,
      amOut: d.amOut && norm ? (cov && !cov.pm ? norm.timeOut : "12:00") : d.amOut,
      pmIn: d.pmIn && norm ? (cov && !cov.am ? norm.timeIn : "13:00") : d.pmIn,
      pmOut: d.pmOut && norm ? (draftMode === "ev" || draftMode === "pmev" ? "17:00" : norm.timeOut) : d.pmOut,
      evIn: d.evIn && norm && cov && !cov.pm ? norm.timeIn : d.evIn,
      evOut: d.evOut && norm ? (cov && cov.ev ? norm.timeOut : d.evOut) : d.evOut,
    }));
    // A host client's schedule is set up with specific working days (e.g.
    // Mon–Fri). If this entry's date falls outside those days, the client
    // is still selectable — but flag it, since it usually means either the
    // wrong host client was picked, or this host client's schedule needs
    // updating to include this day.
    // (That hint is shown inline under the field — see draftClientDayMismatch.)
    setClientNote("");
    setEntryError("");
    // A host client's own hours cap which shift-coverage options actually
    // make sense (e.g. picking a 1:00 PM–8:00 PM afternoon-only client
    // while "Morning only" or "Whole day" was selected). If the current
    // coverage no longer fits this client, fall back to the first coverage
    // that does and explain why.
    const allowed = coverageOptionsFor(draft.category, pastLunchToday, cov);
    if (client && !allowed.includes(draftMode)) {
      const fallback = allowed[0] || "pm";
      setShiftMode(fallback);
      setClientNote(
        `"${client.name}"'s hours are ${formatTime12(norm.timeIn)}–${formatTime12(norm.timeOut)}, which doesn't include a ${
          COVERAGE_META[draftMode]?.label || "this"
        } segment — this entry now covers ${COVERAGE_META[fallback]?.label || "a different segment"} instead.`
      );
    }
  }

  // Shift type drives which coverage options are even available (Evening /
  // Afternoon → Evening only make sense for Evening or Overtime shifts). If
  // it's already past 5pm and someone picks Overtime (or Evening) while the
  // form is still on the "Whole day" default, nudge the coverage to
  // Afternoon → Evening automatically, since a whole day can't have already
  // happened. Switching back to Regular drops any evening-only coverage.
  // Likewise, if it's already past noon today, Morning/Whole day aren't in
  // the allowed list for any category — fall back to whatever the first
  // still-valid option is.
  function handleCategoryChange(nextCategory) {
    setDraft((d) => ({ ...d, category: nextCategory }));
    setCategoryNote("");
    const eveningCapable = nextCategory === "overtime" || nextCategory === "evening";
    const nowMinutes = toMinutes(nowClock(new Date(liveNow))) ?? 0;
    const selectedClient = clients.find((c) => c.id === draft.client);
    const clientCov = selectedClient ? clientCoverage(selectedClient) : null;
    const allowed = coverageOptionsFor(nextCategory, pastLunchToday, clientCov);
    if (eveningCapable && draft.date === todayStr() && nowMinutes >= EVENING_STARTS_AT && draftMode === "full") {
      setShiftMode("pmev");
      setCategoryNote("It's already past 5:00 PM, so this entry now covers Afternoon → Evening. Adjust the times if needed.");
    } else if (!eveningCapable && (draftMode === "ev" || draftMode === "pmev")) {
      setShiftMode("full");
    } else if (!allowed.includes(draftMode)) {
      setShiftMode(allowed[0] || "pm");
    }
  }

  // Loads an existing entry back into the draft form so its times, client,
  // shift type, and remarks can be corrected — e.g. the OJT coordinator
  // called an early out at 2:06 PM instead of the planned 5:00 PM.
  function startEdit(entry) {
    if (entry.status === "submitted" || entry.status === "approved") return; // locked by review (the server enforces this too)
    const hasAM = !!(entry.amIn && entry.amOut);
    const hasPM = !!(entry.pmIn && entry.pmOut);
    const hasEV = !!(entry.evIn && entry.evOut);
    let mode = "full";
    if (hasAM && !hasPM && !hasEV) mode = "am";
    else if (!hasAM && hasPM && !hasEV) mode = "pm";
    else if (!hasAM && !hasPM && hasEV) mode = "ev";
    else if (!hasAM && hasPM && hasEV) mode = "pmev";
    else mode = "full";

    setDraft({
      date: entry.date,
      amIn: entry.amIn || "",
      amOut: entry.amOut || "",
      pmIn: entry.pmIn || "",
      pmOut: entry.pmOut || "",
      evIn: entry.evIn || "",
      evOut: entry.evOut || "",
      client: entry.client || "",
      category: entry.category,
      task: entry.task || "",
    });
    setDraftMode(mode);
    setEditingId(entry.id);
    setEntrySheet(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft());
    setDraftMode("full");
    setEntrySheet(false);
  }

  // Opens the add sheet with a fresh draft (or just re-opens an unsaved one).
  function openNewEntry() {
    if (editingId) {
      setEditingId(null);
      setDraft(emptyDraft());
      setDraftMode("full");
    }
    setEntrySheet(true);
  }

  // Closing the sheet drops an edit in progress; an unsaved new draft is kept.
  function closeEntrySheet() {
    if (editingId) cancelEdit();
    else setEntrySheet(false);
  }



  // Checks a draft against the app's rules before it's saved: a date is
  // required, a host client is required, at least one time segment must be
  // filled in, and the segment(s) can't overlap a time range already
  // logged for that same date — no duplicate "whole day" entries stacked
  // on top of each other.
  function validateDraft(d, excludeId) {
    if (!d.date) return "Please pick a date.";
    if (!d.client) return "Host client is required — please select one.";

    const segs = draftSegments(d);
    if (segs.length === 0) return "Enter at least one time range for this entry.";

    for (const e of entries) {
      if (e.id === excludeId) continue;
      if (e.date !== d.date) continue;
      const existingSegs = draftSegments(e);
      for (const a of segs) {
        for (const b of existingSegs) {
          if (rangesOverlap(a.start, a.end, b.start, b.end)) {
            return `That overlaps a ${b.label.toLowerCase()} entry you already logged for ${formatDateLong(d.date)}. Edit or delete it first instead of adding a duplicate.`;
          }
        }
      }
    }
    return null;
  }

  function saveEntry() {
    // The host client's duty days are fixed: a date outside them can't be saved.
    if (draftClientDayMismatch) {
      const msg = `"${draftSelectedClient.name}" is only scheduled ${scheduleDaysLabel(draftSelectedClient)}, not ${draftDateWeekdayLabel}. Pick a duty day, or add ${draftDateWeekdayLabel} to this host client first.`;
      setEntryError(msg);
      toast.error(msg, { title: "Can't save this day", key: "day-not-scheduled" });
      return;
    }
    const error = validateDraft(draft, editingId);
    if (error) {
      setEntryError(error);
      // Put the cursor on the first field that needs fixing.
      const bad = !draft.date ? "d-date" : !draft.client ? "d-client" : null;
      if (bad) document.getElementById(bad)?.focus();
      return;
    }
    const hrs = segmentHours(draft);
    if (hrs <= 0) {
      setEntryError("Total hours must be greater than zero.");
      return;
    }
    setEntryError("");
    const built = { ...draft, client: draft.client || null, hours: hrs };
    // Clock-out / shift reminders (in-app and push) follow the host client of the day being logged today.
    if (built.client && built.date === todayStr()) setLastClientId(built.client);

    if (editingId) {
      setEntries((prev) =>
        prev.map((e) => (e.id === editingId ? { ...built, id: editingId } : e)).sort((a, b) => a.date.localeCompare(b.date))
      );
      toast.success(`${formatDateLong(draft.date)} was updated to ${formatHours(hrs)}.`, { title: "Entry updated", key: "entry-saved" });
    } else {
      setEntries((prev) => [...prev, { id: uid(), ...built }].sort((a, b) => a.date.localeCompare(b.date)));
      toast.success(`Logged ${formatHours(hrs)} for ${formatDateLong(draft.date)}.`, { title: "Entry added", key: "entry-saved" });
    }
    setDraft(emptyDraft());
    setDraftMode("full");
    setEditingId(null);
    setEntrySheet(false);
  }

  function deleteEntry(id) {
    if (entries.some((x) => x.id === id && (x.status === "submitted" || x.status === "approved"))) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (id === editingId) cancelEdit();
    toast.info("The logbook entry was removed.", { title: "Entry deleted", key: "entry-deleted" });
  }

  // Sends one finished entry to the OJT coordinator. Push pending edits first so the server has it,
  // then adopt the server's copy (it now carries the status).
  async function submitEntryForReview(id) {
    try {
      await flushSync(userId);
      await api.post(`/logbook/entries/${encodeURIComponent(id)}/submit`);
      await hydrateSync(userId);
      applyLogbook(getUserStorage(STORAGE_KEY, userId));
      toast.success("Your coordinator can now review this entry.", { title: "Submitted", key: "entry-submitted" });
    } catch (err) {
      const msg = err?.response?.data?.errors?.entry?.[0] || err?.response?.data?.message || "Could not submit. Check your connection and try again.";
      toast.warning(msg, { title: "Not submitted", key: "entry-submit-failed" });
    }
  }

  // Submits several finished days one after another (the server locks per trainee, so never in parallel).
  async function submitManyForReview(ids) {
    if (!ids.length) return;
    let sent = 0;
    try {
      await flushSync(userId);
      for (const id of ids) {
        await api.post(`/logbook/entries/${encodeURIComponent(id)}/submit`);
        sent += 1;
      }
      toast.success(`${sent} ${sent === 1 ? "entry was" : "entries were"} sent to your coordinator.`, { title: "Submitted", key: "entry-submitted" });
    } catch (err) {
      const msg = err?.response?.data?.errors?.entry?.[0] || err?.response?.data?.message || "Could not submit. Check your connection and try again.";
      toast.warning(sent ? `${sent} sent, then it stopped: ${msg}` : msg, { title: "Not submitted", key: "entry-submit-failed" });
    } finally {
      try { await hydrateSync(userId); applyLogbook(getUserStorage(STORAGE_KEY, userId)); } catch { /* keep local copy */ }
    }
  }

  function requestDeleteEntry(id) {
    setConfirmDialog({ kind: "entry", id });
  }

  // A host client can't be removed once it's actually been used on a duty
  // entry — whole day, or any single Morning/Afternoon/Evening coverage
  // added via "Add day" (or a clocked session). Removing it would orphan
  // real logged hours, so it must first be cleared off every entry (by
  // editing those entries to a different client) before it can go away.
  function clientEntryCount(id) {
    return entries.filter((e) => e.client === id).length;
  }

  function requestDeleteClient(id) {
    if (clients.some((c) => c.id === id && c.managed)) return;
    const count = clientEntryCount(id);
    if (count > 0) {
      const client = clients.find((c) => c.id === id);
      popup({
        type: "warning",
        title: "Can't remove this host client",
        message: `"${client?.name || "This client"}" is used on ${count} duty log ${count === 1 ? "entry" : "entries"} (added via Add day / shift coverage). Edit or delete those entries first, then remove the client.`,
      });
      return;
    }
    setConfirmDialog({ kind: "client", id });
  }

  function cancelConfirm() {
    setConfirmDialog(null);
  }

  function confirmDialogAction() {
    if (!confirmDialog) return;
    if (confirmDialog.kind === "entry") deleteEntry(confirmDialog.id);
    else if (confirmDialog.kind === "client") removeClient(confirmDialog.id);
    setConfirmDialog(null);
  }

  function applyClientTypePreset(type) {
    setNewClientType(type);
    const d = defaultsForType(type);
    setNewClientDays(d.days);
    setNewClientTimeIn(d.timeIn);
    setNewClientTimeOut(d.timeOut);
  }

  function toggleNewClientDay(dayId) {
    setNewClientDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId].sort((a, b) => a - b)
    );
  }

  function resetClientForm() {
    setClientError("");
    setNewClientName("");
    applyClientTypePreset("public");
    setEditingClientId(null);
    setClientSheet(false);
  }

  function openNewClient() {
    setClientError("");
    setNewClientName("");
    applyClientTypePreset("public");
    setEditingClientId(null);
    setClientSheet(true);
  }

  function addClient() {
    const name = clean(newClientName);
    const problem = clientProblem({
      name,
      days: newClientDays,
      timeIn: newClientTimeIn,
      timeOut: newClientTimeOut,
      existingNames: clients.filter((c) => c.id !== editingClientId).map((c) => c.name),
    });
    if (problem) {
      setClientError(problem);
      return;
    }
    setClientError("");
    if (editingClientId) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingClientId
            ? { ...c, name, type: newClientType, days: newClientDays, timeIn: newClientTimeIn, timeOut: newClientTimeOut }
            : c
        )
      );
      // The client someone just edited is the one whose schedule should
      // drive their reminders — without this, lastClientId was never set
      // anywhere in the app, so the cloud function could never match a
      // client and pre-shift/lunch/end-of-day reminders never fired for
      // anyone, no matter how the host client was configured.
      setLastClientId(editingClientId);
      toast.success(`"${name}" schedule was updated.`, { title: "Host client updated", key: "client-saved" });
      resetClientForm();
      return;
    }
    const newClient = { id: uid(), name, type: newClientType, days: newClientDays, timeIn: newClientTimeIn, timeOut: newClientTimeOut };
    setClients((prev) => [...prev, newClient]);
    // A newly added host client becomes the trainee's current one for
    // reminder purposes (see note above).
    setLastClientId(newClient.id);
    resetClientForm();
  }

  function startEditClient(id) {
    const client = clients.find((c) => c.id === id);
    if (!client || client.managed) return; // placement-managed schedules are set by your school
    const norm = normalizeClient(client);
    setEditingClientId(id);
    setNewClientName(norm.name);
    setNewClientType(norm.type);
    setNewClientDays(norm.days);
    setNewClientTimeIn(norm.timeIn);
    setNewClientTimeOut(norm.timeOut);
    setClientError("");
    setClientSheet(true);
  }

  function cancelClientEdit() {
    resetClientForm();
  }

  function removeClient(id) {
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (id === editingClientId) resetClientForm();
    if (id === lastClientId) setLastClientId(null);
    toast.info("The host client was removed from your list.", { title: "Host client removed", key: "client-removed" });
  }

  function clientName(id) {
    if (!id) return "Unassigned";
    return clients.find((c) => c.id === id)?.name || "Unassigned";
  }

  async function handleSignOut() {
    try { await logout(); } finally { navigate("/login", { replace: true }); }
  }

  // PDF "Host client" picker. Every host client is listed so the person can see
  // them all, but only the ones with at least one reportable (already-started)
  // entry can be picked: a host client with nothing logged yet is disabled, so
  // an empty PDF can never be requested for it.
  const exportClientOptions = useMemo(() => {
    const counts = new Map();
    for (const e of entries) {
      if (entryProgress.get(e.id)?.status === "upcoming") continue;
      const id = e.client && clients.some((c) => c.id === e.client) ? e.client : "none";
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const list = clients.map((c) => ({ id: c.id, name: c.name, days: counts.get(c.id) || 0 }));
    // "Unassigned" only appears when there really are entries without a host client.
    if (counts.get("none")) list.push({ id: "none", name: "Unassigned", days: counts.get("none") });
    return list
      .map((o) => ({ ...o, disabled: o.days === 0 }))
      .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.name.localeCompare(b.name));
  }, [entries, entryProgress, clients]);
  const totalReportableEntries = exportClientOptions.reduce((s, o) => s + o.days, 0);
  // If the chosen host client was deleted or has no entries (any more), fall back to "all".
  const effectiveExportClientId = exportClientId === "all" || exportClientOptions.some((o) => o.id === exportClientId && !o.disabled) ? exportClientId : "all";
  const exportBlockedByEmpty = totalReportableEntries === 0;

  async function exportPDF() {
    // Real-time gate: a report is a record of finished duty hours, so it
    // can't be generated while any entry is still mid-shift (started but
    // its scheduled end hasn't been reached yet). This mirrors the same
    // rule the Reports tab uses.
    if (blockingExport) {
      popup({
        type: "warning",
        title: "Still tracking today's shift",
        message: "Today's logged hours are still in progress against the clock. Wait until the scheduled shift finishes, then export or view your report.",
      });
      return;
    }

    // Validate first: make sure there is something to put in the report before
    // anything is loaded or built, so an empty PDF can never be downloaded.
    const wanted = effectiveExportClientId === "all" ? null : exportClientOptions.find((o) => o.id === effectiveExportClientId) || null;
    const available = wanted ? wanted.days : totalReportableEntries;
    if (available === 0) {
      toast.error(
        wanted ? `${wanted.name} has no logged entries yet.` : "You have no logged entries yet.",
        { title: "Nothing to export", key: "pdf-empty" }
      );
      return;
    }

    const nameProblem = traineeNameProblem(studentName);
    if (nameProblem) {
      // Inline error in the trainee-details sheet — open it so it is visible.
      setSetupErrors((x) => ({ ...x, name: nameProblem }));
      setSetupSheet(true);
      return;
    }

    setExporting(true);
    let jsPDF, autoTable;
    try {
      // Loaded on demand: jsPDF (and its html2canvas dependency) is the
      // heaviest part of the app, so it's kept out of the main bundle and
      // only fetched the moment someone actually exports a report.
      [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
    } catch (e) {
      setExporting(false);
      toast.error("Check your connection and try exporting again.", { title: "Couldn't load the PDF engine", key: "pdf-engine" });
      return;
    }

    // Only entries that have actually happened belong in a report; anything
    // not yet started has produced no real hours.
    let reportableEntries = entries.filter((e) => entryProgress.get(e.id)?.status !== "upcoming");
    // Host-client filter: when one host client is chosen, the PDF only
    // contains that client's entries, so every figure ties out to it.
    const selectedClient = effectiveExportClientId === "all" ? null : exportClientOptions.find((o) => o.id === effectiveExportClientId) || null;
    if (selectedClient) {
      reportableEntries = reportableEntries.filter((e) =>
        selectedClient.id === "none" ? !(e.client && clients.some((c) => c.id === e.client)) : e.client === selectedClient.id
      );
    }
    if (reportableEntries.length === 0) {
      setExporting(false);
      toast.error("There are no logged entries for that host client yet.", { title: "Nothing to export", key: "pdf-empty" });
      return;
    }
    const doc = buildDutyReport({
      jsPDF, autoTable, entries: reportableEntries, clients, studentName, targetHours,
      exportPeriod, clientName, selectedClient, now: new Date(),
    });
    const clientSlug = selectedClient ? `-${selectedClient.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
    doc.save(`OCC-OJT-Duty-Log-${(studentName || "trainee").replace(/\s+/g, "-")}${clientSlug}-${todayStr()}.pdf`);

    setExporting(false);
    toast.success("Your detailed duty log PDF has been downloaded.", { title: "Report exported", key: "report-exported" });
  }

  const firstName = (studentName || user?.first_name || user?.name || "").trim().split(/\s+/)[0] || "Trainee";
  const hourNow = nowDate.getHours();
  const greeting = hourNow < 12 ? "Good morning" : hourNow < 18 ? "Good afternoon" : "Good evening";
  const heroLogo = `url("${logo}")`;
  const coverageOpts = coverageOptionsFor(draft.category, pastLunchToday, draftClientCoverage);
  const categoryIsEvening = draft.category === "evening" || draft.category === "overtime";

  const confirmTarget = confirmDialog
    ? confirmDialog.kind === "entry"
      ? entries.find((e) => e.id === confirmDialog.id)
      : clients.find((c) => c.id === confirmDialog.id)
    : null;
  const confirmIsEntry = confirmDialog?.kind === "entry";

  const pageTitle = tab === "reports" ? "Reports" : tab === "history" ? "Entry history" : "Logbook";

  return (
    <div className="app">
      <OnboardingGuide open={showOnboarding} onDone={finishOnboarding} />
      <AppBar title={pageTitle} subtitle="OCC · OJT Duty Log" />

      <main className="app-main">
        {(tab === "log" || tab === "reports" || tab === "history") && clients.length > 0 && (
          <div className="fld view-client">
            <label htmlFor="view-client">Show progress for</label>
            <select id="view-client" value={effectiveViewClientId} onChange={(e) => setViewClientId(e.target.value)}>
              <option value="all">All host clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {hasUnassigned && <option value="none">Unassigned</option>}
            </select>
            {scoped && <span className="fld-hint">Showing only {viewClientName} — other host clients are not mixed in.</span>}
          </div>
        )}
        {tab === "log" && (
          <>
            {/* ---------- hero ---------- */}
            <section className="hero" style={{ "--hero-logo": heroLogo }} aria-label="Your OJT progress">
              <div className="hero-top">
                <div className="hero-who">
                  <small>{greeting}</small>
                  <b>{firstName}</b>
                </div>
                <Tooltip label={"Edit trainee name and required hours"}><button type="button" className="hero-edit" onClick={() => setSetupSheet(true)} aria-label="Edit trainee name and required hours">
                  <Settings2 size={19} />
                </button></Tooltip>
              </div>
              <div className="hero-body">
                <ProgressRing percent={scoped ? viewPercent : percent} complete={scoped ? viewPercent >= 100 : complete}>
                  <b>{pct1(scoped ? viewPercent : percent)}%</b>
                  <span>{(scoped ? viewPercent >= 100 : complete) ? "Target met" : "done"}</span>
                </ProgressRing>
                <div className="hero-info">
                  <div>
                    <div className="big">{formatHours(scoped ? viewHours : totalHours)}</div>
                    <div className="of">{scoped ? `at ${viewClientName} · of ${targetHours}h required` : `of ${targetHours}h required`}</div>
                    {!scoped && totalHours > 0 && (
                      <div className="of">{formatHours(verifiedHours)} verified · {formatHours(pendingReviewHours)} awaiting review · {formatHours(Math.max(0, Math.round((totalHours - verifiedHours - pendingReviewHours) * 100) / 100))} not submitted</div>
                    )}
                  </div>
                  <div className="hero-chips">
                    {scoped
                      ? <span className="hero-chip">{viewShare}% of all your hours</span>
                      : <span className="hero-chip">{formatHours(remaining)} to go</span>}
                    {!scoped && <span className="hero-chip" title="Approved hours only: the figure your coordinator sees">{verifiedPercent}% verified</span>}
                    {(scoped ? viewOvertime : overtimeHours) > 0 && <span className="hero-chip">{formatHours(scoped ? viewOvertime : overtimeHours)} overtime</span>}
                  </div>
                </div>
              </div>
              <div className="hero-foot">
                {studentName.trim() || !loaded ? (
                  <b>{studentName.trim() || "\u00a0"}</b>
                ) : (
                  <button type="button" className="hero-foot-link" onClick={() => setSetupSheet(true)}>Add your name for the PDF report</button>
                )}
                Opol Community College · OJT Duty Log
              </div>
            </section>

            {/* ---------- stats ---------- */}
            <div className="stats" role="list">
              {[
                { label: "Hours logged", value: formatHours(scoped ? viewHours : totalHours), icon: Clock3 },
                scoped
                  ? { label: "Share of total", value: `${viewShare}%`, icon: Hourglass }
                  : { label: "Still required", value: formatHours(remaining), icon: Hourglass },
                { label: "Overtime", value: formatHours(scoped ? viewOvertime : overtimeHours), icon: Zap },
                { label: "Days logged", value: viewEntries.length, icon: CalendarDays },
              ].map(({ label, value, icon: Icon }) => (
                <div className="stat" role="listitem" key={label}>
                  <span className="stat-ico" aria-hidden="true"><Icon size={92} strokeWidth={1.8} /></span>
                  <b>{value}</b>
                  <small>{label}</small>
                </div>
              ))}
            </div>

            {/* ---------- main action ---------- */}
            <button type="button" className="cta" onClick={clients.length === 0 ? openNewClient : openNewEntry} aria-haspopup="dialog">
              <span className="cta-icon">{clients.length === 0 ? <Building2 size={24} strokeWidth={1.8} /> : <Plus size={24} strokeWidth={1.8} />}</span>
              <span className="cta-text">
                <b>{clients.length === 0 ? "Add your host client" : "Add a duty day"}</b>
                <small>{clients.length === 0 ? "The office you are deployed to — needed before you log days" : "Log your morning, afternoon or evening shift"}</small>
              </span>
              <ChevronRight size={20} />
            </button>

            {/* ---------- host clients ---------- */}
            <div className="sec-head">
              <h2>Host clients</h2>
              {clients.length > 0 && <button type="button" className="link-btn" onClick={openNewClient}><Plus size={15} /> Add</button>}
            </div>
            {clients.length === 0 ? (
              <div className="empty"><b>No host clients yet</b>Use the button above to add the office or company you are deployed to.</div>
            ) : (
              <div className="client-list">
                {clients.map((c) => {
                  const norm = normalizeClient(c);
                  const inUseCount = clientEntryCount(c.id);
                  return (
                    <div className={`client${editingClientId === c.id ? " is-editing" : ""}`} key={c.id}>
                      <span className="client-ico"><Building2 size={21} /></span>
                      <div className="client-main">
                        <b>{c.name}{inUseCount > 0 && <span className="badge mute client-used">{inUseCount} {inUseCount === 1 ? "day" : "days"}</span>}</b>
                        <small>
                          {(COMPANY_TYPES[norm.type] || COMPANY_TYPES.custom).label} · {scheduleDaysLabel(norm)}<br />
                          {formatTime12(norm.timeIn)} – {formatTime12(norm.timeOut)}
                        </small>
                      </div>
                      {c.managed ? <div className="client-actions"><span className="badge mute"><Lock size={11} /> Set by school</span></div> : <div className="client-actions">
                        <Tooltip label={`Edit ${c.name}`}><button type="button" className="icon-btn sm" onClick={() => startEditClient(c.id)} aria-label={`Edit ${c.name}`}><Pencil size={15} /></button></Tooltip>
                        <button
                          type="button" className="icon-btn sm danger" onClick={() => requestDeleteClient(c.id)}
                          aria-label={inUseCount > 0 ? `${c.name} is used on ${inUseCount} duty log entries and can't be removed` : `Remove ${c.name}`}
                          disabled={inUseCount > 0}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ---------- today & upcoming ---------- */}
            <div className="sec-head">
              <h2>Today &amp; upcoming</h2>
              {viewCompletedCount > 0 && (
                <button type="button" className="link-btn" onClick={() => setTab("history")}>History ({viewCompletedCount}) <ChevronRight size={15} /></button>
              )}
            </div>
            {entries.length === 0 && (
              <div className="empty"><b>No entries yet</b>{clients.length === 0 ? "Add a host client first, then log your first day." : "Tap the + button to add your first duty day."}</div>
            )}
            {entries.length > 0 && ledgerEntries.length > 0 && (
              <p className="fld-hint" style={{ margin: "0 0 8px" }}>
                {scoped
                  ? `Showing only ${viewClientName}.${hiddenLedgerCount > 0 ? ` ${hiddenLedgerCount} ${hiddenLedgerCount === 1 ? "entry" : "entries"} for other host clients ${hiddenLedgerCount === 1 ? "is" : "are"} hidden.` : ""}`
                  : `All host clients: ${allClientsHint}. Each card shows its host client.`}
              </p>
            )}
            {entries.length > 0 && viewLedgerEntries.length === 0 && (
              <div className="empty"><b>Nothing for today{scoped ? ` at ${viewClientName}` : ""}</b>{scoped && hiddenLedgerCount > 0 ? "Switch to All host clients to see entries for other host clients." : "Earlier days have moved to the History tab."}</div>
            )}
            <div className="entry-list">
              {viewLedgerEntries.slice().reverse().map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  dateLabel={formatDateLong(e.date)}
                  clientName={clientName(e.client)}
                  progress={entryProgress.get(e.id)}
                  editing={e.id === editingId}
                  onEdit={startEdit}
                  onDelete={requestDeleteEntry}
                  onSubmit={submitEntryForReview}
                />
              ))}
            </div>

            {/* ---------- export ---------- */}
            <section className="card export-card">
              <h3 className="card-title"><FileDown size={18} /> PDF report</h3>
              <p className="card-sub">A signable Duty Time Record for your OJT coordinator.</p>
              <div className="fld">
                <label htmlFor="export-period">Report type</label>
                <select id="export-period" value={exportPeriod} onChange={(e) => setExportPeriod(e.target.value)}>
                  <option value="daily">Daily (every entry)</option>
                  <option value="weekly">Weekly summary</option>
                  <option value="monthly">Monthly summary</option>
                </select>
              </div>
              <div className="fld">
                <label htmlFor="export-client">Host client</label>
                <select id="export-client" value={effectiveExportClientId} onChange={(e) => setExportClientId(e.target.value)} disabled={exportBlockedByEmpty}>
                  <option value="all" disabled={exportBlockedByEmpty}>All host clients</option>
                  {exportClientOptions.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.disabled}>
                      {o.disabled ? `${o.name} (no entries yet)` : `${o.name} (${o.days} ${o.days === 1 ? "entry" : "entries"})`}
                    </option>
                  ))}
                </select>
                <span className="fld-hint">
                  {exportBlockedByEmpty
                    ? "No logged entries yet, so there is nothing to export. Add a day and let its shift start."
                    : effectiveExportClientId === "all"
                    ? "The report will include every host client that has entries."
                    : "The report will only include entries for this host client."}
                </span>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={exportPDF} disabled={exporting || blockingExport || exportBlockedByEmpty}>
                {exporting ? <><span className="spin" /> Preparing report…</> : blockingExport ? "Shift in progress…" : <><FileDown size={18} /> Export PDF report</>}
              </button>
              {blockingExport && (
                <p className="fld-hint" style={{ textAlign: "center", marginTop: 10 }}>
                  A logged shift for today hasn't reached its scheduled end yet — export unlocks once it does.
                </p>
              )}
              <span className="save-note">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save — storage may be full or disabled" : loaded ? "Saved to your account" : "Loading…"}
              </span>
            </section>
          </>
        )}

        {tab === "history" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><EntryHistoryPanel entries={viewEntries} clients={clients} now={nowDate} scopedName={scoped ? viewClientName : null} onSubmit={submitEntryForReview} onSubmitAll={submitManyForReview} /></Suspense>}
        {tab === "reports" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><ReportsPanel entries={viewEntries} clients={clients} now={nowDate} blockingExport={blockingExport} scopedName={scoped ? viewClientName : null} /></Suspense>}

        <Footer />
      </main>

      <MobileTabBar tab={tab} onTab={setTab} onAdd={openNewEntry} historyCount={viewCompletedCount} />

      {/* ---------- sheet: add / edit a duty day ---------- */}
      <Sheet
        open={entrySheet}
        onClose={closeEntrySheet}
        title={editingId ? "Edit duty day" : "Add a duty day"}
        labelId="entry-sheet-title"
        footerClass="is-2-1"
        footer={
          <>
            <button type="button" className="btn" onClick={closeEntrySheet}>Cancel</button>
            <button type="button" className={"btn btn-primary" + (draftClientDayMismatch ? " is-blocked" : "")} aria-disabled={draftClientDayMismatch ? "true" : undefined} onClick={saveEntry}>
              {editingId ? "Save changes" : <><Plus size={18} /> Add {COVERAGE_META[draftMode].short}</>}
            </button>
          </>
        }
      >
        {entryError && (
          <div className="notice bad" role="alert" ref={entryBannerRef}>
            <AlertTriangle size={16} /><span><b>Can't save this entry.</b> {entryError}</span>
          </div>
        )}
        {editingId && (
          <div className="notice"><Pencil size={16} /><span>Editing an existing entry — fix whatever needs correcting (e.g. an early out) and save.</span></div>
        )}

        <div className="fld">
          <label htmlFor="d-date">Date</label>
          <input id="d-date" type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
        </div>

        <div className="fld">
          <label htmlFor="d-client">Host client <span className="req">*</span></label>
          <select id="d-client" value={draft.client} aria-invalid={!draft.client ? undefined : false} onChange={(e) => handleClientChange(e.target.value)}>
            <option value="">Select a host client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {clients.length === 0 && <span className="fld-hint warn">You have no host clients yet — add one from the Logbook screen first.</span>}
          {clientNote && <span className="fld-hint warn">{clientNote}</span>}
          {draftClientDayMismatch && (
            <span className="fld-hint bad" role="alert">
              "{draftSelectedClient.name}" is scheduled {scheduleDaysLabel(draftSelectedClient)}, not {draftDateWeekdayLabel}. If this is right, edit it under Host clients to add {draftDateWeekdayLabel} — or add a separate host client.
            </span>
          )}
        </div>

        <div className="fld">
          <span className="fld-label">Shift type</span>
          <div className="seg">
            {CATEGORIES.map((c) => (
              <button type="button" key={c.id} className={draft.category === c.id ? "active" : ""} onClick={() => handleCategoryChange(c.id)}>{c.label}</button>
            ))}
          </div>
          {categoryNote && <span className="fld-hint">{categoryNote}</span>}
        </div>

        <div className="fld">
          <span className="fld-label">Shift coverage</span>
          <div className={`seg${coverageOpts.length > 3 ? " wrap" : ""}`}>
            {coverageOpts.map((key) => {
              const meta = COVERAGE_META[key];
              const Icon = meta.icon;
              return (
                <button type="button" key={key} className={draftMode === key ? "active" : ""} onClick={() => setShiftMode(key)}>
                  {Icon && <Icon size={14} />} <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
          {pastLunchToday && !(draftClientCoverage && draftClientCoverage.am && !draftClientCoverage.pm && !draftClientCoverage.ev) && <span className="fld-hint">It's already past 12:00 PM, so Morning / Whole day isn't available for today's entry.</span>}
          {!pastLunchToday && draftSelectedClient && draftClientCoverage && !(draftClientCoverage.am && draftClientCoverage.pm) && (
            <span className="fld-hint">
              "{draftSelectedClient.name}"'s hours are {formatTime12(normalizeClient(draftSelectedClient).timeIn)}–{formatTime12(normalizeClient(draftSelectedClient).timeOut)}, so only coverage that fits those hours is shown.
            </span>
          )}
          {!categoryIsEvening && <span className="fld-hint">Choose Evening or Overtime above to log evening hours.</span>}
        </div>

        {(draftMode === "full" || draftMode === "am") && (
          <div className="seg-card seg-am">
            <div className="seg-card-title"><span className="seg-ico"><Sun size={16} /></span> Morning</div>
            <div className="fld"><label>Morning in</label><TimeInput12 aria-label="Morning in" value={draft.amIn} onChange={(v) => setDraft((d) => ({ ...d, amIn: v }))} /></div>
            <div className="fld"><label>Lunch out</label><TimeInput12 aria-label="Lunch out" value={draft.amOut} onChange={(v) => setDraft((d) => ({ ...d, amOut: v }))} /></div>
          </div>
        )}
        {(draftMode === "full" || draftMode === "pm" || draftMode === "pmev") && (
          <div className="seg-card seg-pm">
            <div className="seg-card-title"><span className="seg-ico"><Sunset size={16} /></span> Afternoon</div>
            <div className="fld"><label>Lunch in</label><TimeInput12 aria-label="Lunch in" value={draft.pmIn} onChange={(v) => setDraft((d) => ({ ...d, pmIn: v }))} /></div>
            <div className="fld"><label>Afternoon out</label><TimeInput12 aria-label="Afternoon out" value={draft.pmOut} onChange={(v) => setDraft((d) => ({ ...d, pmOut: v }))} /></div>
            <span className="fld-hint">Left early? Set the actual time you clocked out.</span>
          </div>
        )}
        {(draftMode === "ev" || draftMode === "pmev") && (
          <div className="seg-card seg-ev">
            <div className="seg-card-title"><span className="seg-ico"><Moon size={16} /></span> Evening</div>
            <div className="fld"><label>Evening in</label><TimeInput12 aria-label="Evening in" value={draft.evIn} onChange={(v) => setDraft((d) => ({ ...d, evIn: v }))} /></div>
            <div className="fld"><label>Evening out</label><TimeInput12 aria-label="Evening out" value={draft.evOut} onChange={(v) => setDraft((d) => ({ ...d, evOut: v }))} /></div>
          </div>
        )}

        <div className="total-strip"><span>Total for this entry</span><b>{formatHours(segmentHours(draft))}</b></div>

        <div className="fld">
          <label htmlFor="d-task">Task / remarks <em>(optional)</em></label>
          <input id="d-task" type="text" maxLength={500} placeholder="What are you working on?" value={draft.task} onChange={(e) => setDraft((d) => ({ ...d, task: e.target.value }))} />
        </div>
      </Sheet>

      {/* ---------- sheet: host client ---------- */}
      <Sheet
        open={clientSheet}
        onClose={resetClientForm}
        title={editingClientId ? "Edit host client" : "Add host client"}
        labelId="client-sheet-title"
        footerClass="is-2-1"
        footer={
          <>
            <button type="button" className="btn" onClick={resetClientForm}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={addClient}>
              {editingClientId ? "Save changes" : <><Plus size={18} /> Add host client</>}
            </button>
          </>
        }
      >
        <div className="fld">
          <label htmlFor="c-name">Office / company <span className="req">*</span></label>
          <input
            id="c-name" value={newClientName} maxLength={CLIENT_NAME_MAX} aria-required="true" aria-invalid={!!clientError}
            onChange={(e) => { setNewClientName(e.target.value); setClientError(""); }}
            placeholder="e.g. City Hall — IT Office"
          />
          {clientError && <span className="fld-error" role="alert">{clientError}</span>}
        </div>
        <div className="fld">
          <span className="fld-label">Type</span>
          <div className="seg">
            {Object.entries(COMPANY_TYPES).map(([key, meta]) => (
              <button type="button" key={key} className={newClientType === key ? "active" : ""} onClick={() => applyClientTypePreset(key)}>{meta.label}</button>
            ))}
          </div>
        </div>
        <div className="fld">
          <span className="fld-label">Working days</span>
          <div className="days">
            {WEEKDAYS.map((d) => (
              <button type="button" key={d.id} className={newClientDays.includes(d.id) ? "active" : ""} onClick={() => toggleNewClientDay(d.id)} aria-pressed={newClientDays.includes(d.id)}>{d.short}</button>
            ))}
          </div>
        </div>
        <div className="fld"><label>Time in</label><TimeInput12 aria-label="Time in" value={newClientTimeIn} onChange={setNewClientTimeIn} /></div>
        <div className="fld"><label>Time out</label><TimeInput12 aria-label="Time out" value={newClientTimeOut} onChange={setNewClientTimeOut} /></div>
        <div className="notice">
          <Info size={16} />
          <span>
            {formatTime12(newClientTimeIn)}–{formatTime12(newClientTimeOut)} = {formatHours(dailyHoursFor({ days: newClientDays, timeIn: newClientTimeIn, timeOut: newClientTimeOut }))} a day
            (lunch break already excluded), on {scheduleDaysLabel({ days: newClientDays })}.
          </span>
        </div>
      </Sheet>

      {/* ---------- sheet: trainee setup ---------- */}
      <Sheet
        open={setupSheet}
        onClose={() => setSetupSheet(false)}
        title="Trainee details"
        labelId="setup-sheet-title"
        footer={<button type="button" className="btn btn-primary" onClick={() => setSetupSheet(false)}>Done</button>}
      >
        <div className={`fld${setupErrors.name ? " has-error" : ""}`}>
          <label htmlFor="s-name">Trainee name <span className="req">*</span></label>
          <input
            id="s-name" value={studentName} maxLength={80} aria-required="true" aria-invalid={!!setupErrors.name} placeholder="Juan Dela Cruz"
            onChange={(e) => { setStudentName(filterTraineeNameInput(e.target.value)); setSetupErrors((x) => ({ ...x, name: undefined })); }}
            onBlur={() => setSetupErrors((x) => ({ ...x, name: traineeNameProblem(studentName) || undefined }))}
          />
          {setupErrors.name ? <span className="fld-error" role="alert">{setupErrors.name}</span> : <span className="fld-hint">Printed on your PDF report.</span>}
        </div>
        <div className="fld">
          <label htmlFor="s-hours">Required hours</label>
          <input
            id="s-hours" type="text" value={targetHoursInput} readOnly aria-readonly="true"
          />
          <span className="fld-hint">Set by your school. Ask your coordinator if it needs to change.</span>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!confirmDialog}
        title={confirmIsEntry ? "Delete this entry?" : "Remove this host client?"}
        message={
          confirmIsEntry
            ? confirmTarget
              ? `Are you sure you want to delete the entry for ${formatDateLong(confirmTarget.date)}? This can't be undone.`
              : "Are you sure you want to delete this entry? This can't be undone."
            : confirmTarget
            ? `Are you sure you want to remove "${confirmTarget.name}"? It has no duty log entries, so this is safe.`
            : "Are you sure you want to remove this host client?"
        }
        yes={`Yes, ${confirmIsEntry ? "delete" : "remove"}`}
        onYes={confirmDialogAction}
        onNo={cancelConfirm}
      />
    </div>
  );
}
