import React, { useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronDown, ChevronUp, ClipboardCheck, Layers, Trash2, UserCheck, UserPlus } from "lucide-react";
import { Btn, Card } from "./ui";
import { useCoordinatorNotifications, timeAgo } from "../../context/CoordinatorNotificationsContext";

const ICONS = { entry_submitted: ClipboardCheck, registration_pending: UserCheck, trainee_joined: UserPlus, section_assigned: Layers, section_released: Layers };

/**
 * Coordinator > Notifications (a sidebar page, like sclf_APP's /app/notifications). Full list with Mark all as read,
 * Clear all, and per-notice Open / Delete. Details expand inside the row, so there is no pop-up.
 *   tabs       sidebar keys; Open only appears for screens that exist
 *   go(key)    switch screen
 *   highlight  id of the notice the bell sent us here for (scrolled to, expanded and flashed)
 */
export default function NotificationsPanel({ tabs = [], go, highlight = null }) {
  const ctx = useCoordinatorNotifications();
  const [openId, setOpenId] = useState(highlight);
  const [flash, setFlash] = useState(highlight);
  const ready = !!ctx && !ctx.loading;

  useEffect(() => { if (highlight) { setOpenId(highlight); setFlash(highlight); } }, [highlight]);
  useEffect(() => {
    if (!flash || !ready) return undefined;
    document.getElementById(`cn-row-${flash}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash, ready]);

  if (!ctx) return null;
  const { items, unread, loading, failed, markRead, markAll, remove, clearAll } = ctx;

  const toggle = (n) => {
    if (!n.read) markRead(n.id);
    setOpenId((cur) => (cur === n.id ? null : n.id));
  };

  return (
    <Card title="Notifications">
      <div className="cn-page-tools">
        <span className="st-muted">{unread > 0 ? `${unread} unread` : "All caught up"}</span>
        <div className="cn-page-btns">
          {unread > 0 && <Btn onClick={markAll}><CheckCheck size={16} /> Mark all as read</Btn>}
          {items.length > 0 && <Btn onClick={clearAll}><Trash2 size={16} /> Clear all</Btn>}
        </div>
      </div>
      {failed && <p role="alert" className="st-error">{failed}</p>}
      {loading && <div className="cn-skel cn-skel-lg" />}
      {!loading && items.length === 0 && (
        <div className="st-empty"><b>Nothing yet</b>Submissions, registrations and new trainees in your section will show up here.</div>
      )}
      <ul className="cn-page-list">
        {items.map((n) => {
          const Icon = ICONS[n.type] || Bell;
          const isOpen = openId === n.id;
          const canOpen = tabs.includes(n.tab) && n.tab !== "dashboard";
          return (
            <li key={n.id} id={`cn-row-${n.id}`} className={`cn-row${n.read ? "" : " is-unread"}${flash === n.id ? " is-flash" : ""}`}>
              <button type="button" className="cn-row-main" onClick={() => toggle(n)} aria-expanded={isOpen}>
                <span className="cn-pop-ico"><Icon size={16} aria-hidden="true" /></span>
                <span className="cn-pop-body">
                  <span className="cn-pop-title">{n.title}{!n.read && <i className="cn-dot" aria-label="Unread" />}</span>
                  <span className={`cn-pop-msg${isOpen ? " is-full" : ""}`}>{n.message}</span>
                  <span className="cn-pop-time">{timeAgo(n.time)} · {new Date(n.time).toLocaleString()}</span>
                </span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && (
                <div className="cn-row-act">
                  {canOpen && <Btn kind="primary" onClick={() => go?.(n.tab)}>Open</Btn>}
                  <Btn onClick={() => remove(n.id)}><Trash2 size={15} /> Delete</Btn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
