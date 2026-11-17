import React, { Children, cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import logo from "../../assets/images/site-logo.png";
import Footer from "../shared/Footer";
import { useAppTheme } from "../../hooks/useAppTheme";
import { setTheme } from "../../utils/theme";
import "../../styles/auth.css";

/**
 * Auth frame — the sclf_APP "intake ledger" look, lite:
 * header bar (logo + name + light/dark toggle) · a ruled record card with a
 * REF. case number and "Live Session" pill · numbered rows · small legal line.
 *
 * Left out on purpose (see PHASE notes): translations, seasons, the desktop
 * rail/photo "gate", animations toggle, devtools/zoom guards. OCC is a phone
 * app (OCC_MOBILE_ONLY), so one phone-first layout is used at every width.
 *
 * Colours come from the --lg-* tokens in styles/theme.css, which follow all
 * five OCC themes (and turn navy in the dark one).
 */

// Cosmetic only, never sent to the server: REF. OCC-LOG-20261117-0932
const buildCaseNumber = (seed) => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `OCC-${seed}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

// Light <-> dark toggle. Remembers which light theme you were on (Blue, Gold…)
// so flipping to dark and back doesn't lose it.
let lastLight = "white";
function toggleDark(theme) {
  if (theme === "black") return setTheme(lastLight || "white");
  lastLight = theme;
  return setTheme("black");
}

export default function AuthShell({ title, subtitle, children, footer, wide = false, caseSeed = "LOG", tabs = null }) {
  const { theme, isDark } = useAppTheme();
  const [caseNumber] = useState(() => buildCaseNumber(caseSeed));

  // Pages are reached by navigation, so start at the top.
  useEffect(() => { window.scrollTo?.(0, 0); }, []);

  return (
    <div className="lg-wrap">
      <a className="lg-skip" href="#lg-main">Skip to form</a>

      <header className="lg-appbar">
        <Link to="/" className="lg-brand" aria-label="OCC Duty Log home">
          <img src={logo} alt="" />
          <span>OCC Duty Log<small>Opol Community College</small></span>
        </Link>
        <button
          type="button" className="lg-icon-btn" onClick={() => toggleDark(theme)}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main id="lg-main" tabIndex={-1} className="lg-stage">
        <div className={`lg-card${wide ? " is-wide" : ""}`}>
          <div className="lg-strip">
            <span className="lg-ref">REF. {caseNumber}</span>
            <span className="lg-live"><span className="lg-dot" /> Live Session</span>
          </div>

          {/* Register wizard: one "folder tab" per step (01 IDENTITY, 02 ACCOUNT, ...) */}
          {tabs && <div className="lg-folder-tabs" role="list" aria-label="Registration steps">{tabs}</div>}

          <div className="lg-head">
            <h1 className="lg-title">{title}</h1>
            {subtitle && <p className="lg-subtitle">{subtitle}</p>}
          </div>

          <div className="lg-body">{children}</div>

          {footer && <div className="lg-foot">{footer}</div>}
        </div>

        <p className="lg-legal">Your connection is encrypted. Only you and your coordinator can see your duty records.</p>
        <Footer />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Ledger pieces                                                             */
/* ------------------------------------------------------------------------ */

/** One numbered ledger row: index badge + label + field (+ hint / error). */
export function LedgerRow({ index, label, icon: Icon, children, hint, error, htmlFor }) {
  // Tie the visible label to its field so screen readers announce it.
  const autoId = useId();
  const kids = Children.toArray(children);
  const field = isValidElement(kids[0]) ? kids[0] : null;
  const fieldId = htmlFor ?? field?.props?.id ?? (field ? autoId : undefined);
  const content = field && !field.props.id && !htmlFor
    ? [cloneElement(field, { id: fieldId, key: "f" }), ...kids.slice(1)]
    : children;
  return (
    <div className="lg-row">
      <span className="lg-row-index" aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <div className="lg-row-body">
        <label className="lg-row-label" htmlFor={fieldId}>
          {Icon && <Icon size={12} strokeWidth={2.5} />} {label}
        </label>
        {content}
        {error
          ? <span className="lg-row-hint lg-row-error" role="alert">{error}</span>
          : hint && <span className="lg-row-hint">{hint}</span>}
      </div>
    </div>
  );
}

/** Two ledger fields side by side inside one indexed line (stacks under 420 px). */
export function LedgerRowPair({ index, children }) {
  return (
    <div className="lg-row">
      <span className="lg-row-index" aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <div className="lg-row-body lg-row-body--pair">{children}</div>
    </div>
  );
}

export function LedgerInput(props) {
  return <input className="lg-input" {...props} />;
}

/** Select styled like the ledger input. */
export function LedgerSelect(props) {
  return <select className="lg-input lg-select" {...props} />;
}

/** Password field with a show/hide eye. */
export function LedgerPasswordInput({ show, onToggle, ...props }) {
  return (
    <div className="lg-pass">
      <input className="lg-input" type={show ? "text" : "password"} {...props} />
      <button type="button" className="lg-eye" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"} tabIndex={-1}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

/** Password strength as five "ticks". Always mounted (just hidden) so the layout never jumps while typing. */
export function StrengthTicks({ password }) {
  const checks = [
    password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const meta = [
    { label: "Weak", color: "var(--bad)" }, { label: "Weak", color: "var(--bad)" },
    { label: "Fair", color: "var(--lg-accent)" }, { label: "Good", color: "var(--ok)" },
    { label: "Strong", color: "var(--ok)" }, { label: "Strong", color: "var(--ok)" },
  ][score];
  return (
    <div className="lg-strength" style={{ visibility: password ? "visible" : "hidden" }} aria-live="polite">
      <div className="lg-strength-ticks">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} style={i < score ? { background: meta.color } : undefined} />)}
      </div>
      <span className="lg-strength-label" style={{ color: meta.color }}>{password ? meta.label : ""}</span>
    </div>
  );
}

/** The four password rules (same as the server's), ticked off live. */
export function RequirementChecklist({ password }) {
  const items = [
    { ok: password.length >= 8, label: "8+ characters" },
    { ok: /[A-Z]/.test(password), label: "One uppercase letter" },
    { ok: /[a-z]/.test(password), label: "One lowercase letter" },
    { ok: /\d/.test(password), label: "One number" },
  ];
  return (
    <div className="lg-checklist">
      <span className="lg-checklist-title">Password requirements</span>
      <div className="lg-checklist-grid">
        {items.map((it) => (
          <span key={it.label} className={`lg-checklist-item${it.ok ? " is-ok" : ""}`}>
            {it.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PasswordMatchNote({ password, confirm }) {
  const match = password === confirm;
  return (
    <div className={`lg-match ${match ? "is-ok" : "is-bad"}`} style={{ visibility: confirm ? "visible" : "hidden" }} aria-live="polite">
      {match ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      {match ? "Passwords match" : "Passwords do not match"}
    </div>
  );
}

export function LedgerBanner({ tone = "error", children }) {
  if (!children) return null;
  return <div className={`lg-banner lg-banner--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function LedgerButton({ children, ...props }) {
  return <button type="submit" className="lg-submit" {...props}>{children}</button>;
}

/** Secondary "BACK" button next to the submit button. */
export function LedgerGhostButton({ children, ...props }) {
  return <button type="button" className="lg-ghost" {...props}>{children}</button>;
}

/* ------------------------------------------------------------------------ */
/* Old au-* names — kept for any remaining import; Register and Profile now   */
/* use the Ledger pieces above.                                               */
/* ------------------------------------------------------------------------ */

export function Field({ label, error, hint, children, htmlFor, optional, required, className = "" }) {
  return (
    <div className={`au-field${error ? " has-error" : ""} ${className}`.trim()}>
      <label htmlFor={htmlFor}>{label}{required && <span className="au-req" aria-hidden="true"> *</span>}{optional && <em> (optional)</em>}</label>
      {children}
      {error ? <span className="au-error" role="alert">{error}</span> : hint ? <span className="au-hint">{hint}</span> : null}
    </div>
  );
}

export function Banner({ tone = "error", children }) {
  if (!children) return null;
  return <div className={`au-banner au-banner--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Divider({ children = "or" }) {
  return <div className="au-divider"><span>{children}</span></div>;
}
