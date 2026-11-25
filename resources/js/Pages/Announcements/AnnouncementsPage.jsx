import React, { useEffect } from "react";
import { Megaphone, RefreshCw } from "lucide-react";
import api from "../../config/axiosConfig";
import useLoad from "../../hooks/useLoad";
import { useNotifications } from "../../context/NotificationContext";
import AppBar from "../../Components/shared/AppBar";
import MobileTabBar from "../../Components/shared/MobileTabBar";
import Footer from "../../Components/shared/Footer";

const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };
const roleName = (r) => (r === "admin" ? "Administrator" : "Coordinator");

/** Trainee page: the announcements their coordinator (or the administrator) sent to them, newest first. Always live. */
export default function AnnouncementsPage() {
  const { markAnnouncementsRead } = useNotifications();
  // Live: loads now, every 20 s while the tab is open, when the app comes back to the front and when the signal returns.
  const [list, reload, error, meta] = useLoad(
    () => api.get("/announcements/mine").then(({ data }) => data.announcements || []),
    { interval: 20000 }
  );

  useEffect(() => { document.title = "Announcements | OCCDL"; }, []);

  // The person is looking at the list, so the matching bell notices are read.
  useEffect(() => { if (list) markAnnouncementsRead(); }, [list, markAnnouncementsRead]);

  // A new announcement notice arrived (sync.js pulled it): show it at once instead of waiting for the next tick.
  useEffect(() => {
    const on = (e) => { if (e.detail?.key === "notifications-v1") reload(); };
    window.addEventListener("occ-sync-applied", on);
    return () => window.removeEventListener("occ-sync-applied", on);
  }, [reload]);

  return (
    <div className="app">
      <AppBar title="Announcements" subtitle="From your coordinator" back="/logbook" />
      <main className="app-main">
        {error && list === null && (
          <div className="empty" role="alert">
            <b>Couldn't load announcements</b>
            {error}
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={reload}><RefreshCw size={16} /> Try again</button>
            </div>
          </div>
        )}
        {error && list !== null && <p role="status" className="card-sub" style={{ marginBottom: 8 }}>Can't refresh right now. Showing the last list.</p>}
        {list === null && !error && <div className="card" aria-busy="true"><p className="card-sub">Loading…</p></div>}
        {list && list.length === 0 && (
          <div className="empty"><b>No announcements yet</b>When your coordinator posts one, it will show up here.</div>
        )}
        {list && list.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {list.map((a) => (
              <article key={a.id} className="card">
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span className="badge" style={{ padding: 8, borderRadius: 12 }} aria-hidden="true"><Megaphone size={16} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 className="card-title" style={{ overflowWrap: "anywhere" }}>{a.title}</h2>
                    <p className="card-sub">{roleName(a.from_role)} {a.from}{a.section ? ` · Section ${a.section}` : ""} · {when(a.created_at)}</p>
                  </div>
                </div>
                <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{a.body}</p>
              </article>
            ))}
          </div>
        )}
        {meta.updatedAt && !error && <p className="card-sub" style={{ textAlign: "center", marginTop: 12, opacity: 0.7 }}>Live · updates automatically</p>}
        <Footer />
      </main>
      <MobileTabBar />
    </div>
  );
}
