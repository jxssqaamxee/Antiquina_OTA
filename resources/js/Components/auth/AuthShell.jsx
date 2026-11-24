import React, { Children, cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, ShieldCheck, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { useAppTheme } from "../../hooks/useAppTheme";
import { setTheme, isDarkId } from "../../utils/theme";
import logo from "../../assets/images/site-logo.png";
import occBg from "../../assets/images/occ.webp";
import Tooltip from "../shared/Tooltip";
import "../../styles/ledger.css"; // sclf_APP "Intake Ledger" design (ported 1:1)
import "../../styles/auth.css";   // au-* fields used by the Profile page

/**
 * AUTH SHELL — "The Intake Ledger" (ported from sclf_APP Components/shared/AuthShell.jsx)
 *
 *  Phones      : app bar on top, borderless form on the screen, legal line at the bottom.
 *  Wide screens: left "ledger rail", campus photo behind the form, and (Login only) a
 *                "Welcome, to Opol Community College" bar with a sliding Login dropdown.
 *
 * Left out on purpose: translations, seasonal themes, DevTools/zoom guard, animation toggle.
 */

const RAIL_FACTS = [
  "Every duty hour is timestamped the moment you log it.",
  "Your logbook works offline and syncs when you are back online.",
  "Records stay private to you and your coordinator.",
];

// Cosmetic only, never sent to the server: OCC-LOG-20261117-0932
const buildCaseNumber = (prefix) => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `OCC-${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

// Remembers whether the Login dropdown was opened, so coming back from
// Forgot Password / Register keeps the form open. Module memory only.
let gateOpenMemory = false;

// Light <-> dark toggle. Remembers which light theme you were on.
let lastLight = "white";
function toggleDark(theme) {
  if (isDarkId(theme)) return setTheme(lastLight || "white");
  lastLight = theme;
  return setTheme("black");
}

export default function AuthShell({
  docType = "ACCESS LOG",
  caseSeed = "GEN",
  title,
  subtitle,
  railHeadline = "Your duty log, in your pocket.",
  railNote = "Track your OJT hours, host clients and daily entries in one place.",
  children,
  footer,
  wide = false,
  tabs,                       // register wizard: folder-tab step index
  fit = false,                // register wizard: tighter spacing, no scrollbar
  compact = false,
  centerHead = false,         // success / confirmation states
  bgImage = occBg,
  gate = false,               // Login: "Welcome, to <gateName>" + sliding dropdown (wide screens)
  gateName = "Opol Community College",
  gateLabel = "Login",
  gateDefaultOpen = false,
  railFacts = RAIL_FACTS,     // left-rail list; pass your own wording per page
  legalNote,                  // text under the form; pass null to hide it (undefined = trainee default)
}) {
  const { theme, isDark } = useAppTheme();
  const [gateOpen, setGateOpen] = useState(gateDefaultOpen || gateOpenMemory);
  const [caseNumber] = useState(() => buildCaseNumber(caseSeed));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  // Pages are reached by navigation, so start at the top.
  useEffect(() => { window.scrollTo?.(0, 0); }, []);

  const dateStamp = now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  const timeStamp = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const card = (
    <div className={`lg-card${wide ? " is-wide" : ""}`}>
      <div className="lg-card-tab-strip">
        <span className="lg-card-ref">REF. {caseNumber}</span>
        <span className="lg-card-status"><span className="lg-dot" /> Live Session</span>
      </div>

      {tabs && <div className="lg-folder-tabs" role="list" aria-label="Registration steps">{tabs}</div>}

      <div className={`lg-card-head${centerHead ? " is-centered" : ""}`}>
        {gate ? (
          <div className="lg-title-row">
            <h1 className="lg-title">{title}</h1>
            <span className="lg-live-pill"><span className="lg-dot" /> Live Session</span>
          </div>
        ) : (
          <h1 className="lg-title">{title}</h1>
        )}
        {subtitle && <p className="lg-subtitle">{subtitle}</p>}
      </div>

      <div className="lg-card-body">{children}</div>

      {footer && <div className="lg-card-foot">{footer}</div>}
    </div>
  );

  const legalText = legalNote === undefined ? "Entries in this ledger are encrypted in transit and visible only to you and your OJT coordinator." : legalNote;
  const legal = legalText ? <p className="lg-stage-legal">{legalText}</p> : null;

  return (
    <div className={`lg-wrap ${isDark ? "dark" : "light"}${compact ? " is-compact" : ""}${fit ? " is-fit" : ""}`}>
      <a className="lg-skip" href="#lg-main">Skip to form</a>

      {/* ============ LEFT: LEDGER RAIL (wide screens) ============ */}
      <aside className="lg-rail">
        <div className="lg-rail-ruled" aria-hidden="true" />
        <span className="lg-rail-blob lg-rail-blob-1" aria-hidden="true" />
        <span className="lg-rail-blob lg-rail-blob-2" aria-hidden="true" />

        <div className="lg-rail-top">
          <Link to="/" className="lg-brand">
            <span className="lg-brand-mark"><img src={logo} alt="OCC" /></span>
            <span className="lg-brand-text">OCCDL<span>Opol Community College</span></span>
          </Link>
        </div>

        <div className="lg-rail-doc">
          <span className="lg-doc-type">{docType}</span>
          <span className="lg-doc-number">{caseNumber}</span>
          <span className="lg-doc-clock">{dateStamp} · {timeStamp}</span>
        </div>

        <div className="lg-rail-mid">
          <h2 className="lg-rail-headline">{railHeadline}</h2>
          <p className="lg-rail-note">{railNote}</p>
          <ol className="lg-rail-facts">
            {railFacts.map((f, i) => (
              <li key={f}><span className="lg-rail-facts-num">{String(i + 1).padStart(2, "0")}</span>{f}</li>
            ))}
          </ol>
        </div>

        <div className="lg-rail-seal" aria-hidden="true">
          <ShieldCheck size={15} strokeWidth={2.25} />
          <span>Verified Campus System</span>
        </div>
      </aside>

      {/* ============ RIGHT: RECORD CARD ============ */}
      <main
        id="lg-main"
        tabIndex={-1}
        className={`lg-stage${bgImage ? " has-bg" : ""}${gate ? " has-gate" : ""}`}
        style={bgImage ? { "--lg-stage-img": `url(${bgImage})` } : undefined}
      >
        <header className="lg-appbar">
          <Link to="/" className="lg-mobile-brand">
            <img src={logo} alt="OCC" />
            <span>OCCDL<span>Opol Community College</span></span>
          </Link>
          <div className="lg-toggle-group">
            <Tooltip label={isDark ? "Switch to light theme" : "Switch to dark theme"}><button
              type="button" className="lg-theme-toggle" onClick={() => toggleDark(theme)}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
            </button></Tooltip>
          </div>
        </header>

        {gate ? (
          <div className="lg-stage-inner lg-gate">
            <div className="lg-gate-bar">
              <span className="lg-gate-welcome">
                <span className="lg-gw lg-gw-white">Welcome,</span>{" "}
                <span className="lg-gw lg-gw-white">to</span>{" "}
                <strong className="lg-gate-name">{gateName}</strong>
              </span>
              <button
                type="button"
                className={`lg-gate-toggle${gateOpen ? " is-open" : ""}`}
                onClick={() => setGateOpen((v) => { gateOpenMemory = !v; return !v; })}
                aria-expanded={gateOpen}
                aria-controls="lg-gate-panel"
              >
                {gateLabel}
                <svg className="lg-gate-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            <div id="lg-gate-panel" className={`lg-gate-panel${gateOpen ? " is-open" : ""}`}>
              <div className="lg-gate-panel-inner">
                {card}
                {legal}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg-stage-inner">
            {card}
            {legal}
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Ledger pieces (same names as sclf_APP so pages read the same)             */
/* ------------------------------------------------------------------------ */

/** One numbered ledger row: index badge + label + field (+ hint / error). */
export function LedgerRow({ index, label, icon: Icon, children, hint, error, htmlFor }) {
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
          ? <span className="lg-row-hint lg-row-error lg-row-error-text" role="alert">{error}</span>
          : hint && <span className="lg-row-hint">{hint}</span>}
      </div>
    </div>
  );
}

/** Two ledger fields side by side inside one indexed line. */
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

export function LedgerSelect(props) {
  return <select className="lg-input lg-select" {...props} />;
}

/** Password field with a show/hide eye. */
export function LedgerPasswordInput({ show, onToggle, ...props }) {
  return (
    <div className="lg-password-wrap lg-pass">
      <input className="lg-input" type={show ? "text" : "password"} {...props} />
      <Tooltip label={show ? "Hide password" : "Show password"}><button type="button" className="lg-eye" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"} tabIndex={-1}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button></Tooltip>
    </div>
  );
}

/** Password strength as five ticks. Always mounted (just hidden) so the layout never jumps. */
export function StrengthTicks({ password }) {
  const checks = [
    password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const meta = [
    { label: "Weak", color: "var(--lg-danger)" }, { label: "Weak", color: "var(--lg-danger)" },
    { label: "Fair", color: "var(--lg-accent)" }, { label: "Good", color: "var(--lg-ok)" },
    { label: "Strong", color: "var(--lg-ok)" }, { label: "Strong", color: "var(--lg-ok)" },
  ][score];
  return (
    <div className="lg-strength" style={{ visibility: password ? "visible" : "hidden" }} aria-live="polite">
      <div className="lg-strength-ticks">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i < score ? "is-filled" : ""} style={i < score ? { background: meta.color } : undefined} />
        ))}
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
      <span className="lg-checklist-title">Credential requirements</span>
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
      {match ? "Entries match" : "Entries do not match"}
    </div>
  );
}

export function LedgerBanner({ tone = "error", children }) {
  if (!children) return null;
  return <div className={`lg-banner lg-banner--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

/** Big rotated "stamp" used on success / failure states. */
export function Stamp({ label = "VERIFIED", tone = "ok" }) {
  return <div className={`lg-stamp${tone === "danger" ? " lg-stamp--danger" : ""}`} aria-hidden="true"><span>{label}</span></div>;
}

export function LedgerButton({ children, ...props }) {
  return <button type="submit" className="lg-submit" {...props}>{children}</button>;
}

export function LedgerGhostButton({ children, ...props }) {
  return <button type="button" className="lg-ghost" {...props}>{children}</button>;
}

/** "— or —" separator. */
export function Divider({ children = "or" }) {
  return <div className="lg-or"><span>{children}</span></div>;
}

/* ------------------------------------------------------------------------ */
/* Plain au-* helpers still used by older screens                            */
/* ------------------------------------------------------------------------ */
export function Field({ label, htmlFor, error, hint, required, optional, className = "", children }) {
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
