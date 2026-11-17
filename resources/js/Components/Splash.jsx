import React from "react";
import logo from "../assets/images/site-logo.png";

export default function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading">
      <div className="splash-logo"><img src={logo} alt="" /></div>
      <div className="splash-title">Antiquina OTA</div>
      <div className="splash-sub">Opol Community College</div>
      <div className="splash-bar"><i /></div>
    </div>
  );
}
