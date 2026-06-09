const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Split comma/semicolon/newline-separated addresses, trim, validate, dedupe (case-insensitive).
 */
export function parseRecipientEmails(
  raw: string
): { ok: true; emails: string[] } | { ok: false; error: string } {
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    return { ok: false, error: "At least one recipient email is required" };
  }
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const p of parts) {
    if (!EMAIL_REGEX.test(p)) {
      return { ok: false, error: `Invalid email address: ${p}` };
    }
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(p);
  }
  if (emails.length === 0) {
    return { ok: false, error: "At least one recipient email is required" };
  }
  return { ok: true, emails };
}
