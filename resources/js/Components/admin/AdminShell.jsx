import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Check as CheckIcon, ChevronDown, ChevronUp, KeyRound, LogOut, Menu, Palette, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import api, { errorMessage } from "../../config/axiosConfig";
import { useAppTheme } from "../../hooks/useAppTheme";
import { REGULAR_THEMES, BLACK_THEMES, THEMES, setTheme, saveThemeToAccount } from "../../utils/theme";
import AvatarPhoto from "../shared/AvatarPhoto";
import logo from "../../assets/images/site-logo.png";
import { Btn, Card, Field, Input, Notice, Row } from "./ui";
import "../shared/AccountMenu.css";
import "../../styles/admin.css";

const themeLabel = (id) => THEMES.find((t) => t.id === id)?.label || "Default";
const COLLAPSE_KEY = "occ-sidebar-collapsed";
const DESKTOP_QUERY = "(min-width: 960px)";

const idLine = (user) => (user?.admin_id ? `${user?.role === "admin" ? "Admin" : "Coordinator"} ID: ${user.admin_id}` : (user?.email || ""));

/**
 * Account menu: Change password · Theme (nine themes) · Sign out.
 * variant "top"  = the avatar pill in the top bar (drops down).
 * variant "side" = the account row pinned at the bottom of the sidebar (opens beside / above it).
 */
function AdminAccountMenu({ variant = "top", collapsed = false, forced, onChangePassword, onSignOut, signingOut }) {
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
        <button type="button" ref={triggerRef} className="ds-user-row ds-user-row-btn" aria-label="Open account menu"
          aria-haspopup="menu" aria-expanded={open} title={collapsed ? user?.name || "Account" : undefined} onClick={toggle}>
          <span className="ds-avatar"><AvatarPhoto user={user} /></span>
          <div className="ds-user-text" style={{ minWidth: 0 }}>
            <div className="ds-user-name">{user?.name || "Account"}</div>
            <div className="ds-user-email">{idLine(user)}</div>
          </div>
          {!collapsed && <ChevronUp size={15} className="ds-user-row-chevron" />}
        </button>
      ) : (
        <button type="button" ref={triggerRef} className="ds-profile-btn" aria-label="Open account menu"
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <span className="ds-avatar"><AvatarPhoto user={user} /></span>
          <span className="ds-profile-btn-name">{user?.name || "Account"}</span>
          <ChevronDown size={16} className="ds-profile-chevron" />
        </button>
      )}

      {open && createPortal(
        <div ref={menuRef} className="am-menu st-menu" role="menu" aria-label="Account menu" data-occ-theme={theme}>
          <div className="am-head">
            <span className="am-head-avatar"><AvatarPhoto user={user} /></span>
            <span className="am-head-text"><b>{user?.name || "Account"}</b><small>{idLine(user)}</small></span>
          </div>

          {!forced && (
            <button type="button" className="am-item" role="menuitem" onClick={() => { close(); onChangePassword(); }}>
              <KeyRound size={17} /> Change password
            </button>
          )}

          <button type="button" className="am-item" role="menuitem" aria-haspopup="true" aria-expanded={themesOpen}
            onClick={() => setThemesOpen((v) => !v)}>
            <Palette size={17} /> Theme <span className="am-pill">{themeLabel(theme)}</span>
          </button>
          {themesOpen && (
            <div className="am-themes" role="menu" aria-label="Choose theme">
              <div className="am-themes-head">
                <span className="am-themes-title">Choose Theme</span>
                <button type="button" className={`am-black-btn${blackSet ? " is-on" : ""}`} onClick={() => setBlackSet((v) => !v)}
                  aria-label={blackSet ? "Show the white themes" : "Show the black themes"}>{blackSet ? "White" : "Black"}</button>
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

/** Change-password form. `forced` = the account still has the password from .env, so nothing else is shown until it is replaced. */
function PasswordPanel({ forced, onDone }) {
  const { updateUser } = useAuth();
  const [f, setF] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.put("/profile/password", f);
      setF({ current_password: "", password: "", password_confirmation: "" });
      setMsg({ text: "Password changed. Your other devices were signed out." });
      await updateUser(data.user);
      onDone?.();
    } catch (e) { setMsg({ bad: true, text: errorMessage(e) }); } finally { setBusy(false); }
  }
  return (
    <Card title={forced ? "Set your own password to continue" : "Change password"}>
      {forced && <p className="st-muted" style={{ marginBottom: 14 }}>This account was created with a password from the server settings. Choose a new one now; the old one stops working.</p>}
      <Notice msg={msg} />
      <Row>
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.current_password} onChange={set("current_password")} /></Field>
        <Field label="New password"><Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
        <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={f.password_confirmation} onChange={set("password_confirmation")} /></Field>
        <Btn kind="primary" disabled={busy || !f.current_password || !f.password} onClick={save}>Save password</Btn>
      </Row>
      <p className="st-muted" style={{ marginTop: 12 }}>At least 8 characters with upper and lower case letters and a number.</p>
    </Card>
  );
}

/**
 * Admin / Coordinator frame, copied from sclf_APP's DashboardShell: collapsible sidebar (nav + account row),
 * top bar, page header, pinned footer.
 *
 *   nav         [{ key, label, icon }]  the sections of this area (they replace the old tab strip)
 *   active      key of the open section
 *   onNavigate  (key) => void
 */
export default function AdminShell({ roleLabel, nav = [], active, onNavigate, title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // slide-over on narrow screens
  const [isDesktop, setIsDesktop] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(DESKTOP_QUERY).matches));
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const forced = user?.must_change_password === true;
  const railCollapsed = collapsed && isDesktop;

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
    try { await logout(); } finally { navigate("/admin-login", { replace: true }); }
  }

  const go = (key) => { setShowPw(false); onNavigate?.(key); setSidebarOpen(false); };
  const activeItem = nav.find((n) => n.key === active);
  const menuProps = { forced, signingOut: busy, onSignOut: signOut, onChangePassword: () => setShowPw(true) };

  return (
    <div className="ds-shell ds-layout">
      <div className={`ds-sidebar-backdrop${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} aria-hidden={!sidebarOpen} />

      <nav id="ds-sidebar" className={`ds-sidebar${sidebarOpen ? " open" : ""}${railCollapsed ? " collapsed" : ""}`} aria-label="Sections">
        <button type="button" className="ds-icon-btn ds-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>

        <div className="ds-brand" title={railCollapsed ? "OCCDL" : undefined}>
          <img src={logo} alt="" />
          <span className="ds-brand-text">
            <span className="ds-brand-name">OCCDL</span>
            <span className="ds-brand-sub">Opol Community College</span>
          </span>
        </div>

        <div className="ds-sidebar-divider" aria-hidden="true" />
        <div className="ds-nav-label">{roleLabel}</div>

        <div className="ds-nav-scroll">
          <ul className="ds-nav">
            {!forced && nav.map(({ key, label, icon: Icon }) => {
              const on = key === active;
              return (
                <li key={key}>
                  <button type="button" className={`ds-nav-link${on ? " active" : ""}`} aria-current={on ? "page" : undefined}
                    title={railCollapsed ? label : undefined} onClick={() => go(key)}>
                    <span className="ds-nav-icon">{Icon && <Icon size={18} strokeWidth={2} />}</span>
                    <span className="ds-nav-text">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="ds-sidebar-spacer" />
        </div>

        <div className="ds-sidebar-footer">
          <div className="ds-sidebar-menu-wrap">
            <AdminAccountMenu variant="side" collapsed={railCollapsed} {...menuProps} />
          </div>
        </div>
      </nav>

      <div className="ds-content">
        <header className="ds-topbar">
          <div className="ds-topbar-left">
            <button type="button" className="ds-icon-btn ds-hamburger" onClick={burger} aria-controls="ds-sidebar"
              aria-label={!isDesktop ? "Open menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={!isDesktop ? "Menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {sidebarOpen ? <X size={18} /> : !isDesktop ? <Menu size={18} /> : railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="ds-topbar-brand">
              <img src={logo} alt="" />
              <span>{activeItem?.label || "OCCDL"}</span>
            </div>
          </div>
          <div className="ds-topbar-actions">
            <AdminAccountMenu variant="top" {...menuProps} />
          </div>
        </header>

        <main className="ds-main" id="main-content" tabIndex={-1}>
          {forced ? <PasswordPanel forced /> : (
            <>
              {(title || subtitle || actions) && (
                <div className="ds-header">
                  <div className="ds-header-text">
                    {roleLabel && <span className="ds-eyebrow">{roleLabel}</span>}
                    {title && <h1 className="ds-title">{title}</h1>}
                    {subtitle && <p className="ds-subtitle">{subtitle}</p>}
                  </div>
                  {actions && <div className="ds-actions">{actions}</div>}
                </div>
              )}
              {showPw && <PasswordPanel onDone={() => setShowPw(false)} />}
              {children}
            </>
          )}
        </main>

        <footer className="ds-footer">
          <div className="ds-footer-inner">
            <span className="ds-footer-credit">OCCDL · On-the-Job Training Duty Logbook</span>
            <span className="ds-footer-sep ds-footer-extra" aria-hidden="true">|</span>
            <span className="ds-footer-copy ds-footer-extra">© {new Date().getFullYear()} Opol Community College</span>
          </div>
        </footer>
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
