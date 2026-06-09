"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { ChevronRight, Unlock } from "lucide-react";
import { useState } from "react";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Seat {
  id: string;
  row_label: string | null;
  seat_number: string | null;
}

interface Section {
  id: string;
  name: string;
  section_code: string | null;
  seats: Seat[];
}

interface ReservedSeatsResponse {
  sections: Section[];
  active_cart_holds?: CartHold[];
  pending_booking_holds?: PendingBookingHold[];
}

interface CartHold {
  hold_source?: "active_cart_hold";
  reservation_item_id: string;
  cart_id: string;
  seat_id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  section_name: string;
  expires_at: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
}

interface PendingBookingHold {
  hold_source?: "pending_booking";
  ticket_id: string;
  booking_id: string;
  paymongo_reference?: string | null;
  paymongo_id?: string | null;
  seat_id: string | null;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  section_name: string;
  expires_at: string | null;
  payment_status: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  created_at: string | null;
}

interface ReservedSeatsTabProps {
  eventId: string;
}

function formatSeatLabel(seat: Seat): string {
  const row = seat.row_label ?? "";
  const num = seat.seat_number ?? "";
  if (row && num) return `${row}${num}`;
  if (row) return row;
  if (num) return num;
  return seat.id.slice(0, 8);
}

export function ReservedSeatsTab({ eventId }: ReservedSeatsTabProps) {
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState<Set<string>>(new Set());
  const [confirmHold, setConfirmHold] = useState<CartHold | null>(null);

  const { data, isLoading, error } = useQuery<ReservedSeatsResponse>({
    queryKey: ["reserved-seats", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats`);
      if (!res.ok) throw new Error("Failed to load reserved seats");
      return res.json();
    },
  });

  async function releaseSeat(seatId: string) {
    setReleasing((prev) => new Set(prev).add(seatId));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_id: seatId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to release");
      toast.success("Seat released");
      queryClient.invalidateQueries({ queryKey: ["reserved-seats", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release");
    } finally {
      setReleasing((prev) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }
  }

  async function releaseSection(sectionId: string) {
    const key = `section-${sectionId}`;
    setReleasing((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sectionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to release");
      toast.success(`Released ${json.released ?? 0} seat(s) in section`);
      queryClient.invalidateQueries({ queryKey: ["reserved-seats", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release");
    } finally {
      setReleasing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function releasePendingBooking(bookingId: string) {
    const key = `pending-booking-${bookingId}`;
    setReleasing((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to release pending booking hold");
      toast.success("Pending booking hold released");
      queryClient.invalidateQueries({ queryKey: ["reserved-seats", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release pending booking hold");
    } finally {
      setReleasing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function markPendingBookingSold(bookingId: string) {
    const key = `mark-sold-${bookingId}`;
    setReleasing((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_sold_booking_id: bookingId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to mark pending booking as sold");
      toast.success("Pending booking marked as sold");
      queryClient.invalidateQueries({ queryKey: ["reserved-seats", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark pending booking as sold");
    } finally {
      setReleasing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function releaseAllPendingBookingHolds() {
    const key = "all-pending-bookings";
    setReleasing((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_all_pending_bookings: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to release all pending booking holds");
      toast.success(`Released ${json.released ?? 0} pending booking hold(s)`);
      queryClient.invalidateQueries({ queryKey: ["reserved-seats", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release all pending booking holds");
    } finally {
      setReleasing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const isReleasing = releasing.size > 0;

  if (isLoading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading reserved seats…"
        subtitle="Cart holds and blocked seats for this event."
      />
    );
  }

  if (error) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-red-400">
        {error instanceof Error ? error.message : "Failed to load reserved seats"}
      </div>
    );
  }

  const sections = data?.sections ?? [];
  const totalSeats = sections.reduce((sum, s) => sum + s.seats.length, 0);
  const activeCartHolds = data?.active_cart_holds ?? [];
  const pendingBookingHolds = data?.pending_booking_holds ?? [];

  if (
    totalSeats === 0 &&
    activeCartHolds.length === 0 &&
    pendingBookingHolds.length === 0
  ) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-foreground-muted">
        No reserved seats, active cart holds, or pending booking holds for this event.
      </div>
    );
  }

  async function releaseCartHold(hold: CartHold) {
    const key = `hold-${hold.reservation_item_id}`;
    setReleasing((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reserved-seats/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_item_id: hold.reservation_item_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to release cart hold");
      toast.success("Cart hold released");
      queryClient.invalidateQueries({ queryKey: ["reserved-seats", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release cart hold");
      throw e;
    } finally {
      setReleasing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div>
      <FloatingProgressBar
        active={isReleasing}
        message="Releasing holds"
        subtitle="Reserved seats"
        detail="Clearing cart holds, booking holds, or admin reservations on the server."
      />
      <h2 className="text-lg font-semibold text-foreground mb-4">Reserved Seats</h2>
      <p className="text-foreground-muted text-sm mb-6">
        Release admin-reserved seats to make them available for purchase.
      </p>
      <div className="space-y-3">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
          <h3 className="text-base font-semibold text-foreground mb-1">Active Cart Holds</h3>
          <p className="text-foreground-muted text-sm mb-3">
            Temporary seat holds from active customer carts.
          </p>
          {activeCartHolds.length === 0 ? (
            <p className="text-sm text-foreground-muted">No active cart holds.</p>
          ) : (
            <div className="space-y-2">
              {activeCartHolds.map((hold) => {
                const seatLabel =
                  hold.row_label || hold.seat_number
                    ? `${hold.row_label ?? ""}${hold.seat_number ?? ""}`.trim()
                    : hold.seat_id.slice(0, 8);
                return (
                  <div
                    key={hold.reservation_item_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {hold.section_name} • {seatLabel}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Owner: {hold.owner_name ?? "Unknown"}{hold.owner_email ? ` (${hold.owner_email})` : ""}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Expires:{" "}
                        {hold.expires_at
                          ? new Date(hold.expires_at).toLocaleString("en-PH")
                          : "—"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmHold(hold)}
                      disabled={isReleasing}
                    >
                      Release
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
          <h3 className="text-base font-semibold text-foreground mb-1">Pending Booking Holds</h3>
          <p className="text-foreground-muted text-sm mb-3">
            Seats blocked by checkout sessions with pending payment.
          </p>
          {pendingBookingHolds.length === 0 ? (
            <p className="text-sm text-foreground-muted">No pending booking holds.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={releaseAllPendingBookingHolds}
                  disabled={isReleasing}
                >
                  Release all pending holds
                </Button>
              </div>
              {pendingBookingHolds.map((hold) => {
                const seatLabel =
                  hold.row_label || hold.seat_number
                    ? `${hold.row_label ?? ""}${hold.seat_number ?? ""}`.trim()
                    : hold.seat_id
                      ? hold.seat_id.slice(0, 8)
                      : hold.ticket_id.slice(0, 8);
                return (
                  <div
                    key={hold.ticket_id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-foreground">
                        {hold.section_name} • {seatLabel}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Source: Pending booking • Ref: {hold.paymongo_reference ?? hold.booking_id}
                      </p>
                      {!!hold.paymongo_id && (
                        <p className="text-xs text-foreground-muted">
                          PayMongo ID: {hold.paymongo_id}
                        </p>
                      )}
                      <p className="text-xs text-foreground-muted break-all">
                        Booking ID: {hold.booking_id}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Owner: {hold.owner_name ?? "Unknown"}
                        {hold.owner_email ? ` (${hold.owner_email})` : ""}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Payment status: {hold.payment_status ?? "pending"}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Payment expires:{" "}
                        {hold.expires_at
                          ? new Date(hold.expires_at).toLocaleString("en-PH")
                          : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markPendingBookingSold(hold.booking_id)}
                        disabled={isReleasing}
                      >
                        Mark sold
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => releasePendingBooking(hold.booking_id)}
                        disabled={isReleasing}
                      >
                        Release
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {sections.map((section) => (
          <details
            key={section.id}
            className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden group"
          >
            <summary className="flex items-center justify-between gap-4 cursor-pointer p-4 hover:bg-white/5 transition-colors list-none">
              <span className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-foreground-muted group-open:rotate-90 transition-transform" />
                <span className="font-medium text-foreground">
                  {section.name}
                </span>
                <span className="text-foreground-muted text-sm">
                  ({section.seats.length} seat{section.seats.length !== 1 ? "s" : ""})
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  releaseSection(section.id);
                }}
                disabled={isReleasing}
              >
                <Unlock className="h-3.5 w-3.5 mr-1.5" />
                Release all in section
              </Button>
            </summary>
            <div className="border-t border-[var(--glass-border)] p-4 pt-3">
              <div className="flex flex-wrap gap-2">
                {section.seats.map((seat) => (
                  <div
                    key={seat.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      {formatSeatLabel(seat)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-[var(--wish-orange)] hover:text-[var(--wish-orange)]"
                      onClick={() => releaseSeat(seat.id)}
                      disabled={isReleasing}
                    >
                      Release
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmHold}
        onOpenChange={(open) => {
          if (!open) setConfirmHold(null);
        }}
        title="Release cart-held seat?"
        description={
          confirmHold
            ? `This will remove the active hold for ${confirmHold.section_name} ${
                (confirmHold.row_label ?? "") + (confirmHold.seat_number ?? "")
              } from the customer cart.`
            : "This will remove the active hold from the customer cart."
        }
        confirmLabel="Release seat"
        variant="destructive"
        onConfirm={async () => {
          if (!confirmHold) return;
          await releaseCartHold(confirmHold);
          setConfirmHold(null);
        }}
      />
    </div>
  );
}
