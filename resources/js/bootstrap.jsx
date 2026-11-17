import React from "react";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/crossPlatform.css"; // same buttons / fields on iPhone and Android (browser + installed PWA)
import "./utils/disableZoom"; // no pinch / double-tap zoom on phones
import "./utils/touchFocusGuard"; // iOS: skip page-load autoFocus so tapping a field opens the keyboard
import "./utils/pwaInstall"; // start listening for the browser's install event before React mounts
import RootApp from "./RootApp";
import { applyTheme } from "./utils/theme";
import { registerServiceWorker } from "./utils/pwa";
import { preloadImages } from "./utils/imageCache";
import logo from "./assets/images/site-logo.png";
import occBg from "./assets/images/occ.webp";

// Loaded by main.jsx only when this device may use the app (see utils/mobileOnly.js).
export function mount(root) {
  applyTheme(); // saved colour theme (see utils/theme.js)
  registerServiceWorker();
  preloadImages([logo, occBg]); // logo + login background decode ahead of the screens that use them
  root.render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>
  );
}
