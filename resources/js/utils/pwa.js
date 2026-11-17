import { EVENTS } from "../config/constant";

// Registers the service worker and tells the UI when a new version is waiting.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

  window.addEventListener("load", async () => {
    try {
      // The very first install also fires "controllerchange" (clients.claim). Reloading then makes the
      // page load, flash and load again. Only reload when an OLD worker is being replaced.
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register("/sw.js");

      const announce = (worker) => window.dispatchEvent(new CustomEvent(EVENTS.swUpdate, { detail: worker }));
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) announce(w);
        });
      });

      // Pick up new deploys while the app stays open (installed PWAs rarely reload).
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading || !hadController) return;
        reloading = true;
        window.location.reload();
      });
    } catch { /* offline support is a bonus: never block the app */ }
  });
}
