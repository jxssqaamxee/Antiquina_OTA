// Local cache for the logbook.
//
// The server is the source of truth (see utils/sync.js); this file is the fast,
// offline-capable copy the UI reads and writes synchronously:
//
// 1. PER-USER NAMESPACING. Everything is stored under a key scoped to the
//    signed-in account, so two trainees using the same phone never see or
//    overwrite each other's hours. The cache is also wiped on sign-out.
// 2. REDUNDANT BACKUP KEY. Every write is duplicated so a single corrupted or
//    cleared entry can heal itself from its twin instead of coming back empty.

import { queueSync } from "./sync";

const PREFIX = "ojt_";
const BACKUP_SUFFIX = "__backup";

const backingStore = (() => {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
})();

function safeParse(raw) {
  if (typeof raw !== "string") return { ok: false, value: undefined };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, value: undefined };
  }
}

export function getStorage(key) {
  try {
    const raw = backingStore.getItem(PREFIX + key);
    if (raw !== null && raw !== undefined) {
      const parsed = safeParse(raw);
      if (parsed.ok) return parsed.value;
    }
  } catch (e) {
    // fall through to backup
  }

  // Primary copy is missing or corrupted — recover from the backup copy.
  try {
    const rawBackup = backingStore.getItem(PREFIX + key + BACKUP_SUFFIX);
    if (rawBackup !== null && rawBackup !== undefined) {
      const parsedBackup = safeParse(rawBackup);
      if (parsedBackup.ok) {
        try {
          backingStore.setItem(PREFIX + key, JSON.stringify(parsedBackup.value)); // heal the primary
        } catch (e) {}
        return parsedBackup.value;
      }
    }
  } catch (e) {}

  return null;
}

export function setStorage(key, value) {
  let ok = false;
  try {
    backingStore.setItem(PREFIX + key, JSON.stringify(value));
    ok = true;
  } catch (e) {
    ok = false;
  }

  // Best-effort redundant copy — failure here shouldn't fail the whole write.
  try {
    backingStore.setItem(PREFIX + key + BACKUP_SUFFIX, JSON.stringify(value));
  } catch (e) {}

  return ok;
}

export function removeStorage(key) {
  try {
    backingStore.removeItem(PREFIX + key);
    backingStore.removeItem(PREFIX + key + BACKUP_SUFFIX);
    return true;
  } catch (e) {
    return false;
  }
}

// Detects storage that's disabled, full, or otherwise non-functional — e.g.
// Safari private browsing (which throws on write) or a full quota.
export function isStorageAvailable() {
  try {
    const testKey = PREFIX + "__probe__";
    backingStore.setItem(testKey, "1");
    backingStore.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Per-user namespacing
// ---------------------------------------------------------------------

// Turns a base key like "logbook-v2" into an account-scoped key like
// "logbook-v2::u_12" so two different accounts signed in
// on the same browser never read or write each other's data. `userId`
// is the stable per-account id from the server (user.sub).
export function getUserKey(base, userId) {
  return userId ? `${base}::u_${userId}` : base;
}

// Account-scoped wrappers. Writes also queue a background sync to the server.
export function getUserStorage(base, userId) {
  return getStorage(getUserKey(base, userId));
}

export function setUserStorage(base, userId, value) {
  const ok = setStorage(getUserKey(base, userId), value);
  if (ok) queueSync(base, userId);
  return ok;
}

export function removeUserStorage(base, userId) {
  return removeStorage(getUserKey(base, userId));
}
