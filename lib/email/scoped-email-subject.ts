const MAX_SUBJECT_LEN = 200;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Subject line that includes section(s) so bulk sends are easy to tell apart in the inbox. */
export function buildPrintTicketsEmailSubject(sectionSummary: string, eventTitle: string): string {
  const sec = truncate(sectionSummary || "Section", 70);
  const ev = truncate(eventTitle || "Event", 90);
  const raw = `Print tickets: ${sec} — ${ev}`;
  return raw.length > MAX_SUBJECT_LEN ? raw.slice(0, MAX_SUBJECT_LEN - 1) + "…" : raw;
}

/** Manual distribution / assignment ZIP or attachment sends. */
export function buildAssignedTicketsEmailSubject(sectionSummary: string, eventTitle: string): string {
  const sec = truncate(sectionSummary || "Section", 70);
  const ev = truncate(eventTitle || "Event", 90);
  const raw = `Tickets assigned: ${sec} — ${ev}`;
  return raw.length > MAX_SUBJECT_LEN ? raw.slice(0, MAX_SUBJECT_LEN - 1) + "…" : raw;
}
