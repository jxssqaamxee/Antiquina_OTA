// OCCDL service worker.
//  - Hashed build files (/build/assets/*) are cache-first: they never change.
//  - Page navigations are network-first, falling back to the cached app shell
//    and then offline.html, so an installed app still opens with no signal.
//  - /api/* is NEVER cached (private, per-user data); the app keeps its own
//    offline copy of the logbook and syncs when the connection returns.
const VERSION = "occ-v11"; // v11: weekly timetable calendar + PNG/PDF download; v10: precaches every file of the build (images included)
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ["/offline.html", "/images/icon-192.png", "/images/icon-512.png"];

// Every file the production build made (read from Vite's manifest): scripts, styles AND images (logo,
// login background, developer photo, QR). They are all on the device after the first visit, so every
// screen draws its images with no connection, even screens that were never opened. (Same idea as
// sclf_APP's service worker.) Private photos are NOT here: they come from the database through /api and
// are kept by the app itself (utils/imageCache.js), never by this worker.
async function buildFileList() {
  try {
    const res = await fetch("/build/manifest.json", { cache: "no-cache" });
    if (!res.ok) return [];
    const manifest = await res.json();
    const urls = new Set();
    Object.values(manifest).forEach((e) => {
      if (e.file) urls.add("/build/" + e.file);
      (e.css || []).forEach((c) => urls.add("/build/" + c));
      (e.assets || []).forEach((a) => urls.add("/build/" + a));
    });
    return [...urls];
  } catch {
    return []; // dev server / no build: nothing to precache
  }
}

async function precacheBuild() {
  const assets = await caches.open(ASSETS);
  const files = await buildFileList();
  await Promise.allSettled(files.map((u) => assets.add(u).catch(() => {})));
}

// Drop hashed build files that the current build no longer has (old images and chunks), so the cache
// does not grow with every deploy. Skipped when there is no manifest: never prune blindly.
async function pruneOldBuildFiles() {
  try {
    const keep = new Set(await buildFileList());
    if (!keep.size) return;
    const assets = await caches.open(ASSETS);
    for (const req of await assets.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith("/build/assets/") && !keep.has(path)) await assets.delete(req);
    }
  } catch { /* best effort */ }
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {}),
    precacheBuild(),
  ]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      // Only this worker's OWN old versions (occ-v9-*, ...). The app's caches live beside them and must survive a
      // deploy: occ-private-photos-v1 (offline profile photos, see utils/imageCache.js) and occ-push-user.
      .then((keys) => Promise.all(keys.filter((k) => /^occ-v\d+-/.test(k) && !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k))))
      .then(pruneOldBuildFiles)
      .then(() => self.clients.claim())
  );
});

// The page asks for the update once the user taps "Update".
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// A real push from the server (php artisan push:reminders): runs even when the app is closed.
// Every push MUST show a notification, or the phone (iOS especially) cancels the subscription.
// Who is signed in on this install (set by the app, see NotificationContext). Kept in the Cache API because the
// worker is stopped and restarted all the time.
const USER_CACHE = "occ-push-user";
const USER_URL = "/__push_user";
const setPushUser = async (sub) => {
  const c = await caches.open(USER_CACHE);
  await c.put(USER_URL, new Response(sub || "none"));
};
const getPushUser = async () => {
  try { const r = await (await caches.open(USER_CACHE)).match(USER_URL); return r ? await r.text() : null; } catch { return null; }
};

self.addEventListener("message", (event) => {
  if (event.data?.type === "PUSH_USER") event.waitUntil(setPushUser(event.data.sub));
});

// A real push from the server (php artisan push:reminders): runs even when the app is closed.
// Every push MUST show a notification, or the phone (iOS especially) cancels the subscription.
// A push addressed to another account than the one signed in here (or to nobody, after sign-out) is shown
// as a plain "open the app" notice: no name, no client, no times. The server also drops the address on sign-out.
self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; }
  catch { p = { body: event.data ? event.data.text() : "" }; }

  event.waitUntil((async () => {
    const current = await getPushUser(); // "u12" | "none" | null (not told yet: show normally)
    const foreign = p.uid != null && current !== null && current !== "u" + p.uid;
    if (foreign) {
      return self.registration.showNotification("OCCDL", {
        body: "You have a reminder. Open the app to see it.",
        icon: "/images/icon-192.png",
        badge: "/images/icon-96.png",
        tag: "occ-generic",
        data: { url: "/logbook" },
      });
    }
    return self.registration.showNotification(p.title || "OCCDL", {
      body: p.body || "",
      icon: p.icon || "/images/icon-192.png",
      badge: "/images/icon-96.png",
      // Same tag as the in-app reminder, so one reminder never shows twice.
      tag: p.tag || "occ-notification",
      renotify: false,
      data: { url: p.url || "/logbook", uid: p.uid || null },
    });
  })());
});

// The browser rotated this install's push address: take the new one and ask any open window to register it
// with the server (the worker has no sign-in of its own). If no window is open, the next time the app opens
// it registers itself (see NotificationContext).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
      if (key) await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch { /* the app re-subscribes on its next start */ }
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
  })());
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
      || url.pathname.startsWith("/images/apple-touch-icon")) return;

  if (url.pathname.startsWith("/build/assets/") || url.pathname.startsWith("/images/")) {
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
