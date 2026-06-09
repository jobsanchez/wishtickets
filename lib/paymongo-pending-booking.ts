/** Pending unpaid PayMongo booking — reservation cart may already be consumed after first checkout. */
export const WISH_PENDING_PAYMONGO_BOOKING_KEY = "wish_pending_paymongo_booking_v1";

type PendingPaymongoBookingShape = {
  eventId?: string;
  bookingId?: string;
};

export function readPendingPaymongoBooking(eventId: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WISH_PENDING_PAYMONGO_BOOKING_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as PendingPaymongoBookingShape;
    if (o.eventId === eventId && typeof o.bookingId === "string" && o.bookingId.length > 0) {
      return o.bookingId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writePendingPaymongoBooking(eventId: string, bookingId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    WISH_PENDING_PAYMONGO_BOOKING_KEY,
    JSON.stringify({ eventId, bookingId })
  );
}

export function clearPendingPaymongoBooking() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(WISH_PENDING_PAYMONGO_BOOKING_KEY);
}

export function clearPendingPaymongoBookingIfMatches(bookingId: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(WISH_PENDING_PAYMONGO_BOOKING_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PendingPaymongoBookingShape;
    if (parsed.bookingId === bookingId) {
      sessionStorage.removeItem(WISH_PENDING_PAYMONGO_BOOKING_KEY);
    }
  } catch {
    /* ignore malformed values */
  }
}

export function hasPendingPaymongoBooking(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(WISH_PENDING_PAYMONGO_BOOKING_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as PendingPaymongoBookingShape;
    return typeof parsed.bookingId === "string" && parsed.bookingId.length > 0;
  } catch {
    return false;
  }
}
