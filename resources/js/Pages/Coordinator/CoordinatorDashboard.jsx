import React, { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Users, ClipboardCheck, FileBarChart, Megaphone, ShieldCheck } from "lucide-react";
import AdminShell, { StatCard } from "../../Components/admin/AdminShell";
import { Btn, Card, Check, Chip, Field, Input, Notice, Row, Select, Table, statusTone, useAction } from "../../Components/admin/ui";
import { AnnouncementsPanel, AuditPanel, ReportsPanel } from "../../Components/admin/panels";
import { coordinatorService as svc } from "../../services/coordinatorService";
import { errorMessage } from "../../config/axiosConfig";

function useLoad(fn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => fn().then((d) => { setData(d); setError(""); }).catch((e) => setError(errorMessage(e))), []); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  return [data, load, error];
}

/** Approve (optionally with verified hours) or reject (reason required) one submitted entry. */
function ReviewButtons({ entry, onDone, run, busy }) {
  const [hrs, setHrs] = useState("");
  const approve = async () => { if (await run(() => svc.approve(entry.id, hrs), "Entry approved.")) onDone(); };
  const reject = async () => {
    const reason = window.prompt("Reason for rejecting (the trainee will see this):");
    if (reason && reason.trim().length >= 3 && await run(() => svc.reject(entry.id, reason.trim()), "Entry rejected.")) onDone();
  };
  return (
    <Row>
      <Input type="number" step="0.25" min="0" max="24" placeholder={`hrs (${entry.hours})`} value={hrs} onChange={(e) => setHrs(e.target.value)} style={{ width: 100 }} />
      <Btn kind="primary" disabled={busy} onClick={approve}>Approve</Btn>
      <Btn kind="danger" disabled={busy} onClick={reject}>Reject</Btn>
    </Row>
  );
}

const times = (e) => [["am", e.am_in, e.am_out], ["pm", e.pm_in, e.pm_out], ["ev", e.ev_in, e.ev_out]].filter(([, i, o]) => i && o).map(([, i, o]) => `${i}–${o}`).join(", ");

function Approvals() {
  const [data, reload, error] = useLoad(svc.approvals);
  const { busy, msg, run } = useAction();
  return (
    <Card title={`Waiting for review (${data?.entries?.length ?? "…"})`}>
      <Notice msg={msg} />{error && <p role="alert" className="st-error">{error}</p>}
      <Table empty="No entries are waiting for review." rows={data?.entries} cols={[
        { h: "Trainee", render: (e) => e.trainee_id }, { h: "Date", render: (e) => e.date }, { h: "Times", render: times },
        { h: "Hours", render: (e) => e.hours }, { h: "Task", render: (e) => e.task || "—" },
        { h: "Decision", render: (e) => <ReviewButtons entry={e} onDone={reload} run={run} busy={busy} /> },
      ]} />
    </Card>
  );
}

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];

function Placement({ trainee }) {
  const [ests, reloadEsts] = useLoad(svc.establishments);
  const { busy, msg, run } = useAction();
  const [f, setF] = useState({ establishment_id: "", days: [1, 2, 3, 4, 5], time_in: "08:00", time_out: "17:00", supervisor_name: "" });
  const [n, setN] = useState({ name: "", type: "public", address: "" });
  const toggle = (d) => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() });
  const addEst = async () => { const r = await run(() => svc.createEstablishment(n), "Establishment added."); if (r) { setN({ name: "", type: "public", address: "" }); reloadEsts(); } };
  const place = () => run(() => svc.place(trainee.id, { ...f, establishment_id: Number(f.establishment_id), supervisor_name: f.supervisor_name || null }), "Placement saved. The trainee's schedule is now managed here.");
  return (
    <Card title="Placement & schedule">
      <Notice msg={msg} />
      <Row>
        <Field label="New establishment"><Input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
        <Field label="Type"><Select value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="public">Public</option><option value="private">Private</option><option value="custom">Custom</option></Select></Field>
        <Btn disabled={busy || n.name.trim().length < 2} onClick={addEst}>Add</Btn>
      </Row>
      <hr className="st-hr" />
      <Row>
        <Field label="Establishment"><Select value={f.establishment_id} onChange={(e) => setF({ ...f, establishment_id: e.target.value })}>
          <option value="">Choose…</option>{(ests?.establishments || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select></Field>
        <Field label="Time in"><Input type="time" value={f.time_in} onChange={(e) => setF({ ...f, time_in: e.target.value })} /></Field>
        <Field label="Time out"><Input type="time" value={f.time_out} onChange={(e) => setF({ ...f, time_out: e.target.value })} /></Field>
        <Field label="Supervisor"><Input value={f.supervisor_name} onChange={(e) => setF({ ...f, supervisor_name: e.target.value })} /></Field>
      </Row>
      <Row>
        {DAYS.map(([d, l]) => <Check key={d} checked={f.days.includes(d)} onChange={() => toggle(d)}>{l}</Check>)}
        <Btn kind="primary" disabled={busy || !f.establishment_id || !f.days.length} onClick={place} style={{ marginTop: 6 }}>Save placement</Btn>
      </Row>
    </Card>
  );
}

function TraineeDetail({ trainee, onClose }) {
  const [data, reload, error] = useLoad(() => svc.traineeEntries(trainee.id));
  const { busy, msg, run } = useAction();
  const h = data?.hours;
  return (
    <>
      <Card title={`${trainee.name} · ${trainee.student_id}`} actions={<Btn onClick={onClose}>Back to list</Btn>}>
        <Notice msg={msg} />{error && <p role="alert" className="st-error">{error}</p>}
        {h && (
          <div className="st-flex st-mb">
            <StatCard label="Required" value={h.required} /><StatCard label="Verified" value={h.verified} />
            <StatCard label="Pending review" value={h.pending} /><StatCard label="Draft / rejected" value={h.draft} />
          </div>
        )}
        <Table empty="No duty entries yet." rows={data?.entries} cols={[
          { h: "Date", render: (e) => e.date }, { h: "Times", render: times }, { h: "Hours", render: (e) => e.hours },
          { h: "Status", render: (e) => <><Chip tone={statusTone(e.status)}>{e.status}</Chip>{e.legacy && <> <Chip>legacy</Chip></>}</> },
          { h: "Verified", render: (e) => e.verified_hours ?? "—" }, { h: "Note", render: (e) => e.review_reason || "" },
          { h: "", render: (e) => e.status === "submitted" ? <ReviewButtons entry={e} onDone={reload} run={run} busy={busy} /> : null },
        ]} />
      </Card>
      <Placement trainee={trainee} />
    </>
  );
}

function Trainees() {
  const [data, , error] = useLoad(svc.trainees);
  const [open, setOpen] = useState(null);
  if (open) return <TraineeDetail trainee={open} onClose={() => setOpen(null)} />;
  return (
    <Card title="My trainees">
      {error && <p role="alert" className="st-error">{error}</p>}
      <Table empty="No trainees in your section yet." rows={data?.trainees} cols={[
        { h: "Student ID", render: (t) => t.student_id }, { h: "Name", render: (t) => t.name }, { h: "Email", render: (t) => t.email },
        { h: "", render: (t) => <Btn onClick={() => setOpen(t)}>Open</Btn> },
      ]} />
    </Card>
  );
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "trainees", label: "Trainees", icon: Users },
  { key: "approvals", label: "Logbook approvals", icon: ClipboardCheck },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "activity", label: "Audit log", icon: ShieldCheck },
];

/** Coordinator area: dashboard, trainees (with entries + placement), approvals, activity. Scope is enforced by Laravel. */
export default function CoordinatorDashboard() {
  const [tab, setTab] = useState("dashboard");
  const [data, , error] = useLoad(svc.overview);
  useEffect(() => { document.title = "Coordinator | OCCDL"; }, []);
  return (
    <AdminShell roleLabel="Coordinator" nav={NAV} active={tab} onNavigate={setTab}
      title={tab === "dashboard" ? (data?.section ? `Section ${data.section.code}` : "Coordinator dashboard") : NAV.find((n) => n.key === tab)?.label}
      subtitle={tab === "dashboard" ? data?.message : (data?.section ? `Section ${data.section.code}` : undefined)}>
      {error && <p role="alert" className="st-error">{error}</p>}
      {tab === "dashboard" && <div className="st-flex"><StatCard label="Assigned trainees" value={data?.trainees} /></div>}
      {tab === "trainees" && <Trainees />}
      {tab === "approvals" && <Approvals />}
      {tab === "reports" && <ReportsPanel svc={svc} />}
      {tab === "announcements" && <AnnouncementsPanel svc={svc} fixedSection={data?.section || null} />}
      {tab === "activity" && <AuditPanel svc={svc} title="Audit log (my section)" />}
    </AdminShell>
  );
}
