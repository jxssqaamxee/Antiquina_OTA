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
