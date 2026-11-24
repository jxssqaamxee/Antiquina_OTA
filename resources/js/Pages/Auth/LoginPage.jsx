import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { IdCard, Lock } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerInput, LedgerPasswordInput, LedgerRow,
} from "../../Components/auth/AuthShell";
import { loadRememberedCredentials, saveRememberedCredentials, clearRememberedCredentials } from "../../hooks/useRememberedCredentials";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { validateLogin, focusFirstInvalid, clean, filterStudentIdInput, FORMAT_HINTS } from "../../utils/validators";

// iOS opens the keyboard only for a field focused by a tap, so only auto-focus
// with a real mouse. (utils/touchFocusGuard.js enforces the same on touch.)
const canAutoFocus = typeof window === "undefined" || !window.matchMedia
  || window.matchMedia("(pointer: fine)").matches;

// LogbookPage reads this once and shows "Welcome back", then removes it.
const flagWelcome = () => { try { sessionStorage.setItem("occ_login_toast", "1"); } catch { /* storage blocked */ } };

export default function LoginPage() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  // /login?verify=ok|invalid: where the link in the verification email lands.
  const verify = params.get("verify");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const userTyped = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => { document.title = "Sign in | OCCDL"; }, []);

  // Prefill ONLY the Student ID remembered by "Keep this session open". The password is never
  // stored by the app: the phone's password manager fills it (autoComplete="current-password").
  useEffect(() => {
    const remembered = loadRememberedCredentials();
    if (remembered) {
      setStudentId(remembered.studentId || "");
      setRemember(true);
    }
  }, []);

  const goHome = () => {
    flagWelcome();
    // Main loading page first; it then opens the page the person was heading to (or their home).
    try { if (location.state?.from) window.sessionStorage.setItem("occ-post-login", location.state.from); } catch { /* ignore */ }
    navigate("/", { replace: true });
  };

  // One toast for a failed sign-in (replaced, never stacked) + the banner in the card.
  const fail = (message) => {
    setError(message);
    toast.error(message, { title: "Sign in failed", key: "login-error" });
  };

  async function submit(e) {
    e.preventDefault();
    setError(""); setErrors({});
    const v = validateLogin({ student_id: studentId, password });
    if (Object.keys(v).length) {
      setErrors(v);
      setError("Please fill in the highlighted fields.");
      focusFirstInvalid(v, ["student_id", "password"]);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { student_id: clean(studentId), password, remember });
      await signIn(data, remember);
      // Ticked: keep the ID + password for the next visit to this form. Unticked: leave nothing behind.
      if (remember) saveRememberedCredentials(clean(studentId));
      else clearRememberedCredentials();
      goHome();
    } catch (err) {
      setErrors(fieldErrors(err));
      fail(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      docType="ACCESS LOG"
      caseSeed="LOG"
      title={<>Open your <span className="accent">session</span></>}
      subtitle="Sign in with your Student ID to open your duty logbook."
      railHeadline="Welcome back to your duty log."
      railNote="One record, one login — your hours, host clients and daily entries live under a single account."
      gate
      gateName="Opol Community College"
      gateLabel="Login"
      gateDefaultOpen={!!location.state?.registered || !!location.state?.passwordReset || !!verify}
      footer={<>No record on file? <Link to="/register">Sign up here</Link></>}
    >
      {location.state?.registered && <LedgerBanner tone="notice">Account created. Sign in to continue.</LedgerBanner>}
      {location.state?.passwordReset && <LedgerBanner tone="notice">Your password was reset. Sign in with the new one.</LedgerBanner>}
      {verify === "ok" && <LedgerBanner tone="notice">Your email is verified. Sign in to continue.</LedgerBanner>}
      {verify === "invalid" && <LedgerBanner>That verification link is no longer valid. Sign in and press “Resend email” to get a new one.</LedgerBanner>}
      <LedgerBanner>{error}</LedgerBanner>

      <form onSubmit={submit} noValidate>
        <LedgerRow
          index={1} icon={IdCard} htmlFor="student_id" error={errors.student_id}
          label={<>Student ID on file <span className="lg-required" aria-hidden="true">*</span></>}
          hint={FORMAT_HINTS.studentId}
        >
          <LedgerInput
            id="student_id" value={studentId} autoComplete="username" onKeyDown={() => { userTyped.current = true; }} onPaste={() => { userTyped.current = true; }} maxLength={12}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="numeric"
            enterKeyHint="next" placeholder="2021-2-04062" autoFocus={canAutoFocus}
            aria-required="true" aria-invalid={!!errors.student_id}
            onChange={(e) => { setStudentId(filterStudentIdInput(e.target.value)); setError(""); setErrors((x) => ({ ...x, student_id: undefined })); }}
          />
        </LedgerRow>

        <LedgerRow
          index={2} icon={Lock} htmlFor="password" error={errors.password}
          label={<>Password <span className="lg-required" aria-hidden="true">*</span></>}
        >
          <LedgerPasswordInput
            id="password" show={show} onToggle={() => setShow((v) => !v)} value={password}
            autoComplete="current-password" onKeyDown={() => { userTyped.current = true; }} onPaste={() => { userTyped.current = true; }} enterKeyHint="go" placeholder="Your password" maxLength={100}
            aria-required="true" aria-invalid={!!errors.password}
            onChange={(e) => { setPassword(e.target.value); setError(""); setErrors((x) => ({ ...x, password: undefined })); }}
          />
        </LedgerRow>

        <div className="lg-row-checkbox" style={{ margin: "10px 0 12px" }}>
          <label className="lg-remember" htmlFor="remember">
            <input id="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep this session open
          </label>
          <Link to="/forgot-password" className="lg-forgot">Forgot password?</Link>
        </div>

        <LedgerButton disabled={busy}>
          {busy ? <><span className="au-spin" /> Signing in…</> : "Sign in"}
        </LedgerButton>
      </form>
    </AuthShell>
  );
}
