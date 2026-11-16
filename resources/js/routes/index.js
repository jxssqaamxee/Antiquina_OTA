import { lazy } from "react";

// Pages are code-split: the heavy logbook (and its PDF export) only loads after sign-in.
const SplashPage = lazy(() => import("../Pages/Main/SplashPage"));
const LoginPage = lazy(() => import("../Pages/Auth/LoginPage"));
const RegisterPage = lazy(() => import("../Pages/Auth/RegisterPage"));
const LogbookPage = lazy(() => import("../Pages/Logbook/LogbookPage"));
const ProfilePage = lazy(() => import("../Pages/Profile/ProfilePage"));

export const publicRoutes = [{ path: "/", component: SplashPage }];
export const guestRoutes = [
  { path: "/login", component: LoginPage },
  { path: "/register", component: RegisterPage },
];
export const protectedRoutes = [
  { path: "/logbook", component: LogbookPage },
  { path: "/profile", component: ProfilePage },
];
