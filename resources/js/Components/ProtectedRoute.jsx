import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Splash from "./Splash";

export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Login/register pages bounce signed-in users straight to the logbook. */
export function GuestRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();
  if (loading) return <Splash />;
  if (isAuthenticated) return <Navigate to="/logbook" replace />;
  return children;
}
