import { EVENTS } from "../config/constant";

const CHECK_EVERY_MS = 5 * 60 * 1000; // look for a new deploy this often while the app stays open
const CHECK_MIN_GAP_MS = 30 * 1000;

// Registers the service worker and keeps the app on the newest build WITHOUT asking anyone to close and reopen it.
// When a new version is found it is installed in the background, any edit still waiting is saved, and the page
// reloads onto the new build by itself (never while the person is typing in a field).
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
      const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
      let applying = false;
      const apply = (worker) => {
        if (applying || !worker) return;
        applying = true;
        const go = () => {
          if (!document.hidden && typing()) { setTimeout(go, 3000); return; } // never pull the page away mid-typing
          try { window.dispatchEvent(new CustomEvent(EVENTS.flush)); } catch { /* ignore */ } // save the last edit first
          setTimeout(() => worker.postMessage({ type: "SKIP_WAITING" }), document.hidden ? 0 : 800);
        };
        go();
      };
      const found = (worker) => { announce(worker); apply(worker); };

      if (reg.waiting && navigator.serviceWorker.controller) found(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) found(w);
        });
      });

      // Pick up new deploys while the app stays open (installed PWAs rarely reload): on a timer, when the app
      // comes back to the front and when the connection returns.
      let lastCheck = Date.now();
      const check = () => {
        if (Date.now() - lastCheck < CHECK_MIN_GAP_MS || navigator.onLine === false) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      window.addEventListener("online", check);
      check();

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading || !hadController) return;
        reloading = true;
        window.location.reload();
      });
    } catch { /* offline support is a bonus: never block the app */ }
  });
}
