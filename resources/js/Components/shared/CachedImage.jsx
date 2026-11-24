import React, { useEffect, useState } from "react";
import { cachedPhoto, isPrivatePhotoUrl, preloadPhoto } from "../../utils/imageCache";

/**
 * <img> for a PRIVATE photo (e.g. a registration photo an Admin / Coordinator reviews).
 * Same behaviour as the trainee's avatar: it paints at once from the image cache when the photo was
 * preloaded, loads it once otherwise, and shows `fallback` if there is no usable photo or the device
 * is offline and never saw it. Any other address (a local preview, a static file) is shown as given.
 */
export default function CachedImage({ src, alt = "", fallback = null, ...rest }) {
  const priv = isPrivatePhotoUrl(src);
  const [shown, setShown] = useState(() => (priv ? cachedPhoto(src) : src) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src) { setShown(null); return undefined; }
    if (!priv) { setShown(src); return undefined; }
    const hit = cachedPhoto(src);
    if (hit) { setShown(hit); return undefined; }
    setShown(null);
    let live = true;
    preloadPhoto(src).then((result) => {
      if (!live) return;
      if (result) setShown(result); else setFailed(true);
    });
    return () => { live = false; };
  }, [src, priv]);

  if (shown && !failed) {
    return <img src={shown} alt={alt} decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} {...rest} />;
  }
  return fallback;
}
