import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Radio, LayoutDashboard, UserCog, Layers, ClipboardList, Users as UsersIcon, TrendingUp, Target, FileBarChart, Megaphone, ShieldCheck, UserCheck } from "lucide-react";
import AdminShell, { StatCard } from "../../Components/admin/AdminShell";
import { Btn, Card, Chip, Field, Input, Notice, RefreshButton, Row, Select, Table, statusTone, useAction } from "../../Components/admin/ui";
import { OverviewDashboard, OverviewSkeleton } from "../../Components/admin/Dashboard";
import { LiveDutyPanel } from "../../Components/admin/LiveDuty";
import RegistrationsPanel from "../../Components/admin/RegistrationsPanel";
const UserDetails = lazy(() => import("../../Components/admin/UserDetails"));
const AnnouncementsPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.AnnouncementsPanel })));
const AuditPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.AuditPanel })));
const ReportsPanel = lazy(() => import("../../Components/admin/panels").then((m) => ({ default: m.ReportsPanel })));
import { adminService as svc } from "../../services/adminService";
import useLoad from "../../hooks/useLoad";
import usePersistedTab from "../../hooks/usePersistedTab";
import usePersistedState from "../../hooks/usePersistedState";
import { filterNameInput } from "../../utils/validators";
import { usePopup } from "../../context/PopupContext";
import { yearLabel } from "../../utils/academicYear";

const LIVE = 30000; // how often an open screen quietly refetches (paused while the tab is hidden)
const refreshBtn = (reload, m) => <RefreshButton onRefresh={reload} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />;
const Stale = ({ m }) => (m.stale ? <p className="st-stale" role="status">Couldn’t refresh just now. Showing the last data we loaded.</p> : null);

/** Every account's details (name, email): only the Administrator can change them. Profile Settings is read-only. */
function Users() {
  const [q, setQ] = usePersistedState("admin.users.q", "");
  const [role, setRole] = usePersistedState("admin.users.role", "");
  const [dq, setDq] = useState(q);
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]); // wait for the typing to pause
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null); // full details of the account the Admin opened with "View"
  const topRef = useRef(null);
  const { busy, msg, run } = useAction();
  const [data, load, error, m] = useLoad(() => svc.users({ q: dq || undefined, role: role || undefined }), { interval: 45000, deps: [dq, role] });
  const rows = data ? data.users : null;
  const set = (k) => (e) => setEdit({ ...edit, [k]: k === "email" ? e.target.value : filterNameInput(e.target.value) });
  const save = async () => {
    const r = await run(() => svc.updateUser(edit.id, { first_name: edit.first_name, middle_name: edit.middle_name || null, last_name: edit.last_name, email: edit.email }), "User updated.");
    if (r) { setEdit(null); load(); }
  };
  const open = async (u) => {
    const r = await run(() => svc.user(u.id));
    if (r) { setEdit(null); setView(r.user); }
  };
  const editFromView = (u) => { setView(null); setEdit({ ...u }); };
  // bring the details / edit card into view (the list can be long)
  useEffect(() => { if (view || edit) topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [view, edit]);
  const roleName = (r) => (r === "admin" ? "Administrator" : r === "coordinator" ? "Coordinator" : "Trainee");
  return (
    <>
      <Notice msg={msg} />
      <div ref={topRef} />
      {view && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><UserDetails svc={svc} user={view} onClose={() => setView(null)} onEdit={editFromView} /></Suspense>}
      {edit && (
        <Card title={`Edit ${edit.login_id || "user"}`} actions={<Btn onClick={() => setEdit(null)} disabled={busy}>Cancel</Btn>}>
          <Row>
            <Field label="First name"><Input value={edit.first_name || ""} maxLength={80} onChange={set("first_name")} /></Field>
            <Field label="Middle name"><Input value={edit.middle_name || ""} maxLength={80} onChange={set("middle_name")} /></Field>
            <Field label="Last name"><Input value={edit.last_name || ""} maxLength={80} onChange={set("last_name")} /></Field>
            <Field label="Email"><Input type="email" value={edit.email || ""} onChange={set("email")} /></Field>
            <Btn kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</Btn>
          </Row>
          <p className="st-muted st-note">The Student ID / Administrator ID and the role can’t be changed here.</p>
        </Card>
      )}
      <Card title="Users" actions={refreshBtn(load, m)}>
        {error && !data && <p role="alert" className="st-error">{error}</p>}<Stale m={m} />
        <Row>
          <Field label="Search"><Input type="search" value={q} placeholder="Name, ID or email" onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Everyone</option><option value="trainee">Trainees</option><option value="coordinator">Coordinators</option><option value="admin">Administrators</option>
            </Select>
          </Field>
        </Row>
        {data?.truncated && <p className="st-muted st-note" role="status">Showing the first 50 matches. Type a name, ID or email to narrow the list.</p>}
        <Table searchable={false} empty="No users match." rows={rows} cols={[
          { h: "ID", render: (u) => u.login_id || "—" },
          { h: "Name", render: (u) => u.name },
          { h: "Role", render: (u) => <Chip>{roleName(u.role)}</Chip> },
          { h: "Email", render: (u) => u.email },
          { h: "", render: (u) => (
            <div className="st-act">
              <Btn disabled={busy} onClick={() => open(u)}>View</Btn>
              <Btn onClick={() => { setView(null); setEdit({ ...u }); }}>Edit</Btn>
            </div>
          ) },
        ]} />
      </Card>
    </>
  );
}

function Coordinators({ sections, year, goTo }) {
  const [data, reload, , m] = useLoad(() => svc.coordinators(), { interval: 45000 });
  const { busy, msg, run } = useAction();
  const [f, setF] = usePersistedState("admin.coordinator", { admin_id: "", first_name: "", last_name: "", email: "", password: "" }, { omit: ["password"] });
  const [pick, setPick] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = async () => {
    const r = await run(() => svc.createCoordinator(f), "Coordinator created.");
    if (r) { setF({ admin_id: "", first_name: "", last_name: "", email: "", password: "" }); reload(); }
  };
  const assign = async (c) => { if (pick[c.id]) { await run(() => svc.assignCoordinator(c.id, pick[c.id]), "Section assigned."); reload(); } };
  const unassign = async (c) => { await run(() => svc.unassignCoordinator(c.id), "Assignment ended."); reload(); };

  return (
    <>
      <Notice msg={msg} />
      <Card title="New Coordinator">
        <Row>
          <Field label="Coordinator ID"><Input value={f.admin_id} onChange={set("admin_id")} /></Field>
          <Field label="First name"><Input value={f.first_name} onChange={set("first_name")} /></Field>
          <Field label="Last name"><Input value={f.last_name} onChange={set("last_name")} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Temporary password"><Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
          <Btn kind="primary" disabled={busy} onClick={create}>Create</Btn>
        </Row>
      </Card>
      <Card title="Coordinators" actions={refreshBtn(reload, m)}>
        <Stale m={m} />
        {(!year || !sections.some((s) => s.academic_year_id === year.id)) && (
          <p className="st-notice is-bad" role="status">
            {year ? `There are no sections in ${year.name} yet. Create them first, so a coordinator can be given a section of this year.` : "There is no current academic year yet, so no sections exist. Add an academic year and make it current first."}{" "}
            <Btn onClick={() => goTo(year ? "sections" : "progression")}>{year ? "Go to Sections" : "Go to Progression"}</Btn>
          </p>
        )}
        <Table rows={data?.coordinators} cols={[
          { h: "Coordinator ID", render: (c) => c.admin_id },
          { h: "Name", render: (c) => c.name },
          { h: "Email", render: (c) => c.email },
          { h: "Status", render: (c) => <Chip tone={c.is_active ? "good" : "bad"}>{c.is_active ? "Active" : "Deactivated"}</Chip> },
          { h: "Section", render: (c) => c.section?.code || "—" },
          { h: "Assign", render: (c) => (
            <div className="st-act">
              <Select value={pick[c.id] || ""} onChange={(e) => setPick({ ...pick, [c.id]: e.target.value })} aria-label={`Section for ${c.name}`}>
                <option value="">{sections.length ? "Choose section…" : "No sections available"}</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.display || s.code}</option>)}
              </Select>
              <Btn disabled={busy || !pick[c.id]} onClick={() => assign(c)}>{c.section ? "Reassign" : "Assign"}</Btn>
              {c.section && <Btn kind="danger" disabled={busy} onClick={() => unassign(c)}>End</Btn>}
            </div>
          ) },
        ]} />
      </Card>
    </>
  );
}

function Sections({ courses, year, viewYear, past, onChanged, goTo }) {
  const [list, reload, , m] = useLoad(() => svc.sections({ academic_year_id: viewYear?.id }), { interval: 45000, deps: [viewYear?.id] });
  const { busy, msg, run } = useAction();
  const [f, setF] = usePersistedState("admin.sections", { course_id: "", count: "1" });
  const [open, setOpen] = useState(null);
  const create = async () => {
    const r = await run(() => svc.createSections({ course_id: Number(f.course_id), year_level: 4, count: Number(f.count) }), "Sections ready.");
    if (r) { reload(); onChanged(); }
  };
  const show = async (s) => setOpen(await svc.section(s.id).catch(() => null));
  return (
    <>
      <Notice msg={msg} />
      {!year && (
        <p className="st-notice is-bad" role="status">
          Sections belong to the current academic year, and none is set yet.{" "}
          <Btn onClick={() => goTo("progression")}>Add an academic year</Btn>
        </p>
      )}
      {!past && <Card title={`Create sections${year ? ` for ${yearLabel(year.name)}` : ""}`}>
        <Row>
          <Field label="Course"><Select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}>
            <option value="">Choose…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </Select></Field>
          <Field label="Year level" className="st-field-sm"><Input value="4th year" readOnly aria-readonly="true" title="OCC Duty Log Book is only for 4th-year students" /></Field>
          <Field label="How many (A, B, …)" className="st-field-sm"><Input type="number" min="1" max="12" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
          <Btn kind="primary" disabled={busy || !f.course_id} onClick={create}>Create</Btn>
        </Row>
        <p className="st-muted st-note">OCC Duty Log Book is only for 4th-year college students (on-the-job training), so every section is a 4th-year section, e.g. BSIT-4A.</p>
      </Card>}
      <Card title={viewYear ? `Sections · ${yearLabel(viewYear.name)}` : "Sections"} actions={refreshBtn(reload, m)}>
        <Table rows={list?.sections} cols={[
          { h: "Section", render: (s) => s.code }, { h: "Year", render: (s) => s.year_level }, { h: "Students", render: (s) => s.students },
          { h: "", render: (s) => <Btn onClick={() => show(s)}>View roster</Btn> },
        ]} />
      </Card>
      {open && (
        <Card title={`Roster · ${open.section.code}`} actions={<Btn onClick={() => setOpen(null)}>Close</Btn>}>
          <Table rows={open.students} cols={[{ h: "Student ID", render: (s) => s.student_id }, { h: "Name", render: (s) => s.name }, { h: "Status", render: (s) => <Chip tone={statusTone(s.status)}>{s.status}</Chip> }]} />
        </Card>
      )}
    </>
  );
}

function Enrollments({ sections, year, viewYear, past }) {
  const [un, reloadUn, , mu] = useLoad(() => svc.unassigned(), { interval: LIVE });
  const [all, reloadAll, , ma] = useLoad(() => svc.enrollments({ academic_year_id: viewYear?.id }), { interval: 45000, deps: [viewYear?.id] });
  const { busy, msg, run } = useAction();
  const [pick, setPick] = useState({});
  const place = async (e, transfer) => {
    const sid = pick[e.id]; if (!sid) return;
    const r = await run(() => (transfer ? svc.transfer(e.id, Number(sid), "Admin transfer") : svc.assignSection(e.id, Number(sid))), transfer ? "Trainee transferred." : "Section assigned.");
    if (r) { reloadUn(); reloadAll(); }
  };
  // A student waiting for placement belongs in the current year; a transfer may also stay inside an earlier year.
  const options = (e, transfer) => sections.filter((s) => (!e.course || s.course_id === e.course.id) && (transfer || !year || s.academic_year_id === year.id)).map((s) => <option key={s.id} value={s.id}>{s.code}</option>);
  const picker = (e, label, transfer) => (
    <div className="st-act">
      <Select value={pick[e.id] || ""} onChange={(ev) => setPick({ ...pick, [e.id]: ev.target.value })} aria-label={`Section for ${e.student?.name || "student"}`}><option value="">Choose section…</option>{options(e, transfer)}</Select>
      <Btn disabled={busy || !pick[e.id]} onClick={() => place(e, transfer)}>{label}</Btn>
    </div>
  );
  return (
    <>
      <Notice msg={msg} />
      {!past && <Card title={`Unassigned students (${un?.total ?? "…"})`} actions={refreshBtn(reloadUn, mu)}>
        {year && (un?.total ?? 0) > 0 && !sections.some((s) => s.academic_year_id === year.id) && (
          <p className="st-notice is-bad" role="status">New registrations wait here until {year.name} has sections. Create them on the Sections tab, then assign each student.</p>
        )}
        <Table empty="Every student has a section." rows={un?.enrollments} cols={[
          { h: "Student ID", render: (e) => e.student?.student_id }, { h: "Name", render: (e) => e.student?.name },
          { h: "Course", render: (e) => e.course?.code || "—" }, { h: "Assign", render: (e) => picker(e, "Assign", false) },
        ]} />
      </Card>}
      <Card title={viewYear ? `Enrollments · ${yearLabel(viewYear.name)}` : "Enrollments"} actions={refreshBtn(reloadAll, ma)}>
        <Table rows={all?.data} cols={[
          { h: "Student ID", render: (e) => e.student?.student_id }, { h: "Name", render: (e) => e.student?.name },
          { h: "Academic year", render: (e) => e.academic_year || "—" },
          { h: "Section", render: (e) => e.section?.code || "—" }, { h: "Status", render: (e) => <Chip tone={statusTone(e.status)}>{e.status}</Chip> },
          { h: "Move to", render: (e) => (e.section && e.status === "active" && !past ? picker(e, "Transfer", true) : "—") },
        ]} />
      </Card>
    </>
  );
}

function Progression({ years, onChanged }) {
  const [target, setTarget] = useState(null); // the academic year a rollover is being prepared INTO
  const [plan, setPlan] = useState(null);
  const [yearSections, setYearSections] = useState([]);
  const [pick, setPick] = useState({});
  const { busy, msg, run } = useAction();
  const popup = usePopup();
  const [newYear, setNewYear] = usePersistedState("admin.progression.newYear", "");
  const current = years.find((y) => y.is_current);

  const prepare = async (year) => {
    const r = await run(() => svc.prepareProgression(year.id));
    if (!r) return;
    setTarget(year); setPlan(r.proposals);
    // Students who already reached their hours start as "Mark as completed"; everyone else starts on "Leave unchanged".
    setPick(Object.fromEntries(r.proposals.filter((p) => p.kind === "complete" && p.hours_met).map((p) => [p.id, "complete"])));
    const s = await svc.sections({ academic_year_id: year.id }).catch(() => ({ sections: [] }));
    setYearSections(s.sections);
  };
  const chosen = (plan || []).filter((p) => pick[p.id]);
  // A decision is "complete", "repeat:<section id>" (stay 4th year for another term) or a destination section id.
  const decode = (p) => {
    const v = String(pick[p.id]);
    if (v === "complete") return { enrollment_id: p.id, kind: "complete", section_id: null };
    if (v.startsWith("repeat:")) return { enrollment_id: p.id, kind: "repeat", section_id: Number(v.slice(7)) };
    return { enrollment_id: p.id, kind: p.kind, section_id: Number(v) };
  };
  const repeatOptions = (p) => yearSections.filter((s) => s.course_id === p.course?.id && s.year_level === p.year_level);
  const confirm = async () => {
    if (!chosen.length) return;
    const short = chosen.filter((p) => p.kind === "complete" && !p.hours_met);
    if (short.length && !(await popup.confirm({
      title: "Complete students who have not finished their hours?",
      message: `${short.length} selected student${short.length === 1 ? " has" : "s have"} not reached the required hours yet. They will be marked as completed and leave the active lists. Their records are kept.`,
      okLabel: "Mark completed anyway", danger: true,
    }))) return;
    const items = chosen.map((p) => decode(p));
    const r = await run(() => svc.confirmProgression(target.id, items), "Progression applied. Rows left on “Leave unchanged” were not changed.");
    if (r) { prepare(target); onChanged(); }
  };
  const addYear = async () => { if (await run(() => svc.createYear(newYear, false), "Academic year added.")) { setNewYear(""); onChanged(); } };
  const makeCurrent = async (y) => {
    const ok = await popup.confirm({
      title: `Make ${yearLabel(y.name)} the current school year?`,
      message: "New sections, new registrations and the section lists will use this year. Students stay enrolled in the year they are in now until you confirm a progression, and nothing is deleted.",
      okLabel: "Make current",
    });
    if (ok && await run(() => svc.makeYearCurrent(y.id), `${y.name} is now the current year.`)) { setPlan(null); onChanged(); }
  };

  return (
    <>
      <Notice msg={msg} />
      <Card title="Academic years">
        <Row>
          <Field label="New year (e.g. 2027-2028)"><Input value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="YYYY-YYYY" /></Field>
          <Btn disabled={busy || !newYear} onClick={addYear}>Add</Btn>
        </Row>
        <Table searchable={false} toggle={false} empty="No academic year yet. Add one above." rows={years} cols={[
          { h: "School year", render: (y) => yearLabel(y.name) },
          { h: "Status", render: (y) => <Chip tone={y.is_current ? "good" : undefined}>{y.is_current ? "Current" : "Not current"}</Chip> },
          { h: "Sections", render: (y) => y.sections_count ?? 0 },
          { h: "Students still enrolled", render: (y) => y.open_enrollments_count ?? 0 },
          { h: "", render: (y) => (
            <div className="st-act">
              <Btn disabled={busy || y.is_current} onClick={() => makeCurrent(y)}>Make current</Btn>
              <Btn kind="primary" disabled={busy} onClick={() => prepare(y)}>Preview rollover</Btn>
            </div>
          ) },
        ]} />
        <div className="st-muted st-note">
          <p><b>How a new school year works.</b> 1) Add the new year. 2) Make it current. 3) Create its 4th-year sections on the Sections tab. 4) Preview the rollover into it and confirm.</p>
          <p>The “current” year only decides where new sections and new registrations go. Every student keeps the enrollment they already have, in the year it was made, until you confirm a progression here, so last year’s students still show up after a new year is current. Nothing is ever deleted: old enrollments, hours and entries stay as history. The preview changes nothing, and a row left on “Leave unchanged” keeps its old enrollment.</p>
          <p><b>Student not finished (for example the host client had holidays)?</b> Choose “carry over to” a section of the new year (create it first). They move into the new year and keep every verified hour, because hours belong to the student, not to the year.</p>
        </div>
      </Card>
      {plan && target && (
        <Card title={`Rollover into ${yearLabel(target.name)} (${plan.length})`} actions={<Btn kind="primary" disabled={busy || !chosen.length} onClick={confirm}>{`Confirm selected (${chosen.length})`}</Btn>}>
          {target.id !== current?.id && <p className="st-notice is-bad" role="status">{target.name} is not the current academic year. You can still prepare it, but make it current first so new registrations land in the same year.</p>}
          <Table empty="No eligible students." rows={plan} cols={[
            { h: "Student", render: (p) => `${p.student?.name} (${p.student?.student_id})` },
            { h: "From", render: (p) => `${p.academic_year ? `${p.academic_year} · ` : ""}${p.course?.code || ""} ${p.year_level} · ${p.section?.code || "no section"}` },
            { h: "Hours", render: (p) => <>{p.verified_hours} / {p.required_hours} {p.hours_met ? <Chip tone="good">reached</Chip> : <Chip tone="warn">not reached</Chip>}</> },
            { h: "Action", render: (p) => <Chip tone={p.kind === "complete" ? "good" : undefined}>{p.kind === "repeat" ? "carry over" : p.kind}</Chip> },
            { h: "Decision", render: (p) => (
              <div className="st-act">
                {p.kind === "complete" ? (
                  <Select value={pick[p.id] || ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })} aria-label={`Decision for ${p.student?.name}`}>
                    <option value="">Leave unchanged</option><option value="complete">Mark as completed</option>
                    {repeatOptions(p).length > 0 && <optgroup label="Not finished: carry over to">{repeatOptions(p).map((s) => <option key={s.id} value={`repeat:${s.id}`}>{s.code}</option>)}</optgroup>}
                  </Select>
                ) : (
                  <Select value={pick[p.id] || ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })} aria-label={`Destination section for ${p.student?.name}`}>
                    <option value="">Leave unchanged</option>
                    {yearSections.filter((s) => s.course_id === p.course?.id && s.year_level === p.next_year_level).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                  </Select>
                )}
              </div>
            ) },
          ]} />
        </Card>
      )}
    </>
  );
}

function Training({ sections }) {
  const [sid, setSid] = useState("");
  const [roster, setRoster] = useState([]);
  const [sel, setSel] = useState(null);
  const [info, setInfo] = useState(null);
  const [f, setF] = usePersistedState("admin.training", { hours: "", reason: "" });
  const { busy, msg, run } = useAction();
  const pickSection = async (id) => { setSid(id); setSel(null); setInfo(null); setRoster(id ? (await svc.section(id)).students : []); };
  const pickTrainee = async (u) => { setSel(u); setInfo(await svc.traineeHours(u.user_id)); };
  const save = async () => {
    const r = await run(() => svc.setHourException(sel.user_id, Number(f.hours), f.reason), "Requirement updated and logged.");
    if (r) { setInfo(await svc.traineeHours(sel.user_id)); setF({ hours: "", reason: "" }); }
  };
  const h = info?.hours;
  return (
    <>
      <Notice msg={msg} />
      <Card title="Training requirement exceptions">
        <Row>
          <Field label="Section"><Select value={sid} onChange={(e) => pickSection(e.target.value)}><option value="">Choose…</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.display || s.code}</option>)}</Select></Field>
          <Field label="Trainee"><Select value={sel?.user_id || ""} onChange={(e) => { const u = roster.find((r) => String(r.user_id) === e.target.value); if (u) pickTrainee(u); }}>
            <option value="">Choose…</option>{roster.map((r) => <option key={r.user_id} value={r.user_id}>{r.name} ({r.student_id})</option>)}
          </Select></Field>
        </Row>
      </Card>
      {h && (
        <Card title={sel.name}>
          <div className="st-stat-grid">
            <StatCard label="Required" value={h.required} /><StatCard label="Verified" value={h.verified} />
            <StatCard label="Pending review" value={h.pending} /><StatCard label="Draft / rejected" value={h.draft} />
          </div>
          <Row>
            <Field label="New required hours" className="st-field-sm"><Input type="number" min="1" max="2000" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
            <Field label="Reason (required)" className="st-field-wide"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
            <Btn kind="primary" disabled={busy || !f.hours || f.reason.trim().length < 5} onClick={save}>Save exception</Btn>
          </Row>
          <h3 className="st-h3">History</h3>
          <Table empty="No exceptions yet." rows={info.exceptions} cols={[
            { h: "When", render: (x) => new Date(x.created_at).toLocaleString() }, { h: "From", render: (x) => x.previous_hours },
            { h: "To", render: (x) => x.new_hours }, { h: "Reason", render: (x) => x.reason },
          ]} />
        </Card>
      )}
    </>
  );
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "live", label: "Live duty", icon: Radio },
  { key: "registrations", label: "Registrations", short: "Sign-ups", icon: UserCheck },
  { key: "coordinators", label: "Coordinators", icon: UserCog },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "sections", label: "Sections", icon: Layers },
  { key: "enrollments", label: "Enrollments", icon: ClipboardList },
  { key: "progression", label: "Progression", icon: TrendingUp },
  { key: "training", label: "Training requirements", icon: Target },
  { key: "reports", label: "Reports", icon: FileBarChart },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "activity", label: "Audit log", icon: ShieldCheck },
];

/** Admin area: one desktop page, one sidebar entry per section. Every action is also enforced by Laravel (role:admin). */
export default function AdminDashboard() {
  const [tab, setTab] = usePersistedTab("admin", NAV.map((n) => n.key), "dashboard");
  const [courses] = useLoad(() => svc.courses().then((d) => d.courses));
  const [years, reloadYears] = useLoad(() => svc.years().then((d) => d.academic_years), { interval: 60000 });
  // Dashboard, Sections, Enrollments and Reports follow ONE school year: the current one unless the Admin picks another (read-only history).
  const [yearSel, setYearSel] = usePersistedState("admin.viewYear", "");
  const yearList = years || [];
  const current = yearList.find((y) => y.is_current);
  const viewYear = yearList.find((y) => String(y.id) === String(yearSel)) || current;
  const past = !!viewYear && viewYear.id !== current?.id;
  const [ov, reloadOv, ovError, om] = useLoad(() => svc.overview({ academic_year_id: viewYear?.id }), { interval: LIVE, deps: [viewYear?.id] });
  const [yearSecs] = useLoad(() => svc.sections({ academic_year_id: viewYear?.id }).then((d) => d.sections.map((s) => ({ ...s, display: s.code }))), { deps: [viewYear?.id] });
  const stuck = yearList.filter((y) => !y.is_current && (y.open_enrollments_count || 0) > 0); // students left behind in an earlier year
  const [secs, reloadSecs] = useLoad(() => svc.sections({ include_open: 1 }).then((d) => d.sections), { interval: 60000 });
  useEffect(() => { document.title = "Admin | OCCDL"; }, []);
  const year = current;
  const refresh = () => { reloadYears(); reloadSecs(); };
  const sections = secs || [];
  const yearTab = ["dashboard", "sections", "enrollments", "reports"].includes(tab);
  const yearPicker = yearTab && yearList.length > 1 ? (
    <Select className="st-year-pick" value={viewYear?.id || ""} aria-label="School year" onChange={(e) => setYearSel(e.target.value === String(current?.id) ? "" : e.target.value)}>
      {yearList.map((y) => <option key={y.id} value={y.id}>{yearLabel(y.name)}{y.is_current ? " · current" : ""}</option>)}
    </Select>
  ) : null;

  return (
    <AdminShell roleLabel="System Administrator" nav={NAV} phoneTabs={["dashboard", "live", "registrations", "users"]} active={tab} onNavigate={setTab}
      title={NAV.find((n) => n.key === tab)?.label} subtitle={year ? `Current school year: ${yearLabel(year.name)}` : undefined}
      actions={yearTab || tab === "dashboard" ? <div className="st-header-tools">{yearPicker}{tab === "dashboard" && refreshBtn(reloadOv, om)}</div> : undefined}>
      {tab !== "progression" && stuck.length > 0 && (
        <p className="st-notice is-bad" role="status">
          {stuck.reduce((n, y) => n + y.open_enrollments_count, 0)} student(s) are still enrolled in {stuck.map((y) => yearLabel(y.name)).join(", ")} and are not shown in {current ? yearLabel(current.name) : "the current year"}.{" "}
          <Btn onClick={() => setTab("progression")}>Open Progression</Btn>
        </p>
      )}
      {past && yearTab && <p className="st-notice" role="status">You are viewing {yearLabel(viewYear.name)}, a past school year. It is read-only history.</p>}
      {tab === "dashboard" && ovError && !ov && <p role="alert" className="st-error">{ovError}</p>}
      {tab === "dashboard" && <Stale m={om} />}
      {tab === "dashboard" && (ov ? <OverviewDashboard data={ov} scope="admin" go={setTab} liveFetcher={svc.live} /> : !ovError && <OverviewSkeleton />)}
      {tab === "live" && <LiveDutyPanel fetcher={svc.live} />}
      {tab === "registrations" && <RegistrationsPanel svc={svc} />}
      {tab === "users" && <Users />}
      {tab === "coordinators" && <Coordinators sections={sections} year={year} goTo={setTab} />}
      {tab === "sections" && <Sections courses={courses || []} year={year} viewYear={viewYear} past={past} onChanged={refresh} goTo={setTab} />}
      {tab === "enrollments" && <Enrollments sections={sections} year={year} viewYear={viewYear} past={past} />}
      {tab === "progression" && <Progression years={years || []} onChanged={refresh} />}
      {tab === "training" && <Training sections={sections} />}
      {tab === "reports" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><ReportsPanel svc={svc} sections={yearSecs || []} courses={courses || []} scope="admin" yearId={viewYear?.id || null} /></Suspense>}
      {tab === "announcements" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><AnnouncementsPanel svc={svc} sections={sections} courses={courses || []} scope="admin" /></Suspense>}
      {tab === "activity" && <Suspense fallback={<div style={{ padding: 16, opacity: .6 }}>Loading…</div>}><AuditPanel svc={svc} /></Suspense>}
    </AdminShell>
  );
}
