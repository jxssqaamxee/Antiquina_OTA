import React, { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import logo from "../assets/images/site-logo.png";
import { canNativePrompt, isInAppBrowser, isInstalled, isIos, isSnoozed, promptInstall, snooze, subscribe } from "../utils/pwaInstall";

export default function InstallPrompt() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  useEffect(() => { const t = setTimeout(() => setReady(true), 3000); return () => clearTimeout(t); }, []);

  if (!ready || isInstalled() || isSnoozed()) return null;
  const native = canNativePrompt();
  const ios = isIos() && !isInAppBrowser();
  if (!native && !ios) return null;

  const notNow = () => { setIosHelp(false); snooze(); };

  return (
    <div className="ip-wrap" role="region" aria-label="Install the app">
      <div className="ip-card">
        <img className="ip-logo" src={logo} alt="" width="44" height="44" />
        <div className="ip-text">
          <b>Install Antiquina OTA</b>
          <small>
            {iosHelp
              ? <>Tap <Share size={13} className="ip-inline" /> <b>Share</b>, then <b>Add to Home Screen</b>.</>
              : "Open your logbook from the home screen, even offline."}
          </small>
        </div>
        <button type="button" className="ip-x" onClick={notNow} aria-label="Not now"><X size={16} /></button>
        <div className="ip-actions">
          <button type="button" className="ip-later" onClick={notNow}>Not now</button>
          {iosHelp
            ? <button type="button" className="ip-go" onClick={notNow}>Got it</button>
            : <button type="button" className="ip-go" onClick={() => (native ? promptInstall() : setIosHelp(true))}><Download size={16} /> Install</button>}
        </div>
      </div>
    </div>
  );
}
