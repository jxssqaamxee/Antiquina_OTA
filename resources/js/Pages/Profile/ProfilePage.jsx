import React, { useEffect, useState } from "react";
import { Camera, ChevronDown, GraduationCap, IdCard, Lock, Mail, User } from "lucide-react";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useConfig } from "../../config/serverConfig";
import { useToast } from "../../context/ToastContext";
import {
  LedgerBanner, LedgerInput, LedgerPasswordInput, LedgerRow, LedgerRowPair, LedgerSelect,
  PasswordMatchNote, RequirementChecklist, StrengthTicks,
} from "../../Components/auth/AuthShell";
import WeekTimetable from "../../Components/shared/WeekTimetable";
import AvatarPhoto from "../../Components/shared/AvatarPhoto";
import PhotoUploadModal from "../../Components/shared/PhotoUploadModal";
import { ConfirmSheet } from "../../Components/shared/Sheet";
import {
  validateProfile, validatePasswordChange, clean, filterNameInput,
} from "../../utils/validators";
import MobileTabBar from "../../Components/shared/MobileTabBar";
import AppBar from "../../Components/shared/AppBar";
import logo from "../../assets/images/site-logo.png";
import Footer from "../../Components/shared/Footer";
import { subscribe } from "../../utils/pwaInstall";
import "../../styles/auth.css";

import Tooltip from "../../Components/shared/Tooltip";
const req = <span className="lg-required" aria-hidden="true">*</span>;

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const config = useConfig();
  const [form, setForm] = useState({ first_name: user.first_name, middle_name: user.middle_name || "", last_name: user.last_name });
  const [pw, setPw] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [msg, setMsg] = useState({ profile: null, password: null });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState("");
  const [, force] = useState(0);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [confirmPw, setConfirmPw] = useState(false); // last "are you sure" before the password really changes
  const [openSec, setOpenSec] = useState(null); // "details" | "password" | null: closed until tapped, so nothing is typed by accident

  useEffect(() => { document.title = "Profile | OCCDL"; }, []);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  // Opening or closing a section wipes anything typed in the password form, so a half-typed
  // password can never be saved by accident later.
  const toggleSec = (name) => {
    setOpenSec((cur) => (cur === name ? null : name));
    setPw({ current_password: "", password: "", password_confirmation: "" });
    setErrs({}); setMsg({ profile: null, password: null }); setShowPw(false); setShowCur(false);
  };

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
      const ids = { first_name: "pf_first", middle_name: "pf_middle", last_name: "pf_last" };
      const firstBad = Object.keys(ids).find((k) => v[k]);
      if (firstBad) document.getElementById(ids[firstBad])?.focus();
      return;
    }
    setBusy("profile"); setErrs({});
    try {
      const { data } = await api.put("/profile", {
        first_name: clean(form.first_name), middle_name: clean(form.middle_name) || null, last_name: clean(form.last_name),
      });
      updateUser(data.user);
      setMsg((m) => ({ ...m, profile: { tone: "notice", text: "Profile saved." } }));
    } catch (err) {
      setErrs(fieldErrors(err));
      setMsg((m) => ({ ...m, profile: { tone: "error", text: errorMessage(err) } }));
    } finally { setBusy(""); }
  }

  function askPassword(e) {
    e.preventDefault();
    setMsg((m) => ({ ...m, password: null }));
    const v = validatePasswordChange(pw);
    if (Object.keys(v).length) {
      setErrs(v);
      setMsg((m) => ({ ...m, password: { tone: "error", text: "Please fix the highlighted fields." } }));
      return;
    }
    setErrs({});
    setConfirmPw(true);
  }

  async function savePassword() {
    setConfirmPw(false);
    setBusy("password"); setErrs({});
    try {
      const { data } = await api.put("/profile/password", pw);
      updateUser(data.user);
      setPw({ current_password: "", password: "", password_confirmation: "" });
      setMsg((m) => ({ ...m, password: { tone: "notice", text: "Password changed." } }));
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

  const courses = config?.courses || [];
  const timetableFetcher = (w) => api.get("/logbook/timetable", { params: w ? { week: w } : {} }).then((r) => r.data);

  return (
    <div className="app">
      <AppBar title="Profile settings" subtitle="Your account" back="/logbook" />

      <main className="app-main">
        <section className="pf-hero" style={{ "--pf-logo": `url("${logo}")` }}>
          <div className="pf-hero-in">
            <div className="pf-avatar-wrap">
              <span className="pf-avatar"><AvatarPhoto user={user} /></span>
              <Tooltip label={"Change profile photo"}><button type="button" className="pf-cam" onClick={() => setPhotoOpen(true)} disabled={busy === "photo"} aria-label="Change profile photo">
                <Camera size={15} />
              </button></Tooltip>
            </div>
            <div style={{ minWidth: 0 }}>
              <h2>{user.name}</h2>
              <p>Student ID <b>{user.student_id}</b></p>
              <p>{user.email}</p>
            </div>
          </div>
        </section>

        <div className="pf-stack">
          <form className="card pf-form" onSubmit={(e) => e.preventDefault()} noValidate>
            <button type="button" className="pf-toggle" aria-expanded={openSec === "details"} onClick={() => toggleSec("details")}>
              <span className="card-title pf-form-title">Personal details</span>
              <ChevronDown size={18} className="pf-chev" />
            </button>
            <div className="pf-body" hidden={openSec !== "details"}>
            <p className="pf-muted" style={{ margin: "0 0 4px" }}>These details can only be changed by an administrator.</p>
            <LedgerBanner tone={msg.profile?.tone}>{msg.profile?.text}</LedgerBanner>

            <LedgerRowPair index={1}>
              <div>
                <label className="lg-row-label" htmlFor="pf_first"><User size={12} strokeWidth={2.5} /> First name {req}</label>
                <div id="pf_first" className="pf-locked"><Lock size={13} aria-hidden="true" />{user.first_name}</div>
                {errs.first_name && <span className="lg-row-hint lg-row-error" role="alert">{errs.first_name}</span>}
              </div>
              <div>
                <label className="lg-row-label" htmlFor="pf_middle"><User size={12} strokeWidth={2.5} /> Middle name</label>
                <div id="pf_middle" className="pf-locked"><Lock size={13} aria-hidden="true" />{user.middle_name || "—"}</div>
                {errs.middle_name && <span className="lg-row-hint lg-row-error" role="alert">{errs.middle_name}</span>}
              </div>
            </LedgerRowPair>
            <LedgerRow index={2} icon={User} htmlFor="pf_last" error={errs.last_name} label={<>Last name {req}</>}>
              <div id="pf_last" className="pf-locked"><Lock size={13} aria-hidden="true" />{user.last_name}</div>
            </LedgerRow>
            <LedgerRow index={3} icon={GraduationCap} htmlFor="pf_course" label="Course" hint="Your course and section are set by the school and can’t be changed here.">
              <div id="pf_course" className="pf-locked"><Lock size={13} aria-hidden="true" />{user.course}{user.enrollment?.section ? ` · ${user.enrollment.section.code}` : user.enrollment ? " · Section not assigned yet" : ""}</div>
            </LedgerRow>
            <LedgerRow index={4} icon={Mail} htmlFor="pf_email" label="Gmail" hint="Your Gmail and Student ID can’t be changed here.">
              <div id="pf_email" className="pf-locked"><Lock size={13} aria-hidden="true" />{user.email}</div>
            </LedgerRow>
            <LedgerRow index={5} icon={IdCard} htmlFor="pf_sid" label="Student ID">
              <div id="pf_sid" className="pf-locked"><Lock size={13} aria-hidden="true" />{user.student_id}</div>
            </LedgerRow>
          </div>
          </form>

          <form className="card pf-form" onSubmit={askPassword} noValidate autoComplete="off">
            <button type="button" className="pf-toggle" aria-expanded={openSec === "password"} onClick={() => toggleSec("password")}>
              <span className="card-title pf-form-title">Change password</span>
              <ChevronDown size={18} className="pf-chev" />
            </button>
            <div className="pf-body" hidden={openSec !== "password"}>
            <p className="pf-muted" style={{ margin: "0 0 4px" }}>Use at least 8 characters with upper and lower case letters and a number.</p>
            <LedgerBanner tone={msg.password?.tone}>{msg.password?.text}</LedgerBanner>
            <LedgerRow index={1} icon={Lock} htmlFor="pf_cur" error={errs.current_password} label={<>Current password {req}</>}>
              <LedgerPasswordInput id="pf_cur" name="pf_cur_manual" show={showCur} onToggle={() => setShowCur((v) => !v)} autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} maxLength={100} value={pw.current_password} aria-invalid={!!errs.current_password} onChange={setP("current_password")} />
            </LedgerRow>
            <LedgerRow index={2} icon={Lock} htmlFor="pf_new" error={errs.password} label={<>New password {req}</>}>
              <LedgerPasswordInput id="pf_new" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password" maxLength={100} value={pw.password} aria-invalid={!!errs.password} onChange={setP("password")} />
              <StrengthTicks password={pw.password} />
            </LedgerRow>
            <LedgerRow index={3} icon={Lock} htmlFor="pf_conf" error={errs.password_confirmation} label={<>Confirm new password {req}</>}>
              <LedgerPasswordInput id="pf_conf" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password" onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} maxLength={100} value={pw.password_confirmation} aria-invalid={!!errs.password_confirmation} onChange={setP("password_confirmation")} />
              <PasswordMatchNote password={pw.password} confirm={pw.password_confirmation} />
            </LedgerRow>
            {!!pw.password && <RequirementChecklist password={pw.password} />}
            <button className="lg-submit" disabled={busy === "password" || !pw.current_password || !pw.password || !pw.password_confirmation || pw.password !== pw.password_confirmation}>{busy === "password" ? "Saving…" : "Change password"}</button>
          </div>
          </form>

          {(!user.role || user.role === "trainee") && (
            <section className="card pf-form">
              <button type="button" className="pf-toggle" aria-expanded={openSec === "timetable"} onClick={() => toggleSec("timetable")}>
                <span className="card-title pf-form-title">My duty timetable</span>
                <ChevronDown size={18} className="pf-chev" />
              </button>
              <div className="pf-body" hidden={openSec !== "timetable"}>
                <p className="pf-muted" style={{ margin: "0 0 10px" }}>Your week at a glance, based on your logbook. Green is on time, yellow is up to 30 minutes late, red is later than that.</p>
                {openSec === "timetable" && <WeekTimetable fetcher={timetableFetcher} canDownload />}
              </div>
            </section>
          )}
        </div>
        <Footer />
      </main>
      <PhotoUploadModal
        open={photoOpen} onClose={() => setPhotoOpen(false)} onAccept={uploadPhoto} title="Profile photo"
        onRemove={user.has_profile_photo ? () => { setPhotoOpen(false); setConfirmRemove(true); } : undefined}
      />
      <ConfirmSheet
        open={confirmPw} title="Change your password?"
        message="You will stay signed in here, but every other device will be signed out. Make sure you typed the new password correctly."
        yes="Yes, change it" no="Go back" onYes={savePassword} onNo={() => setConfirmPw(false)}
      />
      <ConfirmSheet
        open={confirmRemove} title="Remove your photo?"
        message="Your picture will be removed and your initials will show instead."
        yes="Remove photo" no="Keep it" onYes={removePhoto} onNo={() => setConfirmRemove(false)}
      />
      <MobileTabBar />
    </div>
  );
}
