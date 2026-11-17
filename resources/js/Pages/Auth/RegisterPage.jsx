import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, Check, GraduationCap, IdCard, Lock, Mail, User } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerGhostButton, LedgerInput, LedgerPasswordInput, LedgerRow,
  LedgerRowPair, LedgerSelect, PasswordMatchNote, RequirementChecklist, StrengthTicks,
} from "../../Components/auth/AuthShell";
import PhotoUploadModal from "../../Components/shared/PhotoUploadModal";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useConfig } from "../../config/serverConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { photoProblem } from "../../utils/photoFile";
import {
  FORMAT_HINTS, validateRegister, clean, emailNameSegment,
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

// One "folder tab" per step. `fields` decides which step owns an error, both for
// the per-step check and for jumping back after the server answers 422.
const STEPS = [
  {
    key: "identity", label: "Identity", fields: ["profile_photo", "first_name", "last_name"],
    title: <>Let’s start with <span className="accent">you</span></>,
    subtitle: "A clear photo and your name, so your coordinator knows who is logging hours.",
    railHeadline: "Let's open your file.", railNote: "A clear photo and your name so your coordinator knows who is logging hours.",
  },
  {
    key: "account", label: "Account", fields: ["email", "student_id"],
    title: <>Your <span className="accent">account</span> details</>,
    subtitle: "Your Student ID is how you sign in. We email a code to your Gmail to verify it.",
    railHeadline: "Your sign-in details.", railNote: "Use your school Gmail (you will verify it with a code) and your Student ID — they identify your record.",
  },
  {
    key: "course", label: "Course", fields: ["course", "middle_name"],
    title: <>Your <span className="accent">course</span></>,
    subtitle: "Pick the program you are doing your duty hours for.",
    railHeadline: "Which program are you in?", railNote: "Your course is printed on your Duty Time Record.",
  },
  {
    key: "security", label: "Security", fields: ["password", "password_confirmation"],
    title: <>Secure your <span className="accent">account</span></>,
    subtitle: "Last entry. Set a strong password and your file is complete.",
    railHeadline: "Last entry.", railNote: "A strong password keeps your duty records safe.",
  },
];

// iOS opens the keyboard only for a field focused by a tap, so only auto-focus with a real mouse.
const canAutoFocus = typeof window === "undefined" || !window.matchMedia
  || window.matchMedia("(pointer: fine)").matches;

const req = <span className="lg-required" aria-hidden="true">*</span>;

export default function RegisterPage() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const config = useConfig();

  const [form, setForm] = useState(() => ({
    student_id: "", first_name: "", middle_name: "", last_name: "",
    email: "", course: "", password: "", password_confirmation: "",
  }));
  const [photo, setPhoto] = useState(null);        // the File, sent with the form
  const [photoUrl, setPhotoUrl] = useState("");    // local preview
  const [photoOpen, setPhotoOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const topRef = useRef(null);

  const steps = STEPS;
  const total = steps.length;
  const step = steps[Math.min(stepIndex, total - 1)];
  const isLast = stepIndex >= total - 1;
  const courses = useMemo(() => config?.courses || [], [config]);

  useEffect(() => { document.title = "Create account | OCC Duty Log"; }, []);

  // Each step starts in view.
  useEffect(() => { topRef.current?.scrollIntoView?.({ block: "start" }); }, [stepIndex]);

  // Preview URL for the chosen photo, released when replaced or on leave.
  useEffect(() => {
    if (!photo) { setPhotoUrl(""); return undefined; }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = (k) => (e) => {
    const v = FILTERS[k] ? FILTERS[k](e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    // Changing the last name can fix (or break) the email's name segment.
    setErrors((x) => ({ ...x, [k]: undefined, ...(k === "last_name" ? { email: undefined } : {}) }));
    setError("");
  };

  const pickPhoto = async (file) => {
    const problem = photoProblem(file);
    if (problem) throw new Error(problem);
    setPhoto(file);
    setErrors((x) => ({ ...x, profile_photo: undefined }));
    setError("");
  };

  // Errors for the fields owned by one step (client-side rules, same as the server's).
  function stepErrors(s) {
    const all = validateRegister(form);
    if (!photo) all.profile_photo = "Profile photo is required so your coordinator can verify you.";
    return Object.fromEntries(s.fields.filter((f) => all[f]).map((f) => [f, all[f]]));
  }

  function focusFirst(errs, s) {
    const id = s.fields.find((f) => errs[f]);
    if (!id) return;
    if (id === "profile_photo") document.getElementById("photo-pick")?.focus();
    else document.getElementById(id)?.focus();
  }

  const goBack = () => { setError(""); setErrors({}); setStepIndex((i) => Math.max(0, i - 1)); };
  // Only finished steps can be re-opened; never skip ahead.
  const jumpTo = (i) => { if (i < stepIndex) { setError(""); setErrors({}); setStepIndex(i); } };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;

    const errs = stepErrors(step);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setError(errs.profile_photo && Object.keys(errs).length === 1 ? "Please add a profile photo to continue." : "Please fix the highlighted fields.");
      focusFirst(errs, step);
      return;
    }
    setError("");

    if (!isLast) { setStepIndex((i) => i + 1); return; }

    // Final step: everything must be valid, even if an earlier step was somehow skipped.
    const everything = validateRegister(form);
    if (!photo) everything.profile_photo = "Profile photo is required so your coordinator can verify you.";
    const bad = Object.keys(everything);
    if (bad.length) {
      setErrors(everything);
      const owner = steps.findIndex((s) => s.fields.some((f) => everything[f]));
      if (owner >= 0) setStepIndex(owner);
      setError("Please fix the highlighted fields.");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("student_id", clean(form.student_id));
      body.append("first_name", clean(form.first_name));
      if (clean(form.middle_name)) body.append("middle_name", clean(form.middle_name));
      body.append("last_name", clean(form.last_name));
      body.append("email", normalizeEmailInput(form.email));
      body.append("course", form.course);
      body.append("profile_photo", photo);
      body.append("password", form.password);
      body.append("password_confirmation", form.password_confirmation);

      const { data } = await api.post("/auth/register", body);
      await signIn(data, true);
      // The new account's email still has to be verified (code + link were just emailed).
      navigate("/verify-email", { replace: true });
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors((x) => ({ ...x, ...fe }));
      const message = errorMessage(err);
      setError(message);
      toast.error(message, { title: "Couldn’t create account", key: "register-error" });
      // Go back to the first step that owns a failing field instead of leaving the person stuck here.
      const owner = steps.findIndex((s) => s.fields.some((f) => fe[f]));
      if (owner >= 0) setStepIndex(owner);
      setBusy(false);
    }
  }

  const tabs = steps.map((s, i) => {
    const done = i < stepIndex;
    const active = i === stepIndex;
    return (
      <button
        type="button" key={s.key} role="listitem"
        className={`lg-folder-tab${active ? " is-active" : ""}${done ? " is-done" : ""}`}
        onClick={() => jumpTo(i)} disabled={i >= stepIndex}
        aria-current={active ? "step" : undefined}
        aria-label={`Step ${i + 1} of ${total}: ${s.label}${done ? " (done)" : ""}`}
      >
        <span className="n">{done ? <Check size={12} strokeWidth={3} /> : String(i + 1).padStart(2, "0")}</span>
        {s.label}
      </button>
    );
  });

  const lastNameSeg = emailNameSegment(form.last_name) || "lastname";

  return (
    <AuthShell
      wide
      fit
      docType="NEW CASE FILE"
      caseSeed="REG"
      railHeadline={step.railHeadline}
      railNote={step.railNote}
      tabs={tabs}
      title={step.title}
      subtitle={step.subtitle}
      footer={<>Already registered? <Link to="/login">Sign in</Link></>}
    >
      <div ref={topRef} />
      <LedgerBanner>{error}</LedgerBanner>

      <form onSubmit={submit} noValidate>
        <div key={step.key} className="lg-step">
          {step.key === "identity" && (
            <>
              <LedgerRow
                index={1} icon={Camera} htmlFor="photo-pick" error={errors.profile_photo}
                label={<>Profile photo {req}</>}
                hint={errors.profile_photo ? undefined : `Required so your coordinator can verify you. JPG, PNG or WebP, up to 5 MB.`}
              >
                <div className="lg-avatar-row">
                  <button
                    type="button" id="photo-pick" className={`lg-avatar-frame${photoUrl ? " has-photo" : ""}`}
                    onClick={() => setPhotoOpen(true)} aria-label={photoUrl ? "Change profile photo" : "Add profile photo"}
                    aria-required="true" aria-invalid={!!errors.profile_photo}
                  >
                    {photoUrl ? <img src={photoUrl} alt="Your profile photo preview" /> : <Camera size={26} strokeWidth={1.6} style={{ opacity: .55 }} />}
                  </button>
                  <div className="lg-avatar-actions">
                    <div className="lg-avatar-btns">
                      <button type="button" className="lg-avatar-btn" onClick={() => setPhotoOpen(true)}>{photoUrl ? "Change photo" : "Add photo"}</button>
                      {photoUrl && <button type="button" className="lg-avatar-btn danger" onClick={() => setPhoto(null)}>Remove</button>}
                    </div>
                  </div>
                </div>
              </LedgerRow>

              <LedgerRowPair index={2}>
                <div>
                  <label className="lg-row-label" htmlFor="first_name"><User size={12} strokeWidth={2.5} /> First name {req}</label>
                  <LedgerInput
                    id="first_name" value={form.first_name} onChange={set("first_name")} maxLength={80}
                    autoComplete="given-name" placeholder="Juan" enterKeyHint="next" autoFocus={canAutoFocus}
                    aria-required="true" aria-invalid={!!errors.first_name}
                  />
                  {errors.first_name && <span className="lg-row-hint lg-row-error" role="alert">{errors.first_name}</span>}
                </div>
                <div>
                  <label className="lg-row-label" htmlFor="last_name"><User size={12} strokeWidth={2.5} /> Last name {req}</label>
                  <LedgerInput
                    id="last_name" value={form.last_name} onChange={set("last_name")} maxLength={80}
                    autoComplete="family-name" placeholder="Cruz" enterKeyHint="next"
                    aria-required="true" aria-invalid={!!errors.last_name}
                  />
                  {errors.last_name && <span className="lg-row-hint lg-row-error" role="alert">{errors.last_name}</span>}
                </div>
              </LedgerRowPair>
            </>
          )}

          {step.key === "account" && (
            <>
              <LedgerRow
                index={1} icon={Mail} htmlFor="email" error={errors.email}
                label={<>Gmail {req}</>}
                hint={`Format: occ.${lastNameSeg}.firstname@gmail.com (all lowercase). The lastname must match your Last name. We will email you a code to verify it.`}
              >
                <LedgerInput
                  id="email" type="email" inputMode="email" value={form.email} onChange={set("email")}
                  autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                  placeholder={`occ.${lastNameSeg}.juan@gmail.com`} autoFocus={canAutoFocus}
                  aria-required="true" aria-invalid={!!errors.email}
                />
              </LedgerRow>
              <LedgerRow
                index={2} icon={IdCard} htmlFor="student_id" error={errors.student_id}
                label={<>Student ID {req}</>} hint={FORMAT_HINTS.studentId}
              >
                <LedgerInput
                  id="student_id" value={form.student_id} onChange={set("student_id")} maxLength={12}
                  autoComplete="username" inputMode="numeric" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                  placeholder="2021-2-04062"
                  aria-required="true" aria-invalid={!!errors.student_id}
                />
              </LedgerRow>
            </>
          )}

          {step.key === "course" && (
            <>
              <LedgerRow index={1} icon={GraduationCap} htmlFor="course" error={errors.course} label={<>Course {req}</>}>
                <LedgerSelect id="course" value={form.course} onChange={set("course")} aria-required="true" aria-invalid={!!errors.course}>
                  <option value="">{courses.length ? "Select your course" : "Loading courses…"}</option>
                  {courses.map((g) => (
                    <optgroup key={g.college} label={g.college}>
                      {g.courses.map((c) => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  ))}
                </LedgerSelect>
              </LedgerRow>
              <LedgerRow
                index={2} icon={User} htmlFor="middle_name" error={errors.middle_name}
                label={<>Middle name <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>(optional)</span></>}
              >
                <LedgerInput
                  id="middle_name" value={form.middle_name} onChange={set("middle_name")} maxLength={80}
                  autoComplete="additional-name" placeholder="Dela" enterKeyHint={isLast ? "go" : "next"} aria-invalid={!!errors.middle_name}
                />
              </LedgerRow>
            </>
          )}

          {step.key === "security" && (
            <>
              <LedgerRow index={1} icon={Lock} htmlFor="password" error={errors.password} label={<>Password {req}</>}>
                <LedgerPasswordInput
                  id="password" show={show} onToggle={() => setShow((v) => !v)} value={form.password} onChange={set("password")}
                  autoComplete="new-password" maxLength={100} placeholder="Create a password" enterKeyHint="next"
                  autoFocus={canAutoFocus} aria-required="true" aria-invalid={!!errors.password}
                />
                <StrengthTicks password={form.password} />
              </LedgerRow>
              <LedgerRow index={2} icon={Lock} htmlFor="password_confirmation" error={errors.password_confirmation} label={<>Confirm password {req}</>}>
                <LedgerPasswordInput
                  id="password_confirmation" show={showConfirm} onToggle={() => setShowConfirm((v) => !v)}
                  value={form.password_confirmation} onChange={set("password_confirmation")}
                  autoComplete="new-password" maxLength={100} placeholder="Repeat password" enterKeyHint="go"
                  aria-required="true" aria-invalid={!!errors.password_confirmation}
                />
                <PasswordMatchNote password={form.password} confirm={form.password_confirmation} />
              </LedgerRow>
              <RequirementChecklist password={form.password} />
            </>
          )}
        </div>

        <div className="lg-actions-row" style={{ marginTop: 14 }}>
          {stepIndex > 0 && <LedgerGhostButton onClick={goBack} disabled={busy}>Back</LedgerGhostButton>}
          <LedgerButton disabled={busy}>
            {busy
              ? <><span className="au-spin" /> Creating account…</>
              : isLast ? "Create account" : "Next entry"}
          </LedgerButton>
        </div>
      </form>

      <PhotoUploadModal open={photoOpen} onClose={() => setPhotoOpen(false)} onAccept={pickPhoto} title="Profile photo" />
    </AuthShell>
  );
}
