"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { DashboardSkeleton } from "@/components/admin/reports/dashboard-skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ReportsContent } from "@/components/admin/reports/reports-content";

export interface EventOption {
  id: string;
  title: string;
  event_start?: string;
  producer_id?: string | null;
}

export interface ProducerOption {
  id: string;
  name: string;
}

interface ReportsPageClientProps {
  events: EventOption[];
  producers: ProducerOption[];
  initialEventId?: string;
  initialProducerId?: string;
  canRelease?: boolean;
  canDeleteAdmissions?: boolean;
  canClearSoldSection?: boolean;
}

export function ReportsPageClient({ events, producers, initialEventId, initialProducerId, canRelease = false, canDeleteAdmissions = false, canClearSoldSection = false }: ReportsPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [producerId, setProducerId] = useState<string>(initialProducerId ?? "");
  const [eventId, setEventId] = useState<string>(initialEventId ?? "");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);

  const filteredEvents = !producerId
    ? events
    : producerId === "__none__"
      ? events.filter((e) => !e.producer_id)
      : events.filter((e) => e.producer_id === producerId);

  const { data, isLoading, error } = useDashboardData({
    eventId: eventId || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    autoRefresh,
  });

  useEffect(() => {
    if (initialEventId) {
      setEventId(initialEventId);
    }
    if (initialProducerId !== undefined) {
      setProducerId(initialProducerId);
    } else if (initialEventId) {
      const matchingEvent = events.find((e) => e.id === initialEventId);
      if (matchingEvent) {
        setProducerId(matchingEvent.producer_id ? matchingEvent.producer_id : "__none__");
      }
    }
  }, [initialEventId, initialProducerId, events]);

  useEffect(() => {
    if (filteredEvents.length > 0 && !eventId) {
      setEventId(filteredEvents[0].id);
    }
  }, [filteredEvents, eventId]);

  useEffect(() => {
    const isValid = filteredEvents.some((e) => e.id === eventId);
    if (!isValid && filteredEvents.length > 0) {
      setEventId(filteredEvents[0].id);
    } else if (!isValid && filteredEvents.length === 0) {
      setEventId("");
    }
  }, [producerId, filteredEvents, eventId]);

  useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams();
    if (producerId) params.set("producer_id", producerId);
    if (eventId) params.set("event_id", eventId);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [pathname, producerId, eventId, router]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function handleShareReport() {
    if (!eventId) return;
    setIsSharing(true);
    setShareError(null);
    try {
      const res = await fetch("/api/admin/reports/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          date_from: dateFrom || null,
          date_to: dateTo || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create share link");
      }
      const payload = (await res.json()) as { url?: string };
      if (!payload.url) {
        throw new Error("Failed to create share link");
      }
      setSharedUrl(payload.url);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.url);
      }
    } catch (error) {
      setShareError(String((error as Error)?.message ?? "Failed to create share link"));
    } finally {
      setIsSharing(false);
    }
  }

  const reportsProgress = useMemo(() => {
    if (isSharing) {
      return {
        message: "Generating share link",
        subtitle: "Sales & reports",
        detail: "Creating a read-only link to this dashboard view.",
      };
    }
    if (isLoading) {
      return {
        message: "Loading dashboard",
        subtitle: "Sales & reports",
        detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
      };
    }
    return {
      message: "Working…",
      subtitle: "Sales & reports",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [isSharing, isLoading]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales & Reports</h1>
          <p className="text-sm text-foreground-muted">
            {now.toLocaleString("en-PH", {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleShareReport}
          disabled={!eventId || isSharing}
          className="rounded-lg bg-yellow-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSharing ? "Generating link..." : "Share Report"}
        </button>
      </div>
      {(sharedUrl || shareError) && (
        <div className="mb-4 rounded-lg border border-[var(--glass-border)] bg-white/5 p-3 text-sm [html[data-theme=light]_&]:bg-black/[0.035]">
          {sharedUrl && (
            <div className="text-foreground-muted">
              Shareable report link (copied to clipboard; does not expire):{" "}
              <a className="break-all text-[var(--wish-orange)] underline" href={sharedUrl} target="_blank" rel="noreferrer">
                {sharedUrl}
              </a>
            </div>
          )}
          {shareError && <div className="text-red-400">{shareError}</div>}
        </div>
      )}

      <div className="glass rounded-xl border border-[var(--glass-border)] p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <Label htmlFor="producer-select" className="text-foreground-muted text-sm">Producer</Label>
          <select
            id="producer-select"
            value={producerId}
            onChange={(e) => setProducerId(e.target.value)}
            className="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--wish-orange)] [html[data-theme=light]_&]:border-black/15 [html[data-theme=light]_&]:bg-white/85"
          >
            <option value="">All producers</option>
            <option value="__none__">No Producer</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[200px]">
          <Label htmlFor="event-select" className="text-foreground-muted text-sm">Event</Label>
          <select
            id="event-select"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--wish-orange)] [html[data-theme=light]_&]:border-black/15 [html[data-theme=light]_&]:bg-white/85"
          >
            <option value="">Select event</option>
            {filteredEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="date-from" className="text-foreground-muted text-sm">Date from</Label>
          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--wish-orange)] [html[data-theme=light]_&]:border-black/15 [html[data-theme=light]_&]:bg-white/85"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="date-to" className="text-foreground-muted text-sm">Date to</Label>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--wish-orange)] [html[data-theme=light]_&]:border-black/15 [html[data-theme=light]_&]:bg-white/85"
          />
        </div>
        {data?.is_event_day && (
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-foreground-muted text-sm cursor-pointer">
              Auto-refresh (30s)
            </Label>
          </div>
        )}
      </div>

      <FloatingProgressBar
        active={isLoading || isSharing}
        message={reportsProgress.message}
        subtitle={reportsProgress.subtitle}
        detail={reportsProgress.detail}
      />

      {!eventId ? (
        <p className="text-foreground-muted py-8 text-center">Select an event to view dashboard</p>
      ) : error ? (
        <p className="text-red-400 py-8 text-center">{String(error?.message ?? "Failed to load dashboard")}</p>
      ) : isLoading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <ReportsContent
          data={data}
          eventId={eventId || null}
          dateFrom={dateFrom || null}
          dateTo={dateTo || null}
          canRelease={canRelease}
          canDeleteAdmissions={canDeleteAdmissions}
          canClearSoldSection={canClearSoldSection}
          mode="admin"
        />
      ) : null}
    </div>
  );
}
