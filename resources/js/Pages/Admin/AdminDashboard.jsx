import React, { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, UserCog, Layers, ClipboardList, Users as UsersIcon, TrendingUp, Target, FileBarChart, Megaphone, ShieldCheck } from "lucide-react";
import AdminShell, { StatCard } from "../../Components/admin/AdminShell";
import { Btn, Card, Chip, Field, Input, Notice, Row, Select, Table, statusTone, useAction } from "../../Components/admin/ui";
import { OverviewDashboard, OverviewSkeleton } from "../../Components/admin/Dashboard";
import { AnnouncementsPanel, AuditPanel, ReportsPanel } from "../../Components/admin/panels";
import { adminService as svc } from "../../services/adminService";
import { errorMessage } from "../../config/axiosConfig";
import usePersistedTab from "../../hooks/usePersistedTab";
import usePersistedState from "../../hooks/usePersistedState";
import { filterNameInput } from "../../utils/validators";

/** Loads data once and exposes a reload; keeps the first error readable. */
function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => fn().then((d) => { setData(d); setError(""); }).catch((e) => setError(errorMessage(e))), deps); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  return [data, load, error];
}

function Overview({ go }) {
  const [data, , error] = useLoad(svc.overview);
  return (
    <>
      {error && <p role="alert" className="st-error">{error}</p>}
      {!data && !error && <OverviewSkeleton />}
      <OverviewDashboard data={data} scope="admin" go={go} />
    </>
  );
}

/** Every account's details (name, email): only the Administrator can change them. Profile Settings is read-only. */
function Users() {
  const [q, setQ] = usePersistedState("admin.users.q", "");
  const [role, setRole] = usePersistedState("admin.users.role", "");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);
  const { busy, msg, run } = useAction();
  const load = useCallback(() => svc.users({ q: q || undefined, role: role || undefined }).then((d) => { setRows(d.users); setError(""); }).catch((e) => setError(errorMessage(e))), [q, role]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const set = (k) => (e) => setEdit({ ...edit, [k]: k === "email" ? e.target.value : filterNameInput(e.target.value) });
  const save = async () => {
    const r = await run(() => svc.updateUser(edit.id, { first_name: edit.first_name, middle_name: edit.middle_name || null, last_name: edit.last_name, email: edit.email }), "User updated.");
    if (r) { setEdit(null); load(); }
  };
  const roleName = (r) => (r === "admin" ? "Administrator" : r === "coordinator" ? "Coordinator" : "Trainee");
  return (
    <>
      <Notice msg={msg} />
      {edit && (
        <Card title={`Edit ${edit.login_id || "user"}`} actions={<Btn onClick={() => setEdit(null)} disabled={busy}>Cancel</Btn>}>
          <Row>
            <Field label="First name"><Input value={edit.first_name || ""} maxLength={80} onChange={set("first_name")} /></Field>
            <Field label="Middle name"><Input value={edit.middle_name || ""} maxLength={80} onChange={set("middle_name")} /></Field>
            <Field label="Last name"><Input value={edit.last_name || ""} maxLength={80} onChange={set("last_name")} /></Field>
            <Field label="Email"><Input type="email" value={edit.email || ""} onChange={set("email")} /></Field>
            <Btn kind="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</Btn>
          </Row>
          <p className="st-muted" style={{ marginTop: 10 }}>The Student ID / Administrator ID and the role can’t be changed here.</p>
        </Card>
      )}
      <Card title="Users">
        {error && <p role="alert" className="st-error">{error}</p>}
        <Row>
          <Field label="Search"><Input value={q} placeholder="Name, ID or email" onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Everyone</option><option value="trainee">Trainees</option><option value="coordinator">Coordinators</option><option value="admin">Administrators</option>
            </Select>
          </Field>
        </Row>
        <Table empty="No users match." rows={rows} cols={[
          { h: "ID", render: (u) => u.login_id || "—" },
          { h: "Name", render: (u) => u.name },
          { h: "Role", render: (u) => <Chip>{roleName(u.role)}</Chip> },
          { h: "Email", render: (u) => u.email },
          { h: "", render: (u) => <Btn onClick={() => setEdit({ ...u })}>Edit</Btn> },
        ]} />
      </Card>
    </>
  );
}

function Coordinators({ sections, year, goTo }) {
  const [data, reload] = useLoad(svc.coordinators);
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
      <Card title="Coordinators">
        {sections.length === 0 && (
          <p className="st-notice is-bad" role="status">
            {year ? "There are no sections yet, so there is nothing to choose. Create sections first." : "There is no current academic year yet, so no sections exist. Add an academic year and make it current first."}{" "}
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
            <Row>
              <Select value={pick[c.id] || ""} onChange={(e) => setPick({ ...pick, [c.id]: e.target.value })}>
                <option value="">{sections.length ? "Choose section…" : "No sections available"}</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </Select>
              <Btn disabled={busy || !pick[c.id]} onClick={() => assign(c)}>{c.section ? "Reassign" : "Assign"}</Btn>
              {c.section && <Btn kind="danger" disabled={busy} onClick={() => unassign(c)}>End</Btn>}
            </Row>
          ) },
        ]} />
      </Card>
    </>
  );
}

function Sections({ courses, year, onChanged, goTo }) {
  const [list, reload] = useLoad(() => svc.sections(), []);
  const { busy, msg, run } = useAction();
  const [f, setF] = usePersistedState("admin.sections", { course_id: "", year_level: "1", count: "1" });
  const [open, setOpen] = useState(null);
  const create = async () => {
    const r = await run(() => svc.createSections({ course_id: Number(f.course_id), year_level: Number(f.year_level), count: Number(f.count) }), "Sections ready.");
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
      <Card title={`Create sections${year ? ` for ${year.name}` : ""}`}>
        <Row>
          <Field label="Course"><Select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}>
            <option value="">Choose…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </Select></Field>
          <Field label="Year level"><Select value={f.year_level} onChange={(e) => setF({ ...f, year_level: e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="How many (A, B, …)"><Input type="number" min="1" max="12" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} style={{ width: 90 }} /></Field>
          <Btn kind="primary" disabled={busy || !f.course_id} onClick={create}>Create</Btn>
        </Row>
      </Card>
      <Card title="Sections">
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

function Enrollments({ sections }) {
  const [un, reloadUn] = useLoad(svc.unassigned);
  const [all, reloadAll] = useLoad(() => svc.enrollments(), []);
  const { busy, msg, run } = useAction();
  const [pick, setPick] = useState({});
  const place = async (e, transfer) => {
    const sid = pick[e.id]; if (!sid) return;
    const r = await run(() => (transfer ? svc.transfer(e.id, Number(sid), "Admin transfer") : svc.assignSection(e.id, Number(sid))), transfer ? "Trainee transferred." : "Section assigned.");
    if (r) { reloadUn(); reloadAll(); }
  };
  const options = (e) => sections.filter((s) => !e.course || s.course_id === e.course.id).map((s) => <option key={s.id} value={s.id}>{s.code}</option>);
  const picker = (e, label, transfer) => (
    <Row>
      <Select value={pick[e.id] || ""} onChange={(ev) => setPick({ ...pick, [e.id]: ev.target.value })}><option value="">Section…</option>{options(e)}</Select>
      <Btn disabled={busy || !pick[e.id]} onClick={() => place(e, transfer)}>{label}</Btn>
    </Row>
  );
  return (
    <>
      <Notice msg={msg} />
      <Card title={`Unassigned students (${un?.total ?? "…"})`}>
        <Table empty="Every student has a section." rows={un?.enrollments} cols={[
          { h: "Student ID", render: (e) => e.student?.student_id }, { h: "Name", render: (e) => e.student?.name },
          { h: "Course", render: (e) => e.course?.code || "—" }, { h: "Assign", render: (e) => picker(e, "Assign", false) },
        ]} />
      </Card>
      <Card title="Open enrollments">
        <Table rows={all?.data} cols={[
          { h: "Student ID", render: (e) => e.student?.student_id }, { h: "Name", render: (e) => e.student?.name },
          { h: "Section", render: (e) => e.section?.code || "—" }, { h: "Status", render: (e) => <Chip tone={statusTone(e.status)}>{e.status}</Chip> },
          { h: "Move to", render: (e) => e.section ? picker(e, "Transfer", true) : "—" },
        ]} />
      </Card>
    </>
  );
}

function Progression({ years, sections, onChanged }) {
  const [yearId, setYearId] = usePersistedState("admin.progression.year", "");
  const [plan, setPlan] = useState(null);
  const [yearSections, setYearSections] = useState([]);
  const [pick, setPick] = useState({});
  const { busy, msg, run } = useAction();
  const [newYear, setNewYear] = usePersistedState("admin.progression.newYear", "");

  const prepare = async () => {
    const r = await run(() => svc.prepareProgression(yearId));
    if (!r) return;
    setPlan(r.proposals); setPick({});
    const s = await svc.sections({ academic_year_id: yearId }).catch(() => ({ sections: [] }));
    setYearSections(s.sections);
  };
  const confirm = async () => {
    const items = plan.filter((p) => p.kind === "complete" || pick[p.id]).map((p) => ({ enrollment_id: p.id, kind: p.kind, section_id: p.kind === "complete" ? null : Number(pick[p.id]) }));
    if (!items.length) return;
    const r = await run(() => svc.confirmProgression(yearId, items), "Progression applied. Rows left blank were not changed.");
    if (r) { prepare(); onChanged(); }
  };
  const addYear = async () => { if (await run(() => svc.createYear(newYear, false), "Academic year added.")) { setNewYear(""); onChanged(); } };
  const makeCurrent = async () => { if (await run(() => svc.makeYearCurrent(yearId), "Marked as the current year.")) onChanged(); };

  return (
    <>
      <Notice msg={msg} />
      <Card title="Academic years">
        <Row>
          <Field label="New year (e.g. 2027-2028)"><Input value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="YYYY-YYYY" /></Field>
          <Btn disabled={busy || !newYear} onClick={addYear}>Add</Btn>
          <Field label="Roll over into"><Select value={yearId} onChange={(e) => { setYearId(e.target.value); setPlan(null); }}>
            <option value="">Choose year…</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
          </Select></Field>
          <Btn kind="primary" disabled={busy || !yearId} onClick={prepare}>Preview</Btn>
          <Btn disabled={busy || !yearId} onClick={makeCurrent}>Make current</Btn>
        </Row>
        <p className="st-muted">Order: add the new year, mark it current, create its sections (Sections tab), then preview and confirm here. Preview changes nothing; rows left on "Leave unchanged" keep their old enrollment.</p>
      </Card>
      {plan && (
        <Card title={`Proposed changes (${plan.length})`} actions={<Btn kind="primary" disabled={busy} onClick={confirm}>Confirm selected</Btn>}>
          <Table empty="No eligible students." rows={plan} cols={[
            { h: "Student", render: (p) => `${p.student?.name} (${p.student?.student_id})` },
            { h: "From", render: (p) => `${p.course?.code || ""} ${p.year_level} · ${p.section?.code || "no section"}` },
            { h: "Action", render: (p) => <Chip tone={p.kind === "complete" ? "good" : undefined}>{p.kind}</Chip> },
            { h: "Destination section", render: (p) => p.kind === "complete" ? "Completes OJT" : (
              <Select value={pick[p.id] || ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}>
                <option value="">Leave unchanged</option>
                {yearSections.filter((s) => s.course_id === p.course?.id && s.year_level === p.next_year_level).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </Select>) },
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
          <Field label="Section"><Select value={sid} onChange={(e) => pickSection(e.target.value)}><option value="">Choose…</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</Select></Field>
          <Field label="Trainee"><Select value={sel?.user_id || ""} onChange={(e) => { const u = roster.find((r) => String(r.user_id) === e.target.value); if (u) pickTrainee(u); }}>
            <option value="">Choose…</option>{roster.map((r) => <option key={r.user_id} value={r.user_id}>{r.name} ({r.student_id})</option>)}
          </Select></Field>
        </Row>
      </Card>
      {h && (
        <Card title={sel.name}>
          <div className="st-flex st-mb">
            <StatCard label="Required" value={h.required} /><StatCard label="Verified" value={h.verified} />
            <StatCard label="Pending review" value={h.pending} /><StatCard label="Draft / rejected" value={h.draft} />
          </div>
          <Row>
            <Field label="New required hours"><Input type="number" min="1" max="2000" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} style={{ width: 130 }} /></Field>
            <Field label="Reason (required)"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} style={{ width: 320 }} /></Field>
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
  { key: "overview", label: "Overview", icon: LayoutDashboard },
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
  const [tab, setTab] = usePersistedTab("admin", NAV.map((n) => n.key), "overview");
  const [courses] = useLoad(() => svc.courses().then((d) => d.courses));
  const [years, reloadYears] = useLoad(() => svc.years().then((d) => d.academic_years));
  const [secs, reloadSecs] = useLoad(() => svc.sections().then((d) => d.sections));
  useEffect(() => { document.title = "Admin | OCCDL"; }, []);
  const year = (years || []).find((y) => y.is_current);
  const refresh = () => { reloadYears(); reloadSecs(); };
  const sections = secs || [];

  return (
    <AdminShell roleLabel="System Administrator" nav={NAV} active={tab} onNavigate={setTab}
      title={NAV.find((n) => n.key === tab)?.label} subtitle={year ? `Current academic year: ${year.name}` : undefined}>
      {tab === "overview" && <Overview go={setTab} />}
      {tab === "users" && <Users />}
      {tab === "coordinators" && <Coordinators sections={sections} year={year} goTo={setTab} />}
      {tab === "sections" && <Sections courses={courses || []} year={year} onChanged={refresh} goTo={setTab} />}
      {tab === "enrollments" && <Enrollments sections={sections} />}
      {tab === "progression" && <Progression years={years || []} sections={sections} onChanged={refresh} />}
      {tab === "training" && <Training sections={sections} />}
      {tab === "reports" && <ReportsPanel svc={svc} sections={sections} courses={courses || []} scope="admin" />}
      {tab === "announcements" && <AnnouncementsPanel svc={svc} sections={sections} courses={courses || []} scope="admin" />}
      {tab === "activity" && <AuditPanel svc={svc} />}
    </AdminShell>
  );
}
