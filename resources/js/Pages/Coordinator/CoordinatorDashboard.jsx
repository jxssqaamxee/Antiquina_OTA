import React, { lazy, Suspense, useEffect, useState } from "react";
import { Radio, LayoutDashboard, Users, ClipboardCheck, FileBarChart, Megaphone, ShieldCheck, Upload, UserCheck, Bell } from "lucide-react";
import AdminShell, { StatCard } from "../../Components/admin/AdminShell";
import { Btn, Card, Check, Chip, Field, Input, Notice, RefreshButton, Row, Select, Table, statusTone, useAction } from "../../Components/admin/ui";
import { OverviewDashboard, OverviewSkeleton } from "../../Components/admin/Dashboard";
import { LiveDutyPanel } from "../../Components/admin/LiveDuty";
const WeekTimetable = lazy(() => import("../../Components/shared/WeekTimetable"));
import NotificationsPanel from "../../Components/admin/NotificationsPanel";
import RegistrationsPanel from "../../Components/admin/RegistrationsPanel";
import { ApprovalsPanel, PendingEntries, times } from "../../Components/admin/ApprovalsPanel";
const AnnouncementsPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.AnnouncementsPanel })));
const AuditPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.AuditPanel })));
const ReportsPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.ReportsPanel })));
const RosterPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.RosterPanel })));
import { coordinatorService as svc } from "../../services/coordinatorService";
import useLoad from "../../hooks/useLoad";
import usePersistedTab from "../../hooks/usePersistedTab";
import usePersistedState from "../../hooks/usePersistedState";

const LIVE = 30000; // how often an open screen quietly refetches (paused while the tab is hidden)
const refreshBtn = (reload, m) => <RefreshButton onRefresh={reload} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />;
const Stale = ({ m }) => (m.stale ? <p className="st-stale" role="status">Couldn’t refresh just now. Showing the last data we loaded.</p> : null);

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];

function Placement({ trainee }) {
  const [ests, reloadEsts] = useLoad(() => svc.establishments());
  const { busy, msg, run } = useAction();
  const [f, setF] = usePersistedState(`coord.placement.${trainee.id}`, { establishment_id: "", days: [1, 2, 3, 4, 5], time_in: "08:00", time_out: "17:00", supervisor_name: "" });
  const [n, setN] = usePersistedState("coord.establishment", { name: "", type: "public", address: "" });
  const toggle = (d) => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() });
  const addEst = async () => { const r = await run(() => svc.createEstablishment(n), "Establishment added."); if (r) { setN({ name: "", type: "public", address: "" }); reloadEsts(); } };
  const place = () => run(() => svc.place(trainee.id, { ...f, establishment_id: Number(f.establishment_id), supervisor_name: f.supervisor_name || null }), "Placement saved. The trainee's schedule is now managed here.");
  return (
    <Card title="Placement & schedule">
      <Notice msg={msg} />
      <h3 className="st-h3 st-h3-first">Host establishment & schedule</h3>
      <Row>
        <Field label="Establishment" className="st-field-wide"><Select value={f.establishment_id} onChange={(e) => setF({ ...f, establishment_id: e.target.value })}>
          <option value="">Choose…</option>{(ests?.establishments || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select></Field>
        <Field label="Supervisor (optional)"><Input value={f.supervisor_name} onChange={(e) => setF({ ...f, supervisor_name: e.target.value })} /></Field>
        <Field label="Time in" className="st-field-sm"><Input type="time" value={f.time_in} onChange={(e) => setF({ ...f, time_in: e.target.value })} /></Field>
        <Field label="Time out" className="st-field-sm"><Input type="time" value={f.time_out} onChange={(e) => setF({ ...f, time_out: e.target.value })} /></Field>
      </Row>
      <div className="st-field st-days-field"><span>Duty days</span>
        <div className="st-days">{DAYS.map(([d, l]) => <Check key={d} checked={f.days.includes(d)} onChange={() => toggle(d)}>{l}</Check>)}</div>
      </div>
      <div className="st-form-actions">
        <Btn kind="primary" disabled={busy || !f.establishment_id || !f.days.length} onClick={place}>Save placement</Btn>
      </div>
      <hr className="st-hr" />
      <h3 className="st-h3 st-h3-first">Can’t find the establishment? Add it</h3>
      <Row>
        <Field label="Name" className="st-field-wide"><Input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
        <Field label="Type" className="st-field-sm"><Select value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="public">Public</option><option value="private">Private</option><option value="custom">Custom</option></Select></Field>
        <Field label="Address (optional)"><Input value={n.address} onChange={(e) => setN({ ...n, address: e.target.value })} /></Field>
        <Btn disabled={busy || n.name.trim().length < 2} onClick={addEst}>Add establishment</Btn>
      </Row>
    </Card>
  );
}

function TraineeDetail({ trainee, onClose }) {
  const [data, reload, error, m] = useLoad(() => svc.traineeEntries(trainee.id), { interval: 30000, deps: [trainee.id] });
  const h = data?.hours;
  const waiting = data?.entries?.filter((e) => e.status === "submitted") || [];
  return (
    <>
      <Card title={`${trainee.name} · ${trainee.student_id}`} actions={<>{refreshBtn(reload, m)}<Btn onClick={onClose}>Back to list</Btn></>}>
        {error && !data && <p role="alert" className="st-error">{error}</p>}<Stale m={m} />
        {h && (
          <div className="st-stat-grid">
            <StatCard label="Required" value={h.required} /><StatCard label="Verified" value={h.verified} />
            <StatCard label="Pending review" value={h.pending} /><StatCard label="Draft / rejected" value={h.draft} />
          </div>
        )}
        {waiting.length > 0 && <PendingEntries entries={waiting} svc={svc} name={trainee.name} onChanged={reload} />}
      </Card>
      <Card title="Weekly duty timetable">
        <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><WeekTimetable fetcher={(w) => svc.timetable(trainee.id, w)} resetKey={trainee.id} interval={60000} /></Suspense>
      </Card>
      <Card title="All entries">
        <Table empty="No duty entries yet." rows={data?.entries} cols={[
          { h: "Date", render: (e) => e.date }, { h: "Times", render: times }, { h: "Hours", render: (e) => e.hours },
          { h: "Status", render: (e) => <><Chip tone={statusTone(e.status)}>{e.status}</Chip>{e.legacy && <> <Chip>legacy</Chip></>}</> },
          { h: "Verified", render: (e) => e.verified_hours ?? "—" }, { h: "Note", render: (e) => e.review_reason || "" },
        ]} />
      </Card>
      <Placement trainee={trainee} />
    </>
  );
}

function Trainees() {
  const [data, reload, error, m] = useLoad(() => svc.trainees(), { interval: 45000 });
  const [open, setOpen] = useState(null);
  if (open) return <TraineeDetail trainee={open} onClose={() => setOpen(null)} />;
  return (
    <Card title="My trainees" actions={refreshBtn(reload, m)}>
      {error && !data && <p role="alert" className="st-error">{error}</p>}<Stale m={m} />
      <Table empty="No trainees in your section yet." rows={data?.trainees && [...data.trainees].sort((a, b) => (b.pending > 0) - (a.pending > 0))} cols={[
        { h: "Student ID", render: (t) => t.student_id }, { h: "Name", render: (t) => t.name }, { h: "Email", render: (t) => t.email },
        { h: "Pending", render: (t) => t.pending ? <Chip tone="warn">{t.pending} to review</Chip> : "—" },
        { h: "", render: (t) => <Btn onClick={() => setOpen(t)}>Open</Btn> },
      ]} />
    </Card>
  );
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "live", label: "Live duty", icon: Radio },
  { key: "trainees", label: "Trainees", icon: Users },
  { key: "registrations", label: "Registrations", short: "Sign-ups", icon: UserCheck },
  { key: "roster", label: "Import roster", icon: Upload },
  { key: "approvals", label: "Logbook approvals", short: "Approvals", icon: ClipboardCheck },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "activity", label: "Audit log", icon: ShieldCheck },
];

/** Coordinator area: dashboard, trainees (with entries + placement), approvals, activity. Scope is enforced by Laravel. */
export default function CoordinatorDashboard() {
  const [tab, setTabRaw] = usePersistedTab("coordinator", NAV.map((n) => n.key), "dashboard");
  const [hl, setHl] = useState(null); // notice the bell sent us to (highlighted on the Notifications page)
  const setTab = (key, state) => { setHl(state?.highlight || null); setTabRaw(key); };
  const [data, reloadOverview, error, om] = useLoad(() => svc.overview(), { interval: LIVE });
  useEffect(() => { document.title = "Coordinator | OCCDL"; }, []);
  return (
    <AdminShell roleLabel="Coordinator" nav={NAV} phoneTabs={["dashboard","live","trainees","approvals"]} active={tab} onNavigate={setTab}
      title={tab === "dashboard" ? (data?.section ? `Section ${data.section.code}` : "Coordinator dashboard") : NAV.find((n) => n.key === tab)?.label}
      subtitle={tab === "dashboard" ? data?.message : (data?.section ? `Section ${data.section.code}` : undefined)}
      actions={tab === "dashboard" ? <div className="st-header-tools">{refreshBtn(reloadOverview, om)}</div> : undefined}>
      {error && !data && <p role="alert" className="st-error">{error}</p>}
      {data?.section && data.section.is_current_year === false && (
        <p className="st-notice is-bad" role="status">Your section {data.section.code} belongs to an earlier school year ({data.section.academic_year}). When the administrator gives you a section of the new year, this screen starts fresh. Until then you can keep reviewing the students you still have.</p>
      )}
      {tab === "dashboard" && <Stale m={om} />}
      {tab === "dashboard" && (data ? <OverviewDashboard data={data} scope="coordinator" go={setTab} liveFetcher={svc.live} /> : !error && <OverviewSkeleton />)}
      {tab === "live" && <LiveDutyPanel fetcher={svc.live} />}
      {tab === "trainees" && <Trainees />}
      {tab === "registrations" && <RegistrationsPanel svc={svc} />}
      {tab === "roster" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><RosterPanel svc={svc} scope="coord" /></Suspense>}
      {tab === "approvals" && <ApprovalsPanel svc={svc} />}
      {tab === "reports" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><ReportsPanel svc={svc} scope="coord" /></Suspense>}
      {tab === "announcements" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><AnnouncementsPanel svc={svc} fixedSection={data?.section || null} scope="coord" /></Suspense>}
      {tab === "notifications" && <NotificationsPanel tabs={NAV.map((n) => n.key)} go={setTab} highlight={hl} />}
      {tab === "activity" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><AuditPanel svc={svc} title="Audit log (my section)" /></Suspense>}
    </AdminShell>
  );
}
