import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Check as CheckIcon, ChevronDown, KeyRound, LogOut, Palette } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import api, { errorMessage } from "../../config/axiosConfig";
import { useAppTheme } from "../../hooks/useAppTheme";
import { REGULAR_THEMES, BLACK_THEMES, THEMES, setTheme, saveThemeToAccount } from "../../utils/theme";
import AvatarPhoto from "../shared/AvatarPhoto";
import logo from "../../assets/images/site-logo.png";
import { Btn, Card, Field, Input, Notice, Row } from "./ui";
import "../shared/AccountMenu.css";
import "../../styles/staff.css";

const themeLabel = (id) => THEMES.find((t) => t.id === id)?.label || "Default";

/** Avatar pill in the top bar: Change password · Theme (same nine themes as sclf_APP) · Sign out. */
function StaffAccountMenu({ forced, onChangePassword, onSignOut, signingOut }) {
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
      const width = Math.min(300, vw - gap * 2), top = r.bottom + 8;
      m.style.width = `${width}px`;
      m.style.top = `${top}px`;
      m.style.left = "auto";
      m.style.right = `${Math.max(gap, Math.min(vw - r.right, vw - width - gap))}px`;
      m.style.maxHeight = `${Math.max(160, vh - top - gap)}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, themesOpen]);

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

  return (
    <>
      <button type="button" ref={triggerRef} className={`st-profile${open ? " is-open" : ""}`}
        aria-label="Open account menu" aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setThemesOpen(false); }}>
        <span className="st-profile-av"><AvatarPhoto user={user} /></span>
        <span className="st-profile-txt"><b>{user?.name}</b><small>{user?.staff_id}</small></span>
        <ChevronDown size={14} strokeWidth={2.6} className="st-chev" aria-hidden="true" />
      </button>

      {open && createPortal(
        <div ref={menuRef} className="am-menu st-menu" role="menu" aria-label="Account menu" data-occ-theme={theme}>
          <div className="am-head">
            <span className="am-head-avatar"><AvatarPhoto user={user} /></span>
            <span className="am-head-text"><b>{user?.name || "Account"}</b><small>{user?.staff_id || user?.email || ""}</small></span>
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

/** Desktop frame shared by the Admin and Coordinator areas (top bar + account menu). */
export default function StaffShell({ roleLabel, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const forced = user?.must_change_password === true;

  async function signOut() {
    setBusy(true);
    try { await logout(); } finally { navigate("/staff-login", { replace: true }); }
  }

  return (
    <div className="st-page">
      <header className="st-top">
        <div className="st-top-in">
          <div className="st-brand">
            <img src={logo} alt="" />
            <span className="st-brand-text"><b>OCCDL</b><small>Opol Community College</small></span>
          </div>
          <div className="st-top-actions">
            <span className="st-eyebrow">{roleLabel}</span>
            <StaffAccountMenu forced={forced} signingOut={busy} onSignOut={signOut} onChangePassword={() => setShowPw(true)} />
          </div>
        </div>
      </header>
      <main className="st-main">
        {forced ? <PasswordPanel forced /> : (<>{showPw && <PasswordPanel onDone={() => setShowPw(false)} />}{children}</>)}
      </main>
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
