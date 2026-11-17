import axios from "axios";
import { KEYS, EVENTS } from "./constant";

const TOKEN_KEY = KEYS.token;
const EXPIRY_KEY = KEYS.tokenExp;

// The access token lives in localStorage ("Keep me signed in") or
// sessionStorage (this tab only), mirroring how sclf_APP handles sessions.
function stores() {
  const out = [];
  try { out.push(window.localStorage); } catch { /* blocked */ }
  try { out.push(window.sessionStorage); } catch { /* blocked */ }
  return out;
}

export function getToken() {
  for (const s of stores()) {
    try {
      const t = s.getItem(TOKEN_KEY);
      if (!t) continue;
      const exp = Number(s.getItem(EXPIRY_KEY) || 0);
      if (exp && Date.now() > exp) { s.removeItem(TOKEN_KEY); s.removeItem(EXPIRY_KEY); continue; }
      return t;
    } catch { /* ignore */ }
  }
  return null;
}

export function storeToken(token, expiresAt, remember) {
  clearToken();
  try {
    const s = remember ? window.localStorage : window.sessionStorage;
    s.setItem(TOKEN_KEY, token);
    s.setItem(EXPIRY_KEY, String(new Date(expiresAt).getTime()));
  } catch { /* storage blocked: session lasts until reload */ }
}

export function clearToken() {
  for (const s of stores()) {
    try { s.removeItem(TOKEN_KEY); s.removeItem(EXPIRY_KEY); } catch { /* ignore */ }
  }
}

const api = axios.create({
  baseURL: "/api",
  headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  // A FormData body (photo upload) must NOT be sent as application/json: drop any
  // Content-Type so the browser writes multipart/form-data with its own boundary.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete ? config.headers.delete("Content-Type") : delete config.headers["Content-Type"];
    // A phone photo on a slow connection needs longer than a JSON call.
    if (!config.timeout || config.timeout < 60000) config.timeout = 60000;
  }
  return config;
});

// A 401 on an authenticated call means the token expired or was revoked.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && getToken()) {
      clearToken();
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
