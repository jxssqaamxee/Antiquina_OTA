// FIRST import: hides the UI while browser DevTools is open (OCC_INSPECT_PROTECTION).
// It must run before anything else so it also covers the phone-only screen and DevTools device mode.
import "./utils/devtoolsGuard";
import React from "react";
import ReactDOM from "react-dom/client";
import MobileOnlyScreen from "./Components/shared/MobileOnlyScreen";
import { shouldBlockDevice } from "./utils/mobileOnly";

// OCC_MOBILE_ONLY (.env): true = the app opens only on a real phone. On any
// other device ONLY the "open on your phone" screen is rendered: no router,
// sign-in check, API call, service worker, install prompt or page chunk loads,
// and the web-app manifest is removed so a desktop browser never offers to
// install it. false = normal app everywhere.
// A tab opened before a deploy still points at page chunks (VerifyEmailPage-xxxx.js ...) the new build no longer
// has: the server answers with an HTML page and the screen goes blank. Reload ONCE to pick up the new build
// (the guard stops a reload loop if the server really is missing the file).
const RELOAD_KEY = "occ-chunk-reload";
const reloadForNewBuild = () => {
  try {
    if (window.sessionStorage.getItem(RELOAD_KEY) === "1") return;
    window.sessionStorage.setItem(RELOAD_KEY, "1");
  } catch { /* storage blocked: reload anyway, once per page load */ }
  window.location.reload();
};
window.addEventListener("vite:preloadError", (e) => { e.preventDefault?.(); reloadForNewBuild(); });
window.addEventListener("unhandledrejection", (e) => {
  const m = String(e.reason?.message || e.reason || "");
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(m)) { e.preventDefault(); reloadForNewBuild(); }
});
window.addEventListener("load", () => setTimeout(() => { try { window.sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ } }, 5000));

const root = ReactDOM.createRoot(document.getElementById("app"));

if (shouldBlockDevice()) {
  document.querySelector('link[rel="manifest"]')?.remove();
  root.render(<MobileOnlyScreen />);
} else {
  import("./bootstrap")
    .then(({ mount }) => mount(root))
    .catch(() => {
      // Almost always a stale tab after a deploy: a reload fetches the new build.
      root.render(
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
          <p>The app couldn’t load. Check your connection and reload.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    });
}
