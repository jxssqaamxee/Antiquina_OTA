import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, History, FileText, User, Plus } from "lucide-react";

// Bottom tab bar (sclf_APP style): two tabs, a raised "+" for a new duty day,
// two more tabs. On the Logbook page the tabs switch the in-page tab; from the
// Profile page they go back to the logbook (and "+" opens the add sheet there).
export default function MobileTabBar({ tab, onTab, onAdd, historyCount = 0 }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onProfile = pathname.startsWith("/profile");
  const tick = () => { try { navigator.vibrate?.(8); } catch { /* ignore */ } };

  const tabBtn = ({ id, label, icon: Icon, badge }) => {
    const active = !onProfile && tab === id;
    const cls = `tabbar-item${active ? " is-active" : ""}`;
    const content = (
      <>
        <span className="tabbar-icon">
          <Icon size={22} strokeWidth={active ? 2.4 : 2} />
          {badge > 0 && <i className="tabbar-badge">{badge > 99 ? "99+" : badge}</i>}
        </span>
        <span className="tabbar-label">{label}</span>
      </>
    );
    return onTab && !onProfile ? (
      <button key={id} type="button" className={cls} aria-current={active ? "page" : undefined}
        onClick={() => { tick(); onTab(id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{content}</button>
    ) : (
      <Link key={id} to="/logbook" className={cls} state={{ tab: id }} onClick={tick}>{content}</Link>
    );
  };

  const add = () => {
    tick();
    if (onAdd) onAdd();
    else navigate("/logbook", { state: { tab: "log", add: true } });
  };

  return (
    <nav className="tabbar" aria-label="Main navigation">
      {tabBtn({ id: "log", label: "Logbook", icon: BookOpen })}
      {tabBtn({ id: "history", label: "History", icon: History, badge: historyCount })}
      <button type="button" className="tabbar-fab" onClick={add} aria-label="Add a duty day" aria-haspopup="dialog">
        <span className="tabbar-fab-btn"><Plus size={26} strokeWidth={2.6} /></span>
        <span className="tabbar-label">Add day</span>
      </button>
      {tabBtn({ id: "reports", label: "Reports", icon: FileText })}
      <Link to="/profile" className={`tabbar-item${onProfile ? " is-active" : ""}`} aria-current={onProfile ? "page" : undefined} onClick={tick}>
        <span className="tabbar-icon"><User size={22} strokeWidth={onProfile ? 2.4 : 2} /></span>
        <span className="tabbar-label">Profile</span>
      </Link>
    </nav>
  );
}
