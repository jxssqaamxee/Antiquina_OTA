/** "2026-2027" -> "SY 2026-2027 (OJT 2027)". A school year runs about August to July, so its OJT falls in the second year. */
export function yearLabel(name) {
  const m = /^(\d{4})-(\d{4})$/.exec(name || "");
  return m ? `SY ${name} (OJT ${m[2]})` : name || "";
}
