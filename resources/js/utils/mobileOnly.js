// mobileOnly.js — the phone-only switch.
//
//   OCC_MOBILE_ONLY=true   -> the app opens ONLY on a real phone
//   OCC_MOBILE_ONLY=false  -> the app opens on every device
//
// The value is read on the server (.env) and written on
// <html data-mobile-only="..."> before the app starts (resources/views/app.blade.php),
// so changing it needs `php artisan config:clear`, not a rebuild. Anything
// unrecognised means "off": a typo can never lock everybody out.
//
// "Real phone" is deliberately NOT a width breakpoint. A desktop or laptop
// browser dragged narrow (or any responsive-mode window) keeps a mouse as its
// primary pointer, so it is still treated as a computer and blocked. A phone has
// a touch screen (primary pointer: coarse) AND a small physical screen
// (screen.width/height do not change when a window is resized or the keyboard
// opens). Tablets are bigger than PHONE_MAX_SHORT_SIDE and are blocked too.
//
// Handy while developing (npm run dev only): add ?mobile_only=false (or true)
// to any page URL.
//
// Note: this is a screen gate, not a security boundary. Browser DevTools
// "device mode" pretends to be a phone and is let through (useful for testing).

import { PHONE_MAX_SHORT_SIDE } from "../config/constant";
import { isAdminPath } from "./roles";

const ON = ["true", "1", "on", "yes"];

export const normalizeFlag = (value) => ON.includes(String(value ?? "").trim().toLowerCase());

export function isMobileOnlyEnabled() {
  if (typeof document === "undefined") return false;
  if (import.meta.env?.DEV) {
    const q = new URLSearchParams(window.location.search).get("mobile_only");
    if (q !== null) return normalizeFlag(q);
  }
  return normalizeFlag(document.documentElement.getAttribute("data-mobile-only"));
}

function hasTouchScreen() {
  if (typeof window.matchMedia === "function") return window.matchMedia("(pointer: coarse)").matches;
  // Very old WebViews without matchMedia: fall back to the user agent.
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent || "");
}

function shortSide() {
  const s = window.screen || {};
  const w = Number(s.width) || window.innerWidth || 0;
  const h = Number(s.height) || window.innerHeight || 0;
  return Math.min(w, h);
}

export function isPhoneDevice() {
  if (typeof window === "undefined") return false;
  return hasTouchScreen() && shortSide() > 0 && shortSide() <= PHONE_MAX_SHORT_SIDE;
}

/**
 * True when the switch is on AND this device is not a phone, EXCEPT on the management pages
 * (/admin, /coordinator, /administrator): Admins and Coordinators work on a desktop. The gate runs
 * before anyone signs in, so it can only look at the address, not at the person's role.
 * (It is a screen gate, not security: the API checks the role on every request.)
 */
export function shouldBlockDevice() {
  if (typeof window !== "undefined" && isAdminPath(window.location.pathname)) return false;
  return isMobileOnlyEnabled() && !isPhoneDevice();
}
