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
  const {
    history, unreadCount, markAllRead, clearHistory, permission, enableSystemNotifications,
    pushStatus, turnOnBackgroundAlerts, turnOffBackgroundAlerts, testBackgroundAlert,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  async function test() {
    setNote("Sending…");
    const n = await testBackgroundAlert();
    setNote(n > 0 ? "Sent. Look for it in your notifications." : n === -1 ? "Background alerts are not set up on the server yet." : "No device received it. Turn alerts off and on again.");
  }

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
        {pushStatus === "install" && (
          <p className="notif-hint">To get reminders when the app is closed on iPhone: tap Share, then <b>Add to Home Screen</b>, and open OCCDL from the new icon.</p>
        )}
        {permission === "denied" && (
          <p className="notif-hint">Alerts are blocked for this app. Allow notifications for OCCDL in your phone settings, then come back.</p>
        )}
        {permission !== "granted" && permission !== "unsupported" && permission !== "denied" && pushStatus !== "install" && (
          <button type="button" className="notif-permission" onClick={enableSystemNotifications}>
            Turn on alerts for shift and clock-out reminders
          </button>
        )}
        {permission === "granted" && pushStatus === "off" && (
          <button type="button" className="notif-permission" onClick={turnOnBackgroundAlerts}>
            Turn on reminders for when the app is closed
          </button>
        )}
        {permission === "granted" && pushStatus === "on" && (
          <div className="notif-hint">
            Reminders reach you even when the app is closed.{" "}
            <button type="button" className="link-btn" onClick={test}>Send a test</button>{" · "}
            <button type="button" className="link-btn" onClick={turnOffBackgroundAlerts}>Turn off</button>
            {note && <div>{note}</div>}
          </div>
        )}
        {permission === "granted" && pushStatus === "unconfigured" && (
          <p className="notif-hint">Alerts work while the app is open. Closed-app reminders are not set up on the server yet.</p>
        )}
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
