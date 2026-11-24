import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import Tooltip from "./Tooltip";
// Bottom sheet — dialogs slide up from the bottom edge like a native app
// (sclf_APP's sheets). On wide screens it becomes a centred card.
export default function Sheet({ open, onClose, title, children, footer, dismissible = true, footerClass = "", hideClose = false, labelId = "sheet-title" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && dismissible) onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose?.(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <span className="sheet-grab" aria-hidden="true" />
        {title && (
          <div className="sheet-head">
            <h2 id={labelId}>{title}</h2>
            {dismissible && !hideClose && (
              <Tooltip label={"Close"}><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></Tooltip>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className={`sheet-foot ${footerClass}`.trim()}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// "Are you sure?" sheet used for deletes.
export function ConfirmSheet({ open, title, message, yes, no = "No, keep it", onYes, onNo }) {
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onNo?.(); }}>
      <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <span className="sheet-grab" aria-hidden="true" />
        <div className="confirm">
          <h3 id="confirm-title">{title}</h3>
          <p>{message}</p>
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={onNo}>{no}</button>
            <button type="button" className="btn btn-danger" onClick={onYes}>{yes}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
