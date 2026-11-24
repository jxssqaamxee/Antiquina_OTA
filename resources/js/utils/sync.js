// Write-through sync between the browser cache and the server.
//
// The logbook keeps reading/writing a fast local copy (utils/storage.js), and
// every change is queued here and PUT to /api/sync/{key}. If the phone is
// offline the key stays marked "dirty" and is retried when the connection
// returns, so a trainee can keep logging hours with no signal.
//
// Events dispatched on window (all optional to listen to):
//   occ-sync-rejected  {key, message}  the server refused this data (HTTP 422). The refused
//                                      value is kept in a recovery slot, never thrown away.
//   occ-sync-applied   {key, conflict?} the server's copy replaced the local copy (conflict or
//                                      server-authoritative fields). Pages that hold the
//                                      document in React state should re-read it. On a
//                                      conflict our version is kept in the recovery slot.
//
// Revisions: the server numbers every document. We remember the revision we last saw per
// user+key and send it as base_revision with each save. A save based on an older revision
// gets HTTP 409 + the server's document. Each save also carries a save_id (persisted before
// sending, tied to the exact value) so a keepalive save whose response we never saw is
// recognised by the server as ours when we resend it on the next visit.

import api from "../config/axiosConfig";
import { getStorage, setStorage, removeStorage, getUserKey } from "./storage";

const SYNC_KEYS = ["logbook-v2", "milestones-v1", "shift-reminder-v1", "onboarding-seen-v1", "notifications-v1"];
const DEBOUNCE_MS = 700;
const RETRY_BASE_MS = 5000;        // first retry after a failure
const RETRY_MAX_MS = 5 * 60000;    // never wait longer than this between retries
const KEEPALIVE_LIMIT = 60000;     // browsers cap keepalive request bodies at ~64 KB

let timer = null;
let retryTimer = null;
let activeUser = null;
let flushing = null;
let failures = 0;                  // consecutive failed flushes, drives the backoff
let paused = false;                // server said "verify your email first" (403 email_unverified) or "waiting for approval" (403 account_pending): stop pushing

const dirtyKey = (userId) => `sync-dirty::u_${userId}`;
const rejectedKey = (userId, base) => `sync-rejected::u_${userId}::${base}`;
const revKey = (userId, base) => `sync-rev::u_${userId}::${base}`;
const saveIdKey = (userId, base) => `sync-saveid::u_${userId}::${base}`;
const readRev = (userId, base) => {
  const v = getStorage(revKey(userId, base));
  return Number.isInteger(v) && v >= 0 ? v : null; // null = unknown (old server / never hydrated)
};
const writeRev = (userId, base, rev) => {
  if (Number.isInteger(rev) && rev >= 0) setStorage(revKey(userId, base), rev);
};
const newId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};
const signature = (str) => { // FNV-1a + length: identifies "the same value" without storing it twice
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${str.length}:${h.toString(16)}`;
};
/**
 * The save_id for this exact value. Same value -> same id (a retry or a keepalive resend must
 * be recognisable); a changed value -> a new id (otherwise the server would mistake a NEW edit
 * for a repeat of the old save and drop it). Persisted before the request goes out.
 */
function saveIdFor(userId, base, serialized) {
  const sig = signature(serialized);
  const cur = getStorage(saveIdKey(userId, base));
  if (cur && cur.sig === sig && typeof cur.id === "string") return cur.id;
  const id = newId();
  setStorage(saveIdKey(userId, base), { id, sig });
  return id;
}
/** Request body for one save. base_revision is left out when unknown (server then last-write-wins). */
function saveBody(userId, base, value) {
  const v = value === undefined ? null : value;
  const body = { value: v, save_id: saveIdFor(userId, base, JSON.stringify(v)) };
  const rev = readRev(userId, base);
  if (rev !== null) body.base_revision = rev;
  return body;
}
const readDirty = (userId) => {
  const v = getStorage(dirtyKey(userId));
  return Array.isArray(v) ? v : [];
};
const writeDirty = (userId, list) => (list.length ? setStorage(dirtyKey(userId), list) : removeStorage(dirtyKey(userId)));
const clearDirty = (userId, base) => writeDirty(userId, readDirty(userId).filter((k) => k !== base));
const emit = (name, detail) => {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
};
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** How many logbook documents of this account are saved only on this device (not yet on the server). */
export const unsyncedCount = (userId) => (userId ? readDirty(userId).length : 0);

/** Called by storage.setUserStorage after every local write. */
export function queueSync(base, userId) {
  if (!userId || !SYNC_KEYS.includes(base)) return;
  activeUser = userId;
  const dirty = readDirty(userId);
  if (!dirty.includes(base)) writeDirty(userId, [...dirty, base]);
  // Unverified account: keep the change locally (dirty) and push it after verification (hydrate()).
  if (paused) return;
  clearTimeout(timer);
  timer = setTimeout(() => flush(userId), DEBOUNCE_MS);
}

/** Server said how long to wait (429 Retry-After, in seconds), else exponential backoff with jitter. */
function nextDelay(retryAfterSec) {
  if (retryAfterSec > 0) return Math.min(retryAfterSec * 1000, RETRY_MAX_MS);
  const exp = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
  return Math.round(exp * (0.75 + Math.random() * 0.5));
}

export function flush(userId = activeUser) {
  // Only ever push the account that is signed in RIGHT NOW. Every request carries the
  // current session cookie, so pushing another account's cache would write that
  // person's logbook into the wrong account (shared phone, expired session).
  if (!userId || userId !== activeUser) return Promise.resolve(true);
  if (paused) return Promise.resolve(true);
  if (flushing) return flushing.then(() => flush(userId));
  flushing = (async () => {
    let allOk = true;
    let retryAfter = 0;
    let sessionGone = false;

    for (const base of readDirty(userId)) {
      if (userId !== activeUser) { allOk = false; break; } // account changed mid-flush
      const value = getStorage(getUserKey(base, userId));
      const sent = JSON.stringify(value);
      try {
        const res = await api.put(`/sync/${base}`, saveBody(userId, base, value));
        if (userId !== activeUser) { allOk = false; break; }
        // Always remember the new revision, even if the user kept typing meanwhile:
        // their next save must be based on it.
        writeRev(userId, base, res?.data?.revision);
        // Another write may land while the request is in flight: only clear the
        // dirty flag (and accept the server's copy) if the value is still the one we sent.
        const unchanged = JSON.stringify(getStorage(getUserKey(base, userId))) === sent;
        if (unchanged) {
          clearDirty(userId, base);
          removeStorage(saveIdKey(userId, base));
          removeStorage(rejectedKey(userId, base));
          // Server-authoritative fields (e.g. hours the server recalculated): the server may
          // answer with the canonical document. Adopt it when it differs from what we sent.
          const canonical = res?.data?.value;
          if (canonical !== undefined && !sameValue(canonical, value)) {
            setStorage(getUserKey(base, userId), canonical);
            emit("occ-sync-applied", { key: base });
          }
        }
      } catch (e) {
        allOk = false;
        const status = e.response?.status;

        if (status === 401) {
          // Session ended. axiosConfig already told the app; stop pushing, keep the data dirty
          // so it goes out after the next sign-in.
          sessionGone = true;
          break;
        }
        if (status === 403 && ["email_unverified", "role_forbidden", "account_pending", "account_rejected"].includes(e.response?.data?.code)) {
          // The account's email is not verified yet (or its role has no logbook), so the server closes
          // /sync for it. This is not an error: pause (no retry loop, no console spam), keep the data dirty, and push it the
          // moment the account is verified (AuthContext.updateUser -> hydrate()).
          paused = true;
          clearTimeout(timer);
          clearTimeout(retryTimer);
          break;
        }
        if (status === 409 || status === 412) {
          // Someone else (another device) changed this document first. The 409 body carries the
          // server's document and revision: adopt them directly, and keep our newest local
          // version recoverable (it includes anything typed while the request was in flight).
          const body = e.response?.data;
          const ours = getStorage(getUserKey(base, userId));
          setStorage(rejectedKey(userId, base), ours === undefined ? value : ours);
          clearDirty(userId, base);
          removeStorage(saveIdKey(userId, base));
          if (body && Number.isInteger(body.revision)) {
            if (body.value === undefined || body.value === null) removeStorage(getUserKey(base, userId)); // deleted elsewhere
            else setStorage(getUserKey(base, userId), body.value);
            writeRev(userId, base, body.revision);
          } else {
            await adoptServerCopy(userId, base); // old-style 409/412 without a body
          }
          emit("occ-sync-applied", { key: base, conflict: true });
          continue;
        }
        if (status === 404 || status === 413 || status === 422) {
          // The server will never accept this key/size/content: stop retrying it (a 422 would
          // otherwise be re-sent every 30 s forever). The refused value is parked in a recovery
          // slot because the next hydrate() replaces the local copy with the server's.
          setStorage(rejectedKey(userId, base), value);
          clearDirty(userId, base);
          if (status === 422) {
            const errs = e.response?.data?.errors;
            const first = errs ? Object.values(errs).flat()[0] : null;
            emit("occ-sync-rejected", {
              key: base,
              message: first || e.response?.data?.message || "The server could not accept this data.",
            });
          }
          continue;
        }
        if (status === 429) retryAfter = Number(e.response?.headers?.["retry-after"]) || 0;
        // Network error, timeout, 5xx, 429: keep it dirty and retry with backoff.
      }
    }

    failures = allOk ? 0 : failures + 1;
    if (!sessionGone && !paused) scheduleRetry(userId, retryAfter);
    return allOk;
  })().finally(() => { flushing = null; });
  return flushing;
}

function scheduleRetry(userId, retryAfterSec = 0) {
  clearTimeout(retryTimer);
  if (userId === activeUser && readDirty(userId).length) {
    retryTimer = setTimeout(() => flush(userId), nextDelay(retryAfterSec));
  }
}

/** Replace one key's local copy with the server's (used after a conflict). */
async function adoptServerCopy(userId, base) {
  try {
    const { data } = await api.get("/sync");
    const docs = data.documents || {};
    if (userId !== activeUser) return;
    if (Object.prototype.hasOwnProperty.call(docs, base)) setStorage(getUserKey(base, userId), docs[base]);
    else removeStorage(getUserKey(base, userId));
    applyRevision(userId, base, data, docs);
  } catch { /* offline: the conflict resolves on the next hydrate */ }
}

/** Remember the server's revision for one key (0 when the server has nothing for it yet). */
function applyRevision(userId, base, data, docs) {
  const revs = data.revisions && typeof data.revisions === "object" ? data.revisions : null;
  const has = Object.prototype.hasOwnProperty.call(docs, base);
  if (revs && Number.isInteger(revs[base])) writeRev(userId, base, revs[base]);
  else if (!has && (revs || Object.keys(docs).length === 0)) writeRev(userId, base, 0); // nothing saved yet
  else removeStorage(revKey(userId, base)); // old server without revisions: stay last-write-wins
}

/**
 * Pull the account's documents into the local cache before the app renders.
 * Keys with unsynced local edits win (they are pushed right after); if the
 * server is unreachable the existing local copy is used as-is.
 */
export async function hydrate(userId) {
  if (activeUser !== userId) stopSync(); // a different account: drop the old one's timers
  activeUser = userId;
  paused = false; // hydrate only runs for a verified account: resume pushing
  const dirty = readDirty(userId);
  try {
    const { data } = await api.get("/sync");
    const docs = data.documents || {};
    for (const base of SYNC_KEYS) {
      // Unsynced local edits win and keep their old revision: the push that follows is based on
      // it, so a change made elsewhere meanwhile is reported as a conflict, not overwritten.
      if (dirty.includes(base)) continue;
      applyRevision(userId, base, data, docs);
      if (Object.prototype.hasOwnProperty.call(docs, base)) {
        setStorage(getUserKey(base, userId), docs[base]);
      } else {
        // Nothing on the server: don't keep a stale copy from another session.
        removeStorage(getUserKey(base, userId));
      }
    }
  } catch { /* offline or server error: continue with the local cache */ }
  flush(userId);
}

/**
 * Forget the current account: cancel pending/retry pushes. Called when the session dies
 * (401) so a leftover timer can never fire under the next person's token. The unsynced
 * data stays in this account's local cache and is pushed after their next sign-in.
 */
export function stopSync() {
  clearTimeout(timer);
  clearTimeout(retryTimer);
  timer = null;
  retryTimer = null;
  activeUser = null;
  failures = 0;
  paused = false;
}

/** Sign-out: push anything pending, then wipe this account's local copy (shared phones). */
export async function releaseUser(userId) {
  if (!userId) return;
  clearTimeout(timer);
  await Promise.race([flush(userId), new Promise((r) => setTimeout(r, 4000))]);
  clearTimeout(retryTimer);
  // Keep unsynced data if the push failed — it will be pushed on next sign-in.
  if (readDirty(userId).length === 0) {
    for (const base of SYNC_KEYS) {
      removeStorage(getUserKey(base, userId));
      removeStorage(rejectedKey(userId, base));
      removeStorage(revKey(userId, base));
      removeStorage(saveIdKey(userId, base));
    }
    removeStorage(dirtyKey(userId));
  }
  if (activeUser === userId) activeUser = null;
}

/**
 * Last-chance push when the page is being closed. A normal axios request is cancelled by the
 * browser on unload, so the final edit before closing the app could be lost. fetch with
 * keepalive survives the unload. Only used for small payloads (browser limit ~64 KB); anything
 * larger stays dirty and is pushed on the next visit.
 */
function flushOnUnload(userId) {
  if (typeof fetch === "undefined" || paused) return;
  const xsrf = (document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1];
  if (!xsrf) return;
  let budget = KEEPALIVE_LIMIT;
  for (const base of readDirty(userId)) {
    // Same body shape as a normal save. save_id is persisted by saveBody() before the request is
    // sent, so after a re-visit the resend carries the same id and the server treats it as ours.
    // We cannot read the response here; the dirty flag stays until a normal flush succeeds.
    const body = JSON.stringify(saveBody(userId, base, getStorage(getUserKey(base, userId))));
    if (body.length > budget) continue;
    budget -= body.length;
    try {
      fetch(`/api/sync/${base}`, {
        method: "PUT",
        keepalive: true,
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-XSRF-TOKEN": decodeURIComponent(xsrf),
        },
        body,
      }).catch(() => {});
    } catch { /* leave it dirty */ }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { failures = 0; if (activeUser) flush(activeUser); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && activeUser) flush(activeUser);
  });
  // pagehide: the page may die before an axios call finishes, so send what is pending with keepalive.
  window.addEventListener("pagehide", () => { if (activeUser) flushOnUnload(activeUser); });
}
