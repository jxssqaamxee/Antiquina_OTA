import React from "react";
import { Link } from "react-router-dom";
import logo from "../assets/images/site-logo.png";
import occBg from "../assets/images/occ.webp";
import Footer from "./Footer";
import "../styles/auth.css";

/**
 * Two-zone auth frame, laid out like sclf_APP's login/register:
 * a brand rail on the left (laptops/desktops) and the form card on the right.
 * On phones the rail collapses into a compact header above the card.
 */
export default function AuthShell({ title, subtitle, railHeadline, railNote, children, footer, wide = false }) {
  return (
    <div className="au-wrap">
      <aside className="au-rail">
        <Link to="/" className="au-brand">
          <span className="au-brand-mark"><img src={logo} alt="" /></span>
          <span className="au-brand-text">Antiquina OTA<small>Opol Community College</small></span>
        </Link>
        <div className="au-rail-body">
          <h2>{railHeadline}</h2>
          <p>{railNote}</p>
          <ul className="au-rail-facts">
            <li>Log your daily duty hours in real time</li>
            <li>Track progress toward your required hours</li>
            <li>Export weekly and monthly PDF reports</li>
          </ul>
        </div>
      </aside>

      <main className="au-main" style={{ backgroundImage: `linear-gradient(rgba(10,18,14,.55), rgba(10,18,14,.55)), url(${occBg})` }}>
        <div className={`au-card${wide ? " is-wide" : ""}`}>
          <Link to="/" className="au-mobile-brand" aria-label="Antiquina OTA home">
            <img src={logo} alt="" />
            <span>Antiquina OTA</span>
          </Link>
          <header className="au-head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
          {footer && <p className="au-footer-line">{footer}</p>}
        </div>
        <Footer />
      </main>
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor, optional, className = "" }) {
  return (
    <div className={`au-field${error ? " has-error" : ""} ${className}`.trim()}>
      <label htmlFor={htmlFor}>{label}{optional && <em> (optional)</em>}</label>
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
