import { useEffect, useState } from "react";

// "Real phone" detection (same rule as sclf_APP): a touch screen AND a phone-sized screen, not just a narrow window.
//   1. Portrait phones:  width <= 600px
//   2. Landscape phones: height <= 500px
// A desktop browser dragged narrow keeps a mouse as its pointer, so it is NOT a phone and keeps the desktop layout.
export const PHONE_QUERY =
  "(pointer: coarse) and (max-width: 600px), " +
  "(pointer: coarse) and (orientation: landscape) and (max-height: 500px)";

/** Generic media-query hook. */
export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(query);
    const on = (e) => setMatch(e.matches);
    setMatch(mq.matches);
    if (mq.addEventListener) { mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }
    mq.addListener(on); // Safari < 14
    return () => mq.removeListener(on);
  }, [query]);
  return match;
}

export default function useIsPhone() { return useMediaQuery(PHONE_QUERY); }
