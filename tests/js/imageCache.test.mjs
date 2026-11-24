// Run: node tests/js/imageCache.test.mjs
// Checks utils/imageCache.js with a fake fetch + a fake Cache Storage (no browser needed):
//   - transient failures are retried, final answers (404 / 401) and being offline are not
//   - review photos (admin / coordinator) are cached beside the owner's photo without evicting it
//   - syncPhotoSet drops review photos that are no longer pending; clearPhotoCache wipes everything
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(here, "../../resources/js/utils/imageCache.js")).href);
const { preloadPhoto, cachedPhoto, syncPhotoSet, clearPhotoCache, isPrivatePhotoUrl } = mod;

// ---- fake Cache Storage ----
const stores = new Map();
const abs = (u) => (u.startsWith("http") ? u : `http://app.test${u}`);
globalThis.caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      async match(u) { const r = m.get(abs(String(u.url || u))); return r ? r.clone() : undefined; },
      async put(u, res) { m.set(abs(String(u.url || u)), res); },
      async delete(u) { return m.delete(abs(String(u.url || u))); },
      async keys() { return [...m.keys()].map((url) => ({ url })); },
    };
  },
  async delete(name) { return stores.delete(name); },
};
const cacheKeys = () => [...(stores.get("occ-private-photos-v1") || new Map()).keys()].map((u) => u.replace("http://app.test", ""));

// ---- fake fetch: a script of statuses per call ----
let script = []; let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  const step = script.shift();
  if (step === "throw") throw new TypeError("network");
  const status = step ?? 200;
  return new Response(status === 200 ? new Uint8Array([1, 2, 3]) : "x", { status, headers: { "Content-Type": status === 200 ? "image/jpeg" : "text/plain" } });
};
const run = (steps) => { script = [...steps]; calls = 0; };

let n = 0; const ok = (name) => console.log(`  ok ${++n} - ${name}`);

// 1. address rules
assert.equal(isPrivatePhotoUrl("/api/me/photo?v=abc"), true);
assert.equal(isPrivatePhotoUrl("/api/admin/registrations/12/photo?v=abc"), true);
assert.equal(isPrivatePhotoUrl("/api/coordinator/registrations/3/photo"), true);
assert.equal(isPrivatePhotoUrl("/api/admin/registrations"), false);
assert.equal(isPrivatePhotoUrl("/api/admin/users/1/photo"), false);
assert.equal(isPrivatePhotoUrl("https://evil.test/api/me/photo"), false);
ok("only the owner photo and review photos count as private photos");

// 2. transient failures retry, then succeed
run([503, "throw", 200]);
const t0 = Date.now();
const got = await preloadPhoto("/api/me/photo?v=aaa");
assert.ok(got && got.startsWith("blob:"), "got a blob url");
assert.equal(calls, 3);
assert.ok(Date.now() - t0 >= 2300, "waited 700 + 1800 ms between attempts");
assert.equal(cachedPhoto("/api/me/photo?v=aaa"), got);
ok("503 and a dropped connection are retried (3 attempts) and then the photo loads");

// 3. final answers are not retried
run([404]);
assert.equal(await preloadPhoto("/api/admin/registrations/1/photo?v=x"), null);
assert.equal(calls, 1);
run([200]);
assert.equal(await preloadPhoto("/api/admin/registrations/1/photo?v=x"), null);
assert.equal(calls, 0, "a 404 is remembered: no second request");
ok("404 is final and remembered (one request, not one per avatar)");

run([401]);
assert.equal(await preloadPhoto("/api/me/photo?v=unauth"), null);
assert.equal(calls, 1);
ok("401 is final (no retry)");

// 4. offline: do not sit in a retry loop
Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
run(["throw", "throw", "throw"]);
assert.equal(await preloadPhoto("/api/me/photo?v=offline"), null);
assert.equal(calls, 1);
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
ok("offline stops after the first failed attempt");

// 5. review photos live beside the owner's photo
run([200, 200, 200]);
await preloadPhoto("/api/admin/registrations/10/photo?v=v1");
await preloadPhoto("/api/admin/registrations/11/photo?v=v1");
assert.ok(cacheKeys().includes("/api/me/photo?v=aaa"));
assert.ok(cacheKeys().includes("/api/admin/registrations/10/photo?v=v1"));
assert.ok(cacheKeys().includes("/api/admin/registrations/11/photo?v=v1"));
ok("review photos do not evict the owner's photo (and vice versa)");

// 6. a NEW owner photo replaces the old owner photo only
run([200]);
await preloadPhoto("/api/me/photo?v=bbb");
assert.ok(!cacheKeys().includes("/api/me/photo?v=aaa"), "old owner photo dropped");
assert.ok(cacheKeys().includes("/api/me/photo?v=bbb"));
assert.ok(cacheKeys().includes("/api/admin/registrations/10/photo?v=v1"), "review photos untouched");
ok("a new owner photo replaces only the old owner photo");

// 7. syncPhotoSet: registration 11 was approved -> its photo goes; 10 stays; owner photo stays
syncPhotoSet(["/api/admin/registrations/10/photo?v=v1"]);
await new Promise((r) => setTimeout(r, 20));
assert.deepEqual(cacheKeys().sort(), ["/api/admin/registrations/10/photo?v=v1", "/api/me/photo?v=bbb"].sort());
assert.equal(cachedPhoto("/api/admin/registrations/11/photo?v=v1"), null);
assert.ok(cachedPhoto("/api/admin/registrations/10/photo?v=v1"));
assert.ok(cachedPhoto("/api/me/photo?v=bbb"));
ok("syncPhotoSet drops photos that are no longer pending and keeps the rest");

// 8. a changed picture = a new address = a fresh download
run([200]);
await preloadPhoto("/api/admin/registrations/10/photo?v=v2");
assert.equal(calls, 1, "new ?v= is not served from the old copy");
syncPhotoSet(["/api/admin/registrations/10/photo?v=v2"]);
await new Promise((r) => setTimeout(r, 20));
assert.ok(!cacheKeys().includes("/api/admin/registrations/10/photo?v=v1"), "old version pruned");
ok("a new photo version is fetched fresh and the old version is pruned");

// 9. sign-out wipes everything
clearPhotoCache();
await new Promise((r) => setTimeout(r, 20));
assert.equal(cachedPhoto("/api/me/photo?v=bbb"), null);
assert.equal(stores.has("occ-private-photos-v1"), false);
ok("sign-out clears memory and Cache Storage");

console.log(`\nimageCache: ${n} checks passed`);
