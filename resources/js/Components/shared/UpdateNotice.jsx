import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { EVENTS } from "../../config/constant";

// A new version was found. pwa.js installs it by itself (saves any pending edit, then reloads), so nobody has to
// close and reopen the app. This strip only says so, and "Update now" skips the short wait.
export default function UpdateNotice() {
  const [waiting, setWaiting] = useState(null);

  useEffect(() => {
    const onUpdate = (e) => setWaiting(e.detail);
    window.addEventListener(EVENTS.swUpdate, onUpdate);
    return () => window.removeEventListener(EVENTS.swUpdate, onUpdate);
  }, []);

  if (!waiting) return null;
  return (
    <div className="update-notice" role="status">
      <span>Updating to the latest version…</span>
      <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent(EVENTS.flush)); } catch { /* ignore */ } waiting.postMessage({ type: "SKIP_WAITING" }); }}>
        <RefreshCw size={14} /> Update now
      </button>
    </div>
  );
}
