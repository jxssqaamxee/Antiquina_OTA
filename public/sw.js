// OCC Duty Log service worker.
//  - Hashed build files (/build/assets/*) are cache-first: they never change.
//  - Page navigations are network-first, falling back to the cached app shell
//    and then offline.html, so an installed app still opens with no signal.
//  - /api/* is NEVER cached (private, per-user data); the app keeps its own
//    offline copy of the logbook and syncs when the connection returns.
const VERSION = "occ-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Google sign-in, fonts, etc.
  if (url.pathname.startsWith("/api/")) return;          // private data: always network

  if (url.pathname.startsWith("/build/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
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
