import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle, Check, Copy, Download, Eye, EyeOff, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { usePopup } from "../../context/PopupContext";
import { Btn, Field, Input, Notice } from "./ui";

import Tooltip from "../shared/Tooltip";
/** Six one-digit boxes that behave like one field (type, paste, backspace, arrows, autofill). */
export function OtpInput({ value, onChange, disabled, invalid, autoFocus, label = "Verification code" }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");
  const focusAt = (i) => refs.current[Math.max(0, Math.min(5, i))]?.focus();
  const setAt = (i, d) => { const n = digits.slice(); n[i] = d; onChange(n.join("").slice(0, 6)); };

  const change = (i, e) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) { setAt(i, ""); return; }
    if (raw.length > 1) { const m = (value.slice(0, i) + raw).slice(0, 6); onChange(m); focusAt(m.length >= 6 ? 5 : m.length); return; }
    setAt(i, raw);
    if (i < 5) focusAt(i + 1);
  };
  const key = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) { e.preventDefault(); setAt(i - 1, ""); focusAt(i - 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focusAt(i + 1); }
  };
  const paste = (e) => {
    const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!t) return;
    e.preventDefault(); onChange(t); focusAt(t.length >= 6 ? 5 : t.length);
  };
  return (
    <div className="tf-otp" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i} ref={(el) => { refs.current[i] = el; }} className={`tf-otp-box${d ? " is-filled" : ""}`}
          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={d} disabled={disabled}
          autoComplete={i === 0 ? "one-time-code" : "off"} autoFocus={autoFocus && i === 0}
          aria-label={`${label}, digit ${i + 1}`} aria-invalid={invalid || undefined}
          onChange={(e) => change(i, e)} onKeyDown={(e) => key(i, e)} onPaste={paste} onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function CopyBtn({ value, label }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip label={`Copy ${label}`}><button type="button" className="tf-icon-btn" aria-label={`Copy ${label}`}
      onClick={async () => { if (await copyText(value)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
      {done ? <Check size={16} /> : <Copy size={16} />}
    </button></Tooltip>
  );
}

/**
 * Two-factor (authenticator app) for Admin / Coordinator accounts: same flow as the SCLF app.
 * idle -> enroll (QR + 6-digit code) -> recovery (codes shown ONCE); regen / disable need the password.
 */
export default function TwoFactorPanel() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const enabled = !!user?.two_factor_enabled;
  const required = !!user?.two_factor_required;

  const [phase, setPhase] = useState("idle"); // idle | enroll | recovery | regen | disable
  const [isRegen, setIsRegen] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errs, setErrs] = useState({});
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!enabled || phase !== "idle") return;
    api.get("/2fa/status").then(({ data }) => setRemaining(data.recovery_codes_remaining)).catch(() => {});
  }, [enabled, phase]);

  const reset = () => {
    setPhase("idle"); setIsRegen(false); setMsg(null); setErrs({}); setQr(""); setSecret("");
    setShowSecret(false); setCode(""); setCodes([]); setSaved(false); setPassword("");
  };

  async function startEnroll() {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post("/2fa/setup");
      setQr(await QRCode.toDataURL(data.otpauth_uri, { errorCorrectionLevel: "M", margin: 1, width: 220 }));
      setSecret(data.secret); setPhase("enroll");
    } catch (e) { setMsg({ bad: true, text: errorMessage(e, "Could not start two-factor setup. Please try again.") }); }
    finally { setBusy(false); }
  }

  async function confirm(e) {
    e.preventDefault();
    if (code.length !== 6) { setMsg({ bad: true, text: "Enter the 6-digit code from your authenticator app." }); return; }
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post("/2fa/confirm", { code });
      setCodes(data.recovery_codes || []); setPhase("recovery");
      if (data.user) updateUser(data.user);
    } catch (err) { setMsg({ bad: true, text: fieldErrors(err).code || errorMessage(err, "That code is invalid or has expired.") }); }
    finally { setBusy(false); }
  }

  async function regen(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErrs({});
    try {
      const { data } = await api.post("/2fa/recovery-codes", { password });
      setCodes(data.recovery_codes || []); setPassword(""); setIsRegen(true); setPhase("recovery");
    } catch (err) { setErrs(fieldErrors(err)); setMsg({ bad: true, text: errorMessage(err) }); }
    finally { setBusy(false); }
  }

  async function disable(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErrs({});
    try {
      const { data } = await api.post("/2fa/disable", { password });
      if (data.user) await updateUser(data.user);
      reset(); toast.info("Two-factor authentication has been turned off.");
    } catch (err) { setErrs(fieldErrors(err)); setMsg({ bad: true, text: errorMessage(err) }); }
    finally { setBusy(false); }
  }

  const finish = () => {
    const wasRegen = isRegen; reset();
    if (wasRegen) toast.success("Your new recovery codes are active. The old ones no longer work.", { title: "Recovery codes replaced" });
    else toast.success("Two-factor authentication is now on for your account.", { title: "2FA enabled" });
  };

  const saveFile = () => {
    const text = `OCCDL recovery codes - ${user?.admin_id || user?.email || ""}\nGenerated ${new Date().toLocaleString()}\n\n${codes.join("\n")}\n\nEach code works once. Keep this somewhere safe.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "occdl-recovery-codes.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const passwordForm = (title, sub, onSubmit, label, Icon) => (
    <form className="tf-panel" onSubmit={onSubmit} noValidate autoComplete="off">
      <div className="tf-head"><span className="tf-row-icon"><Icon size={19} /></span><div><b>{title}</b><div className="st-muted">{sub}</div></div></div>
      <Notice msg={msg} />
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" autoFocus value={password} maxLength={100}
          aria-invalid={!!errs.password} onChange={(e) => { setPassword(e.target.value); setMsg(null); setErrs({}); }} />
      </Field>
      <div className="st-flex" style={{ marginTop: 14 }}>
        <Btn kind="primary" disabled={busy || !password}>{busy ? "Please wait…" : label}</Btn>
        <Btn type="button" onClick={reset} disabled={busy}>Cancel</Btn>
      </div>
    </form>
  );

  if (phase === "enroll") {
    return (
      <form className="tf-panel" onSubmit={confirm} noValidate>
        <div className="tf-head"><span className="tf-row-icon"><Smartphone size={19} /></span>
          <div><b>Set up two-factor authentication</b><div className="st-muted">Use an authenticator app such as Google Authenticator, Authy or 1Password.</div></div></div>
        <Notice msg={msg} />
        <div className="tf-grid">
          <div className="tf-qr">{qr && <img src={qr} alt="QR code to scan with your authenticator app" width={220} height={220} />}</div>
          <div style={{ minWidth: 0 }}>
            <ol className="tf-howto">
              <li>Open your authenticator app and choose <b>Add account</b>.</li>
              <li>Scan the QR code. On this phone? Use the setup key instead.</li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <Field label="Setup key">
              <div className="tf-key">
                <code>{showSecret ? secret : secret.replace(/./g, "•")}</code>
                <Tooltip label={showSecret ? "Hide key" : "Show key"}><button type="button" className="tf-icon-btn" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? "Hide key" : "Show key"}>{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button></Tooltip>
                <CopyBtn value={secret} label="setup key" />
              </div>
            </Field>
            <Field label="6-digit code"><OtpInput value={code} onChange={(v) => { setCode(v); setMsg(null); }} invalid={!!msg?.bad} disabled={busy} autoFocus /></Field>
          </div>
        </div>
        <div className="st-flex" style={{ marginTop: 14 }}>
          <Btn kind="primary" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify & enable"}</Btn>
          <Btn type="button" disabled={busy} onClick={async () => {
            const leave = await popup.confirm({
              title: "Stop setting up two-factor?",
              message: "You haven't finished setting up two-factor authentication. If you close this now, you'll need to start over.",
              okLabel: "Stop setup",
              cancelLabel: "Keep going",
              danger: true,
            });
            if (leave) reset();
          }}>Cancel</Btn>
        </div>
      </form>
    );
  }

  if (phase === "recovery") {
    return (
      <div className="tf-panel">
        <div className="tf-head"><span className="tf-row-icon"><ShieldCheck size={19} /></span>
          <div><b>{isRegen ? "New recovery codes" : "Two-factor is on"}</b><div className="st-muted">{isRegen ? "Your old codes no longer work." : "One last thing: keep your recovery codes."}</div></div></div>
        <p className="tf-warn"><AlertTriangle size={16} /> <span><b>Save these codes now.</b> Each works once if you lose your authenticator app. They are shown only this one time.</span></p>
        <div className="tf-codes">
          {codes.map((c) => <div className="tf-chip" key={c}><code>{c}</code><CopyBtn value={c} label="recovery code" /></div>)}
        </div>
        <div className="st-flex" style={{ margin: "12px 0" }}>
          <Btn type="button" onClick={saveFile}><Download size={15} /> Save file</Btn>
          <Btn type="button" onClick={async () => { if (await copyText(codes.join("\n"))) toast.success("All codes copied.", { title: "Recovery codes" }); else toast.error("Could not copy. Use Save file instead."); }}><Copy size={15} /> Copy all</Btn>
        </div>
        <label className="st-check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes somewhere safe</label>
        <div className="st-flex" style={{ marginTop: 14 }}><Btn kind="primary" disabled={!saved} onClick={finish}>Done</Btn></div>
      </div>
    );
  }

  if (phase === "regen") return passwordForm("Create new recovery codes?", "Your old codes will stop working immediately.", regen, "Create new codes", KeyRound);
  if (phase === "disable") return passwordForm("Turn off two-factor?", "Only your password will be needed to sign in.", disable, "Turn off 2FA", ShieldOff);

  return (
    <div className="tf-row">
      <div className="tf-head">
        <span className="tf-row-icon">{enabled ? <ShieldCheck size={19} /> : <ShieldOff size={19} />}</span>
        <div style={{ minWidth: 0 }}>
          <b>Two-factor authentication</b>
          <div className={`st-muted${enabled ? " tf-on" : ""}`}>{enabled ? "On — a code from your authenticator app is needed at sign-in" : "Off — add a second step when you sign in"}</div>
          {enabled && remaining !== null && (
            <div className="st-muted" style={remaining <= 2 ? { color: "#b45309" } : undefined}>
              {remaining === 0 ? "No recovery codes left — create new ones now." : `${remaining} recovery code${remaining === 1 ? "" : "s"} left${remaining <= 2 ? " — create new ones soon" : ""}`}
            </div>
          )}
          {required && !enabled && <div className="st-muted" style={{ color: "#b45309" }}>Required for your role. Set it up to keep using the app.</div>}
        </div>
      </div>
      <Notice msg={msg} />
      {enabled ? (
        <div className="st-flex">
          <Btn onClick={() => { setMsg(null); setPhase("regen"); }}><KeyRound size={15} /> New recovery codes</Btn>
          {!required && <Btn onClick={() => { setMsg(null); setPhase("disable"); }}><ShieldOff size={15} /> Turn off</Btn>}
        </div>
      ) : (
        <Btn onClick={startEnroll} disabled={busy}><Smartphone size={15} /> {busy ? "Starting…" : "Set up 2FA"}</Btn>
      )}
    </div>
  );
}
