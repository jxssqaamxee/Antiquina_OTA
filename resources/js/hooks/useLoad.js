import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../config/axiosConfig";

/**
 * Live data for an admin / coordinator screen (same idea as sclf_APP's usePolling).
 *
 *   const [data, reload, error, meta] = useLoad(() => svc.trainees(), { interval: 30000 });
 *
 * - Fetches right away, then every `interval` ms while the tab is visible (0 = no timer).
 * - Refetches when the tab becomes visible again and when the connection comes back.
 * - `reload()` is the Refresh button: it returns a promise and rejects nothing (the error text lands in `error`).
 * - A failed poll keeps the data already on screen and only sets `meta.stale`, so the list never blanks out.
 * - The newest request always wins, so a slow old answer can never overwrite a newer one.
 * - `fn` may change between renders without restarting the timer (read through a ref).
 * Pass `deps` (array) to refetch at once when something the request depends on changes (e.g. a filter).
 */
export default function useLoad(fn, { interval = 0, deps = [], enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const ticket = useRef(0);
  const alive = useRef(true);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (!alive.current || mine !== ticket.current) return;
      hasData.current = true;
      setData(d); setError(""); setUpdatedAt(Date.now());
    } catch (e) {
      if (!alive.current || mine !== ticket.current) return;
      setError(errorMessage(e));
    } finally {
      if (alive.current && mine === ticket.current) setLoading(false);
    }
  }, []);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const tick = () => { if (!document.hidden && navigator.onLine !== false) load(); };
    const timer = interval > 0 ? setInterval(tick, interval) : null;
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [load, interval, enabled, depsKey]);

  // `error` with data still showing = the last refresh failed, the numbers may be a little old.
  return [data, load, error, { loading, updatedAt, stale: !!error && hasData.current }];
}
