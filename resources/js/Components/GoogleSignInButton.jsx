import React, { useEffect, useRef } from "react";
import { useConfig } from "../utils/config";

const SCRIPT_ID = "gsi-client-script";

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let el = document.getElementById(SCRIPT_ID);
    if (!el) {
      el = document.createElement("script");
      el.id = SCRIPT_ID;
      el.src = "https://accounts.google.com/gsi/client";
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    }
    el.addEventListener("load", resolve);
    el.addEventListener("error", reject);
  });
}

/**
 * Google's own "Sign in with Google" button. `onCredential(idToken)` receives
 * the signed ID token, which the server verifies (POST /api/auth/google).
 */
export default function GoogleSignInButton({ onCredential, text = "signin_with", disabled = false }) {
  const config = useConfig();
  const slot = useRef(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const clientId = config?.google_client_id;

  useEffect(() => {
    if (!clientId || !slot.current) return undefined;
    let cancelled = false;

    loadGsi().then(() => {
      if (cancelled || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => r?.credential && handler.current?.(r.credential),
        ux_mode: "popup",
        auto_select: false,
      });
      const width = Math.min(400, Math.max(200, Math.round(slot.current.clientWidth || 300)));
      slot.current.innerHTML = "";
      window.google.accounts.id.renderButton(slot.current, {
        theme: "outline", size: "large", shape: "rectangular", text, width, logo_alignment: "center",
      });
    }).catch(() => {
      if (slot.current) slot.current.textContent = "Google sign-in could not load. Check your connection.";
    });

    return () => { cancelled = true; };
  }, [clientId, text]);

  if (config && !clientId) {
    return (
      <div className="google-btn-missing" role="note">
        Google sign-in is not set up yet. Add <code>GOOGLE_CLIENT_ID</code> to <code>.env</code>.
      </div>
    );
  }

  return (
    <div className={`google-btn-slot${disabled ? " is-disabled" : ""}`} ref={slot} aria-busy={!clientId} />
  );
}
