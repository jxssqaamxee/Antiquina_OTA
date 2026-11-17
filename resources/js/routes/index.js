import { lazy } from "react";

// Pages are code-split: the heavy logbook (and its PDF export) only loads after sign-in.
const SplashPage = lazy(() => import("../Pages/Main/SplashPage"));
const LoginPage = lazy(() => import("../Pages/Auth/LoginPage"));
const RegisterPage = lazy(() => import("../Pages/Auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("../Pages/Auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("../Pages/Auth/ResetPasswordPage"));
const LogbookPage = lazy(() => import("../Pages/Logbook/LogbookPage"));
const ProfilePage = lazy(() => import("../Pages/Profile/ProfilePage"));
const VerifyEmailPage = lazy(() => import("../Pages/Auth/VerifyEmailPage"));

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
