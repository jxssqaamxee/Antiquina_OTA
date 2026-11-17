import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute, { GuestRoute } from "./components/ProtectedRoute";
import { NotificationProvider } from "./context/NotificationContext";
import { AuthProvider } from "./context/AuthContext";
import Splash from "./components/Splash";
import OfflineNotice from "./components/OfflineNotice";
import UpdateNotice from "./components/UpdateNotice";
import InstallPrompt from "./components/InstallPrompt";
import { publicRoutes, guestRoutes, protectedRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <OfflineNotice />
          <UpdateNotice />
          <Suspense fallback={<Splash />}>
            <Routes>
              {publicRoutes.map(({ path, component: C }) => <Route key={path} path={path} element={<C />} />)}
              {guestRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<GuestRoute><C /></GuestRoute>} />
              ))}
              {protectedRoutes.map(({ path, component: C }) => (
                <Route key={path} path={path} element={<ProtectedRoute><C /></ProtectedRoute>} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <InstallPrompt />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
