import React, { useState } from "react";
import { Bell, BellRing, Trash2 } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import Sheet from "./Sheet";

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const { history, unreadCount, markAllRead, clearHistory } = useNotifications();
  const [open, setOpen] = useState(false);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) markAllRead();
      return next;
    });
  }

  return (
    <>
      <button type="button" className="icon-btn bell-btn" onClick={toggle} aria-label="Notifications">
        {unreadCount > 0 ? <BellRing size={19} /> : <Bell size={19} />}
        {unreadCount > 0 && <span className="bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        labelId="notif-title"
        footer={history.length > 0 ? (
          <button type="button" className="btn" onClick={clearHistory}><Trash2 size={16} /> Clear all</button>
        ) : null}
      >
        <div className="notif-list">
          {history.length === 0 && (
            <div className="empty"><b>Nothing yet</b>Your milestones and shift reminders will show up here.</div>
          )}
          {history.map((n) => (
            <div className={`notif-item type-${n.type}`} key={n.id}>
              <div className="notif-item-title">{n.title}</div>
              {n.message && <div className="notif-item-msg">{n.message}</div>}
              <div className="notif-item-time">{timeAgo(n.time)}</div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
