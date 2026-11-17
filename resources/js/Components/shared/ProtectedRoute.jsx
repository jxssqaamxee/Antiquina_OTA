import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Splash from "./Splash";

/**
 * Signed-in pages. An account whose email is not verified yet is sent to /verify-email
 * (the server keeps the API closed for it too, see EnsureEmailVerified).
 */
export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user?.email_verified === false) return <Navigate to="/verify-email" replace />;
  return children;
}

/** The verify-email screen: signed in but not verified yet. Verified accounts have nothing to do here. */
export function UnverifiedRoute({ children }) {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.email_verified !== false) return <Navigate to="/logbook" replace />;
  return children;
}

/** Login/register pages bounce signed-in users straight on (to the logbook, or to verify their email). */
export function GuestRoute({ children }) {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) return <Splash />;
  if (isAuthenticated) return <Navigate to={user?.email_verified === false ? "/verify-email" : "/logbook"} replace />;
  return children;
}
