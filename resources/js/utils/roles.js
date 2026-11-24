// Account roles (mirrors App\Models\User on the server). The server enforces every permission;
// these helpers only decide which screen to show.

export const ROLES = { admin: "admin", coordinator: "coordinator", trainee: "trainee" };

/** Accounts from before roles existed (or an old cached profile) have no role: they are trainees. */
export const roleOf = (user) => (Object.values(ROLES).includes(user?.role) ? user.role : ROLES.trainee);
export const isTrainee = (user) => roleOf(user) === ROLES.trainee;
export const hasAdminAccess = (user) => roleOf(user) !== ROLES.trainee;
/** A self-registered trainee waiting for (or refused) approval: only the waiting screen is reachable. */
export const isBlockedByApproval = (user) => user?.approval_status === "pending" || user?.approval_status === "rejected";
export const PENDING_PATH = "/pending-approval";

/** An Admin / Coordinator account still on the password it was created with: it must finish the first-login setup. */
export const needsSetup = (user) => hasAdminAccess(user) && user?.must_change_password === true;
export const SETUP_PATH = "/setup-account";

/** Paths of the management areas. The phone-only gate lets these open on a desktop (see mobileOnly.js). */
export const ADMIN_PATH_PREFIXES = ["/admin", "/coordinator", "/administrator", "/admin-login", "/setup-account"];
export const isAdminPath = (path) => ADMIN_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** Where a signed-in person belongs. */
export function homePath(user) {
  if (!user) return "/login";
  if (user.email_verified === false) return "/verify-email";
  if (isBlockedByApproval(user)) return PENDING_PATH;
  if (needsSetup(user)) return SETUP_PATH;
  switch (roleOf(user)) {
    case ROLES.admin: return "/admin";
    case ROLES.coordinator: return "/coordinator";
    default: return "/logbook";
  }
}

/** Which sign-in page a signed-out visitor of `path` should see. */
export const loginPathFor = (path = "") => (isAdminPath(path) ? "/administrator" : "/login");
