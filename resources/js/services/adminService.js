import api from "../config/axiosConfig";

const d = (p) => p.then((r) => r.data);

/** Admin API calls (all closed to other roles by Laravel). */
export const adminService = {
  overview: (params) => d(api.get("/admin/overview", { params })),
  live: () => d(api.get("/admin/live")),
  courses: () => d(api.get("/admin/courses")),
  years: () => d(api.get("/admin/academic-years")),
  createYear: (name, is_current) => d(api.post("/admin/academic-years", { name, is_current })),
  makeYearCurrent: (id) => d(api.post(`/admin/academic-years/${id}/make-current`)),
  sections: (params) => d(api.get("/admin/sections", { params })),
  createSections: (body) => d(api.post("/admin/sections", body)),
  section: (id) => d(api.get(`/admin/sections/${id}`)),
  enrollments: (params) => d(api.get("/admin/enrollments", { params })),
  unassigned: () => d(api.get("/admin/enrollments/unassigned")),
  assignSection: (enrollmentId, section_id) => d(api.post(`/admin/enrollments/${enrollmentId}/assign-section`, { section_id })),
  transfer: (enrollmentId, section_id, reason) => d(api.post(`/admin/enrollments/${enrollmentId}/transfer`, { section_id, reason })),
  prepareProgression: (yearId) => d(api.get(`/admin/academic-years/${yearId}/progression/prepare`)),
  confirmProgression: (yearId, items) => d(api.post(`/admin/academic-years/${yearId}/progression/confirm`, { items })),
  users: (params) => d(api.get("/admin/users", { params })),
  user: (id) => d(api.get(`/admin/users/${id}`)),
  traineeTimetable: (id, week) => d(api.get(`/admin/trainees/${id}/timetable`, { params: week ? { week } : {} })),
  userPhotoUrl: (id, v) => `/api/admin/users/${id}/photo${v ? `?v=${encodeURIComponent(v)}` : ""}`, // v = photo version (a new picture is a new address)
  updateUser: (id, body) => d(api.put(`/admin/users/${id}`, body)),
  coordinators: () => d(api.get("/admin/coordinators")),
  createCoordinator: (body) => d(api.post("/admin/coordinators", body)),
  assignCoordinator: (id, section_id) => d(api.post(`/admin/coordinators/${id}/assign-section`, { section_id })),
  unassignCoordinator: (id) => d(api.delete(`/admin/coordinators/${id}/assignment`)),
  traineeHours: (userId) => d(api.get(`/admin/trainees/${userId}/hours`)),
  setHourException: (userId, hours, reason) => d(api.post(`/admin/trainees/${userId}/hour-exception`, { hours, reason })),
  establishments: () => d(api.get("/admin/establishments")),
  createEstablishment: (body) => d(api.post("/admin/establishments", body)),
  rosterList: (section_id) => d(api.get("/admin/roster", { params: { section_id } })),
  rosterImport: (file, { dryRun, assumeCourse, sectionId }) => {
    const f = new FormData();
    f.append("file", file); f.append("dry_run", dryRun ? "1" : "0"); f.append("assume_course", assumeCourse ? "1" : "0"); f.append("section_id", sectionId);
    return d(api.post("/admin/roster/import", f));
  },
  rosterAdd: (student_ids, section_id) => d(api.post("/admin/roster/add", { student_ids, section_id })),
  rosterCsvUrl: (status, section_id) => `/api/admin/roster.csv?${new URLSearchParams({ section_id, ...(status ? { status } : {}) })}`,
  rosterRemove: (studentId, section_id) => d(api.delete(`/admin/roster/${studentId}`, { params: { section_id } })),
  activity: () => d(api.get("/admin/activity")),
  activityFiltered: (action) => d(api.get("/admin/activity", { params: action ? { action } : {} })),
  report: (params) => d(api.get("/admin/reports/trainees", { params })),
  reportCsvUrl: (params) => `/api/admin/reports/trainees.csv${params && Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`,
  // Pending self-registrations (the server limits a coordinator to their own section).
  registrations: () => d(api.get("/admin/registrations")),
  approveRegistration: (id) => d(api.post(`/admin/registrations/${id}/approve`)),
  rejectRegistration: (id, reason) => d(api.post(`/admin/registrations/${id}/reject`, { reason })),
  registrationPhotoUrl: (id, v) => `/api/admin/registrations/${id}/photo${v ? `?v=${encodeURIComponent(v)}` : ""}`, // v = photo version: a new picture is a new address, so the cache never shows an old one
  announcements: () => d(api.get("/admin/announcements")),
  publishAnnouncement: (body) => d(api.post("/admin/announcements", body)),
};
