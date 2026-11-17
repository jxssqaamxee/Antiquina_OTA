import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Download } from "lucide-react";
import api, { errorMessage, fieldErrors } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../utils/config";
import { Banner, Field } from "../components/AuthShell";
import MobileTabBar from "../components/MobileTabBar";
import Footer from "../components/Footer";
import { canNativePrompt, isInstalled, promptInstall, subscribe } from "../utils/pwaInstall";
import "../styles/auth.css";

function initials(u) {
  return ((u.first_name?.[0] || "") + (u.last_name?.[0] || "")).toUpperCase() || "OT";
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

  useEffect(() => { document.title = "Profile | Antiquina OTA"; }, []);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setP = (k) => (e) => setPw((f) => ({ ...f, [k]: e.target.value }));

  async function saveProfile(e) {
    e.preventDefault();
    setBusy("profile"); setErrs({}); setMsg((m) => ({ ...m, profile: null }));
    try {
      const { data } = await api.put("/profile", { ...form, middle_name: form.middle_name.trim() || null });
      updateUser(data.user);
      setMsg((m) => ({ ...m, profile: { tone: "notice", text: "Profile saved." } }));
    } catch (err) {
      setErrs(fieldErrors(err));
      setMsg((m) => ({ ...m, profile: { tone: "error", text: errorMessage(err) } }));
    } finally { setBusy(""); }
  }

  async function savePassword(e) {
    e.preventDefault();
    setBusy("password"); setErrs({}); setMsg((m) => ({ ...m, password: null }));
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
            <Field label="First name" htmlFor="pf_first" error={errs.first_name}>
              <input id="pf_first" className="au-input" value={form.first_name} onChange={setF("first_name")} />
            </Field>
            <Field label="Middle name" htmlFor="pf_middle" error={errs.middle_name} optional>
              <input id="pf_middle" className="au-input" value={form.middle_name} onChange={setF("middle_name")} />
            </Field>
            <Field className="span-2" label="Last name" htmlFor="pf_last" error={errs.last_name}>
              <input id="pf_last" className="au-input" value={form.last_name} onChange={setF("last_name")} />
            </Field>
            <Field className="span-2" label="Course" htmlFor="pf_course" error={errs.course}>
              <select id="pf_course" className="au-select" value={form.course} onChange={setF("course")}>
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
            ? "Use at least 8 characters."
            : "You signed up with Google. Set a password to also sign in with your Student ID."}</p>
          {msg.password && <Banner tone={msg.password.tone}>{msg.password.text}</Banner>}
          {user.has_password && (
            <Field label="Current password" htmlFor="pf_cur" error={errs.current_password}>
              <input id="pf_cur" className="au-input" type="password" autoComplete="current-password" value={pw.current_password} onChange={setP("current_password")} />
            </Field>
          )}
          <Field label="New password" htmlFor="pf_new" error={errs.password}>
            <input id="pf_new" className="au-input" type="password" autoComplete="new-password" value={pw.password} onChange={setP("password")} />
          </Field>
          <Field label="Confirm new password" htmlFor="pf_conf">
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
