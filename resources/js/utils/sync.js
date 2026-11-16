// Write-through sync between the browser cache and the server.
//
// The logbook keeps reading/writing a fast local copy (utils/storage.js), and
// every change is queued here and PUT to /api/sync/{key}. If the phone is
// offline the key stays marked "dirty" and is retried when the connection
// returns, so a trainee can keep logging hours with no signal.

import api from "../config/axiosConfig";
import { getStorage, setStorage, removeStorage, getUserKey } from "./storage";

const SYNC_KEYS = ["logbook-v2", "milestones-v1", "shift-reminder-v1", "onboarding-seen-v1", "notifications-v1"];
const DEBOUNCE_MS = 700;
const RETRY_MS = 30000;

let timer = null;
let retryTimer = null;
let activeUser = null;
let flushing = null;

const dirtyKey = (userId) => `sync-dirty::u_${userId}`;
const readDirty = (userId) => {
  const v = getStorage(dirtyKey(userId));
  return Array.isArray(v) ? v : [];
};
const writeDirty = (userId, list) => (list.length ? setStorage(dirtyKey(userId), list) : removeStorage(dirtyKey(userId)));

/** Called by storage.setUserStorage after every local write. */
export function queueSync(base, userId) {
  if (!userId || !SYNC_KEYS.includes(base)) return;
  activeUser = userId;
  const dirty = readDirty(userId);
  if (!dirty.includes(base)) writeDirty(userId, [...dirty, base]);
  clearTimeout(timer);
  timer = setTimeout(() => flush(userId), DEBOUNCE_MS);
}

export function flush(userId = activeUser) {
  if (!userId) return Promise.resolve(true);
  if (flushing) return flushing.then(() => flush(userId));
  flushing = (async () => {
    let allOk = true;
    for (const base of readDirty(userId)) {
      const value = getStorage(getUserKey(base, userId));
      try {
        // Another write may land while the request is in flight: only clear the
        // dirty flag if the value is still the one we sent.
        const sent = JSON.stringify(value);
        await api.put(`/sync/${base}`, { value: value === undefined ? null : value });
        if (JSON.stringify(getStorage(getUserKey(base, userId))) === sent) {
          writeDirty(userId, readDirty(userId).filter((k) => k !== base));
        }
      } catch (e) {
        allOk = false;
        if (e.response?.status === 404 || e.response?.status === 413) {
          // The server will never accept this key/size: stop retrying it.
          writeDirty(userId, readDirty(userId).filter((k) => k !== base));
        }
      }
    }
    scheduleRetry(userId);
    return allOk;
  })().finally(() => { flushing = null; });
  return flushing;
}

function scheduleRetry(userId) {
  clearTimeout(retryTimer);
  if (readDirty(userId).length) retryTimer = setTimeout(() => flush(userId), RETRY_MS);
}

/**
 * Pull the account's documents into the local cache before the app renders.
 * Keys with unsynced local edits win (they are pushed right after); if the
 * server is unreachable the existing local copy is used as-is.
 */
export async function hydrate(userId) {
  activeUser = userId;
  const dirty = readDirty(userId);
  try {
    const { data } = await api.get("/sync");
    const docs = data.documents || {};
    for (const base of SYNC_KEYS) {
      if (dirty.includes(base)) continue;
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

/** Sign-out: push anything pending, then wipe this account's local copy (shared phones). */
export async function releaseUser(userId) {
  if (!userId) return;
  clearTimeout(timer);
  await Promise.race([flush(userId), new Promise((r) => setTimeout(r, 4000))]);
  clearTimeout(retryTimer);
  // Keep unsynced data if the push failed — it will be pushed on next sign-in.
  if (readDirty(userId).length === 0) {
    for (const base of SYNC_KEYS) removeStorage(getUserKey(base, userId));
    removeStorage(dirtyKey(userId));
  }
  if (activeUser === userId) activeUser = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => activeUser && flush(activeUser));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && activeUser) flush(activeUser);
  });
  window.addEventListener("pagehide", () => activeUser && flush(activeUser));
}
