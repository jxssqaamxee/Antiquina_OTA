import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

const GAP = 8;
const EDGE = 8;
const NO_HOVER = "(hover: none), (pointer: coarse)";

/**
 * Hover / keyboard-focus label for icon-only controls (same look and behaviour as sclf_APP's Tooltip).
 *
 *   <Tooltip label="Collapse sidebar"><button aria-label="Collapse sidebar">…</button></Tooltip>
 *
 * - Adds NO wrapper element: the hover/focus handlers go straight onto the child, so flex/grid
 *   layouts and CSS like `.parent > button` are unchanged. The child must be a single DOM element
 *   or a component that passes onMouseEnter/onMouseLeave/onFocus/onBlur/onClick/onKeyDown through
 *   (a plain element, <Link> and <NavLink> all do).
 * - Renders through a portal into <body>, measured and clamped inside the viewport, flips to the
 *   opposite side when there is no room, so a sidebar's overflow:hidden never clips it.
 * - Touch / no-hover devices: switched off (a tap-opened tooltip never closes by itself).
 * - Colours follow <html data-theme> (the nine themes), see Tooltip.css.
 * - Closes on scroll, resize, click and Escape. The tooltip text is also set as aria-describedby
 *   while it is open; keep the control's own aria-label, the tooltip does not replace it.
 * - A disabled <button> never fires mouse events in the browser, so it shows no tooltip.
 */
export default function Tooltip({ label, children, side = "bottom", delay = 350, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, placement } once measured
  const [noHover, setNoHover] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(NO_HOVER).matches : false);
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const timer = useRef(null);
  const id = useId();

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(NO_HOVER);
    const on = () => setNoHover(mql.matches);
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  const schedule = useCallback((el) => {
    triggerRef.current = el;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, [delay]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Measure the real tooltip size, then place it (flip if it does not fit, clamp to the viewport).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let placement = side;
    if (placement === "bottom" && r.bottom + GAP + t.height > vh - EDGE && r.top - GAP - t.height >= EDGE) placement = "top";
    else if (placement === "top" && r.top - GAP - t.height < EDGE && r.bottom + GAP + t.height <= vh - EDGE) placement = "bottom";
    else if (placement === "right" && r.right + GAP + t.width > vw - EDGE && r.left - GAP - t.width >= EDGE) placement = "left";
    else if (placement === "left" && r.left - GAP - t.width < EDGE && r.right + GAP + t.width <= vw - EDGE) placement = "right";

    let top; let left;
    if (placement === "left" || placement === "right") {
      top = r.top + r.height / 2 - t.height / 2;
      left = placement === "right" ? r.right + GAP : r.left - GAP - t.width;
    } else {
      left = r.left + r.width / 2 - t.width / 2;
      top = placement === "bottom" ? r.bottom + GAP : r.top - GAP - t.height;
    }
    left = Math.max(EDGE, Math.min(left, vw - EDGE - t.width));
    top = Math.max(EDGE, Math.min(top, vh - EDGE - t.height));
    setPos({ top, left, placement });
  }, [open, label, side]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") hide(); };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, hide]);

  // Nothing to show, or a touch device: render the control exactly as it is.
  if (!label || disabled || noHover || !React.isValidElement(children)) return children;

  const p = children.props;
  const call = (fn, e) => { if (typeof fn === "function") fn(e); };
  return (
    <>
      {React.cloneElement(children, {
        "aria-describedby": open ? id : p["aria-describedby"],
        onMouseEnter: (e) => { call(p.onMouseEnter, e); schedule(e.currentTarget); },
        onMouseLeave: (e) => { call(p.onMouseLeave, e); hide(); },
        onFocus: (e) => { call(p.onFocus, e); schedule(e.currentTarget); },
        onBlur: (e) => { call(p.onBlur, e); hide(); },
        onClick: (e) => { call(p.onClick, e); hide(); },
      })}
      {open && typeof document !== "undefined" && createPortal(
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          className={`occ-tooltip${pos ? ` occ-tooltip-${pos.placement}` : ""}`}
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}
