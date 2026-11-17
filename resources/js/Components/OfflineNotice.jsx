import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Thin banner while the device has no connection. Logging still works: every
// change is kept on the device and synced when the connection returns.
export default function OfflineNotice() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  if (online) return null;
  return (
    <div className="offline-notice" role="status">
      <WifiOff size={14} /> You're offline — entries are saved on this device and will sync automatically.
    </div>
  );
}
