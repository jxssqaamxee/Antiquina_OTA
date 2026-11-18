// "Keep this session open" remembers ONLY the Student ID so the Login form can prefill it,
// for this browser tab (sessionStorage). The password is NEVER stored by the app: anything in
// JS-readable storage can be stolen by an XSS bug, a malicious extension or the next person
// holding a shared phone. The phone's own password manager (autocomplete="current-password")
// is the safe place for it.
const KEY = "occ_remembered_credentials";

// Older versions saved the password too. Wipe it from this browser as soon as the app loads.
function purgeLegacyStorage() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "password" in parsed) {
      window.sessionStorage.setItem(KEY, JSON.stringify({ studentId: String(parsed.studentId || "") }));
    }
  } catch { /* ignore */ }
}

export function loadRememberedCredentials() {
  purgeLegacyStorage();
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { studentId: String(parsed.studentId || "") } : null;
  } catch {
    return null;
  }
}

export function saveRememberedCredentials(studentId) {
  purgeLegacyStorage();
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ studentId: String(studentId || "") }));
  } catch { /* private mode: it is a convenience, not a requirement */ }
}

export function clearRememberedCredentials() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
