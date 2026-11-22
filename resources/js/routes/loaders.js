// Page chunks, loaded on demand. Kept apart from routes/index.js so the loading page can start
// downloading its destination without importing the route table (which imports the loading page).
export const loaders = {
  login: () => import("../Pages/Auth/LoginPage"),
  register: () => import("../Pages/Auth/RegisterPage"),
  forgot: () => import("../Pages/Auth/ForgotPasswordPage"),
  reset: () => import("../Pages/Auth/ResetPasswordPage"),
  logbook: () => import("../Pages/Logbook/LogbookPage"),
  profile: () => import("../Pages/Profile/ProfilePage"),
  verify: () => import("../Pages/Auth/VerifyEmailPage"),
  staffLogin: () => import("../Pages/Auth/StaffLoginPage"),
  admin: () => import("../Pages/Admin/AdminDashboard"),
  coordinator: () => import("../Pages/Coordinator/CoordinatorDashboard"),
};

/** Starts downloading the page the person is about to be sent to, so no loading flash appears on arrival. */
export function preloadPage(name) {
  return (loaders[name] ? loaders[name]() : Promise.resolve()).catch(() => {});
}
