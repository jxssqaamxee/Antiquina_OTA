import React, { useEffect, useState } from "react";
import { cachedPhoto, isPrivatePhotoUrl, preloadPhoto } from "../../utils/imageCache";

export function initialsOf(user) {
  if (!user) return "OC";
  const fromParts = ((user.first_name?.[0] || "") + (user.last_name?.[0] || "")).toUpperCase();
  if (fromParts) return fromParts;
  return (user.name || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "OC";
}

/**
 * The picture of a person inside an avatar bubble: their photo, or their initials
 * when there is no photo or the photo fails to load (offline, a deleted file).
 *
 *   <span className="pf-avatar"><AvatarPhoto user={user} /></span>
 *
 * The signed-in owner's photo comes from the image cache (utils/imageCache.js): loaded once,
 * then shown instantly on every screen and offline. The bubble (shape, size, colours) is the
 * parent's CSS; this renders only the <img> or the initials text.
 * `src` can be given directly (e.g. a local preview) instead of `user`.
 */
export default function AvatarPhoto({ user, src }) {
  const url = src !== undefined ? src : user?.picture;
  const priv = isPrivatePhotoUrl(url);
  const [shown, setShown] = useState(() => (priv ? cachedPhoto(url) : url) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!url) { setShown(null); return undefined; }
    if (!priv) { setShown(url); return undefined; }   // local preview (blob:/data:) or any other address
    const hit = cachedPhoto(url);
    if (hit) { setShown(hit); return undefined; }
    setShown(null);
    let live = true;
    preloadPhoto(url).then((result) => {
      if (!live) return;
      if (result) setShown(result); else setFailed(true);
    });
    return () => { live = false; };
  }, [url, priv]);

  if (shown && !failed) {
    return (
      <img
        src={shown}
        alt=""
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <>{initialsOf(user)}</>;
}
