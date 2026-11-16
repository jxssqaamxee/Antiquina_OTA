import { KEYS } from "../config/constant";
// "Install the app" support. Chrome/Edge/Samsung fire `beforeinstallprompt`
// once; we keep it so the install banner can trigger the native dialog later.
// iPhone/iPad Safari has no such API, so the banner shows the manual steps.

let deferred = null;
const listeners = new Set();
const SNOOZE_KEY = KEYS.installSnooze;
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; try { localStorage.setItem(KEYS.installed, "1"); } catch { /* ignore */ } notify(); });
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function isInstalled() {
  if (typeof window === "undefined") return false;
  try { if (localStorage.getItem(KEYS.installed)) return true; } catch { /* ignore */ }
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isInAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|Messenger|Snapchat/i.test(navigator.userAgent);
export const canNativePrompt = () => !!deferred;

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome === "accepted";
}

export function isSnoozed() {
  try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { return false; }
}
export function snooze(days = 7) {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 864e5)); } catch { /* ignore */ }
  notify();
}
