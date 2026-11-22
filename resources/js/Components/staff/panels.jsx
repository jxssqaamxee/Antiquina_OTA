import React, { useEffect, useState } from "react";
import { Btn, Card, Chip, Field, Input, Notice, Row, Select, Table, Textarea, useAction } from "./ui";
import { StatCard } from "./StaffShell";
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
