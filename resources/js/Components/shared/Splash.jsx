import React from "react";
import { useAppTheme } from "../../hooks/useAppTheme";
import logo from "../../assets/images/site-logo.png";

// Main loading screen — same design as sclf_APP's MainPage (Secure Session chip,
// floating logo, gradient title, animated bar). Styles live in styles/app.css (.mp-*).
// Follows the saved theme so there is no flash while the session is restored.
function Splash() {
  const { isDark } = useAppTheme();
  return (
    <div className={`mp-wrapper ${isDark ? "dark" : "light"}`} role="status" aria-label="Loading" aria-busy="true">
      <span className="mp-blob mp-blob-1" />
      <span className="mp-blob mp-blob-2" />
      <span className="mp-blob mp-blob-3" />
      <div className="mp-card">
        <span className="mp-chip"><span className="pulse" />Secure Session</span>
        <div className="mp-logo-wrap"><img src={logo} alt="OCC Logo" draggable={false} /></div>
        <h1 className="mp-title">OCC<span className="grad">DL</span></h1>
        <p className="mp-sub">Preparing your workspace, please wait…</p>
        <div className="mp-loader" aria-hidden="true" />
        <div className="mp-loading-text">
          Loading<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(Splash);
