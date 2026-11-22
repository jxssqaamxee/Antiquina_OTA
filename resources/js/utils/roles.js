// Account roles (mirrors App\Models\User on the server). The server enforces every permission;
// these helpers only decide which screen to show.

export const ROLES = { admin: "admin", coordinator: "coordinator", trainee: "trainee" };

/** Accounts from before roles existed (or an old cached profile) have no role: they are trainees. */
export const roleOf = (user) => (Object.values(ROLES).includes(user?.role) ? user.role : ROLES.trainee);
export const isTrainee = (user) => roleOf(user) === ROLES.trainee;
export const isStaff = (user) => roleOf(user) !== ROLES.trainee;

/** Paths of the management areas. The phone-only gate lets these open on a desktop (see mobileOnly.js). */
export const STAFF_PATH_PREFIXES = ["/admin", "/coordinator", "/staff-login"];
export const isStaffPath = (path) => STAFF_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** Where a signed-in person belongs. */
export function homePath(user) {
  if (!user) return "/login";
  if (user.email_verified === false) return "/verify-email";
  switch (roleOf(user)) {
    case ROLES.admin: return "/admin";
    case ROLES.coordinator: return "/coordinator";
    default: return "/logbook";
  }
}

/** Which sign-in page a signed-out visitor of `path` should see. */
export const loginPathFor = (path = "") => (isStaffPath(path) ? "/staff-login" : "/login");
