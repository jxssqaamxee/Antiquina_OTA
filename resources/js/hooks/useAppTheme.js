import { useEffect, useState } from "react";
import { getTheme, isDarkId } from "../utils/theme";

// Reads the saved OCC theme and re-renders when it changes (setTheme in
// utils/theme.js dispatches `occ-theme-change`; other tabs fire `storage`).
// "black" and the "dark-*" (Black + accent) themes are dark; the others are light tints.
export const isDarkTheme = (theme) => isDarkId(theme);

export function useAppTheme() {
  const [theme, setThemeState] = useState(() => getTheme());

  useEffect(() => {
    const sync = () => setThemeState(getTheme());
    window.addEventListener("occ-theme-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("occ-theme-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { theme, isDark: isDarkTheme(theme) };
}
