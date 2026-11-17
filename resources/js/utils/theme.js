// Colour themes (same five as sclf_APP's picker). The choice is stored on the
// device and written to <html data-theme>; resources/views/app.blade.php applies
// it before first paint so there is no flash of the wrong theme.

const KEY = "occ_theme";

export const THEMES = [
  { id: "white", label: "Light", bg: "#ffffff", accent: "#4f46e5", color: "#ffffff" },
  { id: "black", label: "Dark", bg: "#12161f", accent: "#6366f1", color: "#0a0c12" },
  { id: "blue", label: "Blue", bg: "#eaf2fd", accent: "#2563eb", color: "#f1f6fe" },
  { id: "yellow", label: "Gold", bg: "#fbf3dc", accent: "#d97706", color: "#fdf8ec" },
  { id: "maroon", label: "Maroon", bg: "#fdeef0", accent: "#9f1239", color: "#fdf3f4" },
];

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
  meta.setAttribute("content", t.color);
  // Keep what app.blade.php painted before first paint in step with the choice,
  // otherwise the old theme's colour stays behind the page (overscroll, rotation).
  const dark = t.id === "black";
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
