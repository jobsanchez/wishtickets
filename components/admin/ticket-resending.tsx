"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { toast } from "@/lib/toast";
import { specialRequestTypeLabel } from "@/lib/special-request";

interface TicketSummary {
  id: string;
  sectionName: string;
  seatLabel: string;
}

interface BookingSummary {
  id: string;
  eventTitle: string;
  eventStart: string;
  bookingCreated: string;
  buyerName: string;
  buyerEmail: string;
  totalTickets: number;
  specialRequestType: string;
  specialRequestDetails: string | null;
  tickets: TicketSummary[];
}

interface SearchResponse {
  bookings: BookingSummary[];
}

function SpecialRequestLine({ b }: { b: BookingSummary }) {
  if (!b.specialRequestType || b.specialRequestType === "none") return null;
  return (
    <p className="text-xs text-amber-200/80 mt-0.5 max-w-prose">
      <span className="font-medium text-foreground">Special request: </span>
      {specialRequestTypeLabel(b.specialRequestType)}
      {b.specialRequestDetails?.trim() ? (
        <span className="text-foreground-muted"> — {b.specialRequestDetails.trim()}</span>
      ) : null}
    </p>
  );
}

export function TicketResending() {
  const [emailQuery, setEmailQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [resendingBookingId, setResendingBookingId] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogText, setSuccessDialogText] = useState<string>("");

  const MIN_SEARCH_LENGTH = 3;
  const hasSearch = useMemo(
    () =>
      emailQuery.trim().length >= MIN_SEARCH_LENGTH ||
      nameQuery.trim().length >= MIN_SEARCH_LENGTH,
    [emailQuery, nameQuery]
  );

  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) {
      if (!map.has(b.eventTitle)) {
        map.set(b.eventTitle, b.eventTitle);
      }
    }
    return Array.from(map.values());
  }, [bookings]);

  const visibleBookings = useMemo(() => {
    if (eventFilter === "all") return bookings;
    return bookings.filter((b) => b.eventTitle === eventFilter);
  }, [bookings, eventFilter]);

  const { upcomingBookings, lapsedBookings } = useMemo(() => {
    const upcoming: BookingSummary[] = [];
    const lapsed: BookingSummary[] = [];
    const now = new Date();
    for (const b of visibleBookings) {
      const dt = new Date(b.eventStart);
      if (!isNaN(dt.getTime()) && dt >= now) {
        upcoming.push(b);
      } else {
        lapsed.push(b);
      }
    }
    return { upcomingBookings: upcoming, lapsedBookings: lapsed };
  }, [visibleBookings]);

  async function runSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!hasSearch) {
      setBookings([]);
      setHasSearched(true);
      setEventFilter("all");
      if (emailQuery.trim().length > 0 || nameQuery.trim().length > 0) {
        toast.error(`Enter at least ${MIN_SEARCH_LENGTH} characters in email or buyer name`);
      }
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (emailQuery.trim()) params.set("email", emailQuery.trim());
      if (nameQuery.trim()) params.set("name", nameQuery.trim());
      const res = await fetch(`/api/admin/bookings/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to search bookings");
      }
      const data = (await res.json()) as SearchResponse;
      setBookings(data.bookings ?? []);
      setEventFilter("all");
    } catch (err) {
      setBookings([]);
      toast.error(err instanceof Error ? err.message : "Failed to search bookings");
    } finally {
      setLoading(false);
    }
  }

  function openResendDialog(booking: BookingSummary) {
    setResendingBookingId(booking.id);
    setResendEmail(booking.buyerEmail ?? "");
    setDialogOpen(true);
  }

  async function handleConfirmResend() {
    const email = resendEmail.trim();
    if (!email) {
      toast.error("Destination email is required.");
      return;
    }
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!resendingBookingId) return;

    setResendSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/bookings/${encodeURIComponent(resendingBookingId)}/resend-tickets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to resend tickets");
      }
      setDialogOpen(false);
      setSuccessDialogText(
        `Ticket email has been resent to ${email}. Ask the buyer to check their inbox (and spam folder).`
      );
      setSuccessDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend tickets");
    } finally {
      setResendSubmitting(false);
    }
  }

  const resendProgress = useMemo(() => {
    if (resendSubmitting) {
      return {
        message: "Resending tickets",
        subtitle: "Ticket resending",
        detail: "Sending ticket images to the verified email address.",
      };
    }
    if (loading) {
      return {
        message: "Loading bookings",
        subtitle: "Ticket resending",
        detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
      };
    }
    return {
      message: "Working…",
      subtitle: "Ticket resending",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [loading, resendSubmitting]);

  return (
    <div className="space-y-6">
      <FloatingProgressBar
        active={loading || resendSubmitting}
        message={resendProgress.message}
        subtitle={resendProgress.subtitle}
        detail={resendProgress.detail}
      />
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Ticket Resending</h1>
        <p className="text-base text-foreground-muted max-w-2xl">
          Search confirmed bookings by buyer email or name, inspect their tickets, and resend
          all tickets in a booking to a verified email address.
        </p>
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] p-5 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Search bookings</h2>
        <form className="space-y-4" onSubmit={runSearch}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Email / buyer filter
              </label>
              <Input
                value={emailQuery}
                onChange={(e) => setEmailQuery(e.target.value)}
                placeholder="buyer@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Buyer name
              </label>
              <Input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Full name"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-foreground-muted">
              Results show only bookings with status <span className="font-semibold">confirmed</span>.
            </p>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </Button>
          </div>
        </form>
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Results</h2>
          {eventOptions.length > 1 && visibleBookings.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-foreground-muted">Filter by event:</span>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="h-9 rounded-md border border-[var(--glass-border)] bg-black/20 px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <option value="all">All events</option>
                {eventOptions.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!hasSearched && (
          <p className="text-sm text-foreground-muted">
            Enter an email or buyer name, then click Search to find confirmed bookings.
          </p>
        )}
        {hasSearched && hasSearch && !loading && bookings.length === 0 && (
          <p className="text-sm text-foreground-muted">No confirmed bookings matched your search.</p>
        )}
        {visibleBookings.length > 0 && (
          <div className="space-y-6">
            {upcomingBookings.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Upcoming events</p>
                <div className="space-y-4">
                  {upcomingBookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-foreground">
                            {b.eventTitle}
                          </p>
                          <p className="text-xs text-foreground-muted" suppressHydrationWarning>
                            Event: {b.eventStart}
                          </p>
                          <p className="text-xs text-foreground-muted" suppressHydrationWarning>
                            Booked at: {b.bookingCreated}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            Booking ID: <span className="font-mono">{b.id}</span>
                          </p>
                          <SpecialRequestLine b={b} />
                        </div>
                        <div className="text-right space-y-0.5">
                          <p className="text-sm text-foreground">
                            {b.buyerName || "Unknown buyer"}
                          </p>
                          <p className="text-xs text-foreground-muted">{b.buyerEmail}</p>
                          <p className="text-xs text-foreground-muted">
                            Tickets: <span className="font-semibold">{b.totalTickets}</span>
                          </p>
                        </div>
                      </div>
                      {b.tickets.length > 0 && (
                        <div className="mt-2 rounded-md border border-dashed border-[var(--glass-border)] bg-black/10 p-2">
                          <p className="text-xs font-semibold text-foreground mb-1">
                            Tickets in this booking
                          </p>
                          <div className="max-h-40 overflow-y-auto text-xs text-foreground-muted space-y-0.5">
                            {b.tickets.map((t) => (
                              <div key={t.id} className="flex justify-between gap-2">
                                <span className="truncate">{t.sectionName}</span>
                                <span className="truncate text-right">{t.seatLabel}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openResendDialog(b)}
                        >
                          Resend tickets
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lapsedBookings.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Lapsed events</p>
                <div className="space-y-4">
                  {lapsedBookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-4 space-y-2 opacity-80"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-foreground">
                            {b.eventTitle}
                          </p>
                          <p className="text-xs text-foreground-muted" suppressHydrationWarning>
                            Event: {b.eventStart}
                          </p>
                          <p className="text-xs text-foreground-muted" suppressHydrationWarning>
                            Booked at: {b.bookingCreated}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            Booking ID: <span className="font-mono">{b.id}</span>
                          </p>
                          <SpecialRequestLine b={b} />
                        </div>
                        <div className="text-right space-y-0.5">
                          <p className="text-sm text-foreground">
                            {b.buyerName || "Unknown buyer"}
                          </p>
                          <p className="text-xs text-foreground-muted">{b.buyerEmail}</p>
                          <p className="text-xs text-foreground-muted">
                            Tickets: <span className="font-semibold">{b.totalTickets}</span>
                          </p>
                        </div>
                      </div>
                      {b.tickets.length > 0 && (
                        <div className="mt-2 rounded-md border border-dashed border-[var(--glass-border)] bg-black/10 p-2">
                          <p className="text-xs font-semibold text-foreground mb-1">
                            Tickets in this booking
                          </p>
                          <div className="max-h-40 overflow-y-auto text-xs text-foreground-muted space-y-0.5">
                            {b.tickets.map((t) => (
                              <div key={t.id} className="flex justify-between gap-2">
                                <span className="truncate">{t.sectionName}</span>
                                <span className="truncate text-right">{t.seatLabel}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openResendDialog(b)}
                        >
                          Resend tickets
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend tickets</DialogTitle>
            <DialogDescription>
              Choose the destination email address where all tickets for this booking will be sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Destination email
            </label>
            <Input
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="buyer@example.com"
              disabled={resendSubmitting}
            />
            <p className="text-xs text-foreground-muted">
              We will resend the full ticket email (with attachments) to this address. Double-check
              before confirming.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogOpen(false)}
              disabled={resendSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmResend}
              disabled={resendSubmitting}
            >
              {resendSubmitting ? "Resending…" : "Resend tickets"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tickets resent</DialogTitle>
            <DialogDescription>{successDialogText}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" onClick={() => setSuccessDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

