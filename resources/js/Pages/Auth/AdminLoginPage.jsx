import React, { useEffect, useState } from "react";
import { loadRememberedCredentials, saveRememberedCredentials, clearRememberedCredentials } from "../../hooks/useRememberedCredentials";
import { Link, useNavigate } from "react-router-dom";
import { IdCard, Lock, ShieldCheck } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerInput, LedgerPasswordInput, LedgerRow,
} from "../../Components/auth/AuthShell";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { homePath } from "../../utils/roles";

// Admin and Coordinator IDs are letters, digits, dashes, dots and underscores, shown upper-case (e.g. ADMIN-001).
const filterAdminId = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9\-_.]/g, "").slice(0, 32);

/** Admin / Coordinator sign-in only: no link to the trainee page. */
export default function AdminLoginPage() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  // Set when the password was right and the account has two-factor: { tempToken }. Held in memory only.
  const [challenge, setChallenge] = useState(null);
  const [codeMode, setCodeMode] = useState("app"); // app | recovery
  const [code, setCode] = useState("");

  useEffect(() => { document.title = "Administrator sign in | OCCDL"; }, []);

  // Prefill only the Admin / Coordinator ID remembered by "Keep this session open" (never the password).
  useEffect(() => {
    const r = loadRememberedCredentials("admin");
    if (r?.adminId) { setAdminId(r.adminId); setRemember(true); }
  }, []);

  async function finishSignIn(data) {
    await signIn(data, remember);
    if (remember) saveRememberedCredentials(adminId, "admin"); else clearRememberedCredentials("admin");
    navigate("/", { replace: true }); // main loading page, then the dashboard
  }

  async function submitCode(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { data } = await api.post("/2fa/login-verify", { temp_token: challenge.tempToken, code });
      await finishSignIn(data);
    } catch (err) {
      const message = fieldErrors(err).code || errorMessage(err);
      setError(message);
      toast.error(message, { title: "Verification failed", key: "admin-2fa-error" });
      setBusy(false);
    }
  }

  const onCode = (raw) => {
    if (codeMode === "app") { setCode(raw.replace(/\D/g, "").slice(0, 6)); return; }
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); // ABCD-EFGH, dash added for you
    setCode(clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean);
  };

  async function submit(e) {
    e.preventDefault();
    setError(""); setErrors({});
    const v = {};
    if (adminId.length < 3) v.admin_id = "Enter your Admin or Coordinator ID.";
    if (!password) v.password = "Enter your password.";
    if (Object.keys(v).length) {
      setErrors(v);
      setError("Please fill in the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/administrator", { admin_id: adminId, password, remember });
      if (data.two_factor_required) { setChallenge({ tempToken: data.temp_token }); setBusy(false); return; }
      await finishSignIn(data);
    } catch (err) {
      setErrors(fieldErrors(err));
      const message = errorMessage(err);
      setError(message);
      toast.error(message, { title: "Sign in failed", key: "admin-login-error" });
      setBusy(false);
    }
  }

  return (
    <AuthShell
      docType="ADMIN ACCESS"
      caseSeed="STF"
      title={<>Administrator <span className="accent">sign in</span></>}
      subtitle="For Administrators and Coordinators. Use the ID given to you by the system administrator."
      railHeadline="Manage on-the-job training."
      railNote="Staff access for Opol Community College Administrators and Coordinators."
      railFacts={[
        "Administrators manage all sections, coordinators, trainees and announcements.",
        "Coordinators see and approve only their own section.",
        "Every management action is checked and recorded on the server.",
      ]}
      legalNote={null}
      gate
      gateName="Opol Community College"
      gateLabel="Admin"
      gateDefaultOpen
    >
      <LedgerBanner>{error}</LedgerBanner>

      {challenge ? (
        <form onSubmit={submitCode} noValidate>
          <LedgerBanner tone="notice">Enter the 6-digit code from your authenticator app to finish signing in.</LedgerBanner>
          <LedgerRow index={1} icon={ShieldCheck} htmlFor="code" label={<>Verification code <span className="lg-required" aria-hidden="true">*</span></>}>
            <LedgerInput
              id="code" type="text" value={code} autoFocus required aria-invalid={!!error}
              inputMode={codeMode === "app" ? "numeric" : "text"} enterKeyHint="go" autoCorrect="off" spellCheck={false}
              autoCapitalize={codeMode === "app" ? "off" : "characters"} maxLength={codeMode === "app" ? 6 : 9}
              autoComplete={codeMode === "app" ? "one-time-code" : "off"} placeholder={codeMode === "app" ? "123456" : "ABCD-EFGH"}
              onChange={(e) => { onCode(e.target.value); setError(""); }}
            />
          </LedgerRow>
          <LedgerButton disabled={busy || !code}>{busy ? <><span className="au-spin" /> Verifying…</> : "Verify & sign in"}</LedgerButton>
          <button type="button" className="lg-forgot" style={{ display: "block", marginTop: 14, background: "none", border: "none", cursor: "pointer" }}
            onClick={() => { setCodeMode((m) => (m === "app" ? "recovery" : "app")); setCode(""); setError(""); }}>
            {codeMode === "app" ? "Use a recovery code instead" : "Use authenticator app code instead"}
          </button>
          <button type="button" className="lg-forgot" style={{ display: "block", marginTop: 14, background: "none", border: "none", cursor: "pointer" }}
            onClick={() => { setChallenge(null); setCode(""); setCodeMode("app"); setError(""); setPassword(""); }}>
            &larr; Back to sign in
          </button>
        </form>
      ) : (
      <form onSubmit={submit} noValidate>
        <LedgerRow
          index={1} icon={IdCard} htmlFor="admin_id" error={errors.admin_id}
          label={<>Admin / Coordinator ID <span className="lg-required" aria-hidden="true">*</span></>}
          hint="e.g. ADMIN-001 for Administrators, COOR-001 for Coordinators"
        >
          <LedgerInput
            id="admin_id" value={adminId} autoComplete="username" maxLength={32}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            enterKeyHint="next" placeholder="ADMIN-001 or COOR-001"
            aria-required="true" aria-invalid={!!errors.admin_id}
            onChange={(e) => { setAdminId(filterAdminId(e.target.value)); setError(""); setErrors((x) => ({ ...x, admin_id: undefined })); }}
          />
        </LedgerRow>

        <LedgerRow
          index={2} icon={Lock} htmlFor="password" error={errors.password}
          label={<>Password <span className="lg-required" aria-hidden="true">*</span></>}
        >
          <LedgerPasswordInput
            id="password" show={show} onToggle={() => setShow((v) => !v)} value={password}
            autoComplete="current-password" enterKeyHint="go" placeholder="Your password" maxLength={100}
            aria-required="true" aria-invalid={!!errors.password}
            onChange={(e) => { setPassword(e.target.value); setError(""); setErrors((x) => ({ ...x, password: undefined })); }}
          />
        </LedgerRow>

        <div className="lg-row-checkbox" style={{ margin: "10px 0 12px" }}>
          <label className="lg-remember" htmlFor="remember">
            <input id="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep this session open
          </label>
          <Link to="/forgot-password/administrator" className="lg-forgot">Forgot password?</Link>
        </div>

        <LedgerButton disabled={busy}>
          {busy ? <><span className="au-spin" /> Signing in…</> : "Sign in"}
        </LedgerButton>
      </form>
      )}
    </AuthShell>
  );
}
