import React, { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw } from "lucide-react";
import Sheet from "./Sheet";
import { PHOTO_ACCEPT, PHOTO_MAX_MB, photoProblem } from "../../utils/photoFile";
import "./PhotoUploadModal.css";

/**
 * Plain profile-photo picker (no photo checks):
 *   choose a photo  ->  preview in the avatar shape  ->  "Use this photo".
 *
 * `onAccept(file)` may be async (e.g. the Profile page uploads right away); the
 * button shows a spinner until it settles and the sheet closes when it succeeds.
 * Throw / reject from onAccept to keep the sheet open (the caller shows the error).
 */
export default function PhotoUploadModal({ open, onClose, onAccept, title = "Profile photo", acceptLabel = "Use this photo" }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open) { setFile(null); setError(""); setBusy(false); }
  }, [open]);

  // Object URL for the preview; always released.
  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = ""; // choosing the same file again must still fire onChange
    if (!picked) return;
    const problem = photoProblem(picked);
    if (problem) { setFile(null); setError(problem); return; }
    setError("");
    setFile(picked);
  };

  async function accept() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      await onAccept(file);
      onClose?.();
    } catch (err) {
      setError(err?.message || "The photo could not be saved. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={title}
      labelId="photo-sheet-title"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={accept} disabled={!file || busy}>
            {busy ? "Saving…" : acceptLabel}
          </button>
        </>
      )}
    >
      <div className="pum">
        <div className={`pum-frame${preview ? " has-photo" : ""}`}>
          {preview ? <img src={preview} alt="Preview of your new photo" /> : <Camera size={34} strokeWidth={1.6} aria-hidden="true" />}
        </div>

        <p className="pum-tip">
          {preview
            ? "This is how your photo will look. Happy with it?"
            : <>Choose a clear photo of your face. JPG, PNG or WebP, up to {PHOTO_MAX_MB} MB.</>}
        </p>

        {error && <p className="pum-error" role="alert">{error}</p>}

        <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} className="pum-input" onChange={choose} tabIndex={-1} aria-hidden="true" />
        <button type="button" className="btn btn-block pum-pick" onClick={() => inputRef.current?.click()} disabled={busy}>
          {file ? <><RotateCcw size={17} /> Choose a different photo</> : <><ImagePlus size={17} /> Choose a photo</>}
        </button>
      </div>
    </Sheet>
  );
}
