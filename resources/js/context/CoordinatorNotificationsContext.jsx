import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import useLoad from "../hooks/useLoad";
import { coordinatorService as svc } from "../services/coordinatorService";
import { showToast } from "../utils/eventBus";
import { errorMessage } from "../config/axiosConfig";

const POLL = 20000; // quiet refetch while the tab is visible (useLoad pauses it while hidden)
const Ctx = createContext(null);

/** null for anyone who is not a coordinator (the admin shell simply has no bell). */
export const useCoordinatorNotifications = () => useContext(Ctx);

export function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * One source of truth for the coordinator's notices, shared by the bell dropdown, the sidebar badge and the
 * Notifications page, so reading one anywhere clears it everywhere.
 * Isolation is unchanged: the list comes only from GET /coordinator/notifications (the server uses the session);
 * nothing is stored in the browser, and the shell mounts this with key = account id.
 */
export function CoordinatorNotificationsProvider({ userId, children }) {
  const [data, reload, , meta] = useLoad(() => svc.notifications(), { interval: POLL, deps: [userId] });
  const [readIds, setReadIds] = useState(() => new Set());
  const [goneIds, setGoneIds] = useState(() => new Set());
  const [failed, setFailed] = useState("");
  const seen = useRef(null);

  useEffect(() => { setReadIds(new Set()); setGoneIds(new Set()); }, [data]);

  const items = useMemo(
    () => (data?.notifications || []).filter((n) => !goneIds.has(n.id)).map((n) => ({ ...n, read: n.read || readIds.has(n.id) })),
    [data, readIds, goneIds]
  );
  const unreadInList = (data?.notifications || []).filter((n) => !n.read).length;
  const beyondList = Math.max(0, (data?.unread_count || 0) - unreadInList);
  const unread = items.filter((n) => !n.read).length + beyondList;

  // A toast for notices that arrived since the last poll (never for the very first load).
  useEffect(() => {
    if (!data) return;
    const sig = (n) => `${n.id}|${n.time}`;
    const unreadNow = data.notifications.filter((n) => !n.read);
    if (seen.current === null) { seen.current = new Set(data.notifications.map(sig)); return; }
    const fresh = unreadNow.filter((n) => !seen.current.has(sig(n)));
    data.notifications.forEach((n) => seen.current.add(sig(n)));
    if (!fresh.length) return;
    showToast({
      type: "info", key: "coordinator-new-notice", duration: 7000,
      title: fresh.length === 1 ? fresh[0].title : `${fresh.length} new notifications`,
      message: fresh.length === 1 ? fresh[0].message : "Open the bell to see them.",
    });
  }, [data]);

  const run = useCallback(async (fn) => {
    setFailed("");
    try { await fn(); } catch (e) { setFailed(errorMessage(e)); } finally { reload(); }
  }, [reload]);

  const markRead = useCallback((id) => { setReadIds((s) => new Set(s).add(id)); return run(() => svc.markNotificationsRead([id])); }, [run]);
  const markAll = useCallback(() => { setReadIds(new Set(items.map((n) => n.id))); return run(() => svc.markNotificationsRead(null)); }, [run, items]);
  const remove = useCallback((id) => { setGoneIds((s) => new Set(s).add(id)); return run(() => svc.deleteNotification(id)); }, [run]);
  const clearAll = useCallback(() => { setGoneIds(new Set(items.map((n) => n.id))); return run(() => svc.clearNotifications()); }, [run, items]);

  const value = { items, unread, loading: meta.loading && !data, failed, reload, markRead, markAll, remove, clearAll };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
