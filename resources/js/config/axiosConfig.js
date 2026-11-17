import axios from "axios";
import { EVENTS, LEGACY_TOKEN_KEYS } from "./constant";

// Sign-in is an HttpOnly session cookie set by the server. JavaScript never sees or stores a
// token: the browser sends the cookie by itself, and axios copies the XSRF-TOKEN cookie into the
// X-XSRF-TOKEN header on every write (CSRF protection).

/** Removes any sign-in token an older version of the app left in this browser. */
export function purgeLegacyTokens() {
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const s = get();
      LEGACY_TOKEN_KEYS.forEach((k) => s.removeItem(k));
    } catch { /* storage blocked */ }
  }
}
purgeLegacyTokens();

// Was this tab signed in? Only used to tell "the session just ended" (401) apart from
// "nobody is signed in" (a normal 401 on the first /me call).
let signedIn = false;
export const setSignedIn = (v) => { signedIn = !!v; };

const api = axios.create({
  baseURL: "/api",
  headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  timeout: 20000,
  withCredentials: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
});

// Laravel hands out the XSRF-TOKEN cookie on any GET to /api. If it is missing (first visit,
// cleared cookies, the app shell came from the offline cache) the first write would be a 419.
// So before ANY write the token is fetched once (shared by concurrent writes) and only then sent.
const hasXsrfCookie = () => typeof document !== "undefined" && /(?:^|;\s*)XSRF-TOKEN=/.test(document.cookie);
let priming = null;
export function ensureCsrf() {
  if (hasXsrfCookie()) return Promise.resolve();
  if (!priming) {
    priming = axios.get("/api/config", { withCredentials: true, timeout: 10000, headers: { Accept: "application/json" } })
      .catch(() => { /* offline: the write fails with a clear network error right after */ })
      .finally(() => { priming = null; });
  }
  return priming;
}

api.interceptors.request.use(async (config) => {
  const method = String(config.method || "get").toLowerCase();
  if (method !== "get" && method !== "head" && method !== "options") await ensureCsrf();

  // A FormData body (photo upload) must NOT be sent as application/json: drop any
  // Content-Type so the browser writes multipart/form-data with its own boundary.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete ? config.headers.delete("Content-Type") : delete config.headers["Content-Type"];
    // A phone photo on a slow connection needs longer than a JSON call.
    if (!config.timeout || config.timeout < 60000) config.timeout = 60000;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err.response?.status;
    const config = err.config;

    // 419 = the CSRF cookie was missing or stale (e.g. the app shell came from the offline cache).
    // GET /config always hands out a fresh one; then the request is repeated once.
    if (status === 419 && config && !config._csrfRetried) {
      config._csrfRetried = true;
      try {
        await api.get("/config");
        return api.request(config);
      } catch { /* fall through to the original error */ }
    }

    // 401 while signed in = the session expired or was ended on the server.
    if (status === 401 && signedIn) {
      signedIn = false;
      window.dispatchEvent(new CustomEvent(EVENTS.unauthorized));
    }
    return Promise.reject(err);
  }
);

/** First readable message out of a Laravel validation / error response. */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err.response) return "Can't reach the server. Check your internet connection.";
  const d = err.response.data;
  if (d?.errors) return Object.values(d.errors)[0]?.[0] || fallback;
  if (err.response.status === 429) return "Too many attempts. Please wait a minute and try again.";
  return d?.message || fallback;
}

/** Field -> first message map for inline form errors. */
export function fieldErrors(err) {
  const e = err.response?.data?.errors;
  if (!e) return {};
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v[0]]));
}

export default api;
