"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import { getDirectTicketImageDisplayUrl } from "@/lib/image-proxy";

export interface ReportRow {
  ticket_id: string;
  booking_id: string;
  event_title: string;
  status: string;
  section_label: string;
  seat_label: string;
  recipient_name: string;
  recipient_email?: string | null;
  ticket_image_url?: string | null;
  total_cents: number;
  created_at: string;
  created_at_formatted?: string;
  accepted_by_admin_name?: string | null;
}

interface ReportsTableProps {
  rows: ReportRow[];
  canRelease: boolean;
}

export function ReportsTable({ rows, canRelease }: ReportsTableProps) {
  const router = useRouter();
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };

  // Group by event → section → buyer
  const byEvent = useMemo(() => {
    const m = new Map<
      string,
      { title: string; bySection: Map<string, Map<string, ReportRow[]>> }
    >();
    for (const r of rows) {
      const eventKey = r.event_title ?? "Other";
      const sectionKey = r.section_label ?? "—";
      const buyerKey = r.recipient_name ?? "—";

      if (!m.has(eventKey)) {
        m.set(eventKey, { title: eventKey, bySection: new Map() });
      }
      const { bySection } = m.get(eventKey)!;
      if (!bySection.has(sectionKey)) bySection.set(sectionKey, new Map());
      const byBuyer = bySection.get(sectionKey)!;
      if (!byBuyer.has(buyerKey)) byBuyer.set(buyerKey, []);
      byBuyer.get(buyerKey)!.push(r);
    }
    return m;
  }, [rows]);

  const toggleEvent = (eventKey: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventKey)) next.delete(eventKey);
      else next.add(eventKey);
      return next;
    });
  };

  const toggleSection = (eventKey: string, sectionKey: string) => {
    const key = `${eventKey}|${sectionKey}`;
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleBuyer = (eventKey: string, sectionKey: string, buyerKey: string) => {
    const key = `${eventKey}|${sectionKey}|${buyerKey}`;
    setExpandedBuyers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleRelease = async (ticketId: string) => {
    setReleasingId(ticketId);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/release`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to release");
        return;
      }
      toast.success("Ticket released");
      router.refresh();
    } catch {
      toast.error("Failed to release");
    } finally {
      setReleasingId(null);
    }
  };

  const handleSendEmail = async (ticketId: string, to: string) => {
    setSendingEmailId(ticketId);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send email");
        return;
      }
      toast.success("Email sent");
      router.refresh();
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSendingEmailId(null);
    }
  };

  const getTicketImageSrc = (r: ReportRow) =>
    getDirectTicketImageDisplayUrl(r.ticket_image_url, r.ticket_id) ??
    r.ticket_image_url ??
    `/api/admin/tickets/${r.ticket_id}/image`;

  return (
    <PhotoProvider>
    <div className="space-y-4 divide-y divide-[var(--glass-border)]">
      {Array.from(byEvent.entries()).map(([eventKey, { title: eventTitle, bySection }]) => {
        const eventTicketCount = Array.from(bySection.values())
          .flatMap((m) => Array.from(m.values()).flat())
          .length;
        const isEventExpanded = expandedEvents.has(eventKey);

        return (
          <div key={eventKey} className="rounded-[10px] border border-[var(--glass-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleEvent(eventKey)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors bg-white/[0.02]"
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
                {Array.from(bySection.entries()).map(([sectionKey, byBuyer]) => {
                  const sectionTicketCount = Array.from(byBuyer.values()).flat().length;
                  const sectionCompositeKey = `${eventKey}|${sectionKey}`;
                  const isSectionExpanded = expandedSections.has(sectionCompositeKey);

                  return (
                    <div key={sectionCompositeKey} className="bg-white/[0.01]">
                      <button
                        type="button"
                        onClick={() => toggleSection(eventKey, sectionKey)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 pl-8 text-left hover:bg-white/5 transition-colors"
                      >
                        {isSectionExpanded ? (
                          <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                        )}
                        <span className="text-foreground-muted">{sectionKey}</span>
                        <span className="text-sm text-foreground-muted">({sectionTicketCount})</span>
                      </button>

                      {isSectionExpanded && (
                        <div className="border-t border-[var(--glass-border)]">
                          {Array.from(byBuyer.entries()).map(([buyerKey, tickets]) => {
                            const buyerCompositeKey = `${eventKey}|${sectionKey}|${buyerKey}`;
                            const isBuyerExpanded = expandedBuyers.has(buyerCompositeKey);

                            return (
                              <div key={buyerCompositeKey} className="bg-white/[0.005]">
                                <button
                                  type="button"
                                  onClick={() => toggleBuyer(eventKey, sectionKey, buyerKey)}
                                  className="flex w-full items-center gap-2 px-4 py-2 pl-12 text-left hover:bg-white/5 transition-colors"
                                >
                                  {isBuyerExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                                  )}
                                  <span className="text-foreground-muted">{buyerKey}</span>
                                  <span className="text-sm text-foreground-muted">({tickets.length})</span>
                                </button>

                                {isBuyerExpanded && (
                                  <div className="border-t border-[var(--glass-border)] overflow-x-auto">
                                    <table className="w-full text-left">
                                      <thead>
                                        <tr className="border-b border-[var(--glass-border)]">
                                          <th className="p-4 text-sm font-medium text-foreground-muted">Seat</th>
                                          <th className="p-4 text-sm font-medium text-foreground-muted">Status</th>
                                          <th className="p-4 text-sm font-medium text-foreground-muted">Amount</th>
                                          <th className="p-4 text-sm font-medium text-foreground-muted">Date</th>
                                          <th className="p-4 text-sm font-medium text-foreground-muted">Accepted by</th>
                                          <th className="p-4 text-sm font-medium text-foreground-muted">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tickets.map((r) => (
                                          <tr
                                            key={r.ticket_id}
                                            className="border-b border-[var(--glass-border)] last:border-b-0"
                                          >
                                            <td className="p-4 text-foreground-muted">{r.seat_label ?? "—"}</td>
                                            <td className="p-4 text-foreground-muted">{r.status}</td>
                                            <td className="p-4 text-foreground-muted">
                                              {((r.total_cents ?? 0) / 100).toLocaleString("en-PH", {
                                                style: "currency",
                                                currency: "PHP",
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0,
                                              })}
                                            </td>
                                            <td className="p-4 text-foreground-muted">
                                              {r.created_at_formatted ?? r.created_at}
                                            </td>
                                            <td className="p-4 text-foreground-muted">
                                              {r.accepted_by_admin_name ?? "—"}
                                            </td>
                                            <td className="p-4">
                                              <div className="flex flex-wrap gap-2">
                                                {r.recipient_email && canRelease && (
                                                  <Button
                                                    size="sm"
                                                    variant="success"
                                                    className="text-foreground"
                                                    onClick={() => handleSendEmail(r.ticket_id, r.recipient_email!)}
                                                    disabled={sendingEmailId !== null}
                                                  >
                                                    {sendingEmailId === r.ticket_id ? (
                                                      "Sending…"
                                                    ) : (
                                                      <>
                                                        <Mail className="h-3.5 w-3.5 mr-1" />
                                                        Send email
                                                      </>
                                                    )}
                                                  </Button>
                                                )}
                                                <PhotoView src={getTicketImageSrc(r)}>
                                                  <Button
                                                    size="sm"
                                                    className="bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)] text-white border-0"
                                                  >
                                                    View Ticket
                                                  </Button>
                                                </PhotoView>
                                                {canRelease && (
                                                  <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => handleRelease(r.ticket_id)}
                                                    disabled={releasingId !== null}
                                                  >
                                                    {releasingId === r.ticket_id ? "Releasing…" : "Release"}
                                                  </Button>
                                                )}
                                              </div>
                                            </td>
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
    </PhotoProvider>
  );
}
