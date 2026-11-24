import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useAppTheme } from "../hooks/useAppTheme";
import "../Components/shared/Popup.css";

// The app's own popup. It replaces the browser's native alert / confirm / prompt
// (the ones that say "<site> says"), so every dialog matches the OCC themes.
//
//   await popup({ title, message, okLabel, type })            // read-once notice -> true
//   await popup.confirm({ title, message, okLabel, danger })  // -> true | false
//   await popup.prompt({ title, message, required, minLength }) // -> string | null (null = cancelled)
//   popup.once("occ_storage_warned", { ... })                 // shown once per browser tab session
//   popup.once("milestone-100", { ... }, "local")             // shown once ever on this device
//
// Popups queue, so two requests never stack on top of each other.

const PopupContext = createContext(null);
const ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2, error: XCircle };

function flagStore(scope) {
  try { return scope === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function PopupProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const queue = useRef([]);
  const okRef = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const { theme } = useAppTheme();

  const openRef = useRef(false); // true while a popup is on screen (state updaters must stay pure)

  const show = useCallback((item) => {
    openRef.current = !!item;
    setText(item?.defaultValue || "");
    setTouched(false);
    setCurrent(item);
  }, []);

  const next = useCallback(() => show(queue.current.shift() || null), [show]);

  const popup = useCallback((opts) => new Promise((resolve) => {
    const kind = opts?.kind || "alert";
    const item = {
      kind,
      type: kind === "alert" ? "info" : "warning",
      okLabel: kind === "alert" ? "Got it" : "Confirm",
      cancelLabel: "Cancel",
      ...opts,
      resolve,
    };
    if (openRef.current) { queue.current.push(item); return; }
    show(item);
  }), [show]);

  const once = useCallback((key, opts, scope = "session") => {
    const store = flagStore(scope);
    try { if (store?.getItem(key)) return Promise.resolve(false); } catch { /* storage blocked */ }
    try { store?.setItem(key, "1"); } catch { /* storage blocked */ }
    return popup(opts);
  }, [popup]);

  const isPrompt = current?.kind === "prompt";
  const isConfirm = current?.kind === "confirm";
  const minLength = current?.minLength || (current?.required ? 1 : 0);
  const trimmed = text.trim();
  const promptError = isPrompt && minLength && trimmed.length < minLength
    ? (current.minLength > 1 ? `Please enter at least ${current.minLength} characters.` : "This can't be empty.")
    : "";

  // Resolve with the right "yes" or "no" value for this kind of popup.
  const accept = useCallback(() => {
    if (!current) return;
    if (isPrompt) {
      if (promptError) { setTouched(true); inputRef.current?.focus(); return; }
      current.resolve?.(trimmed);
    } else {
      current.resolve?.(true);
    }
    next();
  }, [current, isPrompt, promptError, trimmed, next]);

  const cancel = useCallback(() => {
    if (!current) return;
    // alert: closing is simply "read it". confirm: false. prompt: null.
    current.resolve?.(isPrompt ? null : current.kind === "alert");
    next();
  }, [current, isPrompt, next]);

  useEffect(() => {
    if (!current) return undefined;
    // A destructive confirm starts on Cancel so a stray Enter can't delete anything.
    const first = isPrompt ? inputRef.current : (isConfirm && current.danger ? cancelRef.current : okRef.current);
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); return; }
      if (e.key !== "Enter") return;
      const tag = e.target?.tagName;
      if (tag === "BUTTON") return; // let the focused button do its own thing
      if (tag === "TEXTAREA" && e.shiftKey) return; // newline
      e.preventDefault();
      accept();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, isPrompt, isConfirm, accept, cancel]);

  const api = useMemo(() => {
    const fn = (o) => popup(o);
    fn.once = once;
    fn.confirm = (o) => popup({ ...o, kind: "confirm" });
    fn.prompt = (o) => popup({ ...o, kind: "prompt" });
    return fn;
  }, [popup, once]);

  const Icon = current ? (ICONS[current.type] || Info) : null;
  const twoButtons = isConfirm || isPrompt;
  const iconType = current?.danger ? "error" : current?.type;

  return (
    <PopupContext.Provider value={api}>
      {children}
      {current && createPortal(
        <div className="occ-popup-backdrop" data-occ-theme={theme} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
          <div className={`occ-popup-card occ-popup-card-${iconType}`} role={twoButtons ? "dialog" : "alertdialog"} aria-modal="true" aria-labelledby="occ-popup-title" aria-describedby="occ-popup-msg">
            <span className={`occ-popup-icon occ-popup-icon-${iconType}`}><Icon size={22} /></span>
            <h3 className="occ-popup-title" id="occ-popup-title">{current.title}</h3>
            {current.message && <p className="occ-popup-message" id="occ-popup-msg">{current.message}</p>}

            {isPrompt && (
              <div className="occ-popup-field">
                <textarea
                  ref={inputRef}
                  className={`occ-popup-input${touched && promptError ? " is-invalid" : ""}`}
                  rows={3}
                  maxLength={current.maxLength || 500}
                  placeholder={current.placeholder || ""}
                  value={text}
                  aria-label={current.title}
                  aria-invalid={touched && !!promptError}
                  onChange={(e) => setText(e.target.value)}
                />
                {touched && promptError && <p className="occ-popup-error" role="alert">{promptError}</p>}
              </div>
            )}

            <div className={`occ-popup-actions${twoButtons ? " is-two" : ""}`}>
              {twoButtons && (
                <button type="button" ref={cancelRef} className="occ-popup-btn occ-popup-btn-ghost" onClick={cancel}>{current.cancelLabel}</button>
              )}
              <button type="button" ref={okRef} className={`occ-popup-btn${current.danger ? " occ-popup-btn-danger" : ""}`} onClick={accept}>{current.okLabel}</button>
            </div>
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
