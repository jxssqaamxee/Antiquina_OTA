import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellRing, CheckCheck, ClipboardCheck, Inbox, UserCheck, UserPlus, Layers } from "lucide-react";
import Tooltip from "../shared/Tooltip";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useCoordinatorNotifications, timeAgo } from "../../context/CoordinatorNotificationsContext";

const ICONS = {
  entry_submitted: ClipboardCheck,
  registration_pending: UserCheck,
  trainee_joined: UserPlus,
  section_assigned: Layers,
  section_released: Layers,
};
const PREVIEW = 6; // the dropdown shows the latest few; the full list lives on the Notifications page

/**
 * Coordinator bell, same behaviour as sclf_APP's NotificationBell: a dropdown with the latest notices, a
 * "Mark all as read" link and "View all notifications", which opens the Notifications page in the sidebar.
 * Tapping a notice marks it read and opens the screen it is about (or the Notifications page, with that notice
 * highlighted, when it has no screen of its own). No modal.
 *
 *   tabs         keys of the coordinator sidebar, so a notice can only open a screen that exists
 *   onOpenTab(key, state?)  switch the dashboard to that screen
 */
export default function CoordinatorBell({ tabs = [], onOpenTab }) {
  const ctx = useCoordinatorNotifications();
  const { theme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const t = triggerRef.current, m = menuRef.current;
      if (!t || !m) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.innerHeight, gap = 12, r = t.getBoundingClientRect();
      const width = Math.min(380, vw - gap * 2), top = r.bottom + 8;
      m.style.width = `${width}px`;
      m.style.top = `${top}px`;
      m.style.left = "auto";
      m.style.right = `${Math.max(gap, Math.min(vw - r.right, vw - width - gap))}px`;
      m.style.maxHeight = `${Math.max(200, vh - top - gap)}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    ctx?.reload();
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx) return null;
  const { items, unread, loading, markRead, markAll } = ctx;
  const hasPage = tabs.includes("notifications");

  const openItem = (n) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (tabs.includes(n.tab) && n.tab !== "dashboard") onOpenTab?.(n.tab);
    else if (hasPage) onOpenTab?.("notifications", { highlight: n.id });
  };
  const viewAll = () => { setOpen(false); if (hasPage) onOpenTab?.("notifications"); };

  return (
    <>
      <Tooltip label={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}>
        <button type="button" ref={triggerRef} className="ds-icon-btn cn-bell" onClick={() => setOpen((v) => !v)}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="true" aria-expanded={open}>
          {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
          {unread > 0 && <span className="cn-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </Tooltip>

      {open && createPortal(
        <div ref={menuRef} className="am-menu cn-pop" role="menu" aria-label="Notifications" data-occ-theme={theme}>
          <div className="cn-pop-head">
            <b>Notifications</b>
            {unread > 0 && <button type="button" className="cn-link" onClick={markAll}><CheckCheck size={14} /> Mark all as read</button>}
          </div>

          <div className="cn-pop-list">
            {loading && <><i className="cn-skel" /><i className="cn-skel" /></>}
            {!loading && items.length === 0 && <div className="cn-pop-empty"><Inbox size={22} /><span>You’re all caught up.</span></div>}
            {!loading && items.slice(0, PREVIEW).map((n) => {
              const Icon = ICONS[n.type] || Bell;
              return (
                <button type="button" key={n.id} role="menuitem" className={`cn-pop-item${n.read ? "" : " is-unread"}`} onClick={() => openItem(n)}>
                  <span className="cn-pop-ico"><Icon size={15} aria-hidden="true" /></span>
                  <span className="cn-pop-body">
                    <span className="cn-pop-title">{n.title}</span>
                    {n.message && <span className="cn-pop-msg">{n.message}</span>}
                    <span className="cn-pop-time">{timeAgo(n.time)}</span>
                  </span>
                  {!n.read && <i className="cn-dot" aria-label="Unread" />}
                </button>
              );
            })}
          </div>

          {hasPage && (
            <>
              <div className="am-divider" />
              <button type="button" className="am-item" role="menuitem" onClick={viewAll}><Bell size={16} /> View all notifications</button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
