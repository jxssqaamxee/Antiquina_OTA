import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Splash from "../components/Splash";

// Brief branded loading screen while the session is restored; then forwards
// to the logbook (signed in) or login.
export default function SplashPage() {
  const { loading, isAuthenticated } = useAuth();
  useEffect(() => { document.title = "Antiquina OTA | Opol Community College"; }, []);
  if (loading) return <Splash />;
  return <Navigate to={isAuthenticated ? "/logbook" : "/login"} replace />;
}
