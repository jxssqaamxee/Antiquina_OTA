import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, CheckCheck, Megaphone, Trash2 } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import Sheet from "./Sheet";

import Tooltip from "./Tooltip";
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
  const { history, unreadCount, markAllRead, markGeneralRead, markRead, clearHistory } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) markGeneralRead(); // announcements stay unread until the person taps them
  }

  // An announcement notice: mark it read, close the bell and open the Announcements page.
  function openAnnouncement(n) {
    markRead(n.id);
    setOpen(false);
    navigate("/announcements");
  }

  return (
    <>
      <Tooltip label={"Notifications"}><button type="button" className="icon-btn bell-btn" onClick={toggle} aria-label="Notifications">
        {unreadCount > 0 ? <BellRing size={19} /> : <Bell size={19} />}
        {unreadCount > 0 && <span className="bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button></Tooltip>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        labelId="notif-title"
        footer={history.length > 0 ? (
          <>
            {unreadCount > 0 && <button type="button" className="btn" onClick={markAllRead}><CheckCheck size={16} /> Mark all read</button>}
            <button type="button" className="btn" onClick={clearHistory}><Trash2 size={16} /> Clear all</button>
          </>
        ) : null}
      >
        <div className="notif-list">
          {history.length === 0 && (
            <div className="empty"><b>Nothing yet</b>Your milestones and shift reminders will show up here.</div>
          )}
          {history.map((n) => {
            const body = (
              <>
                <div className="notif-item-title">
                  {n.type === "announcement" && <Megaphone size={13} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }} />}
                  {n.title}
                  {!n.read && <i aria-label="Unread" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, marginLeft: 8, background: "var(--accent-text, #4f46e5)" }} />}
                </div>
                {n.message && <div className="notif-item-msg">{n.message}</div>}
                <div className="notif-item-time">{timeAgo(n.time)}{n.type === "announcement" ? " · Tap to open" : ""}</div>
              </>
            );
            return n.type === "announcement" ? (
              <button type="button" key={n.id} className={`notif-item type-${n.type}`} onClick={() => openAnnouncement(n)}
                style={{ textAlign: "left", width: "100%", font: "inherit", color: "inherit", cursor: "pointer" }}>{body}</button>
            ) : (
              <div className={`notif-item type-${n.type}`} key={n.id}>{body}</div>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
