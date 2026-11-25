import { EVENTS } from "../config/constant";

// Registers the service worker and tells the UI when a new worker is waiting. The pop-up itself (and the
// "new build deployed" check) lives in Components/shared/UpdateNotice.jsx, like sclfAPP.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

  window.addEventListener("load", async () => {
    try {
      // The very first install also fires "controllerchange" (clients.claim). Reloading then makes the
      // page load, flash and load again. Only reload when an OLD worker is being replaced.
      const hadController = !!navigator.serviceWorker.controller;
      // updateViaCache "none": the browser never answers the sw.js check from its HTTP cache, so a deploy is seen at once.
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

      const announce = (worker) => window.dispatchEvent(new CustomEvent(EVENTS.swUpdate, { detail: worker }));
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) announce(w);
        });
      });

      // Installed PWAs rarely reload: also look for a new sw.js while the app stays open (UpdateNotice checks too).
      setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading || !hadController) return;
        reloading = true;
        window.location.reload();
      });
    } catch { /* offline support is a bonus: never block the app */ }
  });
}
