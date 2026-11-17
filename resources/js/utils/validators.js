// ============================================================================
// Field formats + validators shared by every form (Login, Register, Profile,
// Logbook) so the rules live in one place and always match what the Laravel
// backend enforces (app/Support/Formats.php + app/Http/Requests/*).
// Same conventions as sclf_APP.
// ============================================================================

// School student IDs: YYYY-N-NNNNN (e.g. 2021-2-04062).
export const STUDENT_ID_REGEX = /^\d{4}-\d-\d{5}$/;

// Letters, spaces, hyphens and apostrophes only; must start with a letter.
export const NAME_REGEX = /^[\p{L}][\p{L}\s'-]*$/u;

// Institutional e-mail: occ.lastname.firstname@gmail.com (digits after the first name optional).
export const SCHOOL_EMAIL_REGEX = /^occ\.([a-z]+)\.([a-z]+)(\d{0,6})@gmail\.com$/;

// Any Gmail address (loose check, e.g. on the forgot-password form).
export const GMAIL_REGEX = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;

export const FORMAT_HINTS = {
  studentId: "Format: YYYY-N-NNNNN, e.g. 2021-2-04062.",
  email: "Format: occ.lastname.firstname@gmail.com (all lowercase). The lastname must match your Last name.",
  name: "Letters, spaces, hyphens and apostrophes only.",
  password: "At least 8 characters, with an uppercase letter, a lowercase letter and a number.",
};

export const FORMAT_ERRORS = {
  studentId: "Use the format YYYY-N-NNNNN, e.g. 2021-2-04062.",
  email: "Use the format occ.lastname.firstname@gmail.com.",
  gmail: "Use a Gmail address (name@gmail.com).",
  name: "Letters, spaces, hyphens and apostrophes only.",
  emailLastName: (lastName) => `The email must start with occ.${emailNameSegment(lastName) || "lastname"}. so it matches your Last name.`,
};

// "De la Cruz" -> "delacruz", "Peña-Reyes" -> "penareyes". Mirrors Formats::emailNameSegment().
export const emailNameSegment = (value) => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z]/g, "");

export const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Live "as you type" filters: a field simply cannot accept a character that
// could never be valid, instead of only complaining afterwards.
// ---------------------------------------------------------------------------
export const filterNameInput = (v) => String(v || "").replace(/[^\p{L}\s'-]/gu, "");

// Auto-formats as you type: 2021-2-04062 (digits only, dashes inserted for you).
export const filterStudentIdInput = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 10);
  let out = d.slice(0, 4);
  if (d.length > 4) out += `-${d.slice(4, 5)}`;
  if (d.length > 5) out += `-${d.slice(5, 10)}`;
  return out;
};

export const normalizeEmailInput = (v) => String(v || "").replace(/\s/g, "").toLowerCase();

// 6-digit email verification code: numbers only, nothing else can be typed or pasted in.
export const filterCodeInput = (v) => String(v || "").replace(/\D/g, "").slice(0, 6);

// Trainee name on the logbook header: letters, spaces, dots, hyphens and apostrophes only.
export const filterTraineeNameInput = (v) => String(v || "").replace(/[^\p{L}\s.'-]/gu, "");

// ---------------------------------------------------------------------------
// Validators: return { field: "message" } — empty object means valid.
// ---------------------------------------------------------------------------
export function passwordProblem(pw) {
  if (!pw) return "Password is required.";
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 100) return "Use at most 100 characters.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Include an uppercase and a lowercase letter.";
  if (!/\d/.test(pw)) return "Include at least one number.";
  return null;
}

function nameErrors(e, key, label, value, required) {
  const v = clean(value);
  if (!v) { if (required) e[key] = `${label} is required.`; return; }
  if (v.length > 80) e[key] = `${label} is too long (80 characters max).`;
  else if (!NAME_REGEX.test(v)) e[key] = FORMAT_ERRORS.name;
}

export function validateLogin(f) {
  const e = {};
  const sid = clean(f.student_id);
  if (!sid) e.student_id = "Student ID is required.";
  else if (!STUDENT_ID_REGEX.test(sid)) e.student_id = FORMAT_ERRORS.studentId;
  if (!f.password) e.password = "Password is required.";
  return e;
}

export function validateRegister(f) {
  const e = {};
  const sid = clean(f.student_id);
  if (!sid) e.student_id = "Student ID is required.";
  else if (!STUDENT_ID_REGEX.test(sid)) e.student_id = FORMAT_ERRORS.studentId;

  nameErrors(e, "first_name", "First name", f.first_name, true);
  nameErrors(e, "middle_name", "Middle name", f.middle_name, false);
  nameErrors(e, "last_name", "Last name", f.last_name, true);

  const email = normalizeEmailInput(f.email);
  if (!email) e.email = "Gmail address is required.";
  else if (!SCHOOL_EMAIL_REGEX.test(email)) e.email = FORMAT_ERRORS.email;
  else if (!e.last_name && SCHOOL_EMAIL_REGEX.exec(email)[1] !== emailNameSegment(f.last_name)) e.email = FORMAT_ERRORS.emailLastName(f.last_name);

  if (!f.course) e.course = "Please choose your course.";

  const p = passwordProblem(f.password);
  if (p) e.password = p;
  if (!f.password_confirmation) e.password_confirmation = "Please confirm your password.";
  else if (f.password !== f.password_confirmation) e.password_confirmation = "Passwords do not match.";
  return e;
}

export function validateProfile(f) {
  const e = {};
  nameErrors(e, "first_name", "First name", f.first_name, true);
  nameErrors(e, "middle_name", "Middle name", f.middle_name, false);
  nameErrors(e, "last_name", "Last name", f.last_name, true);
  if (!f.course) e.course = "Please choose your course.";
  return e;
}

export function validatePasswordChange(pw) {
  const e = {};
  if (!pw.current_password) e.current_password = "Enter your current password.";
  const p = passwordProblem(pw.password);
  if (p) e.password = p;
  else if (pw.password === pw.current_password) e.password = "Your new password must be different from your current one.";
  if (!pw.password_confirmation) e.password_confirmation = "Please confirm your new password.";
  else if (pw.password !== pw.password_confirmation) e.password_confirmation = "Passwords do not match.";
  return e;
}

/** The 6-digit email verification code. */
export function codeProblem(code) {
  if (!code) return "Enter the 6-digit code from your email.";
  if (!/^\d{6}$/.test(code)) return "The code is 6 digits, numbers only.";
  return null;
}

// ---- Logbook ---------------------------------------------------------------
export const MAX_TARGET_HOURS = 2000;
export const CLIENT_NAME_MAX = 80;

/** Trainee name on the logbook header: required, letters only. */
export function traineeNameProblem(name) {
  const v = clean(name);
  if (!v) return "Trainee name is required.";
  if (v.length > 80) return "Trainee name is too long (80 characters max).";
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(v)) return "Trainee name can only contain letters, spaces, dots, hyphens and apostrophes.";
  return null;
}

/** Required hours: a whole number from 1 to MAX_TARGET_HOURS. */
export function targetHoursProblem(value) {
  const n = Number(value);
  if (!String(value).trim()) return "Required hours is required.";
  if (!Number.isInteger(n) || n < 1) return "Required hours must be at least 1.";
  if (n > MAX_TARGET_HOURS) return `Required hours can't be more than ${MAX_TARGET_HOURS}.`;
  return null;
}

/**
 * Host client form: name required (and unique), at least one working day,
 * and the time-out must be after the time-in. Times are "HH:MM" 24-hour strings.
 */
export function clientProblem({ name, days, timeIn, timeOut, existingNames = [] }) {
  const v = clean(name);
  if (!v) return "Host client name is required.";
  if (v.length > CLIENT_NAME_MAX) return `Host client name is too long (${CLIENT_NAME_MAX} characters max).`;
  if (existingNames.some((n) => clean(n).toLowerCase() === v.toLowerCase())) return `"${v}" is already in your host clients.`;
  if (!days || !days.length) return "Pick at least one working day for this host client.";
  if (!timeIn || !timeOut) return "Set both a time in and a time out.";
  if (timeOut <= timeIn) return "Time out must be later than time in.";
  return null;
}

/** Focus the first invalid field (ids in `order`), so the keyboard opens right on the problem. */
export function focusFirstInvalid(errors, order) {
  const id = order.find((k) => errors[k]);
  if (id && typeof document !== "undefined") document.getElementById(id)?.focus();
}
