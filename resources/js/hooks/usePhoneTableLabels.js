import { useEffect } from "react";

// On phones the data tables are shown as stacked cards (see admin.css), and each cell needs its column name.
// This copies every <th> text onto the matching <td> as `data-label` for tables that were not labelled by the
// <Table> component itself (e.g. the live duty board). childList observer only: setting an attribute never re-triggers it.
export default function usePhoneTableLabels() {
  useEffect(() => {
    const root = document.querySelector(".ds-shell .ds-main");
    if (!root) return undefined;
    const label = () => {
      root.querySelectorAll("table.st-table").forEach((table) => {
        const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
        table.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            if (td.tagName !== "TD" || td.hasAttribute("data-label")) return;
            td.setAttribute("data-label", td.colSpan > 1 ? "" : (heads[i] || ""));
          });
        });
      });
    };
    let frame = 0;
    const schedule = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; label(); }); };
    label();
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
}
