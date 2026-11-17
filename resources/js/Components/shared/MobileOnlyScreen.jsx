import React, { useState } from "react";
import { Smartphone, Copy, Check } from "lucide-react";
import logo from "../../assets/images/site-logo.png";
import { APP_NAME, APP_ORG } from "../../config/constant";

// MobileOnlyScreen — the ONLY thing shown on a desktop, laptop or tablet while
// OCC_MOBILE_ONLY=true. main.jsx renders it INSTEAD of the app, so no router,
// login check, API call, service worker or install prompt runs underneath it.
// It therefore must not use any context.

const CSS = `
  .occ-block{box-sizing:border-box;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:14px;padding:28px;text-align:center;
    font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background:#f4f7fb;color:#0b1220}
  .occ-block img{width:72px;height:72px;border-radius:20px;object-fit:contain;background:#fff;padding:8px;box-shadow:0 10px 24px -12px rgba(2,6,23,.4)}
  .occ-block h1{margin:0;font-size:24px;font-weight:700}
  .occ-block p{margin:0;max-width:420px;font-size:15px;line-height:1.6;opacity:.78}
  .occ-block ol{margin:2px 0 0;padding:0;list-style-position:inside;max-width:420px;font-size:14px;line-height:1.8;opacity:.85;text-align:left}
  .occ-block .occ-ico{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#4338ca,#4f46e5 50%,#6366f1);color:#fff}
  .occ-block .occ-url{max-width:90vw;word-break:break-all;font:500 13px ui-monospace,SFMono-Regular,Menlo,monospace;
    padding:10px 14px;border-radius:16px;background:#fff;border:1.5px solid #c3ccdb}
  .occ-block button{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border:0;border-radius:12px;
    font-weight:750;font-size:14px;color:#fff;background:linear-gradient(135deg,#4338ca,#4f46e5 50%,#6366f1);cursor:pointer;min-height:48px}
  .occ-block small{opacity:.6;font-size:12px}
  @media (prefers-color-scheme: dark){
    .occ-block{background:#0a0c12;color:#e7ecf3}
    .occ-block .occ-ico{background:#e7ecf3;color:#0a0c12}
    .occ-block .occ-url{background:#12161f;border-color:#323b4a}
  }
`;

export default function MobileOnlyScreen() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const t = document.createElement("textarea");
      t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="occ-block" role="alert" data-mobile-only-screen>
      <style>{CSS}</style>
      <img src={logo} alt="" />
      <span className="occ-ico" aria-hidden="true"><Smartphone size={28} /></span>
      <h1>{APP_NAME} is for phones</h1>
      <p>This app is built for mobile phones and is not available on desktop, laptop or tablet screens.</p>
      <ol>
        <li>Open this link in your phone’s browser (Chrome or Safari).</li>
        <li>Sign in, then add it to your Home screen to install the app.</li>
      </ol>
      <div className="occ-url">{url}</div>
      <button type="button" onClick={copy}>
        {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}
      </button>
      <small>{APP_ORG}</small>
    </div>
  );
}
