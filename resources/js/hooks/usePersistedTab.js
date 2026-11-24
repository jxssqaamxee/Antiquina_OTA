import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

// Which section of the Admin / Coordinator area is open now lives in the address itself, as a real
// path: /admin/sections, /coordinator/approvals (no "#"). The router owns it, so refresh, Back/Forward
// and shared links all land on the right section. Bare /admin or /coordinator opens the default one.
//
// Old links still work: /coordinator#approvals is rewritten to /coordinator/approvals on arrival,
// and an unknown section (/admin/nope) is replaced by the area's default.
const RESERVED = ["profile"]; // pages of the shell itself, handled by AdminShell, not sections

export const clearPersistedUi = () => {
  try {
    Object.keys(window.sessionStorage).filter((k) => k.startsWith("occdl.tab.") || k.startsWith("occdl.form.")).forEach((k) => window.sessionStorage.removeItem(k));
  } catch { /* storage can be blocked */ }
};

export default function usePersistedTab(area, keys, fallback) {
  const { tab: param } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const base = `/${area}`;

  const legacy = decodeURIComponent((hash || "").replace(/^#/, ""));
  const tab = keys.includes(param) ? param : (!param && keys.includes(legacy) ? legacy : fallback);

  useEffect(() => {
    if (param && !keys.includes(param) && !RESERVED.includes(param)) {
      navigate(base, { replace: true }); // unknown section
    } else if (!param && legacy && (keys.includes(legacy) || RESERVED.includes(legacy))) {
      navigate(`${base}/${legacy}`, { replace: true }); // old /area#section link
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, legacy]);

  const setTab = useCallback((key) => navigate(`${base}/${key}`), [navigate, base]);

  return [tab, setTab];
}
