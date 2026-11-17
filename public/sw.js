// OCCDL service worker.
//  - Hashed build files (/build/assets/*) are cache-first: they never change.
//  - Page navigations are network-first, falling back to the cached app shell
//    and then offline.html, so an installed app still opens with no signal.
//  - /api/* is NEVER cached (private, per-user data); the app keeps its own
//    offline copy of the logbook and syncs when the connection returns.
const VERSION = "occ-v6"; // bumped: new icon URLs + stateless manifest
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png?v=3", "/icons/icon-512.png?v=3"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks for the update once the user taps "Update".
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// A real push from the server (php artisan push:reminders): runs even when the app is closed.
// Every push MUST show a notification, or the phone (iOS especially) cancels the subscription.
self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; }
  catch { p = { body: event.data ? event.data.text() : "" }; }

  event.waitUntil(
    self.registration.showNotification(p.title || "OCCDL", {
      body: p.body || "",
      icon: p.icon || "/icons/icon-192.png?v=3",
      badge: "/icons/icon-96.png?v=3",
      // Same tag as the in-app reminder, so one reminder never shows twice.
      tag: p.tag || "occ-notification",
      renotify: false,
      data: { url: p.url || "/logbook" },
    })
  );
});

// Tapping a notification opens (or focuses) the app on the right page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/logbook";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          const focused = await w.focus();
          if (focused && "navigate" in focused && new URL(focused.url).pathname !== target) { try { await focused.navigate(target); } catch { /* ignore */ } }
          return focused;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // fonts, etc.
  if (url.pathname.startsWith("/api/")) return;          // private data: always network
  // Manifest and iOS home-screen icons always go straight to the network (never answered by the worker).
  if (url.pathname === "/manifest.json" || url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/apple-touch-icon")
      || url.pathname.startsWith("/icons/apple-touch-icon") || url.pathname.startsWith("/icons/occdl-touch")) return;

  if (url.pathname.startsWith("/build/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        const type = res.headers.get("content-type") || "";
        if (res.ok && !type.includes("text/html")) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put("/app-shell", res.clone()));
          return res;
        })
        .catch(async () => (await caches.match("/app-shell")) || (await caches.match("/offline.html")))
    );
  }
});
