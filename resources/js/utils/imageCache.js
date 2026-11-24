// Image preload + cache.
//
//  1. STATIC images (logo, login background) are decoded ahead of time, so a screen that
//     uses them paints at once. They are hashed build files, so the service worker keeps
//     them cache-first as well (public/sw.js) and they also work offline.
//
//  2. The PRIVATE profile photo (GET /api/me/photo?v=...) is fetched once per upload, kept
//     as a blob in memory for instant avatars on every screen, and mirrored in Cache Storage
//     so the installed app still shows it offline. It is private data: the cache is wiped on
//     sign-out and when the session ends (clearPhotoCache), and the service worker itself
//     never caches /api/*.
//
//  3. REVIEW photos: the registration photo an Admin / Coordinator checks before approving
//     (GET /api/{admin|coordinator}/registrations/{id}/photo) goes through the same private
//     cache, so "View" opens at once and a reviewed list is preloaded while the staff member
//     reads it. syncPhotoSet() drops the ones that are no longer pending.
//
//  A photo that answers 404 is remembered for the rest of the page, so a missing file costs
//  one request, not one per avatar on screen.

const PHOTO_CACHE = "occ-private-photos-v1";
const PRIVATE_PREFIX = "/api/me/photo";
const REVIEW_PHOTO = /^\/api\/(admin|coordinator)\/registrations\/\d+\/photo/;

const keep = new Set();        // decoded <img> objects (stops them being garbage-collected early)
const blobUrls = new Map();    // photo url -> blob: url
const missing = new Set();     // photo urls the server said do not exist
const inflight = new Map();    // photo url -> Promise<string|null>

const isOwnerPhotoUrl = (url) => typeof url === "string" && url.startsWith(PRIVATE_PREFIX);
const isReviewPhotoUrl = (url) => typeof url === "string" && REVIEW_PHOTO.test(url);

/** True for a private photo address: the owner's own photo, or a registration photo being reviewed. */
export const isPrivatePhotoUrl = (url) => isOwnerPhotoUrl(url) || isReviewPhotoUrl(url);

/**
 * Starts loading + decoding static images (hashed build URLs). Safe to call repeatedly.
 * `{ late: true }` is for images no screen needs at first paint (developer photo, QR): they wait
 * until the page has finished loading, so they never compete with the screen being opened.
 */
export function preloadImages(urls, { late = false } = {}) {
  if (typeof Image === "undefined") return;
  const run = () => {
    for (const url of urls) {
      if (!url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      keep.add(img);
      if (img.decode) img.decode().catch(() => { /* a failed preload is harmless */ });
    }
  };
  // Never compete with the first paint: wait for an idle moment (or 300 ms at most).
  const schedule = () => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: late ? 4000 : 300 });
    else setTimeout(run, late ? 1500 : 0);
  };
  if (late && typeof document !== "undefined" && document.readyState !== "complete") {
    window.addEventListener("load", schedule, { once: true });
  } else {
    schedule();
  }
}

/** The photo's in-memory blob: url if it was already preloaded, else null. */
export const cachedPhoto = (url) => blobUrls.get(url) || null;

const cacheApi = () => (typeof caches !== "undefined" ? caches : null);

async function readCached(url) {
  try {
    const c = cacheApi();
    return c ? await (await c.open(PHOTO_CACHE)).match(url, { ignoreVary: true }) : undefined;
  } catch { return undefined; }
}

async function writeCached(url, response) {
  try {
    const c = cacheApi();
    if (!c) return;
    const cache = await c.open(PHOTO_CACHE);
    // One owner photo at a time: older versions (the ?v= changed) are dropped.
    // Review photos are one per registration, so they are never pruned here (see syncPhotoSet).
    if (isOwnerPhotoUrl(url)) {
      for (const req of await cache.keys()) {
        const key = new URL(req.url).pathname + new URL(req.url).search;
        if (isOwnerPhotoUrl(key) && key !== url) await cache.delete(req);
      }
    }
    await cache.put(url, response);
  } catch { /* storage full / blocked: the in-memory copy still works */ }
}

// A download that fails for a passing reason (server busy or restarting, a dropped connection) is
// retried a few times with a growing pause, as the sclf_APP avatar loader does, instead of giving up
// on the first hiccup. A real answer (404 no photo, 401/403 not allowed) and being offline are final.
export const RETRY_DELAYS = [0, 700, 1800]; // ms before each attempt
const retryable = (status) => status >= 500 || status === 408 || status === 429;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url, delays = RETRY_DELAYS) {
  for (const delay of delays) {
    if (delay) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return null; // offline: retrying is pointless
      await sleep(delay);
    }
    try {
      const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "image/*" }, cache: delay ? "reload" : "default" });
      if (res.status === 404) { missing.add(url); return null; }
      if (res.ok) return res;
      if (!retryable(res.status)) return null;
    } catch { /* network error: try again */ }
  }
  return null;
}

/**
 * Loads the owner's photo into the cache (Cache Storage first, then the network).
 * Resolves to a blob: url for <img src>, or null when there is no usable photo.
 */
export function preloadPhoto(url) {
  if (!isPrivatePhotoUrl(url) || missing.has(url)) return Promise.resolve(null);
  if (blobUrls.has(url)) return Promise.resolve(blobUrls.get(url));
  if (inflight.has(url)) return inflight.get(url);

  const job = (async () => {
    try {
      let res = await readCached(url);
      if (!res) {
        res = await download(url);
        if (!res) return null;                             // 404 / 401 / still failing / offline: try again later
        writeCached(url, res.clone());
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") || blob.size === 0) return null;
      const objectUrl = URL.createObjectURL(blob);
      blobUrls.set(url, objectUrl);
      // Decode now so the avatar paints without a flash.
      try { const img = new Image(); img.src = objectUrl; keep.add(img); await img.decode?.(); } catch { /* ignore */ }
      return objectUrl;
    } catch {
      return null;                                         // offline and not cached
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, job);
  return job;
}

/** Preloads a list of private photos one after another (idle time, at most `max`). */
export function preloadPhotos(urls, max = 20) {
  const list = [...new Set((urls || []).filter(isPrivatePhotoUrl))].slice(0, max);
  if (!list.length) return;
  const run = async () => { for (const u of list) await preloadPhoto(u); };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 0);
}

/**
 * Keeps only the review photos still on screen: a registration that was approved, rejected or
 * removed no longer needs its photo kept on this device.
 */
export function syncPhotoSet(urls) {
  const keepSet = new Set(urls || []);
  for (const [u, objectUrl] of [...blobUrls]) {
    if (isReviewPhotoUrl(u) && !keepSet.has(u)) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
      blobUrls.delete(u);
    }
  }
  for (const u of [...missing]) if (isReviewPhotoUrl(u) && !keepSet.has(u)) missing.delete(u);
  (async () => {
    try {
      const c = cacheApi();
      if (!c) return;
      const cache = await c.open(PHOTO_CACHE);
      for (const req of await cache.keys()) {
        const key = new URL(req.url).pathname + new URL(req.url).search;
        if (isReviewPhotoUrl(key) && !keepSet.has(key)) await cache.delete(req);
      }
    } catch { /* storage blocked: nothing to prune */ }
  })();
}

/** Sign-out / session end: forget the photo everywhere (shared phones). */
export function clearPhotoCache() {
  blobUrls.forEach((objectUrl) => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } });
  blobUrls.clear();
  missing.clear();
  inflight.clear();
  try { cacheApi()?.delete(PHOTO_CACHE); } catch { /* ignore */ }
}
