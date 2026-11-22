import api from "../config/axiosConfig";

const d = (p) => p.then((r) => r.data);

/** Coordinator API calls. The server limits every one of them to the Coordinator's own section. */
export const coordinatorService = {
  overview: () => d(api.get("/coordinator/overview")),
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
  activity: () => d(api.get("/coordinator/activity")),
  activityFiltered: (action) => d(api.get("/coordinator/activity", { params: action ? { action } : {} })),
  report: (params) => d(api.get("/coordinator/reports/trainees", { params })),
  reportCsvUrl: (params) => `/api/coordinator/reports/trainees.csv${params && Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`,
  announcements: () => d(api.get("/coordinator/announcements")),
  publishAnnouncement: (body) => d(api.post("/coordinator/announcements", body)),
};
