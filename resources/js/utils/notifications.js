// Thin wrapper around the browser Notification API so the rest of the app
// never has to worry about missing support or unresolved permission.
import { alertsTurnedOff } from "./push";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getPermission() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function requestPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return "denied";
  }
}

// Android Chrome (and every installed PWA) forbids `new Notification()`: it throws "Illegal
// constructor", so the old code silently showed nothing on phones. A notification must be
// shown through the service worker registration. `new Notification` stays as the fallback
// for desktop browsers without a service worker.
export async function fireSystemNotification(title, body, tag) {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  if (alertsTurnedOff()) return; // switched off in the avatar menu: the bell history still keeps the message
  const options = {
    body,
    tag,
    icon: "/images/icon-192.png",
    badge: "/images/icon-96.png",
    data: { url: "/logbook" },
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch (e) {
    // The in-app toast and the bell history still carry the message.
  }
}
