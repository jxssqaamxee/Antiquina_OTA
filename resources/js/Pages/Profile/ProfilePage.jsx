import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Download } from "lucide-react";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useConfig } from "../../config/serverConfig";
import { Banner, Field } from "../../Components/auth/AuthShell";
import {
  FORMAT_HINTS, validateProfile, validatePasswordChange, clean, filterNameInput,
} from "../../utils/validators";
import MobileTabBar from "../../Components/shared/MobileTabBar";
import Footer from "../../Components/shared/Footer";
import { canNativePrompt, isInstalled, promptInstall, subscribe } from "../../utils/pwaInstall";
import "../../styles/auth.css";

function initials(u) {
  return ((u.first_name?.[0] || "") + (u.last_name?.[0] || "")).toUpperCase() || "OC";
}

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: user.first_name, middle_name: user.middle_name || "", last_name: user.last_name, course: user.course });
  const [pw, setPw] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [msg, setMsg] = useState({ profile: null, password: null });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState("");
  const [, force] = useState(0);

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

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  const courses = config?.courses || [];
  const showInstall = !isInstalled() && canNativePrompt();

  return (
    <div className="pf-page">
      <header className="pf-top">
        <Link to="/logbook" className="pf-back" aria-label="Back to logbook"><ArrowLeft size={20} /></Link>
        <h1>Profile</h1>
      </header>

      <div className="pf-body">
        <section className="pf-card pf-id">
          {user.picture
            ? <img className="pf-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
            : <span className="pf-avatar pf-avatar--text">{initials(user)}</span>}
          <div>
            <h2>{user.name}</h2>
            <p>Student ID <b>{user.student_id}</b></p>
            <p className="pf-muted">{user.email}</p>
          </div>
        </section>

        <form className="pf-card au-form" onSubmit={saveProfile} noValidate>
          <h3>Personal details</h3>
          {msg.profile && <Banner tone={msg.profile.tone}>{msg.profile.text}</Banner>}
          <div className="au-grid">
            <Field label="First name" htmlFor="pf_first" error={errs.first_name} required>
              <input id="pf_first" className="au-input" value={form.first_name} maxLength={80} aria-required="true" aria-invalid={!!errs.first_name} onChange={setF("first_name")} />
            </Field>
            <Field label="Middle name" htmlFor="pf_middle" error={errs.middle_name} optional>
              <input id="pf_middle" className="au-input" value={form.middle_name} maxLength={80} aria-invalid={!!errs.middle_name} onChange={setF("middle_name")} />
            </Field>
            <Field className="span-2" label="Last name" htmlFor="pf_last" error={errs.last_name} required>
              <input id="pf_last" className="au-input" value={form.last_name} maxLength={80} aria-required="true" aria-invalid={!!errs.last_name} onChange={setF("last_name")} />
            </Field>
            <Field className="span-2" label="Course" htmlFor="pf_course" error={errs.course} required>
              <select id="pf_course" className="au-select" value={form.course} aria-required="true" aria-invalid={!!errs.course} onChange={setF("course")}>
                {!courses.some((g) => g.courses.includes(form.course)) && <option value={form.course}>{form.course}</option>}
                {courses.map((g) => (
                  <optgroup key={g.college} label={g.college}>{g.courses.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
                ))}
              </select>
            </Field>
            <Field className="span-2" label="Gmail" hint="Your Gmail and Student ID can't be changed here.">
              <input className="au-input" value={user.email} readOnly />
            </Field>
          </div>
          <button className="au-btn" disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save changes"}</button>
        </form>

        <form className="pf-card au-form" onSubmit={savePassword} noValidate>
          <h3>{user.has_password ? "Change password" : "Set a password"}</h3>
          <p className="pf-muted">{user.has_password
            ? "Use at least 8 characters with upper and lower case letters and a number."
            : "You signed up with Google. Set a password to also sign in with your Student ID."}</p>
          {msg.password && <Banner tone={msg.password.tone}>{msg.password.text}</Banner>}
          {user.has_password && (
            <Field label="Current password" htmlFor="pf_cur" error={errs.current_password} required>
              <input id="pf_cur" className="au-input" type="password" autoComplete="current-password" value={pw.current_password} onChange={setP("current_password")} />
            </Field>
          )}
          <Field label="New password" htmlFor="pf_new" error={errs.password} required hint={errs.password ? undefined : FORMAT_HINTS.password}>
            <input id="pf_new" className="au-input" type="password" autoComplete="new-password" value={pw.password} onChange={setP("password")} />
          </Field>
          <Field label="Confirm new password" htmlFor="pf_conf" error={errs.password_confirmation} required>
            <input id="pf_conf" className="au-input" type="password" autoComplete="new-password" value={pw.password_confirmation} onChange={setP("password_confirmation")} />
          </Field>
          <button className="au-btn" disabled={busy === "password" || !pw.password}>{busy === "password" ? "Saving…" : user.has_password ? "Change password" : "Set password"}</button>
        </form>

        <section className="pf-card pf-actions">
          {showInstall && <button type="button" className="au-btn au-btn--ghost" onClick={promptInstall}><Download size={18} /> Install app</button>}
          <button type="button" className="au-btn au-btn--ghost pf-signout" onClick={signOut}><LogOut size={18} /> Sign out</button>
        </section>
        <Footer />
      </div>
      <MobileTabBar />
    </div>
  );
}
