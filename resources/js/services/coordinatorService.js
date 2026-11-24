import api from "../config/axiosConfig";

const d = (p) => p.then((r) => r.data);

const rosterForm = (file, { dryRun, assumeCourse, sectionId }) => {
  const f = new FormData();
  f.append("file", file);
  f.append("dry_run", dryRun ? "1" : "0");
  f.append("assume_course", assumeCourse ? "1" : "0");
  if (sectionId) f.append("section_id", sectionId);
  return f;
};

/** Coordinator API calls. The server limits every one of them to the Coordinator's own section. */
export const coordinatorService = {
  overview: () => d(api.get("/coordinator/overview")),
  live: () => d(api.get("/coordinator/live")),
  trainees: () => d(api.get("/coordinator/trainees")),
  trainee: (id) => d(api.get(`/coordinator/trainees/${id}`)),
  traineeEntries: (id) => d(api.get(`/coordinator/trainees/${id}/entries`)),
  approvals: () => d(api.get("/coordinator/approvals")),
  approve: (entryId, verified_hours) => d(api.post(`/coordinator/entries/${entryId}/approve`, verified_hours == null || verified_hours === "" ? {} : { verified_hours: Number(verified_hours) })),
  reject: (entryId, reason) => d(api.post(`/coordinator/entries/${entryId}/reject`, { reason })),
  establishments: () => d(api.get("/coordinator/establishments")),
  createEstablishment: (body) => d(api.post("/coordinator/establishments", body)),
  place: (traineeId, body) => d(api.post(`/coordinator/trainees/${traineeId}/placements`, body)),
  endPlacement: (id) => d(api.delete(`/coordinator/placements/${id}`)),
  rosterList: () => d(api.get("/coordinator/roster")),
  rosterImport: (file, { dryRun, assumeCourse }) => d(api.post("/coordinator/roster/import", rosterForm(file, { dryRun, assumeCourse }))),
  rosterAdd: (student_ids) => d(api.post("/coordinator/roster/add", { student_ids })),
  rosterCsvUrl: (status) => `/api/coordinator/roster.csv${status ? `?status=${status}` : ""}`,
  rosterRemove: (studentId) => d(api.delete(`/coordinator/roster/${studentId}`)),
  activity: () => d(api.get("/coordinator/activity")),
  activityFiltered: (action) => d(api.get("/coordinator/activity", { params: action ? { action } : {} })),
  report: (params) => d(api.get("/coordinator/reports/trainees", { params })),
  reportCsvUrl: (params) => `/api/coordinator/reports/trainees.csv${params && Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`,
  announcements: () => d(api.get("/coordinator/announcements")),
  publishAnnouncement: (body) => d(api.post("/coordinator/announcements", body)),
};
