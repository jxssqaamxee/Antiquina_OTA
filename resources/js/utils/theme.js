// Colour themes (same five as sclf_APP's picker). The choice is stored on the
// device and written to <html data-theme>; resources/views/app.blade.php applies
// it before first paint so there is no flash of the wrong theme.

const KEY = "occ_theme";
const COOKIE = "occ-theme"; // lets the server (app.blade.php + the manifest) know the theme, like sclf-theme

// Browser toolbar / status bar / installed-app title bar colour, same rule as sclf_APP:
// NAVY on the light themes, WHITE on the dark theme. (The page background is the theme's own colour.)
export const BAR_NAVY = "#01215f";
export const BAR_WHITE = "#ffffff";

/** "black" (Dark) and every "dark-*" (Black + accent) theme are dark; the rest are light tints. */
export const isDarkId = (id) => id === "black" || (typeof id === "string" && id.startsWith("dark-"));
export const barColorFor = (id) => (isDarkId(id) ? BAR_WHITE : BAR_NAVY);

// Same nine themes as sclf_APP's account menu: the five regular ones, plus the "Black" set
// (a pure black shell tinted with one accent colour) behind the Black / White switch.
export const THEMES = [
  { id: "white", label: "Default", bg: "#ffffff", accent: "#4f46e5", color: "#ffffff", swatch: "white" },
  { id: "black", label: "Dark", bg: "#12161f", accent: "#6366f1", color: "#0a0c12", swatch: "black" },
  { id: "blue", label: "Blue", bg: "#eaf2fd", accent: "#2563eb", color: "#f1f6fe", swatch: "blue" },
  { id: "yellow", label: "Yellow", bg: "#fbf3dc", accent: "#d97706", color: "#fdf8ec", swatch: "yellow" },
  { id: "maroon", label: "Maroon", bg: "#fdeef0", accent: "#9f1239", color: "#fdf3f4", swatch: "maroon" },
  { id: "dark-white", label: "Black / White", bg: "#0a0a0a", accent: "#f2f2f2", color: "#000000", swatch: "black-white" },
  { id: "dark-blue", label: "Black / Blue", bg: "#060d1f", accent: "#38bdf8", color: "#000000", swatch: "black-blue" },
  { id: "dark-yellow", label: "Black / Yellow", bg: "#120b02", accent: "#f59e0b", color: "#000000", swatch: "black-yellow" },
  { id: "dark-maroon", label: "Black / Maroon", bg: "#14060a", accent: "#dc2626", color: "#000000", swatch: "black-maroon" },
];
export const REGULAR_THEMES = THEMES.filter((t) => !t.id.startsWith("dark-"));
export const BLACK_THEMES = THEMES.filter((t) => t.id.startsWith("dark-"));

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.some((x) => x.id === t)) return t;
  } catch { /* storage blocked */ }
  return "white";
}

export function applyTheme(id = getTheme()) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.setAttribute("data-theme", t.id);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
  meta.setAttribute("content", barColorFor(t.id));
  try { document.cookie = `${COOKIE}=${t.id}; path=/; max-age=31536000; SameSite=Lax`; } catch { /* cookies blocked */ }
  // Keep what app.blade.php painted before first paint in step with the choice,
  // otherwise the old theme's colour stays behind the page (overscroll, rotation).
  const dark = isDarkId(t.id);
  const root = document.documentElement;
  root.style.background = t.color;
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", dark ? "dark" : "light");
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", dark ? "black" : "default");
  return t.id;
}

export function setTheme(id) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  const applied = applyTheme(id);
  // Lets useAppTheme (toasts, popups) re-render without a reload.
  try { window.dispatchEvent(new Event("occ-theme-change")); } catch { /* ignore */ }
  return applied;
}

// Saves the choice on the account (so it follows the person to any device). Fire-and-forget:
// the device keeps the theme either way, and a failed save just means this device only.
export async function saveThemeToAccount(id) {
  try {
    const { default: api } = await import("../config/axiosConfig");
    await api.put("/profile/preferences", { theme: id });
  } catch { /* offline or signed out: stays on this device */ }
}
