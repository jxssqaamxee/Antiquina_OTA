import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useAppTheme } from "../hooks/useAppTheme";
import "../Components/shared/Popup.css";

// A small promise popup for the few things that must be READ once:
//   await popup({ title, message, okLabel, type })
//   popup.once("occ_storage_warned", { ... })   // shown once per browser tab session
//   popup.once("milestone-100", { ... }, "local") // shown once ever on this device
// Popups queue, so two requests never stack on top of each other.

const PopupContext = createContext(null);
const ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2, error: XCircle };

function flagStore(scope) {
  try { return scope === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function PopupProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const queue = useRef([]);
  const okRef = useRef(null);
  const { theme } = useAppTheme();

  const openRef = useRef(false); // true while a popup is on screen (state updaters must stay pure)

  const next = useCallback(() => {
    const item = queue.current.shift() || null;
    openRef.current = !!item;
    setCurrent(item);
  }, []);

  const popup = useCallback((opts) => new Promise((resolve) => {
    const item = { type: "info", okLabel: "Got it", ...opts, resolve };
    if (openRef.current) { queue.current.push(item); return; }
    openRef.current = true;
    setCurrent(item);
  }), []);

  const once = useCallback((key, opts, scope = "session") => {
    const store = flagStore(scope);
    try { if (store?.getItem(key)) return Promise.resolve(false); } catch { /* storage blocked */ }
    try { store?.setItem(key, "1"); } catch { /* storage blocked */ }
    return popup(opts);
  }, [popup]);

  const close = useCallback(() => {
    current?.resolve?.(true);
    next();
  }, [current, next]);

  useEffect(() => {
    if (!current) return undefined;
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, close]);

  const api = useMemo(() => {
    const fn = (o) => popup(o);
    fn.once = once;
    return fn;
  }, [popup, once]);

  const Icon = current ? (ICONS[current.type] || Info) : null;

  return (
    <PopupContext.Provider value={api}>
      {children}
      {current && createPortal(
        <div className="occ-popup-backdrop" data-occ-theme={theme} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="occ-popup-card" role="alertdialog" aria-modal="true" aria-labelledby="occ-popup-title" aria-describedby="occ-popup-msg">
            <span className={`occ-popup-icon occ-popup-icon-${current.type}`}><Icon size={22} /></span>
            <h3 className="occ-popup-title" id="occ-popup-title">{current.title}</h3>
            {current.message && <p className="occ-popup-message" id="occ-popup-msg">{current.message}</p>}
            <button type="button" ref={okRef} className="occ-popup-btn" onClick={close}>{current.okLabel}</button>
          </div>
        </div>,
        document.body
      )}
    </PopupContext.Provider>
  );
}

export const usePopup = () => {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error("usePopup must be used within a PopupProvider");
  return ctx;
};
