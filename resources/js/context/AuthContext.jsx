import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api, { setSignedIn } from "../config/axiosConfig";
import { KEYS, EVENTS } from "../config/constant";
import { hydrate, releaseUser, stopSync, unsyncedCount } from "../utils/sync";
import { showToast } from "../utils/eventBus";
import { setTheme } from "../utils/theme";
import { clearPhotoCache, preloadPhoto } from "../utils/imageCache";
import { forgetThisDevice, getInstallId } from "../utils/push";
import { isBlockedByApproval, isTrainee } from "../utils/roles";

const AuthContext = createContext(null);

// A cached copy of the profile lets an installed PWA open (and keep logging
// hours) with no connection; it is refreshed from /api/me whenever online.
const ME_CACHE = KEYS.me;
// Unsynced work is KEPT on the device (deleting it would lose hours), but the person must be told, because on a
// shared phone it stays until that same account signs in again.
const warnUnsynced = (userId, why) => {
  const n = unsyncedCount(userId);
  if (n > 0) {
    showToast({
      type: "warning", key: "unsynced-on-exit", duration: 12000, title: "Not saved to your account yet",
      message: `${why} Some logbook changes are saved only on this device. Sign in again with your own account to save them. Do not leave them on a shared phone.`,
    });
  }
};
const readMe = () => { try { return JSON.parse(localStorage.getItem(ME_CACHE)); } catch { return null; } };
const writeMe = (u) => { try { u ? localStorage.setItem(ME_CACHE, JSON.stringify(u)) : localStorage.removeItem(ME_CACHE); } catch { /* ignore */ } };

// "Who is signed in?" asked ONCE per page load. React StrictMode (dev) mounts the provider twice;
// sharing one request avoids two parallel calls racing to set different session / XSRF cookies
// (the cause of a random 419 on the first sign-in).
let sessionProbe = null;
function probeSession() {
  if (!sessionProbe) {
    sessionProbe = api.get("/session")
      .then(({ data }) => data.user || null)
      .finally(() => { sessionProbe = null; });
  }
  return sessionProbe;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);
  userRef.current = user;

  // `user` is only set AFTER the account's documents are in the local cache,
  // so no screen ever renders an empty logbook that is about to be filled.
  // An account whose email is not verified yet cannot reach /sync (the API is closed
  // for it), so its documents are pulled the moment it becomes verified (updateUser).
  const establish = useCallback(async (u) => {
    // Only trainees have a logbook to pull; Admin / Coordinator accounts have no /sync (403).
    if (u.email_verified !== false && !isBlockedByApproval(u) && isTrainee(u)) await hydrate(u.sub);
    if (u.theme) setTheme(u.theme); // colour theme saved on the account wins over this device's
    writeMe(u);
    preloadPhoto(u.picture); // warm the avatar cache so every screen shows it at once (no await)
    setUser(u);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The sign-in is an HttpOnly cookie we cannot see, so ask the server who is signed in.
      try {
        const me = await probeSession();
        if (me) {
          setSignedIn(true);
          if (!cancelled) await establish(me);
        } else {
          // A visitor: nothing to restore. Drop whatever a previous account left behind.
          setSignedIn(false);
          writeMe(null);
          clearPhotoCache();
        }
      } catch (e) {
        const cached = readMe();
        // Offline (no response at all): trust the cached profile so the installed app still opens.
        // Any real answer from the server (401 = session ended) means the cache is stale.
        if (!e.response && cached && !cancelled) {
          setSignedIn(true);
          preloadPhoto(cached.picture); // served from Cache Storage when offline
          setUser(cached);
        } else if (e.response) { writeMe(null); clearPhotoCache(); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [establish]);

  // Session expired / ended on the server while the app was open.
  useEffect(() => {
    const onUnauthorized = () => { warnUnsynced(userRef.current?.sub, "Your session ended."); stopSync(); setUser(null); writeMe(null); clearPhotoCache(); };
    window.addEventListener(EVENTS.unauthorized, onUnauthorized);
    return () => window.removeEventListener(EVENTS.unauthorized, onUnauthorized);
  }, []);

  /** Accepts the API's { expires_at, user } payload. The session cookie was already set by the server. */
  const signIn = useCallback(async (session) => {
    setSignedIn(true);
    await establish(session.user);
  }, [establish]);

  /**
   * "Refresh": asks the server again who is signed in and pulls the account's latest documents
   * into the local cache. Used by the loading screen that the logo opens. A network failure keeps
   * the current (cached) session; a real "signed out" answer ends it like an expired session.
   */
  const refresh = useCallback(async () => {
    try {
      const me = await probeSession();
      if (me) { setSignedIn(true); await establish(me); }
      else if (userRef.current) {
        stopSync(); setSignedIn(false); setUser(null); writeMe(null); clearPhotoCache();
      }
    } catch (e) {
      if (e.response && userRef.current) {
        stopSync(); setSignedIn(false); setUser(null); writeMe(null); clearPhotoCache();
      }
    }
  }, [establish]);

  const logout = useCallback(async () => {
    const current = userRef.current;
    // Every step below is best-effort and time-limited: signing out must ALWAYS finish. Before, one
    // step that never answered (the push worker, a slow sync) left the button "doing nothing" and the
    // person still signed in.
    const attempt = (fn, ms) => Promise.race([
      Promise.resolve().then(fn).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, ms)),
    ]);

    // Push pending edits FIRST, while the session is still valid. Done after it ends
    // every push would be rejected and the cache could never be wiped.
    try { window.dispatchEvent(new CustomEvent(EVENTS.flush)); } catch { /* ignore */ } // screens save their last edit first
    if (current) await attempt(() => releaseUser(current.sub), 6000);
    // Stop this phone getting the next person's reminders (needs the session, so before logout).
    await attempt(() => forgetThisDevice(), 6000);
    // The server session itself. If this fails the person would still be signed in after a reload,
    // so try once more before giving up.
    let ended = false;
    for (let i = 0; i < 2 && !ended; i += 1) {
      try { await api.post("/auth/logout", { install_id: getInstallId() || undefined }, { timeout: 8000 }); ended = true; }
      catch (e) { if (e.response && (e.response.status === 401 || e.response.status === 419)) ended = true; /* already gone */ }
    }
    if (current) warnUnsynced(current.sub, "You signed out, but the server could not be reached.");
    stopSync();
    setSignedIn(false);
    writeMe(null);
    clearPhotoCache();
    setUser(null);
  }, []);

  const updateUser = useCallback(async (u) => {
    const was = userRef.current;
    // The logbook opens (and its documents are pulled) once the account is verified AND approved.
    const ready = (x) => !!x && x.email_verified !== false && !isBlockedByApproval(x);
    const justVerified = !ready(was) && ready(u);
    if (justVerified && isTrainee(u)) await hydrate(u.sub);
    writeMe(u);
    preloadPhoto(u.picture); // a new upload gets a new address: load it before the avatar asks
    setUser(u);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, signIn, logout, updateUser, refresh }),
    [user, loading, signIn, logout, updateUser, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
