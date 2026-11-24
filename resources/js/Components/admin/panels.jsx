import React, { useState } from "react";
import { Lock, Upload } from "lucide-react";
import { Btn, Card, Check, Chip, Field, Input, Notice, RefreshButton, Row, Select, Table, Tabs, Textarea, useAction } from "./ui";
import { StatCard } from "./AdminShell";
import useLoad from "../../hooks/useLoad";
import usePersistedState from "../../hooks/usePersistedState";
import { usePopup } from "../../context/PopupContext";

/** Hours report (verified = approved only). `filters` = optional extra controls for Admin; `svc` is the role's service. */
export function ReportsPanel({ svc, sections = [], courses = [], scope = "admin" }) {
  const [f, setF] = usePersistedState(`${scope}.reports`, { section_id: "", course_id: "" });
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const key = JSON.stringify(params);
  const [data, reload, error, m] = useLoad(() => svc.report(params), { interval: 60000, deps: [key] });
  const t = data?.totals;
  return (
    <>
      <Card title="Hours report" actions={<>
        <RefreshButton onRefresh={reload} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />
        <a href={svc.reportCsvUrl(params)} download className="st-link-reset"><Btn>Download CSV</Btn></a>
        <Btn onClick={() => window.print()}>Print / Save as PDF</Btn>
      </>}>
        {error && <p role="alert" className="st-error">{m.stale ? "Couldn’t refresh just now. Showing the last data we loaded." : error}</p>}
        {sections.length > 0 && (
          <Row>
            <Field label="Course"><Select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">All</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
            <Field label="Section"><Select value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })}><option value="">All</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</Select></Field>
          </Row>
        )}
        <div className="st-stat-grid">
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
export function AnnouncementsPanel({ svc, sections = [], courses = [], fixedSection = null, scope = "admin" }) {
  const { busy, msg, run } = useAction();
  const [f, setF] = usePersistedState(`${scope}.announcement`, { audience_type: fixedSection ? "section" : "all", course_id: "", section_id: fixedSection?.id || "", title: "", body: "" });
  const [list, load, , m] = useLoad(() => svc.announcements(), { interval: 60000 });
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
        <div className="st-grid st-compose">
          <Field label="Title"><Input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Message (max 500 characters)">
            <Textarea value={f.body} maxLength={500} rows={4} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </Field>
        </div>
        <div className="st-compose-foot">
          <p className="st-muted">Trainees see it in their notification bell. Sending cannot be undone. <span className="st-count">{f.body.length}/500</span></p>
          <Btn kind="primary" disabled={busy || f.title.trim().length < 3 || f.body.trim().length < 3 || (f.audience_type === "course" && !f.course_id) || (f.audience_type === "section" && !f.section_id)} onClick={send}>Send</Btn>
        </div>
      </Card>
      <Card title="Sent announcements" actions={<RefreshButton onRefresh={load} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />}>
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
  const [action, setAction] = useState("");
  const [rows, reload, error, m] = useLoad(() => svc.activityFiltered(action), { interval: 30000, deps: [action] });
  return (
    <Card title={title} actions={<RefreshButton onRefresh={reload} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />}>
      {error && <p role="alert" className="st-error">{m.stale ? "Couldn’t refresh just now. Showing the last data we loaded." : error}</p>}
      <Row>
        <Field label="Show" className="st-field-md"><Select value={action} onChange={(e) => setAction(e.target.value)}>
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
  invalid_id: ["Invalid ID", "bad"],
};
const FROM = { row: "from the file", heading: "from a heading above", assumed: "assumed (section course)", manual: "section course" };
const ID_FORMAT = /^\d{4}-\d-\d{5}$/;
const MAX_TYPED = 200;
const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Roster = the Student IDs (with their course) that may register. Two ways in:
 *   - Upload a file: it is read and checked first (preview); nothing is saved until the person confirms.
 *   - Type Student IDs: the course is never typed, it is always the section's own course.
 * `sections` is only given to Admin (picks a section); a Coordinator always works on their own section,
 * decided by the server.
 */
export function RosterPanel({ svc, sections = [], scope = "admin" }) {
  const popup = usePopup();
  const isAdmin = sections.length > 0;
  const [sectionId, setSectionId] = usePersistedState(`${scope}.roster.section`, "");
  const [mode, setMode] = usePersistedState(`${scope}.roster.mode`, "file");
  const [file, setFile] = useState(null);
  const [assume, setAssume] = usePersistedState(`${scope}.roster.assume`, false);
  const [typed, setTyped] = usePersistedState(`${scope}.roster.typed`, "");
  const [result, setResult] = useState(null);
  const [show, setShow] = usePersistedState(`${scope}.roster.show`, "all");
  const { busy, msg, run, setMsg } = useAction();
  const ready = !isAdmin || !!sectionId;

  const [loaded, load, error, m] = useLoad(() => svc.rosterList(sectionId || undefined), { interval: 60000, deps: [sectionId], enabled: ready });
  const list = ready ? loaded : null;

  const section = list?.section || sections.find((s) => String(s.id) === String(sectionId)) || null;
  const sectionCode = section?.code || "";
  const courseCode = section?.course || sectionCode.split("-")[0] || "";

  const tokens = typed.split(/[\s,;]+/).filter(Boolean);
  const validTyped = [...new Set(tokens.filter((t) => ID_FORMAT.test(t)))];
  const badTyped = tokens.filter((t) => !ID_FORMAT.test(t));

  const opts = (dryRun) => ({ dryRun, assumeCourse: assume, sectionId });
  const switchMode = (m) => { setMode(m); setResult(null); setMsg(null); };
  const check = async () => { const r = await run(() => svc.rosterImport(file, opts(true))); if (r) setResult(r); };
  const save = async () => {
    const r = await run(() => svc.rosterImport(file, opts(false)));
    if (!r) return;
    setResult(r); setFile(null); load();
    setMsg({ text: `Saved: ${r.counts.added} added, ${r.counts.updated} placed, ${r.counts.unchanged} already listed.` });
  };
  const addTyped = async () => {
    const r = await run(() => svc.rosterAdd(typed, sectionId || undefined));
    if (!r) return;
    setResult(r); load();
    setTyped(r.rows.filter((x) => !["added", "updated", "unchanged"].includes(x.status)).map((x) => x.student_id).join("\n")); // keep only what still needs fixing
    setMsg({ text: `Saved: ${r.counts.added} added, ${r.counts.unchanged} already listed${r.counts.rejected + r.counts.skipped ? `, ${r.counts.rejected + r.counts.skipped} need attention (see below)` : ""}.` });
  };
  const remove = async (id) => {
    const ok = await popup.confirm({
      title: "Remove from roster?",
      message: `Remove ${id} from the roster? They will no longer be able to register.`,
      okLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    if (await run(() => svc.rosterRemove(id, sectionId || undefined), "Removed.")) load();
  };

  const c = result?.counts;
  const importable = c ? c.added + c.updated : 0;
  return (
    <>
      <Card title="Add students to the roster">
        <p className="st-muted ro-intro">
          Only students on the roster can register, and only for {isAdmin ? "the section you choose" : "your section"}. Upload the class list, or type the Student IDs yourself.
        </p>

        <div className="ro-meta">
          {isAdmin && (
            <Field label="Section"><Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setResult(null); }}>
              <option value="">Choose a section…</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select></Field>
          )}
          {ready && sectionCode && (
            <>
              {!isAdmin && <div className="ro-fact"><span>Section</span><b>{sectionCode}</b></div>}
              <div className="ro-fact"><span>Course</span><b>{courseCode || "—"}</b></div>
            </>
          )}
        </div>

        <Tabs value={mode} onChange={switchMode} tabs={[["file", "Upload a file"], ["type", "Type Student IDs"]]} />
        <Notice msg={msg} />{error && <p role="alert" className="st-error">{error}</p>}

        {mode === "file" && (
          <div className="ro-pane">
            <p className="st-muted">
              Excel, Word, PDF (text), CSV, notes or any text file. Every Student ID (like 2021-2-04062) is read together with its course
              (like “CIT BSIT”). Only students whose course matches {courseCode ? <b>{courseCode}</b> : "the section"} are accepted.
            </p>
            <div className="ro-field">
              <span className="ro-label">Class list file</span>
              <label className={`ro-drop${file ? " has-file" : ""}`}>
                <input type="file" key={file ? "has" : "none"} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setMsg(null); }} />
                <span className="ro-drop-icon" aria-hidden="true"><Upload size={20} /></span>
                <span className="ro-drop-text">
                  {file ? <><b>{file.name}</b><small>{fileSize(file.size)} · click to choose a different file</small></>
                    : <><b>Choose a file</b><small>Excel, Word, PDF, CSV or text · up to 10 MB</small></>}
                </span>
              </label>
            </div>
            <label className="ro-option">
              <input type="checkbox" checked={assume} onChange={(e) => { setAssume(e.target.checked); setResult(null); }} />
              <span><b>My file has no course column</b><small>Use {courseCode ? `${courseCode}` : "the section’s course"} for every Student ID in it.</small></span>
            </label>
            <div className="ro-actions">
              <Btn kind="primary" disabled={busy || !file || !ready} onClick={check}>{busy ? "Checking…" : "Check file"}</Btn>
              {importable > 0 && <Btn kind="primary" disabled={busy} onClick={save}>{result.dry_run ? `Import ${importable} student${importable === 1 ? "" : "s"}` : "Import again"}</Btn>}
            </div>
          </div>
        )}

        {mode === "type" && (
          <div className="ro-pane">
            <p className="st-muted">Type or paste one or more Student IDs, separated by spaces, commas or new lines. They are added to {sectionCode ? <b>{sectionCode}</b> : "the section"} right away.</p>
            <div className="ro-field">
              <label className="ro-label" htmlFor="ro-ids">Student IDs</label>
              <Textarea id="ro-ids" rows={4} value={typed} placeholder={"2021-2-04062\n2021-2-04063, 2021-2-04064"} spellCheck={false} autoComplete="off"
                onChange={(e) => { setTyped(e.target.value); setResult(null); setMsg(null); }} />
              <small className={`ro-hint${badTyped.length ? " is-bad" : ""}`}>
                {!tokens.length ? `Format 2021-2-04062 · up to ${MAX_TYPED} at a time`
                  : <>{validTyped.length} valid ID{validTyped.length === 1 ? "" : "s"}{badTyped.length > 0 && <> · {badTyped.length} not in the format 2021-2-04062 (<code>{badTyped[0]}</code>{badTyped.length > 1 ? "…" : ""})</>}</>}
              </small>
            </div>
            <div className="ro-field">
              <span className="ro-label">Course</span>
              <div className="ro-locked"><Lock size={14} aria-hidden="true" /><b>{courseCode || "—"}</b><small>{isAdmin ? "set by the section you chose" : "set by your section"}, so it can’t be typed</small></div>
            </div>
            <div className="ro-actions">
              <Btn kind="primary" disabled={busy || !ready || !validTyped.length || tokens.length > MAX_TYPED} onClick={addTyped}>
                {busy ? "Adding…" : `Add ${validTyped.length || ""} student${validTyped.length === 1 ? "" : "s"}`.replace("  ", " ")}
              </Btn>
              {typed && <Btn disabled={busy} onClick={() => { setTyped(""); setResult(null); }}>Clear</Btn>}
            </div>
          </div>
        )}

        {result && (
          <>
            <h3 className="st-h3">{result.dry_run ? "Preview — nothing saved yet" : "Result"} · {result.file} → {result.section}</h3>
            <div className="st-stat-grid">
              <StatCard label={result.dry_run ? "Will be added" : "Added"} value={c.added} /><StatCard label="Placed" value={c.updated} />
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
        <Card title={`Roster · ${list.section.code}`} actions={<>
          <RefreshButton onRefresh={load} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />
          <a href={svc.rosterCsvUrl(show === "all" ? "" : show, sectionId)} download className="st-link-reset"><Btn>Download CSV</Btn></a>
        </>}>
          <div className="st-stat-grid">
            <StatCard label="On the list" value={list.total} /><StatCard label="Registered" value={list.registered} /><StatCard label="Not registered yet" value={list.waiting} />
          </div>
          <Row>
            <Field label="Show" className="st-field-md"><Select value={show} onChange={(e) => setShow(e.target.value)}>
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
