import { lazy, createElement } from "react";
import { Navigate } from "react-router-dom";
// The loading page at "/" is NOT lazy: if it were, the screen would show the loading fallback,
// then this page's own loading screen, then the fallback again for the next page: several loading
// screens in a row, which looks like blinking. Now there is a single one.
import SplashPage from "../Pages/Main/SplashPage";

// Pages are code-split: the heavy logbook (and its PDF export) only loads after sign-in.
import { loaders } from "./loaders";
const LoginPage = lazy(loaders.login);
const RegisterPage = lazy(loaders.register);
const ForgotPasswordPage = lazy(loaders.forgot);
const ResetPasswordPage = lazy(loaders.reset);
const LogbookPage = lazy(loaders.logbook);
const ProfilePage = lazy(loaders.profile);
const AnnouncementsPage = lazy(loaders.announcements);
const VerifyEmailPage = lazy(loaders.verify);
const PendingApprovalPage = lazy(loaders.pending);
const AdminLoginPage = lazy(loaders.adminLogin);
const AdminDashboard = lazy(loaders.admin);
const CoordinatorDashboard = lazy(loaders.coordinator);
const SetupAccountPage = lazy(loaders.setup);

export const publicRoutes = [{ path: "/", component: SplashPage }];
export const guestRoutes = [
  { path: "/login", component: LoginPage },
  // One address for both Admins and Coordinators, and the address the staff app installs from (see PwaManifestController::staff).
  { path: "/administrator", component: AdminLoginPage },
  // Old bookmarks / installed shortcuts from before the rename.
  { path: "/admin-login", component: () => createElement(Navigate, { to: "/administrator", replace: true }) },
  { path: "/staff-login", component: () => createElement(Navigate, { to: "/administrator", replace: true }) },
  { path: "/register", component: RegisterPage },
  { path: "/forgot-password", component: ForgotPasswordPage },
  // Staff (Administrator / Coordinator) recovery: its own address so "back to sign in" returns to /administrator.
  { path: "/forgot-password/administrator", component: ForgotPasswordPage },
  { path: "/reset-password/administrator/success", component: ResetPasswordPage },
  { path: "/reset-password/administrator/:token", component: ResetPasswordPage },
  { path: "/reset-password/success", component: ResetPasswordPage },
  { path: "/reset-password/:token", component: ResetPasswordPage },
];
// Signed in but email not verified yet (see UnverifiedRoute).
export const unverifiedRoutes = [
  { path: "/verify-email", component: VerifyEmailPage },
];
// Verified but waiting for a coordinator / admin to approve the registration (see PendingRoute).
export const pendingRoutes = [
  { path: "/pending-approval", component: PendingApprovalPage },
];
export const protectedRoutes = [
  { path: "/logbook/:tab?", component: LogbookPage },
  { path: "/profile", component: ProfilePage },
  { path: "/announcements", component: AnnouncementsPage },
];
// Management areas (desktop layouts). Each is limited to one role; Laravel checks the role too.
export const adminRoutes = [
  { path: "/admin/:tab?", component: AdminDashboard },
];
export const coordinatorRoutes = [
  { path: "/coordinator/:tab?", component: CoordinatorDashboard },
];
// First sign-in of an Admin / Coordinator account created with a password someone else knows.
export const setupRoutes = [
  { path: "/setup-account", component: SetupAccountPage },
];
