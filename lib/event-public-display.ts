import { formatEventDate, formatEventTime } from "@/lib/event-datetime";

/** Copy shown on cards and event pages when venue or schedule is marked TBA. */
export const EVENT_PUBLIC_TBA_COPY = "To be announced";

export type EventScheduleDisplayInput = {
  event_start: string;
  schedule_to_be_announced?: boolean | null;
};

export function eventScheduleDisplayLine(event: EventScheduleDisplayInput): string {
  if (event.schedule_to_be_announced) return EVENT_PUBLIC_TBA_COPY;
  return `${formatEventDate(event.event_start)} · ${formatEventTime(event.event_start)}`;
}

export type EventVenueDisplayInput = {
  venue_to_be_announced?: boolean | null;
  venue?: { name?: string | null } | null;
};

export function eventVenueDisplayName(event: EventVenueDisplayInput): string {
  if (event.venue_to_be_announced) return EVENT_PUBLIC_TBA_COPY;
  const n = event.venue?.name?.trim();
  if (n) return n;
  return EVENT_PUBLIC_TBA_COPY;
}
