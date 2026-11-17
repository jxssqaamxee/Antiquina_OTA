import { lazy } from "react";
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
const VerifyEmailPage = lazy(loaders.verify);

export const publicRoutes = [{ path: "/", component: SplashPage }];
export const guestRoutes = [
  { path: "/login", component: LoginPage },
  { path: "/register", component: RegisterPage },
  { path: "/forgot-password", component: ForgotPasswordPage },
  { path: "/reset-password/success", component: ResetPasswordPage },
  { path: "/reset-password/:token", component: ResetPasswordPage },
];
// Signed in but email not verified yet (see UnverifiedRoute).
export const unverifiedRoutes = [
  { path: "/verify-email", component: VerifyEmailPage },
];
export const protectedRoutes = [
  { path: "/logbook", component: LogbookPage },
  { path: "/profile", component: ProfilePage },
];
