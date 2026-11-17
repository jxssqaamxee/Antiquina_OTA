import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerInput, LedgerRow, Stamp,
} from "../../Components/auth/AuthShell";
import api, { errorMessage } from "../../config/axiosConfig";
import { GMAIL_REGEX, normalizeEmailInput } from "../../utils/validators";

// Recovery flow: enter the Gmail -> we always answer the same way ("if an account uses this
// email...") so this page can never be used to find out who has an account. The server only
// sends an email when the address really belongs to an account. Resending waits 60 seconds.

const RESEND_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const timer = useRef(null);

  useEffect(() => { document.title = "Forgot password | OCCDL"; }, []);
  useEffect(() => () => clearInterval(timer.current), []);

  function startCountdown() {
    clearInterval(timer.current);
    setWait(RESEND_SECONDS);
    timer.current = setInterval(() => {
      setWait((w) => {
        if (w <= 1) { clearInterval(timer.current); return 0; }
        return w - 1;
      });
    }, 1000);
  }

  async function send(e) {
    e?.preventDefault();
    setError("");
    const value = normalizeEmailInput(email);
    if (!GMAIL_REGEX.test(value)) { setError("Enter the Gmail address you registered with."); return; }
    setBusy(true);
    try {
      await api.post("/forgot-password", { email: value });
      setEmail(value);
      setSent(true);
      startCountdown();
    } catch (err) {
      setError(errorMessage(err, "We could not send the email right now. Please try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  const tryAnother = () => { setSent(false); setError(""); clearInterval(timer.current); setWait(0); };

  return (
    <AuthShell
      docType="RECOVERY REQUEST"
      caseSeed="REC"
      centerHead={sent}
      title={sent ? <>Check your <span className="accent">email</span></> : <>Recover <span className="accent">access</span></>}
      subtitle={sent
        ? "If an account uses this email, we've sent a secure password reset link to it."
        : "Give us the Gmail on your account and we'll send you a reset link."}
      railHeadline={sent ? "Almost there." : "Locked out happens to everyone."}
      railNote={sent
        ? "The link expires in 60 minutes. Check the spam folder too."
        : "We never say whether an address has an account. That keeps everyone's record private."}
      footer={<>Remembered it after all? <Link to="/login">Back to sign in</Link></>}
    >
      <LedgerBanner>{error}</LedgerBanner>

      {!sent && (
        <form onSubmit={send} noValidate>
          <LedgerRow index={1} icon={Mail} htmlFor="email" label={<>Gmail on file <span className="lg-required" aria-hidden="true">*</span></>} hint="The Gmail you registered with, e.g. occ.lastname.firstname@gmail.com">
            <LedgerInput
              id="email" type="email" inputMode="email" value={email} autoComplete="email"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"
              placeholder="occ.lastname.firstname@gmail.com" aria-required="true" aria-invalid={!!error}
              onChange={(e) => { setEmail(normalizeEmailInput(e.target.value)); setError(""); }}
            />
          </LedgerRow>
          <LedgerButton disabled={busy} style={{ marginTop: 16 }}>{busy ? "Sending…" : "Send reset link"}</LedgerButton>
        </form>
      )}

      {sent && (
        <>
          <Stamp label="REQUEST RECEIVED" />
          <LedgerBanner tone="notice">
            If an account uses <strong>{email}</strong>, a password reset link is on its way. Check your inbox and the spam folder.
          </LedgerBanner>
          <div className="lg-actions-row" style={{ marginTop: 16 }}>
            <LedgerButton type="button" disabled={busy || wait > 0} onClick={send}>
              {busy ? "Sending…" : wait > 0 ? `Resend in ${wait}s` : "Resend the link"}
            </LedgerButton>
          </div>
          <button type="button" className="lg-resend-link" onClick={tryAnother}>Use a different email</button>
        </>
      )}
    </AuthShell>
  );
}
