import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerGhostButton, LedgerInput, LedgerPasswordInput, LedgerRow,
} from "../../Components/auth/AuthShell";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import {
  codeProblem, emailNameSegment, filterCodeInput, normalizeEmailInput, SCHOOL_EMAIL_REGEX,
} from "../../utils/validators";

// Shown after registering (and after signing in) until the email is verified, same flow as
// sclf_APP: type the 6-digit code from the email, or open the link in it. The server
// (EnsureEmailVerified) keeps the rest of the API closed meanwhile.
const RESEND_COOLDOWN_SECONDS = 60;
// While this page is open, quietly re-check the account so the app moves on by itself after
// the link is opened (maybe on another device).
const POLL_INTERVAL_MS = 8000;

const maskEmail = (email) => {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.charAt(0)}${"*".repeat(Math.max(local.length - 2, 1))}${local.charAt(local.length - 1)}@${domain}`;
};

const linkButton = {
  background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 700, color: "var(--lg-accent)",
};

export default function VerifyEmailPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS); // an email was just sent
  const [changing, setChanging] = useState(false);
  const [change, setChange] = useState({ email: "", current_password: "" });
  const [changeErrors, setChangeErrors] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => { document.title = "Verify your email | OCCDL"; }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Re-read the account. Used by the button, on focus, and every few seconds.
  const recheck = useCallback(async (showMessage = false, quiet = false) => {
    if (!quiet) setChecking(true);
    try {
      const { data } = await api.get("/me");
      if (data.user.email_verified === false && showMessage) {
        setError("Your email is not verified yet. Type the code from the email, or open the link in it.");
      }
      await updateUser(data.user); // verified -> the route guard moves on to the logbook
    } catch { /* a dead session is handled by the global 401 handler */ }
    finally { if (!quiet) setChecking(false); }
  }, [updateUser]);

  useEffect(() => {
    const onFocus = () => recheck(false, true);
    const onVisible = () => { if (document.visibilityState === "visible") recheck(false, true); };
    const id = setInterval(onVisible, POLL_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [recheck]);

  async function submitCode(e) {
    e.preventDefault();
    setError(""); setMessage("");
    const problem = codeProblem(code);
    if (problem) { setError(problem); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/email/verify-code", { code });
      if (data.user) await updateUser(data.user);
      else await recheck(false, true);
    } catch (err) {
      setError(errorMessage(err, "Could not verify the code. Please try again."));
      setCode("");
      setSubmitting(false);
    }
  }

  async function resend() {
    setError(""); setMessage(""); setSending(true);
    try {
      const { data } = await api.post("/email/verification-notification");
      setMessage(data.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode("");
      if (data.email_verified) await recheck(false, true);
    } catch (err) {
      setError(errorMessage(err, "Could not send the email. Please try again."));
    } finally {
      setSending(false);
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    setError(""); setMessage(""); setChangeErrors({});
    const email = normalizeEmailInput(change.email);
    const errs = {};
    if (!email) errs.email = "Gmail address is required.";
    else if (!SCHOOL_EMAIL_REGEX.test(email)) errs.email = "Use the format occ.lastname.firstname@gmail.com.";
    else if (SCHOOL_EMAIL_REGEX.exec(email)[1] !== emailNameSegment(user.last_name)) errs.email = `The email must start with occ.${emailNameSegment(user.last_name) || "lastname"}. so it matches your Last name.`;
    if (!change.current_password) errs.current_password = "Enter your current password.";
    if (Object.keys(errs).length) { setChangeErrors(errs); return; }

    setSavingEmail(true);
    try {
      const { data } = await api.post("/email/change", { email, current_password: change.current_password });
      setMessage(data.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setChanging(false);
      setChange({ email: "", current_password: "" });
      setCode("");
      await updateUser(data.user);
    } catch (err) {
      setChangeErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSavingEmail(false);
    }
  }

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  const lastNameSeg = emailNameSegment(user?.last_name) || "lastname";

  return (
    <AuthShell
      docType="EMAIL VERIFICATION"
      caseSeed="VER"
      centerHead
      title={<>Check your <span className="accent">email</span></>}
      subtitle="We sent a 6-digit code and a verification link to your Gmail. Type the code below, or open the link, to activate your account."
      railHeadline="One quick step."
      railNote="The code and link expire in 60 minutes. If you can't find the email, check your spam folder or send a new one."
      footer={<>Wrong account? <button type="button" onClick={signOut} style={linkButton}>Sign out</button></>}
    >
      <LedgerBanner>{error}</LedgerBanner>
      <LedgerBanner tone="notice">{message}</LedgerBanner>

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", margin: "4px 0 16px", fontWeight: 600, wordBreak: "break-all" }}>
        <Mail size={15} strokeWidth={2.25} /> {maskEmail(user?.email)}
      </div>

      <form onSubmit={submitCode} noValidate>
        <LedgerRow
          index={1} icon={ShieldCheck} htmlFor="verify-code"
          label={<>Verification code <span className="lg-required" aria-hidden="true">*</span></>}
          hint="6 digits, numbers only."
        >
          <LedgerInput
            id="verify-code" value={code} maxLength={6} inputMode="numeric" pattern="[0-9]*"
            autoComplete="one-time-code" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="123456"
            aria-required="true" aria-invalid={!!error}
            onChange={(e) => { setCode(filterCodeInput(e.target.value)); setError(""); }}
          />
        </LedgerRow>
        <LedgerButton disabled={submitting || code.length !== 6}>
          {submitting ? <><span className="au-spin" /> Verifying…</> : "Verify code"}
        </LedgerButton>
      </form>

      <div className="lg-actions-row" style={{ marginTop: 16 }}>
        <LedgerGhostButton onClick={resend} disabled={sending || cooldown > 0}>
          {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
        </LedgerGhostButton>
        <LedgerButton type="button" disabled={checking} onClick={() => recheck(true)}>
          {checking ? "Checking…" : "I've verified"}
        </LedgerButton>
      </div>

      {!changing ? (
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
          Typed your email wrong?{" "}
          <button type="button" onClick={() => { setChanging(true); setError(""); setMessage(""); }} style={linkButton}>Change it</button>
        </p>
      ) : (
        <form onSubmit={saveEmail} noValidate style={{ marginTop: 18 }}>
          <LedgerRow
            index={2} icon={Mail} htmlFor="change-email" error={changeErrors.email}
            label={<>Correct Gmail <span className="lg-required" aria-hidden="true">*</span></>}
            hint={`Format: occ.${lastNameSeg}.firstname@gmail.com (all lowercase).`}
          >
            <LedgerInput
              id="change-email" type="email" inputMode="email" value={change.email}
              autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
              placeholder={`occ.${lastNameSeg}.juan@gmail.com`} aria-required="true" aria-invalid={!!changeErrors.email}
              onChange={(e) => { setChange((c) => ({ ...c, email: normalizeEmailInput(e.target.value) })); setChangeErrors((x) => ({ ...x, email: undefined })); }}
            />
          </LedgerRow>
          <LedgerRow
            index={3} icon={Lock} htmlFor="change-password" error={changeErrors.current_password}
            label={<>Current password <span className="lg-required" aria-hidden="true">*</span></>}
          >
            <LedgerPasswordInput
              id="change-password" show={showPw} onToggle={() => setShowPw((v) => !v)} value={change.current_password}
              autoComplete="current-password" maxLength={100} enterKeyHint="go" aria-required="true" aria-invalid={!!changeErrors.current_password}
              onChange={(e) => { setChange((c) => ({ ...c, current_password: e.target.value })); setChangeErrors((x) => ({ ...x, current_password: undefined })); }}
            />
          </LedgerRow>
          <div className="lg-actions-row" style={{ marginTop: 12 }}>
            <LedgerGhostButton onClick={() => { setChanging(false); setChangeErrors({}); }} disabled={savingEmail}>Cancel</LedgerGhostButton>
            <LedgerButton disabled={savingEmail}>{savingEmail ? "Saving…" : "Save & resend"}</LedgerButton>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
