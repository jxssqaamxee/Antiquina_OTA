import { useCallback, useState } from "react";

// useState that survives a refresh (sessionStorage, this tab only), for half-filled forms and
// filters in the Admin / Coordinator area. `omit` lists fields that must never be stored (passwords).
// Cleared on sign-out (see clearPersistedUi).
const PREFIX = "occdl.form.";

export default function usePersistedState(name, initial, { omit = [] } = {}) {
  const [value, setValue] = useState(() => {
    const base = typeof initial === "function" ? initial() : initial;
    try {
      const raw = window.sessionStorage.getItem(PREFIX + name);
      if (raw == null) return base;
      const saved = JSON.parse(raw);
      if (base && typeof base === "object" && !Array.isArray(base)) return { ...base, ...(saved && typeof saved === "object" ? saved : {}) };
      return saved ?? base;
    } catch { return base; }
  });

  const set = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      try {
        let toStore = v;
        if (omit.length && v && typeof v === "object" && !Array.isArray(v)) {
          toStore = { ...v };
          omit.forEach((k) => delete toStore[k]);
        }
        window.sessionStorage.setItem(PREFIX + name, JSON.stringify(toStore));
      } catch { /* storage can be blocked */ }
      return v;
    });
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, set];
}
