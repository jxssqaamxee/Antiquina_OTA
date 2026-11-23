import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute, { GuestRoute, UnverifiedRoute } from "./Components/shared/ProtectedRoute";
import { NotificationProvider } from "./context/NotificationContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { PopupProvider } from "./context/PopupContext";
import Splash from "./Components/shared/Splash";
import OfflineNotice from "./Components/shared/OfflineNotice";
import UpdateNotice from "./Components/shared/UpdateNotice";
import InstallPrompt from "./Components/shared/InstallPrompt";
import { publicRoutes, guestRoutes, unverifiedRoutes, protectedRoutes, adminRoutes, coordinatorRoutes, setupRoutes } from "./routes/index";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <ToastProvider>
          <PopupProvider>
          <OfflineNotice />
          <UpdateNotice />
          <Suspense fallback={<Splash />}>
            <Routes>
              {publicRoutes.map(({ path, component: C }) => <Route key={path} path={path} element={<C />} />)}
              {guestRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<GuestRoute><C /></GuestRoute>} />
              ))}
              {unverifiedRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<UnverifiedRoute><C /></UnverifiedRoute>} />
              ))}
              {protectedRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<ProtectedRoute><C /></ProtectedRoute>} />
              ))}
              {adminRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<ProtectedRoute roles={["admin"]}><C /></ProtectedRoute>} />
              ))}
              {coordinatorRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<ProtectedRoute roles={["coordinator"]}><C /></ProtectedRoute>} />
              ))}
              {setupRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<ProtectedRoute roles={["admin", "coordinator"]}><C /></ProtectedRoute>} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <InstallPrompt />
          </PopupProvider>
          </ToastProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
