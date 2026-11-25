import React from "react";
import { Btn, Card, Chip, Table, statusTone } from "./ui";
import { StatCard } from "./AdminShell";
import CachedImage from "../shared/CachedImage";
import { initialsOf } from "../shared/AvatarPhoto";

const ROLE = { admin: "Administrator", coordinator: "Coordinator", trainee: "Trainee" };
const date = (v) => (v ? new Date(v).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—");
const dateTime = (v) => (v ? new Date(v).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const label = (s) => (s ? String(s).replace(/_/g, " ") : "—");
const ordinal = (n) => (n ? `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n] || "th"} year` : "—");

const Item = ({ k, children, wide }) => (
  <div className={`st-det-item${wide ? " is-wide" : ""}`}>
    <dt>{k}</dt>
    <dd>{children ?? "—"}</dd>
  </div>
);

/** Read-only details of ONE account for the Administrator (the "View" button on the Users screen). */
export default function UserDetails({ svc, user: u, onClose, onEdit }) {
  const trainee = u.role === "trainee";
  const coordinator = u.role === "coordinator";
  const h = u.hours;
  const percent = h && h.required > 0 ? Math.min(100, Math.round((h.verified / h.required) * 1000) / 10) : 0;

  return (
    <Card title={`Details · ${u.login_id || "user"}`} actions={<><Btn onClick={() => onEdit(u)}>Edit</Btn><Btn onClick={onClose}>Close</Btn></>}>
      <div className="st-det-head">
        <span className="st-det-avatar" aria-hidden="true">
          <CachedImage src={u.photo_v ? svc.userPhotoUrl(u.id, u.photo_v) : null} alt="" fallback={<b>{initialsOf(u)}</b>} />
        </span>
        <div className="st-det-who">
          <h3>{u.name}</h3>
          <p className="st-muted">{u.email}</p>
          <div className="st-det-chips">
            <Chip>{ROLE[u.role] || u.role}</Chip>
            <Chip tone={u.is_active ? "good" : "bad"}>{u.is_active ? "Active" : "Deactivated"}</Chip>
            {u.approval_status && u.approval_status !== "approved" && <Chip tone={u.approval_status === "pending" ? "warn" : "bad"}>{label(u.approval_status)}</Chip>}
            <Chip tone={u.email_verified ? "good" : "warn"}>{u.email_verified ? "Email verified" : "Email not verified"}</Chip>
            {u.two_factor !== null && <Chip tone={u.two_factor ? "good" : undefined}>{u.two_factor ? "2-step on" : "2-step off"}</Chip>}
          </div>
        </div>
      </div>

      <h4 className="st-det-h">Account</h4>
      <dl className="st-det-grid">
        <Item k={trainee ? "Student ID" : "Administrator ID"}>{u.login_id}</Item>
        <Item k="First name">{u.first_name}</Item>
        <Item k="Middle name">{u.middle_name}</Item>
        <Item k="Last name">{u.last_name}</Item>
        <Item k="Email" wide>{u.email}</Item>
        {trainee && <Item k="Course" wide>{u.course}</Item>}
        <Item k="Account created">{dateTime(u.created_at)}</Item>
        <Item k="Email verified on">{u.email_verified ? dateTime(u.email_verified_at) : "Not yet"}</Item>
        {!u.is_active && <Item k="Deactivated on">{dateTime(u.deactivated_at)}</Item>}
        {!trainee && <Item k="Must change password">{u.must_change_password ? "Yes (temporary password)" : "No"}</Item>}
      </dl>

      {trainee && (
        <>
          <h4 className="st-det-h">Current enrollment</h4>
          {u.enrollment ? (
            <dl className="st-det-grid">
              <Item k="Academic year">{u.enrollment.academic_year}</Item>
              <Item k="Course">{u.enrollment.course}</Item>
              <Item k="Section">{u.enrollment.section || "Not placed yet"}</Item>
              <Item k="Year level">{ordinal(u.enrollment.year_level)}</Item>
              <Item k="Status"><Chip tone={statusTone(u.enrollment.status)}>{label(u.enrollment.status)}</Chip></Item>
              <Item k="Since">{date(u.enrollment.started_at)}</Item>
            </dl>
          ) : <p className="st-empty">No current enrollment.</p>}

          {h && (
            <>
              <h4 className="st-det-h">Training hours <span className="st-muted">· {percent}% of the requirement</span></h4>
              <div className="st-stat-grid">
                <StatCard label="Required" value={h.required} /><StatCard label="Verified" value={h.verified} />
                <StatCard label="Pending review" value={h.pending} /><StatCard label="Draft / rejected" value={h.draft} />
              </div>
            </>
          )}

          <h4 className="st-det-h">Placement</h4>
          {u.placement ? (
            <dl className="st-det-grid">
              <Item k="Host establishment" wide>{u.placement.establishment}</Item>
              <Item k="Address" wide>{u.placement.address}</Item>
              <Item k="Supervisor">{u.placement.supervisor}</Item>
              <Item k="Duty days">{(u.placement.days || []).join(", ")}</Item>
              <Item k="Time">{u.placement.time_in && u.placement.time_out ? `${u.placement.time_in} – ${u.placement.time_out}` : "—"}</Item>
              <Item k="Starts on">{date(u.placement.starts_on)}</Item>
            </dl>
          ) : <p className="st-empty">Not placed in a host establishment.</p>}

          <h4 className="st-det-h">Enrollment history</h4>
          <Table searchable={false} toggle={false} empty="No enrollments yet." rows={u.enrollments} cols={[
            { h: "Academic year", render: (e) => e.academic_year || "—" },
            { h: "Section", render: (e) => e.section || "—" },
            { h: "Year level", render: (e) => ordinal(e.year_level) },
            { h: "Status", render: (e) => <Chip tone={statusTone(e.status)}>{label(e.status)}</Chip> },
            { h: "Started", render: (e) => date(e.started_at) },
            { h: "Ended", render: (e) => (e.is_open ? "Current" : date(e.ended_at)) },
          ]} />
        </>
      )}

      {coordinator && (
        <>
          <h4 className="st-det-h">Section assignment</h4>
          {u.assignment ? (
            <dl className="st-det-grid">
              <Item k="Section">{u.assignment.section}</Item>
              <Item k="Academic year">{u.assignment.academic_year}</Item>
              <Item k="Since">{date(u.assignment.started_at)}</Item>
            </dl>
          ) : <p className="st-empty">Not assigned to a section.</p>}
          <h4 className="st-det-h">Assignment history</h4>
          <Table searchable={false} toggle={false} empty="No assignments yet." rows={u.assignments} cols={[
            { h: "Section", render: (a) => a.section || "—" },
            { h: "Academic year", render: (a) => a.academic_year || "—" },
            { h: "Started", render: (a) => date(a.started_at) },
            { h: "Ended", render: (a) => (a.is_open ? "Current" : date(a.ended_at)) },
          ]} />
        </>
      )}
    </Card>
  );
}
