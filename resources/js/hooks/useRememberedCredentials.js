// "Keep this session open" also remembers the Student ID + password so the Login form
// can prefill itself, even after logging out, but ONLY for this browser tab (sessionStorage),
// exactly like sclf_APP.
//
// Why not localStorage: anything in localStorage stays on the device forever and is readable
// by any script on the page. sessionStorage is wiped by the browser as soon as the tab or
// window is closed, and it is never shared with other tabs.
const KEY = "occ_remembered_credentials";

// Never leave a saved password in localStorage.
function purgeLegacyStorage() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function loadRememberedCredentials() {
  purgeLegacyStorage();
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRememberedCredentials(studentId, password) {
  purgeLegacyStorage();
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ studentId, password }));
  } catch { /* private mode: it is a convenience, not a requirement */ }
}

export function clearRememberedCredentials() {
  purgeLegacyStorage();
  try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
