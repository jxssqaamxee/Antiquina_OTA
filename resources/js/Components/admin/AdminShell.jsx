import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clearPersistedUi } from "../../hooks/usePersistedTab";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Boxes, Camera, Check as CheckIcon, ChevronDown, ChevronUp, ClipboardList, Lock, LogOut, ShieldCheck, UserRound, Menu, Palette, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { usePopup } from "../../context/PopupContext";
import api, { errorMessage } from "../../config/axiosConfig";
import { useAppTheme } from "../../hooks/useAppTheme";
import useIsPhone from "../../hooks/useIsPhone";
import usePhoneTableLabels from "../../hooks/usePhoneTableLabels";
import { REGULAR_THEMES, BLACK_THEMES, THEMES, setTheme, saveThemeToAccount } from "../../utils/theme";
import AvatarPhoto from "../shared/AvatarPhoto";
import PhotoUploadModal from "../shared/PhotoUploadModal";
import DeveloperCredit from "../shared/DeveloperCredit";
import logo from "../../assets/images/site-logo.png";
import { Btn, Card, Field, Input, Notice, Row } from "./ui";
import TwoFactorPanel from "./TwoFactorPanel";
import CoordinatorBell from "./CoordinatorBell";
import { CoordinatorNotificationsProvider, useCoordinatorNotifications } from "../../context/CoordinatorNotificationsContext";
import "../shared/AccountMenu.css";
import "../../styles/admin.css";

import Tooltip from "../shared/Tooltip";
const themeLabel = (id) => THEMES.find((t) => t.id === id)?.label || "Default";
const COLLAPSE_KEY = "occ-sidebar-collapsed";
const DESKTOP_QUERY = "(min-width: 960px)";

const idLine = (user) => (user?.admin_id ? `${user?.role === "admin" ? "Administrator" : "Coordinator"} ID: ${user.admin_id}` : (user?.email || ""));

/**
 * Account menu: Profile settings · Theme (nine themes) · Sign out. (Changing the password lives in Profile settings > Security.)
 * variant "top"  = the avatar pill in the top bar (drops down).
 * variant "side" = the account row pinned at the bottom of the sidebar (opens beside / above it).
 */
function AdminAccountMenu({ variant = "top", collapsed = false, onEditProfile, onSignOut, signingOut }) {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [blackSet, setBlackSet] = useState(() => String(theme).startsWith("dark-"));
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const close = useCallback(() => { setOpen(false); setThemesOpen(false); }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const t = triggerRef.current, m = menuRef.current;
      if (!t || !m) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.innerHeight, gap = 12, r = t.getBoundingClientRect();
      const width = Math.min(variant === "side" ? 270 : 300, vw - gap * 2);
      m.style.width = `${width}px`;
      if (variant === "side") {
        const sb = t.closest(".ds-sidebar");
        const desktop = window.matchMedia(DESKTOP_QUERY).matches;
        const left = desktop && sb ? sb.getBoundingClientRect().right + gap : Math.max(gap, Math.min(r.left, vw - width - gap));
        m.style.top = "auto";
        m.style.right = "auto";
        m.style.left = `${left}px`;
        m.style.bottom = desktop ? `${Math.max(gap, vh - r.bottom)}px` : `${vh - r.top + 8}px`;
        m.style.maxHeight = `${Math.max(160, vh - gap * 2)}px`;
      } else {
        const top = r.bottom + 8;
        m.style.top = `${top}px`;
        m.style.bottom = "auto";
        m.style.left = "auto";
        m.style.right = `${Math.max(gap, Math.min(vw - r.right, vw - width - gap))}px`;
        m.style.maxHeight = `${Math.max(160, vh - top - gap)}px`;
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, themesOpen, variant]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") { close(); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  const options = blackSet ? BLACK_THEMES : REGULAR_THEMES;
  const pick = (id) => { setTheme(id); saveThemeToAccount(id); };
  const toggle = () => { setOpen((v) => !v); setThemesOpen(false); };

  return (
    <>
      {variant === "side" ? (
        <Tooltip label={user?.name || "Account"} disabled={!collapsed}><button type="button" ref={triggerRef} className="ds-user-row ds-user-row-btn" aria-label="Open account menu"
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <span className="ds-avatar"><AvatarPhoto user={user} /></span>
          <div className="ds-user-text" style={{ minWidth: 0 }}>
            <div className="ds-user-name">{user?.name || "Account"}</div>
            <div className="ds-user-email">{idLine(user)}</div>
          </div>
          {!collapsed && <ChevronUp size={15} className="ds-user-row-chevron" />}
        </button></Tooltip>
      ) : (
        <Tooltip label={"Account menu"}><button type="button" ref={triggerRef} className="ds-profile-btn" aria-label="Open account menu"
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <span className="ds-avatar"><AvatarPhoto user={user} /></span>
          <span className="ds-profile-btn-name">{user?.name || "Account"}</span>
          <ChevronDown size={16} className="ds-profile-chevron" />
        </button></Tooltip>
      )}

      {open && createPortal(
        <div ref={menuRef} className="am-menu st-menu" role="menu" aria-label="Account menu" data-occ-theme={theme}>
          <div className="am-head">
            <span className="am-head-avatar"><AvatarPhoto user={user} /></span>
            <span className="am-head-text"><b>{user?.name || "Account"}</b><small>{idLine(user)}</small></span>
          </div>

          <button type="button" className="am-item" role="menuitem" onClick={() => { close(); onEditProfile(); }}>
            <UserRound size={17} /> Profile settings
          </button>

          <button type="button" className="am-item" role="menuitem" aria-haspopup="true" aria-expanded={themesOpen}
            onClick={() => setThemesOpen((v) => !v)}>
            <Palette size={17} /> Theme <span className="am-pill">{themeLabel(theme)}</span>
          </button>
          {themesOpen && (
            <div className="am-themes" role="menu" aria-label="Choose theme">
              <div className="am-themes-head">
                <span className="am-themes-title">Choose Theme</span>
                <Tooltip label={blackSet ? "Show the white themes" : "Show the black themes"}><button type="button" className={`am-black-btn${blackSet ? " is-on" : ""}`} onClick={() => setBlackSet((v) => !v)}
                  aria-label={blackSet ? "Show the white themes" : "Show the black themes"}>{blackSet ? "White" : "Black"}</button></Tooltip>
              </div>
              {options.map((t) => (
                <button key={t.id} type="button" className="am-theme-opt" role="menuitemradio" aria-checked={theme === t.id} onClick={() => pick(t.id)}>
                  <span className={`am-swatch am-swatch-${t.swatch}`} />{t.label}
                  {theme === t.id && <CheckIcon size={15} className="am-check" />}
                </button>
              ))}
            </div>
          )}

          <div className="am-divider" />
          <button type="button" className="am-item am-danger" role="menuitem" onClick={onSignOut} disabled={signingOut}>
            <LogOut size={17} /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * Change-password form.
 * It opens as a dialog over the page (never inside the dashboard), closed by Cancel, Esc or a click outside.
 */
const EMPTY_PW = { current_password: "", password: "", password_confirmation: "" };

function PasswordPanel({ onDone, inline = false }) {
  const { updateUser } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [f, setF] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Inline (Profile Settings > Security) it starts CLOSED, so nothing can be typed or autofilled by mistake.
  const [open, setOpen] = useState(!inline);
  const dirty = !!(f.current_password || f.password || f.password_confirmation);
  const cancel = async () => {
    if (!inline) { onDone?.(); return; }
    if (dirty && !(await popup.confirm({
      title: "Discard password change?",
      message: "You started changing your password. Close it and discard what you typed?",
      okLabel: "Discard",
      cancelLabel: "Keep editing",
      danger: true,
    }))) return;
    setF(EMPTY_PW); setMsg(null); setOpen(false);
  };

  useEffect(() => {
    if (inline) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onDone?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.put("/profile/password", f);
      setF({ current_password: "", password: "", password_confirmation: "" });
      await updateUser(data.user);
      toast.success("Your other devices were signed out.", { title: "Password changed", key: "admin-password-changed" });
      if (inline) setOpen(false);
      onDone?.();
    } catch (e) { setMsg({ bad: true, text: errorMessage(e) }); } finally { setBusy(false); }
  }

  const body = (
    <>
      <Notice msg={msg} />
      <div className="st-grid st-pw-grid">
        <Field label="Current password"><Input type="password" autoComplete="current-password" autoFocus value={f.current_password} onChange={set("current_password")} /></Field>
        <Field label="New password"><Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
        <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={f.password_confirmation} onChange={set("password_confirmation")} /></Field>
      </div>
      <p className="st-muted" style={{ marginTop: 12 }}>At least 8 characters with upper and lower case letters and a number.</p>
      <div className="st-flex" style={{ marginTop: 14 }}>
        <Btn kind="primary" disabled={busy || !f.current_password || !f.password} onClick={save}>{busy ? "Saving…" : "Save password"}</Btn>
        <Btn onClick={cancel} disabled={busy}>Cancel</Btn>
      </div>
    </>
  );
  if (inline) {
    return open ? body : (
      <div className="st-flex" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div><b>Password</b><div className="st-muted" style={{ letterSpacing: ".12em" }}>••••••••••••</div></div>
        <Btn onClick={() => setOpen(true)}><Lock size={15} /> Change password</Btn>
      </div>
    );
  }

  return createPortal(
    <div className="st-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onDone?.(); }}>
      <div className="st-modal" role="dialog" aria-modal="true" aria-label="Change password"><Card title="Change password">{body}</Card></div>
    </div>,
    document.body
  );
}

/**
 * Profile Settings (same layout as sclf_APP's Profile Settings page): hero with photo + chips,
 * and Security (change password).
 * The Administrator / Coordinator ID and email were set when the account was created and stay locked.
 */
function ProfileSettings() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [msg, setMsg] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const roleLabel = user?.role === "admin" ? "Administrator" : "Coordinator";

  async function uploadPhoto(file) {
    const body = new FormData();
    body.append("photo", file);
    try {
      const { data } = await api.post("/profile/photo", body);
      await updateUser(data.user);
      toast.success("Photo updated", { key: "photo-updated" });
    } catch (e) { throw new Error(errorMessage(e, "The photo could not be saved. Please try again.")); }
  }

  async function removePhoto() {
    setPhotoOpen(false);
    try {
      const { data } = await api.delete("/profile/photo");
      await updateUser(data.user);
      toast.success("Photo removed", { key: "photo-updated" });
    } catch (e) { setMsg({ bad: true, text: errorMessage(e) }); }
  }

  return (
    <>
      <div className="st-card ds-me">
        <span className="ds-me-avatar-wrap">
          <Tooltip label={"Change profile photo"}><button type="button" className="ds-avatar ds-me-avatar" onClick={() => setPhotoOpen(true)} aria-label="Change profile photo">
            <AvatarPhoto user={user} />
          </button></Tooltip>
          <span className="ds-me-cam" aria-hidden="true"><Camera size={12} /></span>
        </span>
        <div className="ds-me-text">
          <h2 className="ds-me-name">{user?.name || "Account"}</h2>
          {user?.email && <p className="ds-me-email">{user.email}</p>}
          <div className="ds-chip-row">
            <span className="ds-chip ds-chip-accent">{roleLabel}</span>
            {user?.admin_id && <span className="ds-chip">{roleLabel} ID: {user.admin_id}</span>}
          </div>
        </div>
        <Btn className="ds-me-btn" onClick={() => setPhotoOpen(true)}><Camera size={15} /> {user?.has_profile_photo ? "Change photo" : "Add photo"}</Btn>
      </div>

      <Notice msg={msg} />
      <Card title="Security">
        <p className="ds-card-desc">Keep your sign-in details up to date and your account protected.</p>
        <PasswordPanel inline />
        <TwoFactorPanel />
      </Card>

      <PhotoUploadModal open={photoOpen} onClose={() => setPhotoOpen(false)} onAccept={uploadPhoto} title="Profile photo"
        onRemove={user?.has_profile_photo ? removePhoto : undefined} />
    </>
  );
}

/**
 * Phone tab bar (sclf_APP's MobileBottomNav): four shortcut tabs + "Menu", which opens the full sidebar.
 * While the sidebar is open the bar slides out of the way. The tabs switch sections (no page change), so they are buttons.
 */
function StaffTabBar({ tabs, active, hidden, menuOpen, onGo, onMenu }) {
  const tick = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };
  return (
    <nav className={`ds-bottomnav${hidden ? " is-hidden" : ""}`} aria-label="Quick navigation" inert={hidden ? "" : undefined}>
      {tabs.map(({ key, label, icon: Icon, short }) => {
        const on = key === active;
        return (
          <button key={key} type="button" className={`ds-bottomnav-item${on ? " is-active" : ""}`} aria-label={label} aria-current={on ? "page" : undefined}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => { tick(); if (on) document.querySelector(".ds-main")?.scrollTo?.({ top: 0, behavior: "smooth" }); else onGo(key); }}>
            <span className="ds-bottomnav-icon">{Icon && <Icon size={22} strokeWidth={on ? 2.3 : 2} />}</span>
            <span className="ds-bottomnav-label">{short || label}</span>
          </button>
        );
      })}
      <button type="button" className="ds-bottomnav-item" aria-label="Open menu" aria-haspopup="true" aria-expanded={menuOpen} aria-controls="ds-sidebar"
        tabIndex={hidden ? -1 : undefined} onClick={() => { tick(); onMenu(); }}>
        <span className="ds-bottomnav-icon"><Menu size={22} strokeWidth={2} /></span>
        <span className="ds-bottomnav-label">Menu</span>
      </button>
    </nav>
  );
}

/**
 * Admin / Coordinator frame, copied from sclf_APP's DashboardShell: collapsible sidebar (nav + account row),
 * top bar, page header, pinned footer.
 *
 *   nav         [{ key, label, icon, short? }]  the sections of this area (they replace the old tab strip)
 *   phoneTabs   keys of the (up to) four sections that get a tab in the phone bottom bar; default: the first four
 *   active      key of the open section
 *   onNavigate  (key) => void
 */
export default function AdminShell(props) {
  const { user } = useAuth();
  const body = <AdminShellInner {...props} />;
  // Coordinators get the shared notification state (bell, sidebar badge, Notifications page); key = account id.
  return user?.role === "coordinator" && user?.id != null
    ? <CoordinatorNotificationsProvider key={user.id} userId={user.id}>{body}</CoordinatorNotificationsProvider>
    : body;
}

function AdminShellInner({ roleLabel, nav = [], phoneTabs, active, onNavigate, title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const notif = useCoordinatorNotifications();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { tab: routeTab } = useParams();
  const { pathname, hash } = useLocation();
  const showProfile = routeTab === "profile" || (!routeTab && hash === "#profile"); // /admin/profile (old #profile links still open it)
  const [sidebarOpen, setSidebarOpen] = useState(false); // slide-over on narrow screens
  const [isDesktopWidth, setIsDesktop] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(DESKTOP_QUERY).matches));
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const isPhone = useIsPhone();
  usePhoneTableLabels();
  const isDesktop = isDesktopWidth && !isPhone; // a big phone turned sideways still gets the slide-over menu
  const railCollapsed = collapsed && isDesktop && !isPhone;

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const on = () => { setIsDesktop(mq.matches); if (mq.matches) setSidebarOpen(false); };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  function burger() {
    if (!isDesktop) { setSidebarOpen((v) => !v); return; }
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* storage can be blocked */ }
      return next;
    });
  }

  async function signOut() {
    setBusy(true);
    try { await logout(); clearPersistedUi(); } finally { navigate("/administrator", { replace: true }); }
  }

  const openProfile = () => {
    setSidebarOpen(false);
    navigate(`/${pathname.split("/")[1]}/profile`);
  };
  const go = (key, state) => { onNavigate?.(key, state); setSidebarOpen(false); };
  const activeItem = nav.find((n) => n.key === active);
  const tabs = (phoneTabs ? phoneTabs.map((k) => nav.find((n) => n.key === k)).filter(Boolean) : nav).slice(0, 4);
  const menuProps = { signingOut: busy, onSignOut: signOut, onEditProfile: openProfile };

  return (
    <div className={`ds-shell ds-layout${isPhone ? " ds-phone ds-staff-app" : ""}`}>
      <div className={`ds-sidebar-backdrop${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} aria-hidden={!sidebarOpen} />

      <nav id="ds-sidebar" className={`ds-sidebar${sidebarOpen ? " open" : ""}${railCollapsed ? " collapsed" : ""}`} aria-label="Sections">
        {isPhone && (
          <button type="button" className="ds-icon-btn ds-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        )}
        <Tooltip label={"OCCDL"} disabled={!railCollapsed}><div className="ds-brand">
          <img src={logo} alt="" />
          <span className="ds-brand-text">
            <span className="ds-brand-name">OCCDL</span>
            <span className="ds-brand-sub">Opol Community College</span>
          </span>
        </div></Tooltip>

        <div className="ds-nav-label">{roleLabel}</div>

        <div className="ds-nav-scroll">
          <ul className="ds-nav">
            {nav.map(({ key, label, icon: Icon }) => {
              const on = key === active && !showProfile;
              return (
                <li key={key}>
                  <Tooltip label={label} disabled={!railCollapsed}><button type="button" className={`ds-nav-link${on ? " active" : ""}`} aria-current={on ? "page" : undefined}
 onClick={() => go(key)}>
                    <span className="ds-nav-icon">{Icon && <Icon size={18} strokeWidth={2} />}</span>
                    <span className="ds-nav-text">{label}</span>
                    {key === "notifications" && notif?.unread > 0 && <span className="ds-nav-badge" aria-label={`${notif.unread} unread`}>{notif.unread > 99 ? "99+" : notif.unread}</span>}
                  </button></Tooltip>
                </li>
              );
            })}
          </ul>
          <div className="ds-sidebar-spacer" />
        </div>

        {isPhone && (
          <div className="ds-sidebar-credit">
            {"</> "}Developed by <DeveloperCredit showTag={false} />
          </div>
        )}
        <div className="ds-sidebar-footer">
          <div className="ds-sidebar-menu-wrap">
            <AdminAccountMenu variant="side" collapsed={railCollapsed} {...menuProps} />
          </div>
        </div>
      </nav>

      <div className="ds-content">
        <header className="ds-topbar">
          <div className="ds-topbar-left">
            <Tooltip label={!isDesktop ? "Menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}><button type="button" className="ds-icon-btn ds-hamburger" onClick={burger} aria-controls="ds-sidebar"
              aria-label={!isDesktop ? "Open menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
>
              {sidebarOpen ? <X size={18} /> : !isDesktop ? <Menu size={18} /> : railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button></Tooltip>
            <div className="ds-topbar-brand">
              <img src={logo} alt="" />
              <span>{showProfile ? "Profile Settings" : (activeItem?.label || "OCCDL")}</span>
            </div>
          </div>
          <div className="ds-topbar-actions">
            {/* Coordinator bell only. key = account id, so a different sign-in on this browser always starts from an empty bell. */}
            {user?.role === "coordinator" && user?.id != null && <CoordinatorBell key={user.id} tabs={nav.map((n) => n.key)} onOpenTab={go} />}
            <AdminAccountMenu variant="top" {...menuProps} />
          </div>
        </header>

        <main className="ds-main" id="main-content" tabIndex={-1}>
          <div className="ds-page">
              {showProfile ? (
                <div className="ds-header">
                  <div className="ds-header-text">
                    <span className="ds-eyebrow">Account</span>
                    <h1 className="ds-title">Profile Settings</h1>
                    <p className="ds-subtitle">Your account details for OCCDL.</p>
                  </div>
                  <div className="ds-actions"><Btn onClick={() => go(active)}>Back to {activeItem?.label || "dashboard"}</Btn></div>
                </div>
              ) : (title || subtitle || actions) && (
                <div className="ds-header">
                  <div className="ds-header-text">
                    {roleLabel && <span className="ds-eyebrow">{roleLabel}</span>}
                    {title && <h1 className="ds-title">{title}</h1>}
                    {subtitle && <p className="ds-subtitle">{subtitle}</p>}
                  </div>
                  {actions && <div className="ds-actions">{actions}</div>}
                </div>
              )}
              {showProfile ? <ProfileSettings /> : children}
          </div>
        </main>

        <footer className="ds-footer">
          <div className="ds-footer-inner">
            <span className="ds-footer-credit">
              {"</> "}Developed by{" "}
              <DeveloperCredit showTag={false} />
            </span>

            <span className="ds-footer-sep ds-footer-extra" aria-hidden="true">|</span>

            <div className="ds-footer-links ds-footer-extra">
              <span className="ds-footer-badge"><ShieldCheck size={12} /> Secure</span>
              <span className="ds-footer-dot">•</span>
              <span className="ds-footer-badge"><ClipboardList size={12} /> Duty Logbook</span>
              <span className="ds-footer-dot">•</span>
              <span className="ds-footer-badge"><Boxes size={12} /> Opol Community College</span>
            </div>

            <span className="ds-footer-sep ds-footer-extra" aria-hidden="true">|</span>

            <span className="ds-footer-copy ds-footer-extra">© {new Date().getFullYear()} OCCDL • Built with ❤️</span>
          </div>
        </footer>

        {isPhone && (
          <StaffTabBar tabs={tabs} active={showProfile ? null : active} hidden={sidebarOpen} menuOpen={sidebarOpen}
            onGo={go} onMenu={() => setSidebarOpen(true)} />
        )}
      </div>
    </div>
  );
}

export function StatCard({ label, value }) {
  return (
    <div className="st-stat">
      <b>{value ?? "—"}</b>
      <span>{label}</span>
    </div>
  );
}
