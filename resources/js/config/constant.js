// App-wide constants. One place for names and storage keys so nothing is
// hard-coded across the app (mirrors sclf_APP's config/constant.js).

export const APP_NAME = "OCCDL";
export const APP_ORG = "Opol Community College";

// Storage keys (localStorage / sessionStorage).
export const KEYS = {
  me: "occ_me",
  config: "occ_config",
  installSnooze: "occ_install_snooze",
  installed: "occ_installed",
};

// Sign-in tokens from older versions of the app. The sign-in is now an HttpOnly cookie that
// JavaScript cannot read, so these are only ever DELETED (see purgeLegacyTokens).
export const LEGACY_TOKEN_KEYS = ["occ_token", "occ_token_exp", "ota_token", "ota_token_exp"];

// Window events.
export const EVENTS = {
  unauthorized: "occ:unauthorized",
  swUpdate: "occ:sw-update",
  // Sent before sign-out: screens write any edit still waiting in their debounce timer.
  flush: "occ:flush",
};

// A "real phone" has a touch screen (coarse primary pointer) and a short screen
// side of at most this many CSS pixels. Phones are ~320–440, foldables ~600,
// tablets start at ~740. Raise it if you want to admit larger foldables.
export const PHONE_MAX_SHORT_SIDE = 600;
