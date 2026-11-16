import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import AuthShell, { Banner, Divider, Field } from "../../Components/auth/AuthShell";
import GoogleSignInButton from "../../Components/auth/GoogleSignInButton";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useConfig } from "../../config/serverConfig";
import { useAuth } from "../../context/AuthContext";
import {
  FORMAT_HINTS, validateRegister, focusFirstInvalid, clean,
  filterNameInput, filterStudentIdInput, normalizeEmailInput,
} from "../../utils/validators";

// Live input filters: a field can't accept a character that could never be valid.
const FILTERS = {
  student_id: filterStudentIdInput,
  first_name: filterNameInput,
  middle_name: filterNameInput,
  last_name: filterNameInput,
  email: normalizeEmailInput,
};
const FIELD_ORDER = ["email", "student_id", "first_name", "middle_name", "last_name", "course", "password", "password_confirmation"];

export default function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const config = useConfig();

  const [google, setGoogle] = useState(location.state?.google || null); // { credential, profile }
  const [form, setForm] = useState(() => ({
    student_id: "", first_name: google?.profile?.first_name || "", middle_name: "", last_name: google?.profile?.last_name || "",
    email: google?.profile?.email || "", course: "", password: "", password_confirmation: "",
  }));
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Create account | OCC Duty Log"; }, []);

  const viaGoogle = !!google;
  const set = (k) => (e) => {
    const v = FILTERS[k] ? FILTERS[k](e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    // Changing the last name can fix (or break) the email's name segment.
    setErrors((x) => ({ ...x, [k]: undefined, ...(k === "last_name" ? { email: undefined } : {}) }));
    setError("");
  };
  const courses = useMemo(() => config?.courses || [], [config]);

  async function submit(e) {
    e.preventDefault();
    const v = validateRegister(form, viaGoogle);
    setErrors(v);
    if (Object.keys(v).length) {
      setError("Please fix the highlighted fields.");
      focusFirstInvalid(v, FIELD_ORDER);
      return;
    }

    setBusy(true); setError("");
    try {
      const body = {
        student_id: clean(form.student_id), first_name: clean(form.first_name), middle_name: clean(form.middle_name) || null,
        last_name: clean(form.last_name), email: normalizeEmailInput(form.email), course: form.course,
      };
      if (viaGoogle) body.google_credential = google.credential;
      else { body.password = form.password; body.password_confirmation = form.password_confirmation; }

      const { data } = await api.post("/auth/register", body);
      await signIn(data, true);
      navigate("/logbook", { replace: true });
    } catch (err) {
      setErrors((x) => ({ ...x, ...fieldErrors(err) }));
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onGoogle(credential) {
    setBusy(true); setError("");
    try {
      const { data, status } = await api.post("/auth/google", { credential });
      if (status === 202 || data.status === "needs_registration") {
        setGoogle({ credential, profile: data.profile });
        setForm((f) => ({ ...f, email: data.profile.email, first_name: f.first_name || data.profile.first_name, last_name: f.last_name || data.profile.last_name }));
        setBusy(false);
        return;
      }
      await signIn(data, true); // this Google account already has an account
      navigate("/logbook", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Google sign-in failed. Please try again."));
      setBusy(false);
    }
  }

  const input = (id, props = {}) => (
    <input id={id} className="au-input" value={form[id]} onChange={set(id)} aria-invalid={!!errors[id]} aria-required={props.readOnly ? undefined : "true"} {...props} />
  );

  return (
    <AuthShell
      wide
      title="Create your account"
      subtitle={viaGoogle ? "Almost done — add your Student ID and course." : "Register with your Gmail and Student ID."}
      railHeadline="Start logging your OJT in minutes."
      railNote="One account keeps your logbook safe and in sync across your phone and laptop."
      footer={<>Already registered? <Link to="/login">Sign in</Link></>}
    >
      {viaGoogle && <Banner tone="notice">Signed in with Google as <b>{google.profile.email}</b>. No password needed.</Banner>}
      <Banner>{error}</Banner>

      <form className="au-form" onSubmit={submit} noValidate>
        <div className="au-grid">
          <Field className="span-2" label="Gmail" htmlFor="email" error={errors.email} required hint={viaGoogle ? FORMAT_HINTS.gmail : FORMAT_HINTS.email}>
            {input("email", { type: "email", inputMode: "email", autoComplete: "email", placeholder: viaGoogle ? "name@gmail.com" : "occ.cruz.juan@gmail.com", readOnly: viaGoogle, autoCapitalize: "none", autoCorrect: "off" })}
          </Field>
          <Field className="span-2" label="Student ID" htmlFor="student_id" error={errors.student_id} required hint={FORMAT_HINTS.studentId}>
            {input("student_id", { autoComplete: "username", inputMode: "numeric", autoCorrect: "off", placeholder: "2021-2-04062", maxLength: 12 })}
          </Field>

          <Field label="First name" htmlFor="first_name" error={errors.first_name} required>
            {input("first_name", { autoComplete: "given-name", placeholder: "Juan", maxLength: 80 })}
          </Field>
          <Field label="Middle name" htmlFor="middle_name" error={errors.middle_name} optional>
            {input("middle_name", { autoComplete: "additional-name", placeholder: "Dela", maxLength: 80 })}
          </Field>
          <Field className="span-2" label="Last name" htmlFor="last_name" error={errors.last_name} required>
            {input("last_name", { autoComplete: "family-name", placeholder: "Cruz", maxLength: 80 })}
          </Field>

          <div className="span-2">
            <Field label="Course" htmlFor="course" error={errors.course} required>
              <select id="course" className="au-select" value={form.course} onChange={set("course")} aria-invalid={!!errors.course}>
                <option value="">{courses.length ? "Select your course" : "Loading courses…"}</option>
                {courses.map((g) => (
                  <optgroup key={g.college} label={g.college}>
                    {g.courses.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>

          {!viaGoogle && (
            <>
              <Field label="Password" htmlFor="password" error={errors.password} required hint={FORMAT_HINTS.password}>
                <div className="au-pass">
                  {input("password", { type: show ? "text" : "password", autoComplete: "new-password", placeholder: "Create a password", maxLength: 100 })}
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password" htmlFor="password_confirmation" error={errors.password_confirmation} required>
                {input("password_confirmation", { type: show ? "text" : "password", autoComplete: "new-password", placeholder: "Repeat password", maxLength: 100 })}
              </Field>
            </>
          )}
        </div>

        <button className="au-btn" disabled={busy}>
          {busy ? <><span className="au-spin" /> Creating account…</> : "Create account"}
        </button>
      </form>

      {!viaGoogle && (
        <>
          <Divider>or</Divider>
          <GoogleSignInButton onCredential={onGoogle} text="signup_with" disabled={busy} />
        </>
      )}
    </AuthShell>
  );
}
