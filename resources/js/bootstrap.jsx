import React from "react";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/crossPlatform.css"; // same buttons / fields on iPhone and Android (browser + installed PWA)
import "./utils/disableZoom"; // no pinch / double-tap zoom on phones
import "./utils/touchFocusGuard"; // iOS: skip page-load autoFocus so tapping a field opens the keyboard
import "./utils/pwaInstall"; // start listening for the browser's install event before React mounts
import RootApp from "./RootApp";
import { registerServiceWorker } from "./utils/pwa";

// Loaded by main.jsx only when this device may use the app (see utils/mobileOnly.js).
export function mount(root) {
  registerServiceWorker();
  root.render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>
  );
}
