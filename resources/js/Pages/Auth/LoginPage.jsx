import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import AuthShell, { Banner, Divider, Field } from "../../Components/auth/AuthShell";
import GoogleSignInButton from "../../Components/auth/GoogleSignInButton";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { validateLogin, focusFirstInvalid, clean } from "../../utils/validators";

export default function LoginPage() {
  const { signIn } = useAuth();
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

  const goHome = () => navigate(location.state?.from || "/logbook", { replace: true });

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
      setError(errorMessage(err));
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
      setError(errorMessage(err, "Google sign-in failed. Please try again."));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with your Student ID to open your duty logbook."
      railHeadline="Your OJT hours, always up to date."
      railNote="Sign in to log time in and out, watch your progress ring fill, and export reports for your coordinator."
      footer={<>New trainee? <Link to="/register">Create an account</Link></>}
    >
      {location.state?.registered && <Banner tone="notice">Account created. Sign in to continue.</Banner>}
      <Banner>{error}</Banner>

      <form className="au-form" onSubmit={submit} noValidate>
        <Field label="Student ID" htmlFor="student_id" error={errors.student_id} required>
          <input
            id="student_id" className="au-input" value={studentId} autoComplete="username"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text"
            placeholder="e.g. 2021-2-04062" aria-required="true" aria-invalid={!!errors.student_id}
            onChange={(e) => { setStudentId(e.target.value); setError(""); setErrors((x) => ({ ...x, student_id: undefined })); }}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password} required>
          <div className="au-pass">
            <input
              id="password" className="au-input" type={show ? "text" : "password"} value={password}
              autoComplete="current-password" placeholder="Your password" aria-required="true" aria-invalid={!!errors.password}
              onChange={(e) => { setPassword(e.target.value); setError(""); setErrors((x) => ({ ...x, password: undefined })); }}
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        <div className="au-row">
          <label className="au-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in
          </label>
        </div>

        <button className="au-btn" disabled={busy}>
          {busy ? <><span className="au-spin" /> Signing in…</> : "Sign in"}
        </button>
      </form>

      <Divider>or</Divider>
      <GoogleSignInButton onCredential={google} disabled={busy} />
    </AuthShell>
  );
}
