import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, History, FileText, User } from "lucide-react";

// Bottom tab bar for phones (hidden on laptops/desktops by CSS), like
// sclf_APP's MobileBottomNav. On the Logbook page the first three tabs switch
// the in-page tab; Profile is its own route.
export default function MobileTabBar({ tab, onTab, historyCount = 0 }) {
  const { pathname } = useLocation();
  const onProfile = pathname.startsWith("/profile");

  const items = [
    { id: "log", label: "Logbook", icon: BookOpen },
    { id: "history", label: "History", icon: History, badge: historyCount },
    { id: "reports", label: "Reports", icon: FileText },
  ];

  const tick = () => { try { navigator.vibrate?.(8); } catch { /* ignore */ } };

  return (
    <nav className="tabbar" aria-label="Main navigation">
      {items.map(({ id, label, icon: Icon, badge }) => {
        const active = !onProfile && tab === id;
        const cls = `tabbar-item${active ? " is-active" : ""}`;
        const content = (
          <>
            <span className="tabbar-icon"><Icon size={22} strokeWidth={active ? 2.4 : 2} />{badge > 0 && <i className="tabbar-badge">{badge > 99 ? "99+" : badge}</i>}</span>
            <span className="tabbar-label">{label}</span>
          </>
        );
        return onTab && !onProfile ? (
          <button key={id} type="button" className={cls} aria-current={active ? "page" : undefined}
            onClick={() => { tick(); onTab(id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{content}</button>
        ) : (
          <Link key={id} to="/logbook" className={cls} state={{ tab: id }} onClick={tick}>{content}</Link>
        );
      })}
      <Link to="/profile" className={`tabbar-item${onProfile ? " is-active" : ""}`} aria-current={onProfile ? "page" : undefined} onClick={tick}>
        <span className="tabbar-icon"><User size={22} strokeWidth={onProfile ? 2.4 : 2} /></span>
        <span className="tabbar-label">Profile</span>
      </Link>
    </nav>
  );
}
