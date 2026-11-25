import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getUserStorage, setUserStorage } from "../utils/storage";
import { useAuth } from "./AuthContext";
import {
  fireSystemNotification,
  getPermission,
  notificationsSupported as notificationsSupportedNow,
  requestPermission,
} from "../utils/notifications";
import { uid } from "../utils/time";
import { isTrainee } from "../utils/roles";
import { showToast } from "../utils/eventBus";
import { alertsTurnedOff, disablePush, enablePush, isPushSupported, needsHomeScreenInstall, sendTestPush, syncPush } from "../utils/push";

const HISTORY_KEY = "notifications-v1";
const MAX_HISTORY = 200; // same cap as the server (LogbookRules::MAX_NOTIFICATIONS)

const EMPTY = [];

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  // Same account-scoping as the logbook data — otherwise Trainee B signing
  // in would see Trainee A's notification history (and vice versa).
  // Admin / Coordinator accounts have no logbook sync or push, so they keep no trainee history here.
  const userId = user && isTrainee(user) ? (user.sub || user.email || null) : null;

  // The list is stored together with the account it belongs to, so a render that still
  // holds the previous account's list can never be written into the new account's storage.
  const [store, setStore] = useState({ owner: null, items: EMPTY });
  const history = store.owner === userId ? store.items : EMPTY;
  const setHistory = useCallback(
    (next) => setStore((prev) => ({ ...prev, items: typeof next === "function" ? next(prev.items) : next })),
    []
  );
  // What the screen holds right now, readable from event listeners without re-subscribing them.
  const storeRef = useRef(store);
  storeRef.current = store;
  // Set when the list was just replaced by the server's copy: the save effect must not write it straight back
  // (that would bump the revision and ping-pong between devices).
  const skipWrite = useRef(false);
  const [permission, setPermission] = useState(() => getPermission());
  // Background (closed-app) alerts: "on" | "off" | "unsupported" | "unconfigured" | "denied" | "install" | "error"
  const [pushStatus, setPushStatus] = useState(() => (isPushSupported() ? (getPermission() === "granted" && !alertsTurnedOff() ? "on" : "off") : needsHomeScreenInstall() ? "install" : "unsupported"));

  // Signed in with permission already granted: quietly (re)register this phone for push, so reminders
  // keep arriving after a redeploy, a new sign-in, or when the browser rotated its subscription.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    syncPush().then((s) => { if (live && s !== "off") setPushStatus(s); });
    return () => { live = false; };
  }, [userId]);

  // Tell the service worker whose reminders this install may show. A push for anyone else (a shared phone where
  // the previous trainee's address was not removed) is shown without any names, see public/sw.js.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "PUSH_USER", sub: userId || null })).catch(() => {});
  }, [userId]);

  // Keep this install registered while the app stays in use: every time the app comes back to the front or the
  // network returns (at most every 10 minutes), and at once when the service worker says the browser rotated
  // the push address (pushsubscriptionchange). Without this a rotated address was only fixed at the next sign-in.
  useEffect(() => {
    if (!userId) return undefined;
    let last = Date.now();
    const resync = (force = false) => {
      const now = Date.now();
      if (!force && now - last < 10 * 60 * 1000) return;
      last = now;
      syncPush().then((s) => { if (s !== "off") setPushStatus(s); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") resync(); };
    const onOnline = () => resync();
    const onMessage = (e) => { if (e.data?.type === "PUSH_SUBSCRIPTION_CHANGED") resync(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [userId]);

  // Load (and reload, if a different account signs in) this account's
  // notification history.
  useEffect(() => {
    setStore({ owner: userId, items: userId ? getUserStorage(HISTORY_KEY, userId) || [] : EMPTY });
  }, [userId]);

  useEffect(() => {
    if (!userId || store.owner !== userId) return;
    if (skipWrite.current) { skipWrite.current = false; return; }
    setUserStorage(HISTORY_KEY, userId, store.items.slice(0, MAX_HISTORY));
  }, [store, userId]);

  // Live: the server's list arrived (a coordinator announcement, another device, or a sync conflict).
  // sync.js already wrote it into storage; take it into the bell and tell the person about NEW unread notices.
  useEffect(() => {
    if (!userId) return undefined;
    const onApplied = (e) => {
      if (e.detail?.key !== HISTORY_KEY) return;
      const items = getUserStorage(HISTORY_KEY, userId);
      const next = Array.isArray(items) ? items : EMPTY;
      const prev = storeRef.current;
      if (prev.owner !== userId) return;
      const seen = new Set(prev.items.map((n) => n.id));
      const fresh = next.filter((n) => !n.read && !seen.has(n.id));
      skipWrite.current = true;
      setStore({ owner: userId, items: next });
      const ann = fresh.filter((n) => n.type === "announcement");
      if (ann.length) {
        showToast({
          type: "info", key: "new-announcement", duration: 7000,
          title: ann.length === 1 ? "New announcement" : `${ann.length} new announcements`,
          message: ann.length === 1 ? ann[0].title : "Open the bell to read them.",
        });
      }
    };
    window.addEventListener("occ-sync-applied", onApplied);
    return () => window.removeEventListener("occ-sync-applied", onApplied);
  }, [userId]);

  // Mark as read only when something actually changes (an unchanged list must not trigger a save).
  const markWhere = useCallback((pick) => {
    setStore((prev) => {
      if (!prev.items.some((n) => !n.read && pick(n))) return prev;
      return { ...prev, items: prev.items.map((n) => (!n.read && pick(n) ? { ...n, read: true } : n)) };
    });
  }, []);
  const markAllRead = useCallback(() => markWhere(() => true), [markWhere]);
  /** Opening the bell: everyday notices count as seen; announcements stay unread until the person taps them. */
  const markGeneralRead = useCallback(() => markWhere((n) => n.type !== "announcement"), [markWhere]);
  const markRead = useCallback((id) => markWhere((n) => n.id === id), [markWhere]);
  const markAnnouncementsRead = useCallback(() => markWhere((n) => n.type === "announcement"), [markWhere]);

  const clearHistory = useCallback(() => setHistory([]), []);

  // Bell history only. Toasts live in ToastContext (useToast) — keeping the two
  // apart is what stops the bell badge from growing on every click. Only
  // milestones and shift reminders should call this.
  const notify = useCallback((notification) => {
    const item = {
      id: uid(),
      type: notification.type || "info",
      title: notification.title,
      message: notification.message || "",
      time: new Date().toISOString(),
      read: false,
    };

    setHistory((prev) => [item, ...prev].slice(0, MAX_HISTORY));

    if (notification.system) {
      fireSystemNotification(item.title, item.message, notification.tag);
    }

    return item.id;
  }, []);

  const enableSystemNotifications = useCallback(async () => {
    const result = await requestPermission();
    setPermission(result);
    if (result === "granted") { setPushStatus(await enablePush()); setOffFlag(alertsTurnedOff()); } // also subscribe for closed-app reminders
    return result;
  }, []);

  const turnOnBackgroundAlerts = useCallback(async () => {
    const s = await enablePush();
    setPermission(getPermission());
    setOffFlag(alertsTurnedOff());
    setPushStatus(s);
    return s;
  }, []);

  const turnOffBackgroundAlerts = useCallback(async () => {
    await disablePush();
    setOffFlag(true);
    setPushStatus("off");
  }, []);

  const testBackgroundAlert = useCallback(() => sendTestPush(), []);

  // The avatar-menu switch for shift and clock-out reminders.
  //  ON  = this device may show them (permission granted, not switched off) and, when the server is set up, gets
  //        them with the app closed. OFF = nothing is shown on this device and its push address is dropped.
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [offFlag, setOffFlag] = useState(() => alertsTurnedOff());
  const alertsOn = permission === "granted" && !offFlag && pushStatus !== "off" && pushStatus !== "denied";

  /** Flips the switch. Resolves to "on" | "off" | "denied" | "install" | "unsupported" | "unconfigured" | "error". */
  const toggleAlerts = useCallback(async () => {
    if (alertsBusy) return alertsOn ? "on" : "off";
    setAlertsBusy(true);
    try {
      if (alertsOn) {
        // The switch flips at once; dropping this device's push address (a network call) finishes behind it.
        setOffFlag(true);
        setPushStatus("off");
        await disablePush();
        return "off";
      }
      if (!notificationsSupportedNow() && !isPushSupported()) return needsHomeScreenInstall() ? "install" : "unsupported";
      const perm = await requestPermission();
      setPermission(perm);
      if (perm === "denied") { setPushStatus("denied"); return "denied"; }
      if (perm !== "granted") return perm === "unsupported" ? (needsHomeScreenInstall() ? "install" : "unsupported") : "off";
      const status = await enablePush();
      setOffFlag(alertsTurnedOff());
      setPushStatus(status);
      return status === "error" ? "error" : status === "unconfigured" ? "unconfigured" : "on";
    } finally {
      setAlertsBusy(false);
    }
  }, [alertsBusy, alertsOn]);

  const unreadCount = useMemo(() => history.filter((n) => !n.read).length, [history]);

  const value = useMemo(
    () => ({
      history,
      unreadCount,
      permission,
      notify,
      markAllRead,
      markGeneralRead,
      markRead,
      markAnnouncementsRead,
      clearHistory,
      enableSystemNotifications,
      pushStatus,
      turnOnBackgroundAlerts,
      turnOffBackgroundAlerts,
      testBackgroundAlert,
      alertsOn,
      alertsBusy,
      toggleAlerts,
    }),
    [history, unreadCount, permission, notify, markAllRead, markGeneralRead, markRead, markAnnouncementsRead, clearHistory, enableSystemNotifications,
      pushStatus, turnOnBackgroundAlerts, turnOffBackgroundAlerts, testBackgroundAlert, alertsOn, alertsBusy, toggleAlerts]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}
