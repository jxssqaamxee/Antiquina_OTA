import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hourglass } from "lucide-react";
import AuthShell, { LedgerBanner, LedgerButton } from "../../Components/auth/AuthShell";
import api from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";

// Shown to a verified trainee whose registration a coordinator / admin has not approved yet (or refused).
// The server (EnsureApproved) keeps the rest of the API closed meanwhile; this page re-checks quietly.
const POLL_INTERVAL_MS = 15000;

const linkButton = {
  background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 700, color: "var(--lg-accent)",
};

export default function PendingApprovalPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const rejected = user?.approval_status === "rejected";

  useEffect(() => { document.title = "Waiting for approval | OCCDL"; }, []);

  const recheck = useCallback(async (quiet = false) => {
    if (!quiet) setChecking(true);
    try {
      const { data } = await api.get("/me");
      await updateUser(data.user); // approved -> the route guard moves on to the logbook
    } catch { /* a dead session is handled by the global 401 handler */ }
    finally { if (!quiet) setChecking(false); }
  }, [updateUser]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") recheck(true); };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [recheck]);

  async function signOut() {
    try { await logout(); } finally { navigate("/login", { replace: true }); }
  }

  return (
    <AuthShell
      docType="REGISTRATION REVIEW"
      caseSeed="APR"
      centerHead
      title={rejected ? <>Registration <span className="accent">not approved</span></> : <>Waiting for <span className="accent">approval</span></>}
      subtitle={rejected
        ? "Your coordinator did not approve this registration. Please contact your coordinator or the administrator."
        : "Your email is verified. Your coordinator (or an administrator) still has to approve your registration before you can use the app."}
      railHeadline={rejected ? "Needs attention." : "Almost there."}
      railNote={rejected ? "If you think this is a mistake, ask your coordinator to check your Student ID and course." : "This page checks for you every few seconds. You can close the app and come back later."}
      footer={<>Wrong account? <button type="button" onClick={signOut} style={linkButton}>Sign out</button></>}
    >
      <LedgerBanner tone="notice"><Hourglass size={14} strokeWidth={2.25} aria-hidden="true" /> {rejected ? "Status: not approved" : "Status: pending approval"}</LedgerBanner>
      {!rejected && (
        <LedgerButton type="button" disabled={checking} onClick={() => recheck(false)} style={{ marginTop: 16 }}>
          {checking ? "Checking…" : "Check again"}
        </LedgerButton>
      )}
    </AuthShell>
  );
}
