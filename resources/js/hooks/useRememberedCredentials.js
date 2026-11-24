// "Keep this session open" remembers ONLY the sign-in ID (Student ID, or Admin/Coordinator ID) so the
// Login form can prefill it next time, even after the browser was closed. An ID is not a secret.
// The PASSWORD is never stored by the app: anything in JS-readable storage can be stolen by an XSS bug,
// a malicious extension or the next person holding a shared phone. The device's own password manager
// (autocomplete="current-password") is the safe place for it.
//
// The sign-in itself stays open on the server side (30 days with the box ticked, otherwise 12 hours;
// see SessionLogin / EnforceSessionLifetime). Signing in again with the box unticked
// forgets the ID.
const KEYS = { student: "occ_remembered_credentials", admin: "occ_remembered_admin" };
const FIELD = { student: "studentId", admin: "adminId" };

// Older versions saved the password too (and kept it per tab). Wipe anything but the ID.
function purgeLegacyStorage() {
  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const s = window[store];
      const raw = s.getItem(KEYS.student);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "password" in parsed) s.setItem(KEYS.student, JSON.stringify({ studentId: String(parsed.studentId || "") }));
    } catch { /* ignore */ }
  }
}

export function loadRememberedCredentials(kind = "student") {
  purgeLegacyStorage();
  for (const store of ["localStorage", "sessionStorage"]) {
    try {
      const raw = window[store].getItem(KEYS[kind]);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const id = parsed && typeof parsed === "object" ? String(parsed[FIELD[kind]] || "") : "";
      if (id) return { [FIELD[kind]]: id };
    } catch { /* ignore */ }
  }
  return null;
}

export function saveRememberedCredentials(id, kind = "student") {
  purgeLegacyStorage();
  try {
    window.localStorage.setItem(KEYS[kind], JSON.stringify({ [FIELD[kind]]: String(id || "") }));
    window.sessionStorage.removeItem(KEYS[kind]);
  } catch { /* private mode: it is a convenience, not a requirement */ }
}

export function clearRememberedCredentials(kind = "student") {
  for (const store of ["localStorage", "sessionStorage"]) {
    try { window[store].removeItem(KEYS[kind]); } catch { /* ignore */ }
  }
}
