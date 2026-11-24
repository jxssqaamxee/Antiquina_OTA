import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { BellRing, Check, ChevronDown, LogOut, Palette, UserCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { hasAdminAccess } from "../../utils/roles";
import { useNotifications } from "../../context/NotificationContext";
import { useToast } from "../../context/ToastContext";
import { useAppTheme } from "../../hooks/useAppTheme";
import { REGULAR_THEMES, BLACK_THEMES, THEMES, setTheme, saveThemeToAccount } from "../../utils/theme";
import AvatarPhoto from "./AvatarPhoto";
import "./AccountMenu.css";

import Tooltip from "./Tooltip";
const themeLabel = (id) => THEMES.find((t) => t.id === id)?.label || "Default";

/** One row with an ON / OFF switch (same look as sclf_APP's avatar menu). */
function SwitchRow({ icon: Icon, label, hint, checked, busy, onToggle }) {
  return (
    <button
      type="button"
      className="am-item am-switch-row"
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-busy={busy}
      disabled={busy}
      onClick={onToggle}
    >
      <Icon size={17} />
      <span className="am-switch-text">
        <span className="am-switch-label">{label}</span>
        {hint && <span className="am-switch-hint">{hint}</span>}
      </span>
      <span className={`am-switch${checked ? " is-on" : ""}${busy ? " is-busy" : ""}`} aria-hidden="true">
        <span className="am-switch-knob" />
      </span>
    </button>
  );
}

/**
 * The avatar in the top bar. Tapping it opens a dropdown with:
 *   Profile settings · Theme (Choose Theme, with the Black set) · Shift & clock-out alerts (ON/OFF) · Sign out
 * The panel is portaled into <body> and placed from the avatar's real position, so no parent's
 * overflow can clip it. Picking a theme or flipping the switch leaves the menu open (like sclf_APP),
 * so a few themes can be tried in a row.
 */
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const { alertsOn, alertsBusy, toggleAlerts, permission, pushStatus } = useNotifications();
  const { theme } = useAppTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [blackSet, setBlackSet] = useState(() => String(theme).startsWith("dark-"));
  const [signingOut, setSigningOut] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => { setOpen(false); setThemesOpen(false); }, []);

  // Place the panel under the avatar, right edge aligned, never past a screen edge.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.visualViewport?.height || window.innerHeight;
      const gap = 12;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(300, vw - gap * 2);
      const top = rect.bottom + 8;
      const right = Math.max(gap, vw - rect.right);
      menu.style.width = `${width}px`;
      menu.style.top = `${top}px`;
      menu.style.right = `${Math.min(right, vw - width - gap + 0)}px`;
      menu.style.left = "auto";
      menu.style.maxHeight = `${Math.max(160, vh - top - gap)}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open, themesOpen]);

  // Close on outside tap, Escape or leaving the page.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === "Escape") { close(); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function pickTheme(id) {
    setTheme(id);
    saveThemeToAccount(id); // follows the account to other devices; this device keeps it either way
  }

  async function onToggleAlerts() {
    const wasOn = alertsOn;
    const result = await toggleAlerts();
    if (wasOn) {
      toast.info("Shift and clock-out alerts are off on this device.", { key: "alerts-toggle" });
    } else if (result === "on") {
      toast.success("Shift and clock-out alerts are on.", { key: "alerts-toggle" });
    } else if (result === "unconfigured") {
      toast.success("Alerts are on while the app is open. Closed-app reminders are not set up on the server yet.", { key: "alerts-toggle" });
    } else if (result === "denied") {
      toast.warning("Notifications are blocked for this app. Allow them in your phone or browser settings, then switch this on.", { key: "alerts-toggle" });
    } else if (result === "install") {
      toast.info("On iPhone: tap Share, then Add to Home Screen, and open OCCDL from the new icon to get alerts.", { key: "alerts-toggle" });
    } else if (result === "unsupported") {
      toast.error("This browser doesn't support notifications.", { key: "alerts-toggle" });
    } else if (result === "error") {
      toast.error("Couldn't turn alerts on. Check your connection and try again.", { key: "alerts-toggle" });
    }
  }

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    close();
    const signedOutTo = hasAdminAccess(user) ? "/administrator" : "/login"; // read before logout clears the user
    try {
      await logout();
    } finally {
      // Whatever happened above, leave the signed-in screens.
      navigate(signedOutTo, { replace: true });
      setSigningOut(false);
    }
  }

  const alertsHint = permission === "denied" || pushStatus === "denied"
    ? "Blocked in your phone settings"
    : pushStatus === "install"
      ? "Add OCCDL to your Home Screen first"
      : "Reminders on this device";

  const options = blackSet ? BLACK_THEMES : REGULAR_THEMES;

  return (
    <>
      <Tooltip label={"Account menu"}><button
        type="button"
        ref={triggerRef}
        className={`avatar-btn avatar-btn--menu${open ? " is-open" : ""}`}
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setThemesOpen(false); }}
      >
        <AvatarPhoto user={user} />
        <span className="avatar-chevron" aria-hidden="true"><ChevronDown size={11} strokeWidth={3} /></span>
      </button></Tooltip>

      {open && createPortal(
        <div ref={menuRef} className="am-menu" role="menu" aria-label="Account menu" data-occ-theme={theme}>
          <div className="am-head">
            <span className="am-head-avatar"><AvatarPhoto user={user} /></span>
            <span className="am-head-text">
              <b>{user?.name || "Account"}</b>
              <small>{user?.email || ""}</small>
            </span>
          </div>

          <Link to="/profile" className="am-item" role="menuitem" onClick={close}>
            <UserCircle size={17} /> Profile settings
          </Link>

          <button
            type="button"
            className="am-item"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={themesOpen}
            onClick={() => setThemesOpen((v) => !v)}
          >
            <Palette size={17} /> Theme
            <span className="am-pill">{themeLabel(theme)}</span>
          </button>
          {themesOpen && (
            <div className="am-themes" role="menu" aria-label="Choose theme">
              <div className="am-themes-head">
                <span className="am-themes-title">Choose Theme</span>
                <Tooltip label={blackSet ? "Show the white themes" : "Show the black themes"}><button
                  type="button"
                  className={`am-black-btn${blackSet ? " is-on" : ""}`}
                  onClick={() => setBlackSet((v) => !v)}
                  aria-label={blackSet ? "Show the white themes" : "Show the black themes"}
                >
                  {blackSet ? "White" : "Black"}
                </button></Tooltip>
              </div>
              {options.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="am-theme-opt"
                  role="menuitemradio"
                  aria-checked={theme === t.id}
                  onClick={() => pickTheme(t.id)}
                >
                  <span className={`am-swatch am-swatch-${t.swatch}`} />
                  {t.label}
                  {theme === t.id && <Check size={15} className="am-check" />}
                </button>
              ))}
            </div>
          )}

          <div className="am-divider" />
          <SwitchRow
            icon={BellRing}
            label="Push notifications"
            hint={alertsHint}
            checked={alertsOn}
            busy={alertsBusy}
            onToggle={onToggleAlerts}
          />
          <p className="am-note">Shift and clock-out reminders, even when the app is closed.</p>

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
