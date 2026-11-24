import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clearPersistedUi } from "../../hooks/usePersistedTab";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Boxes, Camera, Check as CheckIcon, ChevronDown, ChevronUp, ClipboardList, IdCard, Lock, LogOut, Mail, ShieldCheck, UserRound, Menu, Palette, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
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
import "../shared/AccountMenu.css";
import "../../styles/admin.css";

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

/**
 * Change-password form.
 * It opens as a dialog over the page (never inside the dashboard), closed by Cancel, Esc or a click outside.
 */
const EMPTY_PW = { current_password: "", password: "", password_confirmation: "" };

function PasswordPanel({ onDone, inline = false }) {
  const { updateUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Inline (Profile Settings > Security) it starts CLOSED, so nothing can be typed or autofilled by mistake.
  const [open, setOpen] = useState(!inline);
  const dirty = !!(f.current_password || f.password || f.password_confirmation);
  const cancel = () => {
    if (!inline) { onDone?.(); return; }
    if (dirty && !window.confirm("You started changing your password. Close it and discard what you typed?")) return;
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

const InfoItem = ({ icon: Icon, label, value }) => (
  <div className="ds-info-item">
    <span className="ds-info-icon"><Icon size={16} /></span>
    <div className="ds-info-text">
      <div className="ds-info-label">{label}</div>
      <div className="ds-info-value">{value || "—"}</div>
    </div>
  </div>
);

/**
 * Profile Settings (same layout as sclf_APP's Profile Settings page): hero with photo + chips,
 * Account details grid, name editing, and Security (change password).
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
      <div className="st-card" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <button type="button" className="ds-avatar" style={{ width: 64, height: 64, fontSize: 22, borderRadius: 16, position: "relative" }} onClick={() => setPhotoOpen(true)} aria-label="Change profile photo">
          <AvatarPhoto user={user} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{user?.name || "Account"}</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>{user?.email || ""}</div>
          <div className="ds-chip-row">
            <span className="ds-chip ds-chip-accent">{roleLabel}</span>
            {user?.admin_id && <span className="ds-chip">{roleLabel} ID: {user.admin_id}</span>}
          </div>
        </div>
        <Btn onClick={() => setPhotoOpen(true)}><Camera size={15} /> {user?.has_profile_photo ? "Change photo" : "Add photo"}</Btn>
      </div>

      <Notice msg={msg} />
      <Card title="Account details">
        <p className="ds-card-desc">Information tied to your OCCDL account.</p>
        <div className="ds-info-grid">
          <InfoItem icon={UserRound} label="Full name" value={user?.name} />
          <InfoItem icon={Mail} label="Email" value={user?.email} />
          <InfoItem icon={IdCard} label={`${roleLabel} ID`} value={user?.admin_id} />
          <InfoItem icon={ShieldCheck} label="Role" value={<span className="ds-chip ds-chip-accent">{roleLabel}</span>} />
        </div>
        <p className="st-muted" style={{ marginTop: 12 }}>
          <Lock size={12} aria-hidden="true" /> These details can only be changed by an administrator.
        </p>
      </Card>

      <Card title="Security">
        <p className="ds-card-desc">Keep your sign-in details up to date and your account protected.</p>
        <PasswordPanel inline />
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
export default function AdminShell({ roleLabel, nav = [], phoneTabs, active, onNavigate, title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showProfile, setShowProfile] = useState(() => { try { return window.location.hash === "#profile"; } catch { return false; } });
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
    setShowProfile(true); setSidebarOpen(false);
    try { window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#profile`); } catch { /* ignore */ }
  };
  const go = (key) => { setShowProfile(false); onNavigate?.(key); setSidebarOpen(false); };
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
        <div className="ds-brand" title={railCollapsed ? "OCCDL" : undefined}>
          <img src={logo} alt="" />
          <span className="ds-brand-text">
            <span className="ds-brand-name">OCCDL</span>
            <span className="ds-brand-sub">Opol Community College</span>
          </span>
        </div>

        <div className="ds-nav-label">{roleLabel}</div>

        <div className="ds-nav-scroll">
          <ul className="ds-nav">
            {nav.map(({ key, label, icon: Icon }) => {
              const on = key === active && !showProfile;
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
            <button type="button" className="ds-icon-btn ds-hamburger" onClick={burger} aria-controls="ds-sidebar"
              aria-label={!isDesktop ? "Open menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={!isDesktop ? "Menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {sidebarOpen ? <X size={18} /> : !isDesktop ? <Menu size={18} /> : railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="ds-topbar-brand">
              <img src={logo} alt="" />
              <span>{showProfile ? "Profile Settings" : (activeItem?.label || "OCCDL")}</span>
            </div>
          </div>
          <div className="ds-topbar-actions">
            <AdminAccountMenu variant="top" {...menuProps} />
          </div>
        </header>

        <main className="ds-main" id="main-content" tabIndex={-1}>
          <>
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
          </>
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
