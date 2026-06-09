/**
 * Client-side side effects when a reservation cart timer reaches zero.
 *
 * When the countdown ends we want a single source of truth across every surface that
 * watches the timer (book page, checkout page, global floating timer, other tabs):
 *
 *  - the server cart row is deleted (idempotent — the API treats a missing row as success),
 *  - `user_session_activity.has_active_cart` is flipped to `false` immediately so the
 *    inactivity sweeper / session telemetry see the cleared state without waiting for the
 *    next 60-second heartbeat,
 *  - other tabs / the global `FloatingCartTimer` are notified via the existing
 *    `wish-reservation` BroadcastChannel so they hide their UI right away.
 *
 * All requests are best-effort and never throw — callers stay focused on local cleanup.
 */
const RESERVATION_CHANNEL = "wish-reservation";

export async function notifyReservationExpired(
  cartId: string | null | undefined
): Promise<void> {
  if (typeof window === "undefined") return;

  // 1) Best-effort delete the server-side cart so seats are released even if the
  //    sweeper has not gotten to the expired row yet. The endpoint already accepts
  //    "missing" rows as success, so racing with the TTL purge is safe.
  if (cartId) {
    try {
      await fetch(`/api/reservations/${cartId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      /* best effort */
    }
  }

  // 2) Tell session telemetry we no longer hold an active cart so the row updates now,
  //    not on the next heartbeat tick. Marked as a heartbeat (not interaction) so it
  //    does not artificially refresh the user's last_activity_at.
  try {
    await fetch("/api/session/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        event: "heartbeat",
        hasActiveCart: false,
        inPaymongoFlow: false,
      }),
    });
  } catch {
    /* best effort */
  }

  // 3) Wake up other tabs / the floating timer so their UI clears immediately.
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const ch = new BroadcastChannel(RESERVATION_CHANNEL);
      ch.postMessage({ type: "expire", cartId: cartId ?? null });
      ch.close();
    } catch {
      /* best effort */
    }
  }
}
