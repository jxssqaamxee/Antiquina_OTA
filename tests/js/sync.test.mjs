// Run: node sync.test.mjs <path-to-sync.js>   (defaults to ./sync.js)
// Copies sync.js into a temp tree with mocked ./storage and ../config/axiosConfig, then runs scenarios.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const src = path.resolve(process.argv[2] || "sync.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synctest-"));
fs.mkdirSync(path.join(dir, "utils")); fs.mkdirSync(path.join(dir, "config"));
fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
fs.writeFileSync(path.join(dir, "utils/sync.js"), fs.readFileSync(src, "utf8").replace('"../config/axiosConfig"', '"../config/axiosConfig.js"').replace('"./storage"', '"./storage.js"'));
fs.writeFileSync(path.join(dir, "utils/storage.js"), `
export const store = new Map();
export const getStorage = (k) => store.has(k) ? JSON.parse(store.get(k)) : undefined;
export const setStorage = (k, v) => { store.set(k, JSON.stringify(v)); };
export const removeStorage = (k) => { store.delete(k); };
export const getUserKey = (b, u) => "u_" + u + "::" + b;
`);
fs.writeFileSync(path.join(dir, "config/axiosConfig.js"), `
export const calls = [];
export const mock = { put: null, get: null };
export default { put: (...a) => { calls.push(["put", ...a]); return mock.put(...a); }, get: (...a) => { calls.push(["get", ...a]); return mock.get(...a); } };
`);

// browser globals
const win = new EventTarget(); const doc = new EventTarget(); doc.visibilityState = "visible"; doc.cookie = "";
globalThis.window = win; globalThis.document = doc;
const events = []; for (const n of ["occ-sync-applied", "occ-sync-rejected"]) win.addEventListener(n, (e) => events.push([n, e.detail]));
const fetches = []; globalThis.fetch = (...a) => { fetches.push(a); return Promise.resolve({}); };

const sync = await import(pathToFileURL(path.join(dir, "utils/sync.js")).href);
const { store, getStorage, setStorage } = await import(pathToFileURL(path.join(dir, "utils/storage.js")).href);
const { calls, mock } = await import(pathToFileURL(path.join(dir, "config/axiosConfig.js")).href);

const U = 7, K = "logbook-v2";
const err = (status, data = {}, headers = {}) => Object.assign(new Error("x"), { response: { status, data, headers } });
const reset = () => { store.clear(); calls.length = 0; events.length = 0; fetches.length = 0; sync.stopSync(); mock.put = null; mock.get = null; };
const local = (k = K) => getStorage(`u_${U}::${k}`);
const rev = () => getStorage(`sync-rev::u_${U}::${K}`);
const dirty = () => getStorage(`sync-dirty::u_${U}`) ?? [];
const edit = (v) => { setStorage(`u_${U}::${K}`, v); sync.queueSync(K, U); };
const hydrateWith = async (data) => { mock.get = async () => ({ data }); await sync.hydrate(U); };
let n = 0; const t = async (name, fn) => { reset(); try { await fn(); console.log("ok  ", name); n++; } catch (e) { console.error("FAIL", name, "\n", e); process.exitCode = 1; } };
const putBody = (i = 0) => calls.filter((c) => c[0] === "put")[i][2];

await t("hydrate stores revisions; first save sends base_revision + save_id; success stores new revision", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 4 } });
  assert.equal(rev(), 4); assert.deepEqual(local(), { a: 1 });
  mock.put = async () => ({ data: { ok: true, revision: 5 } });
  edit({ a: 2 }); await sync.flush(U);
  const b = putBody(); assert.deepEqual(b.value, { a: 2 }); assert.equal(b.base_revision, 4); assert.match(b.save_id, /^[\w-]{8,36}$/);
  assert.equal(rev(), 5); assert.deepEqual(dirty(), []); assert.equal(events.length, 0);
});

await t("empty account: base_revision 0; old server (docs but no revisions): base omitted", async () => {
  await hydrateWith({ documents: [] });
  assert.equal(rev(), 0);
  reset();
  await hydrateWith({ documents: { [K]: { a: 1 } } });
  assert.equal(rev(), undefined);
  mock.put = async () => ({ data: { ok: true } });
  edit({ a: 2 }); await sync.flush(U);
  assert.ok(!("base_revision" in putBody())); assert.deepEqual(dirty(), []);
});

await t("canonical value adopted when it differs and local is unchanged", async () => {
  await hydrateWith({ documents: { [K]: { h: 0 } }, revisions: { [K]: 1 } });
  mock.put = async () => ({ data: { ok: true, revision: 2, value: { h: 8 } } });
  edit({ h: 0 }); await sync.flush(U);
  assert.deepEqual(local(), { h: 8 }); assert.equal(rev(), 2); assert.deepEqual(events, [["occ-sync-applied", { key: K }]]);
});

await t("edit in flight: revision kept, dirty stays, canonical NOT applied, next save uses new revision + new save_id", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 1 } });
  let first = true;
  mock.put = async (u, body) => { if (first) { first = false; edit({ a: "typed meanwhile" }); return { data: { ok: true, revision: 2, value: { a: "canon" } } }; } return { data: { ok: true, revision: 3 } }; };
  edit({ a: 2 }); await sync.flush(U);
  assert.deepEqual(local(), { a: "typed meanwhile" }); assert.deepEqual(dirty(), [K]); assert.equal(rev(), 2);
  await sync.flush(U);
  assert.equal(putBody(1).base_revision, 2); assert.notEqual(putBody(1).save_id, putBody(0).save_id); assert.equal(rev(), 3); assert.deepEqual(dirty(), []);
});

await t("409: adopts body value+revision with no GET, parks our value, emits conflict", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 1 } });
  calls.length = 0;
  mock.put = async () => { throw err(409, { message: "m", revision: 6, value: { a: "theirs" } }); };
  edit({ a: "mine" }); await sync.flush(U);
  assert.deepEqual(local(), { a: "theirs" }); assert.equal(rev(), 6); assert.deepEqual(dirty(), []);
  assert.deepEqual(getStorage(`sync-rejected::u_${U}::${K}`), { a: "mine" });
  assert.equal(calls.filter((c) => c[0] === "get").length, 0);
  assert.deepEqual(events, [["occ-sync-applied", { key: K, conflict: true }]]);
});

await t("409 with value null (deleted elsewhere) removes local copy", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 1 } });
  mock.put = async () => { throw err(409, { revision: 3, value: null }); };
  edit({ a: "mine" }); await sync.flush(U);
  assert.equal(local(), undefined); assert.equal(rev(), 3);
});

await t("422: parked, not retried, rejected event; revision untouched", async () => {
  await hydrateWith({ documents: { [K]: {} }, revisions: { [K]: 2 } });
  mock.put = async () => { throw err(422, { errors: { value: ["bad hours"] } }); };
  edit({ bad: 1 }); await sync.flush(U);
  assert.deepEqual(dirty(), []); assert.equal(rev(), 2); assert.deepEqual(events, [["occ-sync-rejected", { key: K, message: "bad hours" }]]);
  assert.deepEqual(getStorage(`sync-rejected::u_${U}::${K}`), { bad: 1 });
});

await t("500 keeps dirty, same save_id on retry; later success clears", async () => {
  await hydrateWith({ documents: { [K]: {} }, revisions: { [K]: 2 } });
  let fail = true; mock.put = async () => { if (fail) throw err(500); return { data: { ok: true, revision: 3 } }; };
  edit({ a: 1 }); assert.equal(await sync.flush(U), false);
  assert.deepEqual(dirty(), [K]); fail = false;
  assert.equal(await sync.flush(U), true);
  assert.equal(putBody(0).save_id, putBody(1).save_id); assert.equal(putBody(1).base_revision, 2); assert.equal(rev(), 3);
  sync.stopSync();
});

await t("401 stops, keeps dirty, no retry timer scheduled", async () => {
  await hydrateWith({ documents: { [K]: {} }, revisions: { [K]: 2 } });
  mock.put = async () => { throw err(401); };
  edit({ a: 1 }); assert.equal(await sync.flush(U), false); assert.deepEqual(dirty(), [K]); assert.equal(rev(), 2);
});

await t("keepalive then re-visit: resend reuses save_id + base, duplicate response is accepted, no conflict", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 1 } });
  edit({ a: "last edit" }); // debounce timer pending; page closes first
  document.cookie = "XSRF-TOKEN=abc"; window.dispatchEvent(new Event("pagehide"));
  assert.equal(fetches.length, 1);
  const sent = JSON.parse(fetches[0][1].body);
  assert.equal(sent.base_revision, 1); assert.deepEqual(sent.value, { a: "last edit" }); assert.ok(sent.save_id);
  assert.deepEqual(dirty(), [K]); // cannot know the result
  // --- re-visit: server saved it (rev 2), client never saw the response
  sync.stopSync(); calls.length = 0;
  mock.get = async () => ({ data: { documents: { [K]: { a: "last edit" } }, revisions: { [K]: 2 } } });
  mock.put = async (u, body) => ({ data: { ok: true, revision: 2, value: { a: "last edit" }, _echo: body } });
  await sync.hydrate(U); await sync.flush(U);
  assert.equal(putBody().save_id, sent.save_id); assert.equal(putBody().base_revision, 1);
  assert.equal(rev(), 2); assert.deepEqual(dirty(), []); assert.deepEqual(local(), { a: "last edit" }); assert.equal(events.length, 0);
});

await t("re-visit after keepalive but user edited again: new save_id (new edit not mistaken for the old save)", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 1 } });
  document.cookie = "XSRF-TOKEN=abc";
  edit({ a: "one" }); window.dispatchEvent(new Event("pagehide"));
  const id1 = JSON.parse(fetches[0][1].body).save_id;
  setStorage(`u_${U}::${K}`, { a: "two" });
  mock.put = async () => ({ data: { ok: true, revision: 3 } });
  sync.stopSync(); sync.queueSync(K, U); await sync.flush(U);
  assert.notEqual(putBody().save_id, id1);
});

await t("hydrate keeps revision of dirty keys (so a change elsewhere becomes a 409, not an overwrite)", async () => {
  await hydrateWith({ documents: { [K]: { a: 1 } }, revisions: { [K]: 1 } });
  mock.put = async () => { throw err(500); };
  edit({ a: "offline" }); await sync.flush(U); sync.stopSync();
  mock.get = async () => ({ data: { documents: { [K]: { a: "other" } }, revisions: { [K]: 5 } } });
  mock.put = async () => { throw err(409, { revision: 5, value: { a: "other" } }); };
  await sync.hydrate(U); await sync.flush(U);
  assert.equal(putBody(1).base_revision, 1); assert.deepEqual(getStorage(`sync-rejected::u_${U}::${K}`), { a: "offline" });
  assert.equal(rev(), 5);
});

console.log(`\n${n} scenarios passed`); fs.rmSync(dir, { recursive: true, force: true }); process.exit(process.exitCode || 0);
