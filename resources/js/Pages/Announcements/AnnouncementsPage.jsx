import React, { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import api, { errorMessage } from "../../config/axiosConfig";
import AppBar from "../../Components/shared/AppBar";
import MobileTabBar from "../../Components/shared/MobileTabBar";
import Footer from "../../Components/shared/Footer";

const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };
const roleName = (r) => (r === "admin" ? "Administrator" : "Coordinator");

/** Trainee page: the announcements their coordinator (or the administrator) sent to them, newest first. */
export default function AnnouncementsPage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { document.title = "Announcements | OCCDL"; }, []);
  useEffect(() => {
    let live = true;
    api.get("/announcements/mine")
      .then(({ data }) => { if (live) setList(data.announcements || []); })
      .catch((e) => { if (live) { setError(errorMessage(e)); setList([]); } });
    return () => { live = false; };
  }, []);

  return (
    <div className="app">
      <AppBar title="Announcements" subtitle="From your coordinator" back="/logbook" />
      <main className="app-main">
        {error && <p role="alert" className="empty">{error}</p>}
        {list === null && <div className="card" aria-busy="true"><p className="card-sub">Loading…</p></div>}
        {list && !error && list.length === 0 && (
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
        <Footer />
      </main>
      <MobileTabBar />
    </div>
  );
}
