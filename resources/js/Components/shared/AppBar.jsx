import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EVENTS } from "../../config/constant";
import { ArrowLeft, Megaphone } from "lucide-react";
import { NotificationBell } from "./NotificationCenter";
import { HelpButton } from "./HelpGuide";
import AccountMenu from "./AccountMenu";
import logo from "../../assets/images/site-logo.png";

import Tooltip from "./Tooltip";
// Slim frosted top bar: logo + page name on the left, help / bell / avatar on the right.
export default function AppBar({ title, subtitle, back }) {
  const [scrolled, setScrolled] = useState(false);
  const onAnnouncements = useLocation().pathname.startsWith("/announcements");
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
          <Tooltip label={"Back"}><Link to={back} className="icon-btn appbar-back" aria-label="Back"><ArrowLeft size={20} /></Link></Tooltip>
        ) : (
          <Tooltip label={"Refresh"}><Link
            to="/"
            className="appbar-brand"
            aria-label="OCCDL: refresh"
            onClick={() => window.dispatchEvent(new CustomEvent(EVENTS.flush))} // save any edit still waiting
          >
            <img src={logo} alt="" />
          </Link></Tooltip>
        )}
        <div className="appbar-title">
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <div className="appbar-actions" style={{ flex: "none" }}>
          {!onAnnouncements && <Tooltip label={"Announcements"}><Link to="/announcements" className="icon-btn" aria-label="Announcements"><Megaphone size={19} /></Link></Tooltip>}
          <HelpButton />
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
