import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, ClipboardCheck, Trash2, UserCheck, UserPlus, Layers } from "lucide-react";
import Sheet from "../shared/Sheet";
import Tooltip from "../shared/Tooltip";
import useLoad from "../../hooks/useLoad";
import { coordinatorService as svc } from "../../services/coordinatorService";
import { showToast } from "../../utils/eventBus";
import { errorMessage } from "../../config/axiosConfig";

const POLL = 20000; // quiet refetch while the tab is visible (useLoad pauses it while hidden)

const ICONS = {
  entry_submitted: ClipboardCheck,
  registration_pending: UserCheck,
  trainee_joined: UserPlus,
  section_assigned: Layers,
  section_released: Layers,
};

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * The coordinator's bell: trainee submissions, registrations, new trainees in the section, section changes.
 *
 * Isolation: the list comes ONLY from GET /coordinator/notifications, which answers for the signed-in account (the
 * server derives everything from the session; no user id is sent). Nothing is kept in localStorage or any shared
 * store: the state lives in this component, which the shell mounts with key = account id, so signing in as someone
 * else on the same browser always starts from an empty bell.
 *
 *   userId   the signed-in coordinator (only used to restart the load if it ever changes)
 *   tabs     keys of the coordinator sidebar, so a notice can only open a screen that exists
 *   onOpenTab(key)  switch the dashboard to that screen
 */
export default function CoordinatorBell({ userId, tabs = [], onOpenTab }) {
  const [data, reload, , meta] = useLoad(() => svc.notifications(), { interval: POLL, deps: [userId] });
  const [open, setOpen] = useState(false);
  // Optimistic marks, thrown away every time the server's list arrives (the server is the truth: a re-raised notice
  // keeps its id but is unread again).
  const [readIds, setReadIds] = useState(() => new Set());
  const [goneIds, setGoneIds] = useState(() => new Set());
  const [failed, setFailed] = useState("");
  const seen = useRef(null); // signatures (id + time) already shown; null until the first list arrives

  useEffect(() => { setReadIds(new Set()); setGoneIds(new Set()); }, [data]);

  const items = useMemo(
    () => (data?.notifications || []).filter((n) => !goneIds.has(n.id)).map((n) => ({ ...n, read: n.read || readIds.has(n.id) })),
    [data, readIds, goneIds]
  );
  const unreadInList = (data?.notifications || []).filter((n) => !n.read).length;
  const beyondList = Math.max(0, (data?.unread_count || 0) - unreadInList); // unread ones older than what the list shows
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

  const openItem = (n) => {
    if (!n.read) { setReadIds((s) => new Set(s).add(n.id)); run(() => svc.markNotificationsRead([n.id])); }
    setOpen(false);
    if (tabs.includes(n.tab)) onOpenTab?.(n.tab);
  };
  const markAll = () => { setReadIds(new Set(items.map((n) => n.id))); run(() => svc.markNotificationsRead(null)); };
  const clearAll = () => { setGoneIds(new Set(items.map((n) => n.id))); run(() => svc.clearNotifications()); };

  return (
    <>
      <Tooltip label="Notifications">
        <button type="button" className="ds-icon-btn cn-bell" onClick={() => { setOpen(true); reload(); }}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="dialog">
          {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
          {unread > 0 && <span className="cn-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </Tooltip>

      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications" labelId="coord-notif-title"
        footer={items.length > 0 ? (
          <>
            {unread > 0 && <button type="button" className="btn" onClick={markAll}><CheckCheck size={16} /> Mark all read</button>}
            <button type="button" className="btn" onClick={clearAll}><Trash2 size={16} /> Clear all</button>
          </>
        ) : null}>
        <div className="notif-list">
          {failed && <p role="alert" className="st-error">{failed}</p>}
          {items.length === 0 && (
            <div className="empty"><b>{meta.loading && !data ? "Loading…" : "Nothing yet"}</b>{!(meta.loading && !data) && "Submissions, registrations and new trainees in your section will show up here."}</div>
          )}
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button type="button" key={n.id} className={`notif-item cn-item type-${n.type}${n.read ? "" : " is-unread"}`} onClick={() => openItem(n)}>
                <div className="notif-item-title">
                  <Icon size={14} aria-hidden="true" className="cn-item-icon" />
                  {n.title}
                  {!n.read && <i className="cn-dot" aria-label="Unread" />}
                </div>
                {n.message && <div className="notif-item-msg">{n.message}</div>}
                <div className="notif-item-time">{timeAgo(n.time)}{tabs.includes(n.tab) ? " · Tap to open" : ""}</div>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
