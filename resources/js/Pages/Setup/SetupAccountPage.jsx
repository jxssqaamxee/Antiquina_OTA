import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, IdCard, Lock, Mail, User } from "lucide-react";
import api, { errorMessage, fieldErrors as serverFieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerGhostButton, LedgerInput, LedgerPasswordInput, LedgerRow, LedgerRowPair,
  PasswordMatchNote, RequirementChecklist, StrengthTicks,
} from "../../Components/auth/AuthShell";
import PhotoUploadModal from "../../Components/shared/PhotoUploadModal";
import { clean, filterNameInput, passwordProblem, validateProfile } from "../../utils/validators";
import { homePath } from "../../utils/roles";

const req = <span className="lg-required" aria-hidden="true">*</span>;

/**
 * Mandatory first sign-in for an Admin / Coordinator account (same flow as sclf_APP's SetupAccountPage):
 * Identity (photo + first / middle / last name) -> Security (their own password).
 * The Admin ID and email were set by whoever created the account and are shown locked.
 * ProtectedRoute sends the person here while user.must_change_password is true, and Laravel
 * (EnsureProfileSetupComplete) keeps every other call closed until this succeeds.
 */
export default function SetupAccountPage() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const topRef = useRef(null);
  const isAdmin = user?.role === "admin";
  const roleLabel = isAdmin ? "System Administrator" : "Coordinator";

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: user?.first_name || "", middle_name: user?.middle_name || "", last_name: user?.last_name || "",
    password: "", password_confirmation: "",
  });
  const [photo, setPhoto] = useState(null);       // the File to upload
  const [photoUrl, setPhotoUrl] = useState("");   // local preview
  const [photoOpen, setPhotoOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const hasPhoto = !!photo || !!user?.has_profile_photo;

  useEffect(() => { document.title = "Set up your account | OCCDL"; }, []);
  useEffect(() => { topRef.current?.scrollIntoView({ block: "start" }); }, [step]);
  useEffect(() => {
    if (!photo) { setPhotoUrl(""); return undefined; }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = (k) => (e) => {
    const v = k.endsWith("_name") ? filterNameInput(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const META = [
    {
      title: <>Welcome, let&rsquo;s confirm <span className="accent">you</span></>,
      subtitle: `This ${roleLabel} account was set up for you. Add your photo and your name.`,
      railHeadline: "One last entry before you\u2019re in.",
      railNote: "Your photo, name and password replace the details entered when the account was created.",
    },
    {
      title: <>Your <span className="accent">sign-in</span> details</>,
      subtitle: `These were set when the ${roleLabel} account was created. Check they are yours.`,
      railHeadline: "Stay reachable on campus.",
      railNote: "Your ID and email are locked: they are how you sign in, so only the person who created the account can change them.",
    },
    {
      title: <>Secure your <span className="accent">account</span></>,
      subtitle: "Last step: choose a password only you know, and you\u2019re in.",
      railHeadline: "Last entry on the form.",
      railNote: "This replaces the password you were given. Nobody else will see your new one.",
    },
  ];
  const TOTAL = META.length;
  const meta = META[step - 1];

  const tabs = ["Identity", "Account", "Security"].map((label, i) => {
    const n = i + 1;
    const done = n < step;
    return (
      <button type="button" key={label} className={`lg-folder-tab${n === step ? " is-active" : ""}${done ? " is-done" : ""}`}
        onClick={() => { if (done) { setErrors({}); setBanner(""); setStep(n); } }} disabled={n >= step}
        aria-current={n === step ? "step" : undefined}>
        <span className="n">{done ? <Check size={11} strokeWidth={3} /> : String(n).padStart(2, "0")}</span>{label}
      </button>
    );
  });

  async function submit(e) {
    e.preventDefault();
    setBanner("");
    if (step === 1) {
      const v = validateProfile(form);
      if (!hasPhoto) v.photo = "Please add a profile photo for your account.";
      if (Object.keys(v).length) {
        setErrors(v);
        if (v.photo && Object.keys(v).length === 1) setBanner(v.photo);
        return;
      }
      setErrors({});
      setStep(2);
      return;
    }
    if (step < TOTAL) { setStep(step + 1); return; }

    const v = {};
    const p = passwordProblem(form.password);
    if (p) v.password = p;
    if (!form.password_confirmation) v.password_confirmation = "Please confirm your new password.";
    else if (form.password !== form.password_confirmation) v.password_confirmation = "Passwords do not match.";
    if (Object.keys(v).length) { setErrors(v); return; }

    setBusy(true); setErrors({});
    try {
      const body = new FormData();
      body.append("first_name", clean(form.first_name));
      if (clean(form.middle_name)) body.append("middle_name", clean(form.middle_name));
      body.append("last_name", clean(form.last_name));
      body.append("password", form.password);
      body.append("password_confirmation", form.password_confirmation);
      if (photo) body.append("photo", photo); // keep the photo on file when none was picked
      const { data } = await api.post("/profile/complete-setup", body);
      await updateUser(data.user);
      toast.success("Your account is set up. Welcome to OCCDL!", { title: "All set", key: "setup-done" });
      navigate(homePath(data.user), { replace: true });
    } catch (err) {
      const fe = serverFieldErrors(err);
      setErrors(fe);
      if (fe.first_name || fe.middle_name || fe.last_name || fe.photo) setStep(1);
      setBanner(errorMessage(err, "Something went wrong setting up your account. Please try again."));
    } finally { setBusy(false); }
  }

  async function wrongAccount(e) {
    e.preventDefault();
    await logout();
    navigate("/administrator", { replace: true });
  }

  const shownPhoto = photoUrl || user?.picture || "";

  return (
    <AuthShell wide compact docType="ACCOUNT SETUP" caseSeed="SETUP" tabs={tabs} title={meta.title} subtitle={meta.subtitle}
      railHeadline={meta.railHeadline} railNote={meta.railNote}
      footer={<>Signed in as {user?.email}. <a href="#signout" onClick={wrongAccount}>Not you? Sign out</a></>}>
      <div ref={topRef} />
      <form onSubmit={submit} noValidate>
        <LedgerBanner tone="error">{banner}</LedgerBanner>

        <div key={step} className="lg-step">
          {step === 1 && (
            <>
              <LedgerRow index={1} icon={Camera} htmlFor="photo-pick" error={errors.photo} label={<>Profile photo {req}</>}
                hint={errors.photo ? undefined : "A clear photo of your face. JPG, PNG or WebP, up to 5 MB."}>
                <div className="lg-avatar-row">
                  <button type="button" id="photo-pick" className={`lg-avatar-frame${shownPhoto ? " has-photo" : ""}`}
                    onClick={() => setPhotoOpen(true)} aria-label={shownPhoto ? "Change profile photo" : "Add profile photo"}
                    aria-required="true" aria-invalid={!!errors.photo}>
                    {shownPhoto ? <img src={shownPhoto} alt="Your profile photo preview" /> : <Camera size={26} strokeWidth={1.6} style={{ opacity: 0.55 }} />}
                  </button>
                  <div className="lg-avatar-actions">
                    <div className="lg-avatar-btns">
                      <button type="button" className="lg-avatar-btn" onClick={() => setPhotoOpen(true)}>{shownPhoto ? "Change photo" : "Add photo"}</button>
                      {photo && <button type="button" className="lg-avatar-btn danger" onClick={() => setPhoto(null)}>Remove</button>}
                    </div>
                  </div>
                </div>
              </LedgerRow>

              <LedgerRowPair index={2}>
                <div>
                  <label className="lg-row-label" htmlFor="su_first"><User size={12} strokeWidth={2.5} /> First name {req}</label>
                  <LedgerInput id="su_first" value={form.first_name} maxLength={80} autoComplete="given-name" aria-required="true"
                    aria-invalid={!!errors.first_name} onChange={set("first_name")} />
                  {errors.first_name && <span className="lg-row-hint lg-row-error" role="alert">{errors.first_name}</span>}
                </div>
                <div>
                  <label className="lg-row-label" htmlFor="su_middle"><User size={12} strokeWidth={2.5} /> Middle name</label>
                  <LedgerInput id="su_middle" value={form.middle_name} maxLength={80} autoComplete="additional-name"
                    aria-invalid={!!errors.middle_name} onChange={set("middle_name")} />
                  {errors.middle_name && <span className="lg-row-hint lg-row-error" role="alert">{errors.middle_name}</span>}
                </div>
              </LedgerRowPair>
              <LedgerRow index={3} icon={User} htmlFor="su_last" error={errors.last_name} label={<>Last name {req}</>}>
                <LedgerInput id="su_last" value={form.last_name} maxLength={80} autoComplete="family-name" aria-required="true"
                  aria-invalid={!!errors.last_name} onChange={set("last_name")} />
              </LedgerRow>

            </>
          )}

          {step === 2 && (
            <>
              <LedgerRow index={1} icon={IdCard} htmlFor="su_id" label={isAdmin ? "Admin ID" : "Coordinator ID"}
                hint="Set when the account was created. It can’t be changed here.">
                <div id="su_id" className="lg-locked"><Lock size={13} aria-hidden="true" />{user?.admin_id}</div>
              </LedgerRow>
              <LedgerRow index={2} icon={Mail} htmlFor="su_email" label="Email" hint="Your sign-in email can’t be changed here.">
                <div id="su_email" className="lg-locked"><Lock size={13} aria-hidden="true" />{user?.email}</div>
              </LedgerRow>
            </>
          )}

          {step === 3 && (
            <>
              <LedgerRow index={1} icon={Lock} htmlFor="su_pw" error={errors.password} label={<>New password {req}</>}>
                <LedgerPasswordInput id="su_pw" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password" maxLength={100}
                  autoFocus value={form.password} aria-invalid={!!errors.password} onChange={set("password")} />
                <StrengthTicks password={form.password} />
              </LedgerRow>
              <LedgerRow index={2} icon={Lock} htmlFor="su_conf" error={errors.password_confirmation} label={<>Confirm new password {req}</>}>
                <LedgerPasswordInput id="su_conf" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password" maxLength={100}
                  value={form.password_confirmation} aria-invalid={!!errors.password_confirmation} onChange={set("password_confirmation")} />
                <PasswordMatchNote password={form.password} confirm={form.password_confirmation} />
              </LedgerRow>
              {!!form.password && <RequirementChecklist password={form.password} />}
            </>
          )}
        </div>

        <div className="lg-actions-row" style={{ marginTop: 10 }}>
          {step > 1 && <LedgerGhostButton onClick={() => { setErrors({}); setBanner(""); setStep(step - 1); }}>Back</LedgerGhostButton>}
          <LedgerButton disabled={busy}>{step < TOTAL ? "Next Entry" : busy ? "Saving…" : "Complete Setup & Continue"}</LedgerButton>
        </div>
      </form>

      <PhotoUploadModal open={photoOpen} onClose={() => setPhotoOpen(false)} title="Profile photo"
        onAccept={(f) => { setPhoto(f); setErrors((x) => ({ ...x, photo: undefined })); setBanner(""); }} />
    </AuthShell>
  );
}
