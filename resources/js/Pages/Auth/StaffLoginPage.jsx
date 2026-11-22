import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IdCard, Lock } from "lucide-react";
import AuthShell, {
  LedgerBanner, LedgerButton, LedgerInput, LedgerPasswordInput, LedgerRow,
} from "../../Components/auth/AuthShell";
import api, { errorMessage, fieldErrors } from "../../config/axiosConfig";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { homePath } from "../../utils/roles";

// Staff IDs are letters, digits, dashes, dots and underscores, shown upper-case (e.g. ADMIN-001).
const filterStaffId = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9\-_.]/g, "").slice(0, 32);

/** Admin / Coordinator sign-in. Trainees sign in at /login with their Student ID. */
export default function StaffLoginPage() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => { document.title = "Staff sign in | OCCDL"; }, []);

  async function submit(e) {
    e.preventDefault();
    setError(""); setErrors({});
    const v = {};
    if (staffId.length < 3) v.staff_id = "Enter your Staff ID.";
    if (!password) v.password = "Enter your password.";
    if (Object.keys(v).length) {
      setErrors(v);
      setError("Please fill in the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/staff-login", { staff_id: staffId, password, remember });
      await signIn(data, remember);
      navigate(homePath(data.user), { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      const message = errorMessage(err);
      setError(message);
      toast.error(message, { title: "Sign in failed", key: "staff-login-error" });
      setBusy(false);
    }
  }

  return (
    <AuthShell
      docType="STAFF ACCESS"
      caseSeed="STF"
      title={<>Staff <span className="accent">sign in</span></>}
      subtitle="Administrators and Coordinators sign in with their Staff ID."
      railHeadline="Manage on-the-job training."
      railNote="Coordinators see only their own section. Every management action is checked on the server."
      gate
      gateName="Opol Community College"
      gateLabel="Staff"
      gateDefaultOpen
      footer={<>Trainee? <Link to="/login">Sign in with your Student ID</Link></>}
    >
      <LedgerBanner>{error}</LedgerBanner>

      <form onSubmit={submit} noValidate>
        <LedgerRow
          index={1} icon={IdCard} htmlFor="staff_id" error={errors.staff_id}
          label={<>Staff ID <span className="lg-required" aria-hidden="true">*</span></>}
          hint="Given to you by the system administrator, e.g. ADMIN-001"
        >
          <LedgerInput
            id="staff_id" value={staffId} autoComplete="username" maxLength={32}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            enterKeyHint="next" placeholder="ADMIN-001"
            aria-required="true" aria-invalid={!!errors.staff_id}
            onChange={(e) => { setStaffId(filterStaffId(e.target.value)); setError(""); setErrors((x) => ({ ...x, staff_id: undefined })); }}
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
