"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { ChevronDown, ChevronRight } from "lucide-react";

type EventData = {
  id: string;
  title: string;
  slug: string;
  event_start: string;
  status?: string;
};

type Booking = {
  id: string;
  status: string;
  created_at: string;
  event: EventData | EventData[];
  tickets?: { id: string }[] | null;
};

function getEvent(b: Booking): EventData | null {
  const e = Array.isArray(b.event) ? b.event[0] : b.event;
  return e ?? null;
}

function getEventStatus(
  event: EventData | null,
  nowIso: string
): "Upcoming" | "Lapsed" | "Postponed" | "Archived" {
  if (!event) return "Upcoming";
  if (event.status === "postponed") return "Postponed";
  if (event.status === "archived") return "Archived";
  const eventStart = new Date(event.event_start).getTime();
  const now = new Date(nowIso).getTime();
  return eventStart > now ? "Upcoming" : "Lapsed";
}

function groupByEvent(bookings: Booking[]): { key: string; title: string; date: string; bookings: Booking[] }[] {
  const map = new Map<string, Booking[]>();
  for (const b of bookings) {
    const event = getEvent(b);
    const key = event?.id ?? b.id;
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const event = getEvent(list[0]);
      return {
        key,
        title: event?.title ?? "Event",
        date: event?.event_start ? formatDate(event.event_start) : "",
        bookings: list,
      };
    })
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.title.localeCompare(b.title);
    });
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function BookingRow({ b, serverNow }: { b: Booking; serverNow: string }) {
  const event = getEvent(b);
  const slug = event?.slug ?? "";
  const eventStatus = getEventStatus(event, serverNow);
  const ticketsCount = Array.isArray(b.tickets) ? b.tickets.length : 0;
  return (
    <tr className="border-b border-[var(--glass-border)] last:border-b-0 bg-white/5 hover:bg-white/8 transition-colors">
      <td className="py-3 px-4 font-medium text-foreground">
        {event?.title ?? "Event"}
      </td>
      <td className="py-3 px-4 text-sm text-foreground-muted">
        <span suppressHydrationWarning>
          {formatDateTime(b.created_at)}
          {ticketsCount > 0 && ` \u00b7 ${ticketsCount} ticket${ticketsCount > 1 ? "s" : ""}`}
        </span>
      </td>
      <td className="py-3 px-4">
        <span
          className={`text-sm ${
            eventStatus === "Upcoming"
              ? "text-green-400"
              : eventStatus === "Lapsed"
                ? "text-foreground-muted"
                : eventStatus === "Postponed"
                  ? "text-amber-400"
                  : eventStatus === "Archived"
                    ? "text-foreground-muted"
                    : "text-red-400"
          }`}
        >
          {eventStatus}
        </span>
      </td>
      <td className="py-3 px-4">
        <span
          className={`text-sm ${
            b.status === "confirmed"
              ? "text-green-400"
              : b.status === "failed"
                ? "text-red-400"
                : "text-foreground-muted"
          }`}
        >
          {b.status}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        {b.status === "confirmed" && slug && (
          <NavButtonWithProgress
            href={`/${slug}/confirmation/${b.id}`}
            size="sm"
            variant="secondary"
            loadingMessage="Loading tickets…"
          >
            View tickets
          </NavButtonWithProgress>
        )}
      </td>
    </tr>
  );
}

interface DashboardBookingsProps {
  confirmed: Booking[];
  pending: Booking[];
  failed: Booking[];
  serverNow: string;
}

export function DashboardBookings({
  confirmed,
  pending,
  failed,
  serverNow,
}: DashboardBookingsProps) {
  const router = useRouter();
  const [statusOpen, setStatusOpen] = useState({
    confirmed: true,
    pending: true,
    failed: true,
    lapsed: true,
  });
  const [eventOpen, setEventOpen] = useState<Record<string, boolean>>({});
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    if (pending.length === 0) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollPendingStatuses = async () => {
      if (cancelled || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const results = await Promise.all(
          pending.map(async (booking) => {
            const res = await fetch(`/api/bookings/${booking.id}/status?t=${Date.now()}`, {
              cache: "no-store",
            });
            if (!res.ok) return { id: booking.id, status: "pending" as const };
            const data = (await res.json()) as { status?: "pending" | "confirmed" | "failed" };
            return { id: booking.id, status: data.status ?? "pending" };
          })
        );
        if (results.some((r) => r.status === "confirmed" || r.status === "failed")) {
          router.refresh();
          return;
        }
      } catch {
        // Ignore transient network errors; retry on next tick.
      } finally {
        pollInFlightRef.current = false;
      }

      if (!cancelled) {
        timeoutId = setTimeout(pollPendingStatuses, 5000);
      }
    };

    timeoutId = setTimeout(pollPendingStatuses, 2000);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pending, router]);

  const { upcomingConfirmed, lapsedConfirmed } = useMemo(() => {
    const upcoming: Booking[] = [];
    const lapsed: Booking[] = [];

    for (const b of confirmed) {
      const status = getEventStatus(getEvent(b), serverNow);
      if (status === "Lapsed") {
        lapsed.push(b);
      } else {
        upcoming.push(b);
      }
    }

    return { upcomingConfirmed: upcoming, lapsedConfirmed: lapsed };
  }, [confirmed, serverNow]);

  const toggleEvent = (key: string) => {
    setEventOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isEventOpen = (key: string) => eventOpen[key] === true;

  const StatusSection = ({
    title,
    count,
    statusKey,
    bookings,
    statusColor,
  }: {
    title: string;
    count: number;
    statusKey: keyof typeof statusOpen;
    bookings: Booking[];
    statusColor: string;
  }) => {
    const isOpen = statusOpen[statusKey];
    const groups = useMemo(() => groupByEvent(bookings), [bookings]);

    return (
      <div className="mb-4 last:mb-0">
        <button
          type="button"
          onClick={() => setStatusOpen((p) => ({ ...p, [statusKey]: !p[statusKey] }))}
          className="w-full flex items-center justify-between py-3 px-4 text-left font-medium text-foreground hover:bg-white/5 transition-colors rounded-t-xl border border-b-0 border-[var(--glass-border)]"
        >
          <span className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-foreground-muted" />
            ) : (
              <ChevronRight className="h-4 w-4 text-foreground-muted" />
            )}
            {title}
            <span className={`text-sm font-normal ${statusColor}`}>({count})</span>
          </span>
        </button>
        {isOpen && bookings.length > 0 && (
          <div className="border border-t-0 border-[var(--glass-border)] rounded-b-xl overflow-hidden">
            {groups.map(({ key, title: eventTitle, date, bookings: groupBookings }) => {
              const open = isEventOpen(key);
              return (
                <div key={key} className="border-b border-[var(--glass-border)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleEvent(key)}
                    className="w-full flex items-center gap-2 py-2.5 px-4 text-left text-sm font-medium text-foreground-muted hover:bg-white/5 transition-colors cursor-pointer"
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-foreground-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" />
                    )}
                    {eventTitle}
                    {date && (
                      <span suppressHydrationWarning className="text-foreground-muted font-normal">
                        — {date}
                      </span>
                    )}
                    <span className="text-foreground-muted font-normal">({groupBookings.length})</span>
                  </button>
                  {open && (
                    <div className="overflow-x-auto" role="region" aria-label={`${eventTitle} bookings`}>
                      <table className="w-full min-w-[400px] border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--glass-border)] bg-white/5">
                            <th className="text-left py-2 px-4 text-xs font-medium text-foreground-muted">Event</th>
                            <th className="text-left py-2 px-4 text-xs font-medium text-foreground-muted">Booked</th>
                            <th className="text-left py-2 px-4 text-xs font-medium text-foreground-muted">Event status</th>
                            <th className="text-left py-2 px-4 text-xs font-medium text-foreground-muted">Status</th>
                            <th className="text-right py-2 px-4 text-xs font-medium text-foreground-muted">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...groupBookings]
                            .sort(
                              (a, b) =>
                                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                            )
                            .map((b) => (
                              <BookingRow key={b.id} b={b} serverNow={serverNow} />
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {upcomingConfirmed.length > 0 && (
        <StatusSection
          title="Confirmed"
          count={upcomingConfirmed.length}
          statusKey="confirmed"
          bookings={upcomingConfirmed}
          statusColor="text-green-400"
        />
      )}
      {lapsedConfirmed.length > 0 && (
        <StatusSection
          title="Lapsed"
          count={lapsedConfirmed.length}
          statusKey="lapsed"
          bookings={lapsedConfirmed}
          statusColor="text-foreground-muted"
        />
      )}
      {pending.length > 0 && (
        <StatusSection
          title="Pending"
          count={pending.length}
          statusKey="pending"
          bookings={pending}
          statusColor="text-foreground-muted"
        />
      )}
      {failed.length > 0 && (
        <StatusSection
          title="Failed"
          count={failed.length}
          statusKey="failed"
          bookings={failed}
          statusColor="text-red-400"
        />
      )}
    </div>
  );
}
