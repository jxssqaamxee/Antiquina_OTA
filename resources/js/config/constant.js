// App-wide constants. One place for names and storage keys so nothing is
// hard-coded across the app (mirrors sclf_APP's config/constant.js).

export const APP_NAME = "OCC Duty Log";
export const APP_ORG = "Opol Community College";

// Storage keys (localStorage / sessionStorage).
export const KEYS = {
  token: "occ_token",
  tokenExp: "occ_token_exp",
  me: "occ_me",
  config: "occ_config",
  installSnooze: "occ_install_snooze",
  installed: "occ_installed",
};

// Window events.
export const EVENTS = {
  unauthorized: "occ:unauthorized",
  swUpdate: "occ:sw-update",
};

// A "real phone" has a touch screen (coarse primary pointer) and a short screen
// side of at most this many CSS pixels. Phones are ~320–440, foldables ~600,
// tablets start at ~740. Raise it if you want to admit larger foldables.
export const PHONE_MAX_SHORT_SIDE = 600;
