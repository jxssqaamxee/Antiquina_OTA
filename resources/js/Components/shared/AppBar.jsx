import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { NotificationBell } from "./NotificationCenter";
import { HelpButton } from "./HelpGuide";
import AvatarPhoto from "./AvatarPhoto";
import logo from "../../assets/images/site-logo.png";

// Slim frosted top bar: logo + page name on the left, help / bell / avatar on the right.
export default function AppBar({ title, subtitle, back }) {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`appbar${scrolled ? " is-scrolled" : ""}`}>
      <div className="appbar-in">
        {back ? (
          <Link to={back} className="icon-btn appbar-back" aria-label="Back"><ArrowLeft size={20} /></Link>
        ) : (
          <Link to="/logbook" className="appbar-brand" aria-label="OCC Duty Log">
            <img src={logo} alt="" />
          </Link>
        )}
        <div className="appbar-title" style={{ flex: 1, minWidth: 0 }}>
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <div className="appbar-actions">
          <HelpButton />
          <NotificationBell />
          <Link to="/profile" className="avatar-btn" aria-label="Open your profile">
            <AvatarPhoto user={user} />
          </Link>
        </div>
      </div>
    </header>
  );
}
