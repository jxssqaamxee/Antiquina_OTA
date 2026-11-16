import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { clearToken, getToken, storeToken } from "../config/axiosConfig";
import { KEYS, EVENTS } from "../config/constant";
import { hydrate, releaseUser } from "../utils/sync";

const AuthContext = createContext(null);

// A cached copy of the profile lets an installed PWA open (and keep logging
// hours) with no connection; it is refreshed from /api/me whenever online.
const ME_CACHE = KEYS.me;
const readMe = () => { try { return JSON.parse(localStorage.getItem(ME_CACHE)); } catch { return null; } };
const writeMe = (u) => { try { u ? localStorage.setItem(ME_CACHE, JSON.stringify(u)) : localStorage.removeItem(ME_CACHE); } catch { /* ignore */ } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // `user` is only set AFTER the account's documents are in the local cache,
  // so no screen ever renders an empty logbook that is about to be filled.
  const establish = useCallback(async (u) => {
    await hydrate(u.sub);
    writeMe(u);
    setUser(u);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const { data } = await api.get("/me");
        if (!cancelled) await establish(data.user);
      } catch (e) {
        const cached = readMe();
        // Offline (no response at all): trust the cached profile. A real 401 already cleared the token.
        if (!e.response && cached && getToken() && !cancelled) setUser(cached);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [establish]);

  // Token expired / revoked while the app was open.
  useEffect(() => {
    const onUnauthorized = () => { setUser(null); writeMe(null); };
    window.addEventListener(EVENTS.unauthorized, onUnauthorized);
    return () => window.removeEventListener(EVENTS.unauthorized, onUnauthorized);
  }, []);

  /** Accepts the API's { token, expires_at, user } session payload. */
  const signIn = useCallback(async (session, remember = true) => {
    storeToken(session.token, session.expires_at, remember);
    await establish(session.user);
  }, [establish]);

  const logout = useCallback(async () => {
    const current = user;
    try { await api.post("/auth/logout"); } catch { /* token may already be dead */ }
    clearToken();
    writeMe(null);
    setUser(null);
    if (current) await releaseUser(current.sub);
  }, [user]);

  const updateUser = useCallback((u) => { writeMe(u); setUser(u); }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, signIn, logout, updateUser }),
    [user, loading, signIn, logout, updateUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
