import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { EVENTS } from "../../config/constant";

// Shows "A new version is ready" when the service worker finds an update.
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
      <span>A new version is ready.</span>
      <button type="button" onClick={() => { waiting.postMessage({ type: "SKIP_WAITING" }); }}>
        <RefreshCw size={14} /> Update
      </button>
    </div>
  );
}
