import React, { useEffect, useState } from "react";
import { Btn, Card, Chip, Notice, RefreshButton, Row, Table, useAction } from "./ui";
import useLoad from "../../hooks/useLoad";
import { usePopup } from "../../context/PopupContext";
import CachedImage from "../shared/CachedImage";
import { preloadPhotos, syncPhotoSet } from "../../utils/imageCache";

/** Pending self-registrations: look at the photo, then approve or reject. `svc` is the role's service. */
export default function RegistrationsPanel({ svc }) {
  const [photo, setPhoto] = useState(null);
  const { busy, msg, run } = useAction();
  const popup = usePopup();

  const [data, load, error, m] = useLoad(() => svc.registrations(), { interval: 20000 });
  const rows = data ? data.registrations : null;
  useEffect(() => {
    if (!data) return;
    // Warm the photo cache while the staff member reads the list, and forget photos no longer pending.
    const urls = data.registrations.filter((r) => r.photo_v).map((r) => svc.registrationPhotoUrl(r.id, r.photo_v));
    syncPhotoSet(urls); preloadPhotos(urls);
  }, [data, svc]);

  const approve = async (r) => { if (await run(() => svc.approveRegistration(r.id), `${r.name} approved.`)) load(); };
  const reject = async (r) => {
    const reason = await popup.prompt({
      title: `Reject ${r.name}?`,
      message: "Add a reason if you like. It is kept in the audit log.",
      placeholder: "Optional reason",
      okLabel: "Reject",
      danger: true,
    });
    if (reason === null) return; // cancelled
    if (await run(() => svc.rejectRegistration(r.id, reason || undefined), `${r.name} rejected.`)) load();
  };

  return (
    <Card title={`Waiting for approval (${rows?.length ?? "…"})`} actions={<RefreshButton onRefresh={load} loading={m.loading && !m.updatedAt} updatedAt={m.updatedAt} />}>
      <Notice msg={msg} />{error && <p role="alert" className="st-error">{m.stale ? "Couldn’t refresh just now. Showing the last data we loaded." : error}</p>}
      {photo && (
        <Row>
          <CachedImage src={svc.registrationPhotoUrl(photo.id, photo.photo_v)} alt={`Registration photo of ${photo.name}`} style={{ maxWidth: 220, maxHeight: 260, borderRadius: 8 }} fallback={<p className="st-muted">This photo isn't available right now.</p>} />
          <Btn onClick={() => setPhoto(null)}>Close photo</Btn>
        </Row>
      )}
      <Table empty="No registrations are waiting for approval." rows={rows} cols={[
        { h: "Student ID", render: (r) => r.student_id }, { h: "Name", render: (r) => r.name },
        { h: "Course", render: (r) => r.course }, { h: "Email", render: (r) => <>{r.email} {!r.email_verified && <Chip tone="warn">not verified</Chip>}</> },
        { h: "Photo", render: (r) => r.photo_v ? <Btn onClick={() => setPhoto(r)}>View</Btn> : <Chip tone="warn">no photo</Chip> },
        { h: "Decision", render: (r) => <Row><Btn kind="primary" disabled={busy} onClick={() => approve(r)}>Approve</Btn><Btn kind="danger" disabled={busy} onClick={() => reject(r)}>Reject</Btn></Row> },
      ]} />
    </Card>
  );
}
