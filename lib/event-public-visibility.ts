const EVENT_TIME_ZONE = "Asia/Manila";

export type EventCardCountdownDisplay = "hidden" | "countdown" | "in_progress";

export type EventCountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function manilaDatePartsFromMs(nowMs: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return dateKeyFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/** YYYY-MM-DD in Asia/Manila for an ISO timestamp. */
export function getManilaCalendarDate(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const { year, month, day } = manilaDatePartsFromMs(ms);
  return dateKeyFromParts(year, month, day);
}

/** Last Manila calendar day the event stays on public listings (event date + 1 day). */
export function getEventPublicListVisibleUntilDate(eventStart: string): string {
  const eventDate = getManilaCalendarDate(eventStart);
  if (!eventDate) return "";
  return addCalendarDays(eventDate, 1);
}

/** Today's date key in Asia/Manila (for server listing filters). */
export function getTodayManilaDateKey(nowMs: number = Date.now()): string {
  const { year, month, day } = manilaDatePartsFromMs(nowMs);
  return dateKeyFromParts(year, month, day);
}

export function isEventPubliclyListed(eventStart: string, nowMs: number = Date.now()): boolean {
  const visibleUntil = getEventPublicListVisibleUntilDate(eventStart);
  if (!visibleUntil) return false;
  const today = getTodayManilaDateKey(nowMs);
  return today <= visibleUntil;
}

export function isEventInProgress(eventStart: string, nowMs: number = Date.now()): boolean {
  const eventTime = new Date(eventStart).getTime();
  if (Number.isNaN(eventTime)) return false;
  return eventTime <= nowMs && isEventPubliclyListed(eventStart, nowMs);
}

export function getEventCardCountdownDisplay(
  eventStart: string,
  scheduleTba: boolean | null | undefined,
  nowMs: number = Date.now()
): EventCardCountdownDisplay {
  if (scheduleTba) return "hidden";
  const eventTime = new Date(eventStart).getTime();
  if (Number.isNaN(eventTime)) return "hidden";
  if (!isEventPubliclyListed(eventStart, nowMs)) return "hidden";
  if (eventTime <= nowMs) return "in_progress";
  return "countdown";
}

/** Parts for compact countdown to event start. Returns null when not in countdown phase. */
export function getEventCountdownParts(iso: string, nowMs: number): EventCountdownParts | null {
  const eventTime = new Date(iso).getTime();
  if (Number.isNaN(eventTime)) return null;

  const diffMs = eventTime - nowMs;
  if (diffMs <= 0) return null;

  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}
