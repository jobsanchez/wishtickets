"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { toast } from "@/lib/toast";

type SoldTicket = {
  ticket_id: string;
  booking_id: string;
  seat_id: string | null;
  seat_label: string;
};

type SoldSection = {
  section_id: string;
  section_name: string;
  sold_count: number;
  sold_tickets: SoldTicket[];
};

type SoldGroup = {
  group_key: string;
  group_label: string;
  sections: SoldSection[];
};

type VoidSaleResponse = {
  event_id: string;
  groups: SoldGroup[];
};

type ConfirmAction =
  | { type: "ticket"; ticketId: string; label: string }
  | { type: "section"; sectionId: string; label: string }
  | { type: "group"; groupKey: string; label: string }
  | null;

interface VoidSaleReleaseTabProps {
  eventId: string;
}

export function VoidSaleReleaseTab({ eventId }: VoidSaleReleaseTabProps) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<VoidSaleResponse>({
    queryKey: ["void-sale-inventory", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/events/${eventId}/void-sale`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load sold inventory");
      return json as VoidSaleResponse;
    },
  });

  const totalSold = useMemo(
    () =>
      (data?.groups ?? []).reduce(
        (sum, g) =>
          sum + g.sections.reduce((sectionSum, s) => sectionSum + (s.sold_count ?? 0), 0),
        0
      ),
    [data]
  );

  const sectionKey = (groupKey: string, sectionId: string) => `${groupKey}:${sectionId}`;

  async function submitAction() {
    if (!confirmAction) return;
    setPending(true);
    try {
      let payload: Record<string, string> = {};
      if (confirmAction.type === "ticket") {
        payload = { ticket_id: confirmAction.ticketId };
      } else if (confirmAction.type === "section") {
        payload = { section_id: confirmAction.sectionId };
      } else {
        payload = { group_key: confirmAction.groupKey };
      }
      const res = await fetch(`/api/admin/events/${eventId}/void-sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Void sale failed");
      toast.success("Void sale completed and seats released.");
      queryClient.invalidateQueries({ queryKey: ["void-sale-inventory", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Void sale failed");
    } finally {
      setPending(false);
      setConfirmAction(null);
    }
  }

  if (isLoading) {
    return (
      <>
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.genericLoad}
          message="Loading sold seats…"
          subtitle="Void sale"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-foreground-muted">
          Loading sold seats…
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-red-400">
        {error instanceof Error ? error.message : "Failed to load sold seats"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FloatingProgressBar
        active={pending}
        message="Voiding sale"
        subtitle="Super-admin"
        detail="Removing sale records, updating bookings, and returning seats to available inventory."
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
        <h2 className="text-lg font-semibold text-foreground">Void Sale &amp; Release Seat</h2>
        <p className="text-sm text-foreground-muted mt-1">
          Super-admin destructive tool. This removes sale records, updates affected bookings, and
          returns seats to available.
        </p>
        <p className="text-sm text-foreground-muted mt-2">
          Total sold seats found: <span className="text-foreground font-medium">{totalSold}</span>
        </p>
      </div>

      {(data?.groups ?? []).length === 0 ? (
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
          No sold seats found for this event.
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.groups ?? []).map((group) => (
            <div
              key={group.group_key}
              className="glass rounded-xl border border-[var(--glass-border)] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-0 py-0 text-left hover:bg-transparent"
                    onClick={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.group_key)) {
                          next.delete(group.group_key);
                        } else {
                          next.add(group.group_key);
                        }
                        return next;
                      })
                    }
                  >
                    {expandedGroups.has(group.group_key) ? (
                      <ChevronDown className="mr-1 h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="mr-1 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      <p className="text-sm text-foreground-muted">Group</p>
                      <h3 className="text-base font-semibold text-foreground">{group.group_label}</h3>
                    </span>
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setConfirmAction({
                      type: "group",
                      groupKey: group.group_key,
                      label: group.group_label,
                    })
                  }
                  disabled={pending}
                >
                  Void group
                </Button>
              </div>

              {expandedGroups.has(group.group_key) ? (
                <div className="space-y-2">
                {group.sections.map((section) => (
                  <div
                    key={section.section_id}
                    className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto px-0 py-0 text-left hover:bg-transparent"
                          onClick={() =>
                            setExpandedSections((prev) => {
                              const key = sectionKey(group.group_key, section.section_id);
                              const next = new Set(prev);
                              if (next.has(key)) {
                                next.delete(key);
                              } else {
                                next.add(key);
                              }
                              return next;
                            })
                          }
                        >
                          {expandedSections.has(sectionKey(group.group_key, section.section_id)) ? (
                            <ChevronDown className="mr-1 h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="mr-1 h-4 w-4 shrink-0" />
                          )}
                          <span className="text-sm text-foreground">
                            {section.section_name}{" "}
                            <span className="text-foreground-muted">({section.sold_count} sold)</span>
                          </span>
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmAction({
                            type: "section",
                            sectionId: section.section_id,
                            label: section.section_name,
                          })
                        }
                        disabled={pending}
                      >
                        Void section
                      </Button>
                    </div>

                    {expandedSections.has(sectionKey(group.group_key, section.section_id)) ? (
                      <div className="mt-2 space-y-1">
                        {section.sold_tickets.map((ticket) => (
                          <div
                            key={ticket.ticket_id}
                            className="flex items-center justify-between gap-3 rounded border border-[var(--glass-border)] px-2 py-1"
                          >
                            <div className="min-w-0">
                              <p className="text-xs text-foreground">{ticket.seat_label}</p>
                              <p className="text-xs text-foreground-muted truncate">
                                Ticket: {ticket.ticket_id}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  type: "ticket",
                                  ticketId: ticket.ticket_id,
                                  label: ticket.seat_label,
                                })
                              }
                              disabled={pending}
                            >
                              Void seat
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title="Void sale and release seat?"
        description={
          confirmAction
            ? `This will permanently remove sale records for ${confirmAction.label} and release affected seats. This action cannot be undone.`
            : "This action cannot be undone."
        }
        confirmLabel="Void sale"
        variant="destructive"
        onConfirm={submitAction}
      />
    </div>
  );
}
