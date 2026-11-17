// Plain-upload rules for a profile photo. These only mirror what the server
// enforces (JPG / PNG / WebP, up to 5 MB) so a bad file is refused instantly
// instead of after a slow upload. There are NO image-content checks (blur,
// face, background...) on purpose: any normal photo is accepted.

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_MAX_MB = 5;
export const PHOTO_MAX_BYTES = PHOTO_MAX_MB * 1024 * 1024;

/** A readable problem with the chosen file, or null when it is fine to upload. */
export function photoProblem(file) {
  if (!file) return "Please choose a photo.";
  const okType = PHOTO_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name || "");
  if (!okType) return "Use a JPG, PNG or WebP photo.";
  if (file.size > PHOTO_MAX_BYTES) return `The photo must be smaller than ${PHOTO_MAX_MB} MB.`;
  if (file.size === 0) return "That file is empty. Please choose another photo.";
  return null;
}
