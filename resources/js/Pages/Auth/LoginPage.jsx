import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { IdCard, Lock } from "lucide-react";
import AuthShell, {
  Divider, LedgerBanner, LedgerButton, LedgerInput, LedgerPasswordInput, LedgerRow,
} from "../../Components/auth/AuthShell";
import GoogleSignInButton from "../../Components/auth/GoogleSignInButton";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { validateLogin, focusFirstInvalid, clean, FORMAT_HINTS } from "../../utils/validators";

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
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => { document.title = "Sign in | OCC Duty Log"; }, []);

  const goHome = () => {
    flagWelcome();
    navigate(location.state?.from || "/logbook", { replace: true });
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
      goHome();
    } catch (err) {
      setErrors(fieldErrors(err));
      fail(errorMessage(err));
      setBusy(false);
    }
  }

  async function google(credential) {
    setError(""); setBusy(true);
    try {
      const { data, status } = await api.post("/auth/google", { credential });
      if (status === 202 || data.status === "needs_registration") {
        // First time with this Google account: finish sign-up (Student ID, name, course).
        navigate("/register", { replace: true, state: { google: { credential, profile: data.profile } } });
        return;
      }
      await signIn(data, true);
      goHome();
    } catch (err) {
      fail(errorMessage(err, "Google sign-in failed. Please try again."));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      caseSeed="LOG"
      title={<>Open your <span className="accent">session</span></>}
      subtitle="Sign in with your Student ID to open your duty logbook."
      footer={<>No record on file? <Link to="/register">Open a new case file</Link></>}
    >
      {location.state?.registered && <LedgerBanner tone="notice">Account created. Sign in to continue.</LedgerBanner>}
      <LedgerBanner>{error}</LedgerBanner>

      <form onSubmit={submit} noValidate>
        <LedgerRow
          index={1} icon={IdCard} htmlFor="student_id" error={errors.student_id}
          label={<>Student ID on file <span className="lg-required" aria-hidden="true">*</span></>}
          hint={FORMAT_HINTS.studentId}
        >
          <LedgerInput
            id="student_id" value={studentId} autoComplete="username"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text"
            enterKeyHint="next" placeholder="2021-2-04062" autoFocus={canAutoFocus}
            aria-required="true" aria-invalid={!!errors.student_id}
            onChange={(e) => { setStudentId(e.target.value); setError(""); setErrors((x) => ({ ...x, student_id: undefined })); }}
          />
        </LedgerRow>

        <LedgerRow
          index={2} icon={Lock} htmlFor="password" error={errors.password}
          label={<>Password <span className="lg-required" aria-hidden="true">*</span></>}
        >
          <LedgerPasswordInput
            id="password" show={show} onToggle={() => setShow((v) => !v)} value={password}
            autoComplete="current-password" enterKeyHint="go" placeholder="Your password"
            aria-required="true" aria-invalid={!!errors.password}
            onChange={(e) => { setPassword(e.target.value); setError(""); setErrors((x) => ({ ...x, password: undefined })); }}
          />
        </LedgerRow>

        <div className="lg-remember-row">
          <label className="lg-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep this session open
          </label>
        </div>

        <LedgerButton disabled={busy}>
          {busy ? <><span className="au-spin" /> Signing in…</> : "Sign in"}
        </LedgerButton>
      </form>

      <Divider>or</Divider>
      <GoogleSignInButton onCredential={google} disabled={busy} />
    </AuthShell>
  );
}
