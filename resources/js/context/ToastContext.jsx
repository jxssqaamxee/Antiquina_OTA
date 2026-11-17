import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X, RotateCcw } from "lucide-react";
import { toastBus } from "../utils/eventBus";
import { useAppTheme } from "../hooks/useAppTheme";
import "../Components/shared/Toast.css";

// Toasts are for RESULTS ("Entry added"). Hints belong inline next to the
// field, and one-off explanations belong in a popup (see PopupContext).
// This is the sclf_APP toast plus the anti-spam rules OCC needs:
//   - `key`:  a toast whose key is already visible is replaced, not stacked
//   - at most MAX_VISIBLE toasts; the oldest is dropped
//   - the same message+type within DEDUPE_MS is ignored
//   - every timer is tracked and cleared

const ToastContext = createContext(null);

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const DEFAULT_DURATION = { success: 4000, info: 4500, warning: 6000, error: 7000 };
const MAX_VISIBLE = 3;
const DEDUPE_MS = 60000;

export const UNDO_SECONDS = 15;

let uid = 0;

// Live countdown for an undo toast, computed from the start time so it stays
// right even if the tab was in the background.
function UndoRing({ startedAt, seconds }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  const left = Math.max(0, Math.ceil((startedAt + seconds * 1000 - now) / 1000));
  return (
    <span className="occ-undo-ring" style={{ "--undo-s": `${seconds}s` }} aria-hidden="true">
      <svg viewBox="0 0 36 36" width="38" height="38">
        <circle className="occ-undo-ring-track" cx="18" cy="18" r="15.5" />
        <circle className="occ-undo-ring-fill" cx="18" cy="18" r="15.5" pathLength="100" />
      </svg>
      <span className="occ-undo-ring-num">{left}</span>
    </span>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const listRef = useRef([]);          // source of truth; state mirrors it
  const timers = useRef({});           // id -> timeout handle
  const recent = useRef(new Map());    // "type|message" -> last shown (ms)
  const { theme, isDark } = useAppTheme();

  const commit = useCallback(() => setToasts([...listRef.current]), []);

  const clearTimer = useCallback((id) => {
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const dismiss = useCallback((id) => {
    clearTimer(id);
    listRef.current = listRef.current.filter((t) => t.id !== id);
    commit();
  }, [clearTimer, commit]);

  const show = useCallback((toast) => {
    const type = toast.type && ICONS[toast.type] ? toast.type : "info";
    const message = toast.message || "";
    const now = Date.now();

    const undo = toast.undo
      ? { ...toast.undo, seconds: toast.undo.seconds || UNDO_SECONDS, startedAt: now }
      : null;

    // Ignore the same message+type shown in the last minute (double taps,
    // remounts, duplicate network errors). Undo toasts are always shown.
    if (!undo && !toast.key) {
      const sig = `${type}|${message}`;
      const last = recent.current.get(sig);
      if (last && now - last < DEDUPE_MS) return null;
      recent.current.set(sig, now);
      if (recent.current.size > 50) {
        for (const [k, t] of recent.current) if (now - t >= DEDUPE_MS) recent.current.delete(k);
      }
    }

    // Same key already on screen -> replace it instead of stacking.
    if (toast.key) {
      const existing = listRef.current.find((t) => t.key === toast.key);
      if (existing) {
        clearTimer(existing.id);
        listRef.current = listRef.current.filter((t) => t.id !== existing.id);
      }
    }

    const id = toast.id || `toast-${++uid}`;
    const duration = toast.duration ?? DEFAULT_DURATION[type];
    listRef.current = [
      ...listRef.current,
      { id, key: toast.key, type, title: toast.title, message, undo },
    ];

    // Keep only the newest MAX_VISIBLE; the oldest is dropped (an undo toast
    // that is dropped counts as "kept", so its action still completes).
    while (listRef.current.length > MAX_VISIBLE) {
      const [oldest, ...rest] = listRef.current;
      clearTimer(oldest.id);
      listRef.current = rest;
      oldest.undo?.onExpire?.();
    }
    commit();

    if (undo) {
      timers.current[id] = setTimeout(() => {
        dismiss(id);
        undo.onExpire?.();
      }, undo.seconds * 1000);
    } else if (duration && duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [clearTimer, commit, dismiss]);

  useEffect(() => toastBus.subscribe(show), [show]);

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
  }, []);

  // "Undo" press: the caller may answer false to keep the toast running.
  const runUndo = useCallback(async (t) => {
    const result = await t.undo.onUndo?.();
    if (result === false) return;
    // Undo done -> the action will NOT finish, so skip onExpire.
    dismiss(t.id);
  }, [dismiss]);

  // Closing an undo toast with the X means "keep it" -> finish now.
  const closeUndo = useCallback((t) => {
    dismiss(t.id);
    t.undo.onExpire?.();
  }, [dismiss]);

  const api = {
    show,
    undo: ({ seconds = UNDO_SECONDS, onUndo, onExpire, undoLabel = "Undo", type = "success", ...rest }) =>
      show({ type, ...rest, undo: { seconds, onUndo, onExpire, undoLabel } }),
    success: (message, opts) => show({ type: "success", message, ...opts }),
    error: (message, opts) => show({ type: "error", message, ...opts }),
    warning: (message, opts) => show({ type: "warning", message, ...opts }),
    info: (message, opts) => show({ type: "info", message, ...opts }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={`occ-toast-viewport ${isDark ? "dark" : "light"}`} data-occ-theme={theme} role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          if (t.undo) {
            return (
              <div key={t.id} className={`occ-toast occ-toast-undo occ-toast-${t.type}`} role="status" aria-live="polite" style={{ "--undo-s": `${t.undo.seconds}s` }}>
                <UndoRing startedAt={t.undo.startedAt} seconds={t.undo.seconds} />
                <div className="occ-toast-body">
                  {t.title && <div className="occ-toast-title">{t.title}</div>}
                  <div className="occ-toast-message">{t.message}</div>
                </div>
                <button type="button" className="occ-undo-btn" onClick={() => runUndo(t)}>
                  <RotateCcw size={14} /> {t.undo.undoLabel}
                </button>
                <button type="button" className="occ-toast-close" onClick={() => closeUndo(t)} aria-label="Dismiss and keep">
                  <X size={14} />
                </button>
                <span className="occ-undo-bar" aria-hidden="true" />
              </div>
            );
          }
          return (
            <div key={t.id} className={`occ-toast occ-toast-${t.type}`} role="alert">
              <span className="occ-toast-icon"><Icon size={18} strokeWidth={2.25} /></span>
              <div className="occ-toast-body">
                {t.title && <div className="occ-toast-title">{t.title}</div>}
                <div className="occ-toast-message">{t.message}</div>
              </div>
              <button type="button" className="occ-toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Degrades to the event bus if a component is rendered outside the provider.
    return {
      show: (t) => toastBus.emit(t),
      undo: ({ onExpire, ...t }) => { toastBus.emit({ type: "success", ...t }); onExpire?.(); },
      success: (message, opts) => toastBus.emit({ type: "success", message, ...opts }),
      error: (message, opts) => toastBus.emit({ type: "error", message, ...opts }),
      warning: (message, opts) => toastBus.emit({ type: "warning", message, ...opts }),
      info: (message, opts) => toastBus.emit({ type: "info", message, ...opts }),
      dismiss: () => {},
    };
  }
  return ctx;
};
