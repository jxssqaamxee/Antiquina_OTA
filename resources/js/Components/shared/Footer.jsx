import React from "react";
import DeveloperCredit from "./DeveloperCredit";

// Small credit footer shown at the bottom of the app's pages.
// The developer's name opens the same hover popover (desktop) / bottom sheet
// (phone and installed app) as sclf_APP: photo, bio, Facebook and the GCash QR.
export default function Footer() {
  return (
    <footer className="app-footer">
      <span className="app-footer__tag" aria-hidden="true">{"</>"}</span>
      <span className="app-footer__text">
        Developed by{" "}
        <DeveloperCredit showTag={false} />
      </span>
    </footer>
  );
}
