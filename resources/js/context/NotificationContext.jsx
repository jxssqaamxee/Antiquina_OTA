import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getUserStorage, setUserStorage } from "../utils/storage";
import { useAuth } from "./AuthContext";
import {
  fireSystemNotification,
  getPermission,
  requestPermission,
} from "../utils/notifications";
import { uid } from "../utils/time";

const HISTORY_KEY = "notifications-v1";
const MAX_HISTORY = 200; // same cap as the server (LogbookRules::MAX_NOTIFICATIONS)

const EMPTY = [];

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  // Same account-scoping as the logbook data — otherwise Trainee B signing
  // in would see Trainee A's notification history (and vice versa).
  const userId = user?.sub || user?.email || null;

  // The list is stored together with the account it belongs to, so a render that still
  // holds the previous account's list can never be written into the new account's storage.
  const [store, setStore] = useState({ owner: null, items: EMPTY });
  const history = store.owner === userId ? store.items : EMPTY;
  const setHistory = useCallback(
    (next) => setStore((prev) => ({ ...prev, items: typeof next === "function" ? next(prev.items) : next })),
    []
  );
  const [permission, setPermission] = useState(() => getPermission());

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
    return result;
  }, []);

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
    }),
    [history, unreadCount, permission, notify, markAllRead, clearHistory, enableSystemNotifications]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}
