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
//  A photo that answers 404 is remembered for the rest of the page, so a missing file costs
//  one request, not one per avatar on screen.

const PHOTO_CACHE = "occ-private-photos-v1";
const PRIVATE_PREFIX = "/api/me/photo";

const keep = new Set();        // decoded <img> objects (stops them being garbage-collected early)
const blobUrls = new Map();    // photo url -> blob: url
const missing = new Set();     // photo urls the server said do not exist
const inflight = new Map();    // photo url -> Promise<string|null>

/** True for the signed-in owner's own photo address. */
export const isPrivatePhotoUrl = (url) => typeof url === "string" && url.startsWith(PRIVATE_PREFIX);

/** Starts loading + decoding static images (hashed build URLs). Safe to call repeatedly. */
export function preloadImages(urls) {
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
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 300 });
  else setTimeout(run, 0);
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
    // One account's photo at a time: older versions (the ?v= changed) are dropped.
    for (const req of await cache.keys()) {
      if (new URL(req.url).pathname + new URL(req.url).search !== url) await cache.delete(req);
    }
    await cache.put(url, response);
  } catch { /* storage full / blocked: the in-memory copy still works */ }
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
        res = await fetch(url, { credentials: "same-origin", headers: { Accept: "image/*" } });
        if (res.status === 404) { missing.add(url); return null; }
        if (!res.ok) return null;                          // 401 / 5xx / offline: try again later
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

/** Sign-out / session end: forget the photo everywhere (shared phones). */
export function clearPhotoCache() {
  blobUrls.forEach((objectUrl) => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } });
  blobUrls.clear();
  missing.clear();
  inflight.clear();
  try { cacheApi()?.delete(PHOTO_CACHE); } catch { /* ignore */ }
}
