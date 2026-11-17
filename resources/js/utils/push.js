// Web Push helpers: reminders that reach the phone even when the app is CLOSED.
// (Same idea as sclf_APP's utils/push.js.) The server side is PushController + `php artisan push:reminders`.
import api from "../config/axiosConfig";

const OFF_KEY = "occ_push_off"; // set when the person turned background alerts off themselves

export const isPushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));

/** iPhone only delivers Web Push to an app added to the Home Screen (iOS 16.4+), never to a Safari tab. */
export const needsHomeScreenInstall = () => isIOS() && !isStandalone();

const getOff = () => { try { return localStorage.getItem(OFF_KEY) === "1"; } catch { return false; } };
const setOff = (v) => { try { v ? localStorage.setItem(OFF_KEY, "1") : localStorage.removeItem(OFF_KEY); } catch { /* ignore */ } };

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** Is the server's key the one this browser subscribed with? (A changed key silently stops delivery.) */
const sameKey = (sub, publicKey) => {
  try {
    const have = sub.options?.applicationServerKey;
    if (!have) return true; // cannot tell: keep it
    const want = urlBase64ToUint8Array(publicKey);
    const a = new Uint8Array(have);
    return a.length === want.length && a.every((b, i) => b === want[i]);
  } catch { return true; }
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
}

export async function currentSubscription() {
  if (!isPushSupported()) return null;
  try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
}

/**
 * Makes sure THIS device is subscribed and registered to the signed-in account.
 * Never asks for permission by itself (needs permission === "granted").
 * Returns "on" | "off" | "unsupported" | "unconfigured" | "denied" | "error".
 */
export async function syncPush({ force = false } = {}) {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  if (!force && getOff()) return "off";
  try {
    const { data } = await api.get("/push/status");
    if (!data.configured || !data.vapid_public_key) return "unconfigured";

    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, data.vapid_public_key)) { await sub.unsubscribe(); sub = null; }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.vapid_public_key),
      });
    }
    // Always (re)register: it also moves a phone that another trainee used before to THIS account.
    await api.post("/push/subscribe", sub.toJSON());
    setOff(false);
    return "on";
  } catch {
    return "error";
  }
}

/** The person taps "turn on alerts": ask permission, then subscribe. */
export async function enablePush() {
  if (!isPushSupported()) return needsHomeScreenInstall() ? "install" : "unsupported";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return "denied";
  return syncPush({ force: true });
}

/** The person turns background alerts off: unsubscribe here and tell the server. */
export async function disablePush() {
  setOff(true);
  await forgetThisDevice();
}

/** Used on sign-out too: a shared phone must not keep getting the previous trainee's reminders. */
export async function forgetThisDevice() {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await api.post("/push/unsubscribe", { endpoint }); } catch { /* the server drops dead endpoints itself */ }
  try { await sub.unsubscribe(); } catch { /* ignore */ }
}

/** Asks the server to push a test message to this account's devices. Resolves to the number of devices reached. */
export async function sendTestPush() {
  try {
    const { data } = await api.post("/push/test");
    return data.sent ?? 0;
  } catch (e) {
    return e?.response?.status === 503 ? -1 : 0;
  }
}
