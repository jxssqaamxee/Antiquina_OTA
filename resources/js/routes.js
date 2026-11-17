import { lazy } from "react";

// Pages are code-split: the heavy logbook (and its PDF export) only loads after sign-in.
const SplashPage = lazy(() => import("./pages/SplashPage"));
const LoginPage = lazy(() => import("./pages/Auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/Auth/RegisterPage"));
const LogbookPage = lazy(() => import("./pages/Logbook/LogbookPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

export const publicRoutes = [{ path: "/", component: SplashPage }];
export const guestRoutes = [
  { path: "/login", component: LoginPage },
  { path: "/register", component: RegisterPage },
];
export const protectedRoutes = [
  { path: "/logbook", component: LogbookPage },
  { path: "/profile", component: ProfilePage },
];
