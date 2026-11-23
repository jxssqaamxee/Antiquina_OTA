import React, { useEffect, useState } from "react";
import { Btn, Card, Chip, Field, Input, Notice, Row, Select, Table, Textarea, useAction } from "./ui";
import { StatCard } from "./AdminShell";
import { errorMessage } from "../../config/axiosConfig";

/** Hours report (verified = approved only). `filters` = optional extra controls for Admin; `svc` is the role's service. */
export function ReportsPanel({ svc, sections = [], courses = [] }) {
  const [f, setF] = useState({ section_id: "", course_id: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const key = JSON.stringify(params);
  useEffect(() => { svc.report(params).then(setData).catch((e) => setError(errorMessage(e))); }, [key]); // eslint-disable-line
  const t = data?.totals;
  return (
    <>
      <Card title="Hours report" actions={<>
        <a href={svc.reportCsvUrl(params)} download className="st-link-reset"><Btn>Download CSV</Btn></a>
        <Btn onClick={() => window.print()}>Print / Save as PDF</Btn>
      </>}>
        {error && <p role="alert" className="st-error">{error}</p>}
        {sections.length > 0 && (
          <Row>
            <Field label="Course"><Select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">All</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
            <Field label="Section"><Select value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })}><option value="">All</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</Select></Field>
          </Row>
        )}
        <div className="st-flex st-mb" style={{ margin: "14px 0" }}>
          <StatCard label="Trainees" value={t?.trainees} /><StatCard label="Verified hours" value={t?.verified} />
          <StatCard label="Pending review" value={t?.pending} /><StatCard label="Reached requirement" value={t?.completed} />
        </div>
        <Table empty="No trainees in this view." rows={data?.rows} cols={[
          { h: "Student ID", render: (r) => r.student_id }, { h: "Name", render: (r) => r.name }, { h: "Section", render: (r) => r.section || "—" },
          { h: "Verified", render: (r) => `${r.verified} / ${r.required}` }, { h: "Pending", render: (r) => r.pending },
          { h: "Progress", render: (r) => <Chip tone={r.percent >= 100 ? "good" : undefined}>{r.percent}%</Chip> },
        ]} />
      </Card>
    </>
  );
}

/** Compose + history. Admin may pick all / course / section; a Coordinator is fixed to their own section (`fixedSection`). */
export function AnnouncementsPanel({ svc, sections = [], courses = [], fixedSection = null }) {
  const [list, setList] = useState(null);
  const { busy, msg, run } = useAction();
  const [f, setF] = useState({ audience_type: fixedSection ? "section" : "all", course_id: "", section_id: fixedSection?.id || "", title: "", body: "" });
  const load = () => svc.announcements().then(setList).catch(() => setList({ announcements: [] }));
  useEffect(() => { load(); }, []); // eslint-disable-line
  const send = async () => {
    const body = { ...f, course_id: f.course_id ? Number(f.course_id) : null, section_id: f.section_id ? Number(f.section_id) : null };
    const r = await run(() => svc.publishAnnouncement(body), null);
    if (r) { setF({ ...f, title: "", body: "" }); load(); }
  };
  const sent = msg ? msg : null;
  return (
    <>
      <Card title="New announcement">
        <Notice msg={sent} />
        <Row>
          {!fixedSection && (
            <Field label="Send to"><Select value={f.audience_type} onChange={(e) => setF({ ...f, audience_type: e.target.value })}>
              <option value="all">All trainees</option><option value="course">One course</option><option value="section">One section</option>
            </Select></Field>
          )}
          {f.audience_type === "course" && <Field label="Course"><Select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">Choose…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>}
          {f.audience_type === "section" && !fixedSection && <Field label="Section"><Select value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })}><option value="">Choose…</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</Select></Field>}
          {fixedSection && <Chip>{`Section ${fixedSection.code}`}</Chip>}
        </Row>
        <div className="st-grid">
          <Field label="Title"><Input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Message (max 500 characters)">
            <Textarea value={f.body} maxLength={500} rows={4} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </Field>
          <div><Btn kind="primary" disabled={busy || f.title.trim().length < 3 || f.body.trim().length < 3 || (f.audience_type === "course" && !f.course_id) || (f.audience_type === "section" && !f.section_id)} onClick={send}>Send</Btn></div>
        </div>
        <p className="st-muted">Trainees see it in their notification bell. Sending cannot be undone.</p>
      </Card>
      <Card title="Sent announcements">
        <Table empty="Nothing sent yet." rows={list?.announcements} cols={[
          { h: "When", render: (a) => new Date(a.created_at).toLocaleString() }, { h: "Title", render: (a) => a.title },
          { h: "Audience", render: (a) => a.audience_type }, { h: "Recipients", render: (a) => a.recipient_count },
        ]} />
      </Card>
    </>
  );
}

/** Audit viewer with an action-prefix filter. */
export function AuditPanel({ svc, title = "Audit log" }) {
  const [rows, setRows] = useState(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { svc.activityFiltered(action).then((r) => { setRows(r); setError(""); }).catch((e) => setError(errorMessage(e))); }, [action]); // eslint-disable-line
  return (
    <Card title={title}>
      {error && <p role="alert" className="st-error">{error}</p>}
      <Row>
        <Field label="Show"><Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Everything</option><option value="entry.">Entry approvals</option><option value="coordinator.">Coordinator changes</option>
          <option value="enrollment.">Enrollment transfers</option><option value="placement.">Placements</option><option value="hours.">Hour exceptions</option><option value="announcement.">Announcements</option><option value="report.">Report exports</option>
        </Select></Field>
      </Row>
      <div className="st-mt">
        <Table empty="No matching activity." rows={rows} cols={[
          { h: "When", render: (r) => new Date(r.created_at).toLocaleString() }, { h: "By", render: (r) => r.actor },
          { h: "Action", render: (r) => r.action }, { h: "Subject", render: (r) => `${r.subject_type || ""} ${r.subject_id ?? ""}` },
        ]} />
      </div>
    </Card>
  );
}

const ROSTER_RESULT = {
  added: ["Added", "good"], updated: ["Placed", "good"], unchanged: ["Already listed", undefined],
  wrong_course: ["Wrong course", "bad"], no_course: ["No course", "bad"], ambiguous_course: ["Course unclear", "bad"],
  conflicting_course: ["Conflict in file", "bad"], other_section: ["Other section", "warn"], already_registered: ["Has account", "warn"],
};
const FROM = { row: "from the file", heading: "from a heading above", assumed: "assumed (section course)" };

/**
 * Roster = the Student IDs (with their course) that may register. The file is read first and checked
 * (preview); nothing is saved until the person confirms. `sections` is only given to Admin (picks a section);
 * a Coordinator always imports into their own section, decided by the server.
 */
export function RosterPanel({ svc, sections = [] }) {
  const isAdmin = sections.length > 0;
  const [sectionId, setSectionId] = useState("");
  const [file, setFile] = useState(null);
  const [assume, setAssume] = useState(false);
  const [result, setResult] = useState(null);
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState("all");
  const { busy, msg, run, setMsg } = useAction();
  const ready = !isAdmin || !!sectionId;

  const load = () => svc.rosterList(sectionId || undefined).then((d) => { setList(d); setError(""); }).catch((e) => { setList(null); setError(errorMessage(e)); });
  useEffect(() => { if (ready) load(); else setList(null); }, [sectionId]); // eslint-disable-line

  const opts = (dryRun) => ({ dryRun, assumeCourse: assume, sectionId });
  const check = async () => { const r = await run(() => svc.rosterImport(file, opts(true))); if (r) setResult(r); };
  const save = async () => {
    const r = await run(() => svc.rosterImport(file, opts(false)));
    if (!r) return;
    setResult(r); setFile(null); load();
    setMsg({ text: `Saved: ${r.counts.added} added, ${r.counts.updated} placed, ${r.counts.unchanged} already listed.` });
  };
  const remove = async (id) => {
    if (!window.confirm(`Remove ${id} from the roster? They will no longer be able to register.`)) return;
    if (await run(() => svc.rosterRemove(id, sectionId || undefined), "Removed.")) load();
  };

  const c = result?.counts;
  const importable = c ? c.added + c.updated : 0;
  return (
    <>
      <Card title="Import Student IDs and courses">
        <p className="st-muted">
          Upload the class list as Excel, Word, PDF (text), CSV, notes or any text file. Every Student ID (like 2021-2-04062) is read together with its
          course (like “CIT BSIT”). Only students whose course matches {isAdmin ? "the section" : `your section${list?.section ? ` ${list.section.code}` : ""}`} are
          accepted, and only they can register.
        </p>
        <Notice msg={msg} />{error && <p role="alert" className="st-error">{error}</p>}
        <Row>
          {isAdmin && (
            <Field label="Section"><Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setResult(null); }}>
              <option value="">Choose…</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select></Field>
          )}
          <Field label="File"><Input type="file" key={file ? "has" : "none"} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setMsg(null); }} /></Field>
        </Row>
        <Row>
          <Check checked={assume} onChange={(e) => { setAssume(e.target.checked); setResult(null); }}>My file has no course column — use the section’s course for every ID</Check>
        </Row>
        <Row>
          <Btn kind="primary" disabled={busy || !file || !ready} onClick={check}>Check file</Btn>
          {importable > 0 && <Btn kind="primary" disabled={busy} onClick={save}>{result.dry_run ? `Import ${importable} student${importable === 1 ? "" : "s"}` : "Import again"}</Btn>}
        </Row>

        {result && (
          <>
            <h3 className="st-h3">{result.dry_run ? "Preview — nothing saved yet" : "Result"} · {result.file} → {result.section}</h3>
            <div className="st-flex st-mb">
              <StatCard label="Will be added" value={c.added} /><StatCard label="Placed" value={c.updated} />
              <StatCard label="Already listed" value={c.unchanged} /><StatCard label="Rejected" value={c.rejected} /><StatCard label="Skipped" value={c.skipped} />
            </div>
            <Table empty="Nothing to show." rows={result.rows} cols={[
              { h: "Student ID", render: (r) => r.student_id },
              { h: "Course read", render: (r) => r.course ? <>{r.course} <span className="st-muted">{FROM[r.course_from] || ""}</span></> : "—" },
              { h: "Result", render: (r) => { const [t, tone] = ROSTER_RESULT[r.status] || [r.status]; return <Chip tone={tone}>{t}</Chip>; } },
              { h: "Note", render: (r) => r.message },
            ]} />
            {result.truncated && <p className="st-muted">Only the first {result.rows.length} rows are shown; all of them were processed.</p>}
          </>
        )}
      </Card>

      {ready && list && (
        <Card title={`Roster · ${list.section.code}`} actions={
          <a href={svc.rosterCsvUrl(show === "all" ? "" : show, sectionId)} download className="st-link-reset"><Btn>Download CSV</Btn></a>
        }>
          <div className="st-flex st-mb">
            <StatCard label="On the list" value={list.total} /><StatCard label="Registered" value={list.registered} /><StatCard label="Not registered yet" value={list.waiting} />
          </div>
          <Row>
            <Field label="Show"><Select value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="all">All ({list.total})</option>
              <option value="registered">Registered ({list.registered})</option>
              <option value="waiting">Not registered yet ({list.waiting})</option>
            </Select></Field>
          </Row>
          <Table empty="No students to show here." rows={list.students.filter((s) => show === "all" || (show === "registered") === s.registered)} cols={[
            { h: "Student ID", render: (s) => s.student_id }, { h: "Course", render: (s) => s.course || "—" },
            { h: "Status", render: (s) => s.registered ? <Chip tone="good">Registered{s.name ? ` · ${s.name}` : ""}</Chip> : <Chip tone="warn">Waiting to register</Chip> },
            { h: "Email", render: (s) => s.email || "—" },
            { h: "Registered on", render: (s) => s.registered_at ? new Date(s.registered_at).toLocaleDateString() : "—" },
            { h: "", render: (s) => s.registered ? null : <Btn kind="danger" disabled={busy} onClick={() => remove(s.student_id)}>Remove</Btn> },
          ]} />
        </Card>
      )}
    </>
  );
}
