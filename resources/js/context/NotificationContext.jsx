import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

  // Load (and reload, if a different account signs in) this account's
  // notification history.
  useEffect(() => {
    setStore({ owner: userId, items: userId ? getUserStorage(HISTORY_KEY, userId) || [] : EMPTY });
  }, [userId]);

  useEffect(() => {
    if (!userId || store.owner !== userId) return;
    setUserStorage(HISTORY_KEY, userId, store.items.slice(0, MAX_HISTORY));
  }, [store, userId]);

  const markAllRead = useCallback(() => {
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

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
    [history, unreadCount, permission, notify, markAllRead, clearHistory, enableSystemNotifications,
      pushStatus, turnOnBackgroundAlerts, turnOffBackgroundAlerts, testBackgroundAlert, alertsOn, alertsBusy, toggleAlerts]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}
