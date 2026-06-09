"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import { RouteLoading } from "@/components/ui/route-loading";

interface TicketAssignment {
  ticket_id: string;
  recipient_name: string;
  event_id: string;
  event_title: string;
  section_name: string;
  section_code: string;
  seat_label: string;
  booking_id: string;
  assignment_status: string;
  created_at: string;
}

interface Event {
  id: string;
  title: string;
}

interface TicketAssignmentsResponse {
  assignments: TicketAssignment[];
  canRelease: boolean;
}

export default function TicketAssignmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [events, setEvents] = useState<Event[]>([]);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedRecipients, setExpandedRecipients] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };

  const toggleEvent = (eventKey: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventKey)) next.delete(eventKey);
      else next.add(eventKey);
      return next;
    });
  };

  const toggleRecipient = (eventKey: string, personKey: string) => {
    const key = `${eventKey}|${personKey}`;
    setExpandedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSection = (eventKey: string, personKey: string, sectionKey: string) => {
    const key = `${eventKey}|${personKey}|${sectionKey}`;
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/admin/events")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, []);

  const { data, isLoading } = useQuery<TicketAssignmentsResponse>({
    queryKey: ["ticket-assignments", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId
        ? `/api/admin/ticket-assignments?event_id=${selectedEventId}`
        : "/api/admin/ticket-assignments";
      const res = await fetch(url);
      if (res.status === 403) {
        showPermissionDialog();
        throw new Error("Forbidden");
      }
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const assignments = useMemo(() => data?.assignments ?? [], [data?.assignments]);
  const canRelease = data?.canRelease ?? false;

  // Group by event → person → section
  const byEvent = useMemo(() => {
    const m = new Map<
      string,
      { title: string; byPerson: Map<string, Map<string, TicketAssignment[]>> }
    >();
    for (const a of assignments) {
      const eventKey = a.event_id || "unknown";
      const personKey = a.recipient_name || "—";
      const sectionKey = a.section_code || a.section_name || "—";

      if (!m.has(eventKey)) {
        m.set(eventKey, { title: a.event_title ?? "—", byPerson: new Map() });
      }
      const { byPerson } = m.get(eventKey)!;
      if (!byPerson.has(personKey)) byPerson.set(personKey, new Map());
      const bySection = byPerson.get(personKey)!;
      if (!bySection.has(sectionKey)) bySection.set(sectionKey, []);
      bySection.get(sectionKey)!.push(a);
    }
    return m;
  }, [assignments]);

  const handleRelease = async (ticketId: string) => {
    setReleasingId(ticketId);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/release`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) {
        toast.error(body.error ?? "Failed to release");
        return;
      }
      toast.success("Ticket released");
      await queryClient.invalidateQueries({ queryKey: ["ticket-assignments", selectedEventId] });
      router.refresh();
    } catch {
      toast.error("Failed to release");
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Manual Distribution</h1>
      <p className="text-foreground-muted text-sm mb-6">
        List of tickets and who they are distributed to.
      </p>

      <div className="mb-6">
        <label className="block text-sm text-foreground-muted mb-2">Filter by event</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="h-10 px-4 rounded-lg border border-[var(--glass-border)] bg-white/5 text-foreground"
        >
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <RouteLoading
          variant="compact"
          message="Loading assignments…"
          subtitle="Manual ticket distribution for the selected event."
        />
      ) : (
        <div className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden">
          {!assignments.length ? (
            <div className="p-8 text-center text-foreground-muted">
              No manual distribution found.
            </div>
          ) : (
            <div className="divide-y divide-[var(--glass-border)]">
              {Array.from(byEvent.entries()).map(([eventKey, { title: eventTitle, byPerson }]) => {
                const eventTicketCount = Array.from(byPerson.values())
                  .flatMap((m) => Array.from(m.values()).flat())
                  .length;
                const isEventExpanded = expandedEvents.has(eventKey);

                return (
                  <div key={eventKey} className="bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => toggleEvent(eventKey)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                    >
                      {isEventExpanded ? (
                        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                      )}
                      <span className="font-medium text-foreground">{eventTitle}</span>
                      <span className="text-sm text-foreground-muted">({eventTicketCount})</span>
                    </button>

                    {isEventExpanded && (
                      <div className="border-t border-[var(--glass-border)]">
                        {Array.from(byPerson.entries()).map(([personKey, bySection]) => {
                          const personTicketCount = Array.from(bySection.values())
                            .flat()
                            .length;
                          const recipientKey = `${eventKey}|${personKey}`;
                          const isRecipientExpanded = expandedRecipients.has(recipientKey);

                          return (
                            <div key={recipientKey} className="bg-white/[0.01]">
                              <button
                                type="button"
                                onClick={() => toggleRecipient(eventKey, personKey)}
                                className="flex w-full items-center gap-2 px-4 py-2.5 pl-12 text-left hover:bg-white/5 transition-colors"
                              >
                                {isRecipientExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                                )}
                                <span className="text-foreground-muted">{personKey}</span>
                                <span className="text-sm text-foreground-muted">({personTicketCount})</span>
                              </button>

                              {isRecipientExpanded && (
                                <div className="border-t border-[var(--glass-border)]">
                                  {Array.from(bySection.entries()).map(([sectionLabel, tickets]) => {
                                    const sectionKey = `${eventKey}|${personKey}|${sectionLabel}`;
                                    const isSectionExpanded = expandedSections.has(sectionKey);

                                    return (
                                      <div key={sectionKey} className="bg-white/[0.005]">
                                        <button
                                          type="button"
                                          onClick={() => toggleSection(eventKey, personKey, sectionLabel)}
                                          className="flex w-full items-center gap-2 px-4 py-2 pl-20 text-left hover:bg-white/5 transition-colors"
                                        >
                                          {isSectionExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                                          )}
                                          <span className="text-foreground-muted">{sectionLabel}</span>
                                          <span className="text-sm text-foreground-muted">({tickets.length})</span>
                                        </button>

                                        {isSectionExpanded && (
                                          <div className="border-t border-[var(--glass-border)] overflow-x-auto">
                                            <table className="w-full text-left">
                                              <thead>
                                                <tr className="border-b border-[var(--glass-border)]">
                                                  <th className="p-3 text-sm font-medium text-foreground-muted">Seat</th>
                                                  <th className="p-3 text-sm font-medium text-foreground-muted">Status</th>
                                                  <th className="p-3 text-sm font-medium text-foreground-muted">Date</th>
                                                  {canRelease && (
                                                    <th className="p-3 text-sm font-medium text-foreground-muted w-24" />
                                                  )}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {tickets.map((a) => (
                                                  <tr
                                                    key={a.ticket_id}
                                                    className="border-b border-[var(--glass-border)] last:border-b-0"
                                                  >
                                                    <td className="p-3 text-foreground-muted">{a.seat_label ?? "—"}</td>
                                                    <td className="p-3 text-foreground-muted">{a.assignment_status}</td>
                                                    <td className="p-3 text-foreground-muted">
                                                      {new Date(a.created_at).toLocaleString()}
                                                    </td>
                                                    {canRelease && (
                                                      <td className="p-3">
                                                        <Button
                                                          size="sm"
                                                          variant="secondary"
                                                          onClick={() => handleRelease(a.ticket_id)}
                                                          disabled={releasingId !== null}
                                                        >
                                                          {releasingId === a.ticket_id ? "Releasing…" : "Release"}
                                                        </Button>
                                                      </td>
                                                    )}
                                                  </tr>
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
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
