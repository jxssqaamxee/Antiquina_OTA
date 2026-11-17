import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Splash from "../../Components/shared/Splash";
import { preloadPage } from "../../routes/loaders";

// Main loading page at "/" (same idea as sclf_APP's MainPage). The logo on the sign-in pages and in
// the logbook app bar opens it, so tapping the logo behaves like a refresh: the branded loading
// screen shows, the session and the account's documents are re-checked with the server, and then
// the person is sent where they belong (logbook, verify-email or login).
// How long the screen stays up at least. Raise it for a longer wait, 0 skips it.
export const REDIRECT_DELAY_MS = 2500;
// Never wait longer than this for the server; the cached copy is used instead.
const REFRESH_TIMEOUT_MS = 8000;

export default function SplashPage() {
  const { loading, user, refresh } = useAuth();
  const navigate = useNavigate();
  const userRef = useRef(user);
  userRef.current = user;
  const openedAt = useRef(Date.now());

  useEffect(() => { document.title = "OCCDL | Opol Community College"; }, []);

  useEffect(() => {
    if (loading) return undefined;   // the first session check is still running
    let live = true;
    let timer;
    (async () => {
      if (userRef.current) {
        await Promise.race([refresh(), new Promise((r) => setTimeout(r, REFRESH_TIMEOUT_MS))]);
      }
      // Fetch the destination page while the loading screen is still showing.
      const u0 = userRef.current;
      const target = !u0 ? "login" : u0.email_verified === false ? "verify" : "logbook";
      await Promise.race([preloadPage(target), new Promise((r) => setTimeout(r, 4000))]);
      if (!live) return;
      const wait = Math.max(0, REDIRECT_DELAY_MS - (Date.now() - openedAt.current));
      timer = setTimeout(() => {
        if (!live) return;
        const u = userRef.current;
        navigate(!u ? "/login" : u.email_verified === false ? "/verify-email" : "/logbook", { replace: true });
      }, wait);
    })();
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return <Splash />;
}
