import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerGhostButton, LedgerPasswordInput, LedgerRow,
  PasswordMatchNote, RequirementChecklist, Stamp, StrengthTicks,
} from "../../Components/auth/AuthShell";
import api, { errorMessage } from "../../config/axiosConfig";
import { passwordProblem } from "../../utils/validators";

// One-time reset links (same behaviour as sclf_APP): good for ONE successful reset, within
// 60 minutes, and only until a newer link is requested. The server enforces that; this page
// checks the link when it opens and shows "link no longer valid" instead of the form.

const LINK_MESSAGES = {
  link_expired: {
    title: <>Link <span className="accent">expired</span></>, stamp: "LINK EXPIRED",
    headline: "That link has timed out.",
    note: "Reset links only work for a short time. Request a fresh one and we will email it right away.",
    text: "This reset link has expired. For your security, links only work for a short time. Please request a new one.",
  },
  link_invalid: {
    title: <>Link no longer <span className="accent">valid</span></>, stamp: "LINK REVOKED",
    headline: "This link has been retired.",
    note: "Each reset link works once. If you already changed your password with it, or asked for a newer link, the old one is closed.",
    text: "This reset link is no longer valid. It may have already been used, been replaced by a newer link, or never belonged to this account. Please request a new link.",
  },
};

export default function ResetPasswordPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const email = searchParams.get("email") || "";
  // Opened from /reset-password/administrator/...: everything returns to the staff sign-in, never the trainee one.
  const staff = location.pathname.startsWith("/reset-password/administrator");
  const signInPath = staff ? "/administrator" : "/login";
  const forgotPath = staff ? "/forgot-password/administrator" : "/forgot-password";

  const [phase, setPhase] = useState(token && email ? "checking" : "blocked"); // checking | form | blocked
  const [blockedCode, setBlockedCode] = useState("link_invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSuccessRoute = !token;
  const resetJustDone = isSuccessRoute && !!location.state?.passwordReset;

  useEffect(() => { document.title = "Reset password | OCCDL"; }, []);

  // Is the emailed link still usable? Runs on open and when the browser restores the page from its cache.
  useEffect(() => {
    if (isSuccessRoute) return undefined;
    if (!token || !email) { setBlockedCode("link_invalid"); setPhase("blocked"); return undefined; }
    let cancelled = false;
    const verify = async () => {
      try {
        const { data } = await api.post("/password/reset-token/check", { token, email });
        if (cancelled) return;
        // Admins / Coordinators always finish on the staff pages, trainees on the trainee ones, whichever address was opened.
        if (data?.data?.valid && !!data.data.staff !== staff) {
          navigate(`${data.data.staff ? "/reset-password/administrator/" : "/reset-password/"}${encodeURIComponent(token)}${location.search}`, { replace: true });
          return;
        }
        if (data?.data?.valid) setPhase((p) => (p === "blocked" ? p : "form"));
        else { setBlockedCode(data?.data?.reason === "expired" ? "link_expired" : "link_invalid"); setPhase("blocked"); }
      } catch {
        // Offline / rate limited: don't lock anyone out — the server still refuses a bad link on submit.
        if (!cancelled) setPhase((p) => (p === "blocked" ? p : "form"));
      }
    };
    verify();
    const onShow = (e) => { if (e.persisted) verify(); };
    window.addEventListener("pageshow", onShow);
    return () => { cancelled = true; window.removeEventListener("pageshow", onShow); };
  }, [token, email, isSuccessRoute, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = passwordProblem(password);
  const matches = password.length > 0 && password === confirm;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (problem) { setError(problem); return; }
    if (!matches) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await api.post("/reset-password", { token, email, password, password_confirmation: confirm });
      // REPLACE so the form (and its spent token) is gone from history.
      navigate(staff ? "/reset-password/administrator/success" : "/reset-password/success", { replace: true, state: { passwordReset: true } });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "link_expired" || code === "link_invalid") { setBlockedCode(code); setPhase("blocked"); }
      else setError(errorMessage(err, "We could not reset your password just now. Please check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  // /reset-password/success opened directly: nothing to show.
  if (isSuccessRoute && !resetJustDone) return <Navigate to={signInPath} replace />;

  if (!isSuccessRoute && phase === "checking") {
    return (
      <AuthShell
        docType="CREDENTIAL REISSUE" caseSeed="RST" legalNote={staff ? null : undefined}
        title={<>Checking your <span className="accent">link</span></>}
        subtitle="One moment while we confirm this reset link is still valid."
        railHeadline="Almost back in." railNote="Reset links work once and only for a short time, so we check yours first."
      >
        <LedgerBanner tone="notice">Verifying your link…</LedgerBanner>
      </AuthShell>
    );
  }

  if (!isSuccessRoute && phase === "blocked") {
    const m = LINK_MESSAGES[blockedCode] || LINK_MESSAGES.link_invalid;
    return (
      <AuthShell
        docType="CREDENTIAL REISSUE" caseSeed="RST" legalNote={staff ? null : undefined} title={m.title} centerHead
        subtitle="We can't use this link to change a password."
        railHeadline={m.headline} railNote={m.note}
      >
        <Stamp label={m.stamp} tone="danger" />
        <LedgerBanner>{m.text}</LedgerBanner>
        <div className="lg-stack">
          <LedgerButton type="button" onClick={() => navigate(forgotPath, { replace: true })}>Request a new link</LedgerButton>
          <LedgerGhostButton onClick={() => navigate(signInPath, { replace: true })}>Back to sign in</LedgerGhostButton>
        </div>
      </AuthShell>
    );
  }

  if (resetJustDone) {
    return (
      <AuthShell
        docType="CREDENTIAL REISSUE" caseSeed="RST" legalNote={staff ? null : undefined} centerHead
        title={<>Credential <span className="accent">reissued</span></>}
        subtitle="Your password has been changed successfully."
        railHeadline="You're all set." railNote="Sign in with your new password to get back to your duty log."
        footer={<>Ready to go? <Link to={signInPath}>Sign in here</Link></>}
      >
        <Stamp label="RESET COMPLETE" />
        <LedgerBanner tone="notice">Your password has been reset. Please sign in with your new password.</LedgerBanner>
        <LedgerButton type="button" onClick={() => navigate(signInPath, { replace: true, state: { passwordReset: true } })}>Go to sign in</LedgerButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      docType="CREDENTIAL REISSUE" caseSeed="RST" legalNote={staff ? null : undefined}
      title={<>Set a <span className="accent">new</span> password</>}
      subtitle="Choose a strong, secure password for your account."
      railHeadline="Almost back in." railNote="Choose a strong new password so your record — and every hour you've logged — stays secure."
      footer={<>Remember your password? <Link to={signInPath}>Sign in here</Link></>}
    >
      <LedgerBanner>{error}</LedgerBanner>
      <form onSubmit={submit} noValidate>
        <LedgerRow index={1} icon={Lock} htmlFor="password" label={<>New password <span className="lg-required" aria-hidden="true">*</span></>}>
          <LedgerPasswordInput
            id="password" show={show} onToggle={() => setShow((v) => !v)} value={password}
            autoComplete="new-password" maxLength={100} placeholder="Create a password" enterKeyHint="next"
            aria-required="true" aria-invalid={!!error}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
          />
          <StrengthTicks password={password} />
        </LedgerRow>
        <LedgerRow index={2} icon={Lock} htmlFor="password_confirmation" label={<>Confirm password <span className="lg-required" aria-hidden="true">*</span></>}>
          <LedgerPasswordInput
            id="password_confirmation" show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} value={confirm}
            autoComplete="new-password" maxLength={100} placeholder="Repeat password" enterKeyHint="go"
            aria-required="true" aria-invalid={!!error}
            onChange={(e) => { setConfirm(e.target.value); setError(""); }}
          />
          <PasswordMatchNote password={password} confirm={confirm} />
        </LedgerRow>
        <RequirementChecklist password={password} />
        <LedgerButton disabled={busy || !!problem || !matches} style={{ marginTop: 14 }}>
          {busy ? <><span className="au-spin" /> Resetting…</> : "Reset password"}
        </LedgerButton>
      </form>
    </AuthShell>
  );
}
