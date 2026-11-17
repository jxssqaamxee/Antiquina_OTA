import React, { useEffect, useState } from "react";

export function initialsOf(user) {
  if (!user) return "OC";
  const fromParts = ((user.first_name?.[0] || "") + (user.last_name?.[0] || "")).toUpperCase();
  if (fromParts) return fromParts;
  return (user.name || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "OC";
}

/**
 * The picture of a person inside an avatar bubble: their photo, or their initials
 * when there is no photo or the photo fails to load (offline, an expired link in
 * the cached profile, a deleted file).
 *
 *   <span className="pf-avatar"><AvatarPhoto user={user} /></span>
 *
 * The bubble (shape, size, colours) is the parent's CSS; this renders only the
 * <img> or the initials text, so it fits .avatar-btn, .pf-avatar and the wizard.
 * `src` can be given directly (e.g. a local preview) instead of `user`.
 */
export default function AvatarPhoto({ user, src }) {
  const url = src !== undefined ? src : user?.picture;
  const [failed, setFailed] = useState(false);

  // A new photo (upload / remove) gets a fresh chance to load.
  useEffect(() => { setFailed(false); }, [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"   // Google avatar URLs reject some referrers
        onError={() => setFailed(true)}
      />
    );
  }
  return <>{initialsOf(user)}</>;
}
