import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Download, GraduationCap, IdCard, Lock, LogOut, Mail, Trash2, User } from "lucide-react";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useConfig } from "../../config/serverConfig";
import { useToast } from "../../context/ToastContext";
import {
  LedgerBanner, LedgerInput, LedgerPasswordInput, LedgerRow, LedgerRowPair, LedgerSelect,
  PasswordMatchNote, RequirementChecklist, StrengthTicks,
} from "../../Components/auth/AuthShell";
import AvatarPhoto from "../../Components/shared/AvatarPhoto";
import PhotoUploadModal from "../../Components/shared/PhotoUploadModal";
import { ConfirmSheet } from "../../Components/shared/Sheet";
import {
  validateProfile, validatePasswordChange, clean, filterNameInput,
} from "../../utils/validators";
import MobileTabBar from "../../Components/shared/MobileTabBar";
import AppBar from "../../Components/shared/AppBar";
import { THEMES, getTheme, setTheme } from "../../utils/theme";
import logo from "../../assets/images/site-logo.png";
import Footer from "../../Components/shared/Footer";
import { canNativePrompt, isInstalled, promptInstall, subscribe } from "../../utils/pwaInstall";
import "../../styles/auth.css";

const req = <span className="lg-required" aria-hidden="true">*</span>;

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const config = useConfig();
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: user.first_name, middle_name: user.middle_name || "", last_name: user.last_name, course: user.course });
  const [pw, setPw] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [msg, setMsg] = useState({ profile: null, password: null });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState("");
  const [, force] = useState(0);
  const [theme, setThemeState] = useState(getTheme);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCur, setShowCur] = useState(false);

  useEffect(() => { document.title = "Profile | OCC Duty Log"; }, []);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  const setF = (k) => (e) => {
    const v = k.endsWith("_name") ? filterNameInput(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((x) => ({ ...x, [k]: undefined }));
  };
  const setP = (k) => (e) => {
    setPw((f) => ({ ...f, [k]: e.target.value }));
    setErrs((x) => ({ ...x, [k]: undefined }));
  };

  async function saveProfile(e) {
    e.preventDefault();
    setMsg((m) => ({ ...m, profile: null }));
    const v = validateProfile(form);
    if (Object.keys(v).length) {
      setErrs(v);
      setMsg((m) => ({ ...m, profile: { tone: "error", text: "Please fix the highlighted fields." } }));
      const ids = { first_name: "pf_first", middle_name: "pf_middle", last_name: "pf_last", course: "pf_course" };
      const firstBad = Object.keys(ids).find((k) => v[k]);
      if (firstBad) document.getElementById(ids[firstBad])?.focus();
      return;
    }
    setBusy("profile"); setErrs({});
    try {
      const { data } = await api.put("/profile", {
        first_name: clean(form.first_name), middle_name: clean(form.middle_name) || null, last_name: clean(form.last_name), course: form.course,
      });
      updateUser(data.user);
      setMsg((m) => ({ ...m, profile: { tone: "notice", text: "Profile saved." } }));
    } catch (err) {
      setErrs(fieldErrors(err));
      setMsg((m) => ({ ...m, profile: { tone: "error", text: errorMessage(err) } }));
    } finally { setBusy(""); }
  }

  async function savePassword(e) {
    e.preventDefault();
    setMsg((m) => ({ ...m, password: null }));
    const v = validatePasswordChange(pw, user.has_password);
    if (Object.keys(v).length) {
      setErrs(v);
      setMsg((m) => ({ ...m, password: { tone: "error", text: "Please fix the highlighted fields." } }));
      return;
    }
    setBusy("password"); setErrs({});
    try {
      const { data } = await api.put("/profile/password", pw);
      updateUser(data.user);
      setPw({ current_password: "", password: "", password_confirmation: "" });
      setMsg((m) => ({ ...m, password: { tone: "notice", text: user.has_password ? "Password changed." : "Password set. You can now sign in with your Student ID." } }));
    } catch (err) {
      setErrs(fieldErrors(err));
      setMsg((m) => ({ ...m, password: { tone: "error", text: errorMessage(err) } }));
    } finally { setBusy(""); }
  }

  // Upload / replace. Throws a readable message so the photo sheet can show it and stay open.
  async function uploadPhoto(file) {
    const body = new FormData();
    body.append("photo", file);
    try {
      const { data } = await api.post("/profile/photo", body);
      updateUser(data.user); // also refreshes the cached profile (occ_me) used offline
      toast.success("Photo updated", { key: "photo-updated" });
    } catch (err) {
      throw new Error(errorMessage(err, "The photo could not be saved. Please try again."));
    }
  }

  async function removePhoto() {
    setConfirmRemove(false);
    setBusy("photo");
    try {
      const { data } = await api.delete("/profile/photo");
      updateUser(data.user);
      toast.success("Photo removed", { key: "photo-updated" });
    } catch (err) {
      toast.error(errorMessage(err, "The photo could not be removed. Please try again."), { key: "photo-error" });
    } finally { setBusy(""); }
  }

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  const courses = config?.courses || [];
  const showInstall = !isInstalled() && canNativePrompt();

  return (
    <div className="app">
      <AppBar title="Profile" subtitle="Account & appearance" back="/logbook" />

      <main className="app-main">
        <section className="pf-hero" style={{ "--pf-logo": `url("${logo}")` }}>
          <div className="pf-hero-in">
            <div className="pf-avatar-wrap">
              <span className="pf-avatar"><AvatarPhoto user={user} /></span>
              <button type="button" className="pf-cam" onClick={() => setPhotoOpen(true)} disabled={busy === "photo"} aria-label="Change profile photo">
                <Camera size={15} />
              </button>
            </div>
            <div style={{ minWidth: 0 }}>
              <h2>{user.name}</h2>
              <p>Student ID <b>{user.student_id}</b></p>
              <p>{user.email}</p>
            </div>
          </div>
        </section>

        <div className="pf-stack">
          <section className="card">
            <h3 className="card-title">Appearance</h3>
            <p className="pf-muted">Pick a colour theme. It is saved on this device.</p>
            <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
              {THEMES.map((t) => (
                <button
                  key={t.id} type="button" role="radio" aria-checked={theme === t.id}
                  className={`theme-opt${theme === t.id ? " is-active" : ""}`}
                  onClick={() => setThemeState(setTheme(t.id))}
                >
                  <span className="theme-swatch" style={{ background: t.bg, "--sw-accent": t.accent }} />
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {user.has_profile_photo && (
            <section className="card">
              <h3 className="card-title">Profile photo</h3>
              <p className="pf-muted" style={{ marginBottom: 0 }}>Tap the camera on your picture to replace it. Removing it shows your Google picture, or your initials.</p>
              <div className="pf-photo-actions">
                <button type="button" className="btn" onClick={() => setPhotoOpen(true)}><Camera size={16} /> Replace photo</button>
                <button type="button" className="btn btn-danger" onClick={() => setConfirmRemove(true)} disabled={busy === "photo"}><Trash2 size={16} /> Remove photo</button>
              </div>
            </section>
          )}

          <form className="card pf-form" onSubmit={saveProfile} noValidate>
            <h3 className="card-title pf-form-title">Personal details</h3>
            <LedgerBanner tone={msg.profile?.tone}>{msg.profile?.text}</LedgerBanner>

            <LedgerRowPair index={1}>
              <div>
                <label className="lg-row-label" htmlFor="pf_first"><User size={12} strokeWidth={2.5} /> First name {req}</label>
                <LedgerInput id="pf_first" value={form.first_name} maxLength={80} autoComplete="given-name" aria-required="true" aria-invalid={!!errs.first_name} onChange={setF("first_name")} />
                {errs.first_name && <span className="lg-row-hint lg-row-error" role="alert">{errs.first_name}</span>}
              </div>
              <div>
                <label className="lg-row-label" htmlFor="pf_middle"><User size={12} strokeWidth={2.5} /> Middle name</label>
                <LedgerInput id="pf_middle" value={form.middle_name} maxLength={80} autoComplete="additional-name" aria-invalid={!!errs.middle_name} onChange={setF("middle_name")} />
                {errs.middle_name && <span className="lg-row-hint lg-row-error" role="alert">{errs.middle_name}</span>}
              </div>
            </LedgerRowPair>
            <LedgerRow index={2} icon={User} htmlFor="pf_last" error={errs.last_name} label={<>Last name {req}</>}>
              <LedgerInput id="pf_last" value={form.last_name} maxLength={80} autoComplete="family-name" aria-required="true" aria-invalid={!!errs.last_name} onChange={setF("last_name")} />
            </LedgerRow>
            <LedgerRow index={3} icon={GraduationCap} htmlFor="pf_course" error={errs.course} label={<>Course {req}</>}>
              <LedgerSelect id="pf_course" value={form.course} aria-required="true" aria-invalid={!!errs.course} onChange={setF("course")}>
                {!courses.some((g) => g.courses.includes(form.course)) && <option value={form.course}>{form.course}</option>}
                {courses.map((g) => (
                  <optgroup key={g.college} label={g.college}>{g.courses.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
                ))}
              </LedgerSelect>
            </LedgerRow>
            <LedgerRow index={4} icon={Mail} htmlFor="pf_email" label="Gmail" hint="Your Gmail and Student ID can’t be changed here.">
              <LedgerInput id="pf_email" value={user.email} readOnly />
            </LedgerRow>
            <LedgerRow index={5} icon={IdCard} htmlFor="pf_sid" label="Student ID">
              <LedgerInput id="pf_sid" value={user.student_id} readOnly />
            </LedgerRow>
            <button className="lg-submit" disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save changes"}</button>
          </form>

          <form className="card pf-form" onSubmit={savePassword} noValidate>
            <h3 className="card-title pf-form-title">{user.has_password ? "Change password" : "Set a password"}</h3>
            <p className="pf-muted" style={{ margin: "0 0 4px" }}>{user.has_password
              ? "Use at least 8 characters with upper and lower case letters and a number."
              : "You signed up with Google. Set a password to also sign in with your Student ID."}</p>
            <LedgerBanner tone={msg.password?.tone}>{msg.password?.text}</LedgerBanner>
            {user.has_password && (
              <LedgerRow index={1} icon={Lock} htmlFor="pf_cur" error={errs.current_password} label={<>Current password {req}</>}>
                <LedgerPasswordInput id="pf_cur" show={showCur} onToggle={() => setShowCur((v) => !v)} autoComplete="current-password" value={pw.current_password} aria-invalid={!!errs.current_password} onChange={setP("current_password")} />
              </LedgerRow>
            )}
            <LedgerRow index={user.has_password ? 2 : 1} icon={Lock} htmlFor="pf_new" error={errs.password} label={<>New password {req}</>}>
              <LedgerPasswordInput id="pf_new" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password" maxLength={100} value={pw.password} aria-invalid={!!errs.password} onChange={setP("password")} />
              <StrengthTicks password={pw.password} />
            </LedgerRow>
            <LedgerRow index={user.has_password ? 3 : 2} icon={Lock} htmlFor="pf_conf" error={errs.password_confirmation} label={<>Confirm new password {req}</>}>
              <LedgerPasswordInput id="pf_conf" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password" maxLength={100} value={pw.password_confirmation} aria-invalid={!!errs.password_confirmation} onChange={setP("password_confirmation")} />
              <PasswordMatchNote password={pw.password} confirm={pw.password_confirmation} />
            </LedgerRow>
            {!!pw.password && <RequirementChecklist password={pw.password} />}
            <button className="lg-submit" disabled={busy === "password" || !pw.password}>{busy === "password" ? "Saving…" : user.has_password ? "Change password" : "Set password"}</button>
          </form>

          <section className="card pf-actions">
            {showInstall && <button type="button" className="btn btn-block" onClick={promptInstall}><Download size={18} /> Install app</button>}
            <button type="button" className="btn btn-block btn-signout" onClick={signOut}><LogOut size={18} /> Sign out</button>
          </section>
        </div>
        <Footer />
      </main>
      <PhotoUploadModal open={photoOpen} onClose={() => setPhotoOpen(false)} onAccept={uploadPhoto} title="Profile photo" />
      <ConfirmSheet
        open={confirmRemove} title="Remove your photo?"
        message="Your picture will go back to your Google photo, or your initials if you have none."
        yes="Remove photo" no="Keep it" onYes={removePhoto} onNo={() => setConfirmRemove(false)}
      />
      <MobileTabBar />
    </div>
  );
}
