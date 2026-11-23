import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SETUP_PATH, homePath, loginPathFor, needsSetup, roleOf } from "../../utils/roles";
import Splash from "./Splash";

/**
 * Signed-in pages. An account whose email is not verified yet is sent to /verify-email
 * (the server keeps the API closed for it too, see EnsureEmailVerified).
 *
 * `roles` limits the page to those roles (default: trainee, the original logbook app). A signed-in
 * person with another role is sent to their own home. This is only a convenience: Laravel enforces
 * the same rule on every API call (EnsureRole).
 */
export default function ProtectedRoute({ children, roles = ["trainee"] }) {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!isAuthenticated) return <Navigate to={loginPathFor(location.pathname)} replace state={{ from: location.pathname }} />;
  if (user?.email_verified === false) return <Navigate to="/verify-email" replace />;
  if (!roles.includes(roleOf(user))) return <Navigate to={homePath(user)} replace />;
  // First sign-in of an Admin / Coordinator: only the setup page is reachable until it is done.
  if (needsSetup(user) && location.pathname !== SETUP_PATH) return <Navigate to={SETUP_PATH} replace />;
  if (!needsSetup(user) && location.pathname === SETUP_PATH) return <Navigate to={homePath(user)} replace />;
  return children;
}

/** The verify-email screen: signed in but not verified yet. Verified accounts have nothing to do here. */
export function UnverifiedRoute({ children }) {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.email_verified !== false) return <Navigate to={homePath(user)} replace />;
  return children;
}

/** Login/register pages bounce signed-in users straight on (to their home, or to verify their email). */
export function GuestRoute({ children }) {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) return <Splash />;
  if (isAuthenticated) return <Navigate to={homePath(user)} replace />;
  return children;
}
