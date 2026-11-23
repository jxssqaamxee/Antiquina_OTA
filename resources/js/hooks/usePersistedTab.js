import { useCallback, useState } from "react";

// Remembers which section of the Admin / Coordinator area is open, so a refresh stays where the
// person was (same idea as sclf_APP, where every page has its own address). The section is kept in
// the address (/admin#sections) and in sessionStorage as a fallback; it is cleared on sign-out.
const PREFIX = "occdl.tab.";

export const clearPersistedUi = () => {
  try {
    Object.keys(window.sessionStorage).filter((k) => k.startsWith("occdl.tab.") || k.startsWith("occdl.form.")).forEach((k) => window.sessionStorage.removeItem(k));
  } catch { /* storage can be blocked */ }
};

export default function usePersistedTab(area, keys, fallback) {
  const [tab, setTabState] = useState(() => {
    try {
      const fromUrl = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (keys.includes(fromUrl)) return fromUrl;
      const saved = window.sessionStorage.getItem(PREFIX + area);
      if (keys.includes(saved)) return saved;
    } catch { /* ignore */ }
    return fallback;
  });

  const setTab = useCallback((key) => {
    setTabState(key);
    try {
      window.sessionStorage.setItem(PREFIX + area, key);
      // Keep the router's own history state; only the #fragment changes.
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${key}`);
    } catch { /* ignore */ }
  }, [area]);

  return [tab, setTab];
}
