const EVENT_TIME_ZONE = "Asia/Manila";

function hasExplicitTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim());
}

/**
 * Parse an admin-entered datetime-local value as Philippines local time
 * when no timezone suffix is included.
 */
export function parseEventStartInput(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) return new Date(NaN);
  const normalized = hasExplicitTimeZone(trimmed) ? trimmed : `${trimmed}+08:00`;
  return new Date(normalized);
}

/**
 * Format an ISO timestamp into datetime-local value in Asia/Manila.
 */
export function toManilaDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Single line for tickets and emails — always Asia/Manila (matches admin event form). */
export function formatEventDateTimeLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
