import React, { useEffect, useState } from "react";
import { loadRememberedCredentials, saveRememberedCredentials, clearRememberedCredentials } from "../../hooks/useRememberedCredentials";
import { Link, useNavigate } from "react-router-dom";
import { IdCard, Lock } from "lucide-react";
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

  useEffect(() => { document.title = "Administrator sign in | OCCDL"; }, []);

  // Prefill only the Admin / Coordinator ID remembered by "Keep this session open" (never the password).
  useEffect(() => {
    const r = loadRememberedCredentials("admin");
    if (r?.adminId) { setAdminId(r.adminId); setRemember(true); }
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(""); setErrors({});
    const v = {};
    if (adminId.length < 3) v.admin_id = "Enter your Administrator ID.";
    if (!password) v.password = "Enter your password.";
    if (Object.keys(v).length) {
      setErrors(v);
      setError("Please fill in the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/administrator", { admin_id: adminId, password, remember });
      await signIn(data, remember);
      if (remember) saveRememberedCredentials(adminId, "admin"); else clearRememberedCredentials("admin");
      navigate("/", { replace: true }); // main loading page, then the dashboard
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
      subtitle="Administrators sign in with their Admin ID and Coordinators with their Coordinator ID."
      railHeadline="Manage on-the-job training."
      railNote="Coordinators see only their own section. Every management action is checked on the server."
      gate
      gateName="Opol Community College"
      gateLabel="Admin"
      gateDefaultOpen
    >
      <LedgerBanner>{error}</LedgerBanner>

      <form onSubmit={submit} noValidate>
        <LedgerRow
          index={1} icon={IdCard} htmlFor="admin_id" error={errors.admin_id}
          label={<>Administrator ID <span className="lg-required" aria-hidden="true">*</span></>}
          hint="Given to you by the system administrator, e.g. ADMIN-001"
        >
          <LedgerInput
            id="admin_id" value={adminId} autoComplete="username" maxLength={32}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            enterKeyHint="next" placeholder="ADMIN-001"
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
          <Link to="/forgot-password" className="lg-forgot">Forgot password?</Link>
        </div>

        <LedgerButton disabled={busy}>
          {busy ? <><span className="au-spin" /> Signing in…</> : "Sign in"}
        </LedgerButton>
      </form>
    </AuthShell>
  );
}
