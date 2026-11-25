import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { EVENTS } from "../../config/constant";

// Tells the person when a NEW VERSION of the app is ready (browser tab or installed PWA) and lets them update
// with one tap, or choose "Later". Same idea as sclfAPP. Two signals, either one shows the pop-up:
//   1. A new service worker finished installing and is waiting (sw.js changed).
//   2. /build/manifest.json differs from the one this page started with, i.e. a new build was deployed.
//      This is the important one: sw.js is often byte-identical between deploys, so the browser would never
//      report an update by itself.
// Re-checks when the app comes back to the screen, when the connection returns and every few minutes.
// Never checks while offline, and does nothing on the Vite dev server (no build manifest there).

const MANIFEST_URL = "/build/manifest.json";
const CHECK_EVERY_MS = 5 * 60 * 1000;   // "real time" enough for a deploy; the file is tiny
const REMIND_AFTER_MS = 10 * 60 * 1000; // "Later" asks again after this long

export default function UpdateNotice() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const baseline = useRef(null);   // manifest text this page started with
  const dismissedAt = useRef(0);
  const readyRef = useRef(false);

  const show = useCallback(() => {
    if (readyRef.current) return;
    if (dismissedAt.current && Date.now() - dismissedAt.current < REMIND_AFTER_MS) return;
    readyRef.current = true;
    setReady(true);
  }, []);

  const fetchManifest = useCallback(async () => {
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const text = await res.text();
      return text.trim().startsWith("{") ? text : null; // ignore an HTML fallback page
    } catch { return null; }
  }, []);

  const check = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.update().catch(() => {});
          if (reg.waiting && navigator.serviceWorker.controller) show();
        }
      }
    } catch { /* ignore */ }
    if (baseline.current) {
      const now = await fetchManifest();
      if (now && now !== baseline.current) show();
    }
  }, [fetchManifest, show]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    (async () => {
      baseline.current = await fetchManifest();
      if (cancelled || !("serviceWorker" in navigator)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting && navigator.serviceWorker.controller) show();
      } catch { /* ignore */ }
    })();

    // pwa.js reports a worker that finished installing while the app is open.
    const onWorker = () => show();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener(EVENTS.swUpdate, onWorker);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    const id = setInterval(check, CHECK_EVERY_MS);
    const first = setTimeout(check, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENTS.swUpdate, onWorker);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
      clearInterval(id);
      clearTimeout(first);
    };
  }, [check, fetchManifest, show]);

  const update = useCallback(async () => {
    setBusy(true);
    // Screens write any edit still waiting in their debounce timer; anything unsynced stays safe on the device.
    try { window.dispatchEvent(new CustomEvent(EVENTS.flush)); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 400));
    let reloaded = false;
    const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
          setTimeout(reload, 2000); // safety net
          return;
        }
      }
    } catch { /* fall through */ }
    reload();
  }, []);

  const later = useCallback(() => {
    dismissedAt.current = Date.now();
    readyRef.current = false;
    setReady(false);
  }, []);

  if (!ready) return null;
  return (
    <div className="update-notice" role="alertdialog" aria-live="polite" aria-label="A new version is available">
      <span className="update-notice-text">
        <b>A new version is available</b>
        <small>Update now to get the latest improvements.</small>
      </span>
      <span className="update-notice-actions">
        <button type="button" onClick={update} disabled={busy}><RefreshCw size={14} /> {busy ? "Updating…" : "Update now"}</button>
        <button type="button" className="is-later" onClick={later} disabled={busy}>Later</button>
      </span>
    </div>
  );
}
