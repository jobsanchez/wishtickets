"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { useDrilldownData, type DrilldownMetric } from "@/hooks/use-drilldown-data";
import type { SectionSales, VssBreakdown } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPercent(n: number): string {
  return n.toFixed(1) + "%";
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type AdmittedHierarchySection = {
  secKey: string;
  sectionName: string;
  eventSectionId?: string;
  items: Record<string, unknown>[];
};

type AdmittedHierarchyGroup = {
  groupKey: string;
  groupDisplay: string;
  sections: AdmittedHierarchySection[];
};

function GroupedBySectionTable({
  rows,
  formatNumber,
  formatDateTime,
  eventId,
  canDeleteAdmissions,
  onDeleted,
}: {
  rows: Record<string, unknown>[];
  formatNumber: (n: number) => string;
  formatDateTime: (iso: string) => string;
  eventId?: string | null;
  canDeleteAdmissions?: boolean;
  onDeleted?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    ticketIds: string[];
    sectionName: string;
    eventSectionId?: string;
    sectionNameForApi?: string;
    deleteAll?: boolean;
  } | null>(null);

  /** Section group → section name → tickets (admission code shown per row in table). */
  const hierarchy = useMemo((): AdmittedHierarchyGroup[] => {
    type AccSection = {
      sectionName: string;
      eventSectionId?: string;
      items: Record<string, unknown>[];
    };
    type AccGroup = {
      groupDisplay: string;
      sections: Map<string, AccSection>;
    };
    const byGroup = new Map<string, AccGroup>();

    for (const r of rows) {
      const groupRaw = String(r.section_group ?? "").trim();
      const groupKey = groupRaw || "__ungrouped__";
      const groupDisplay = groupRaw || "Ungrouped";
      const sectionName = String(r.section_name ?? "—");
      const eventSectionId = r.event_section_id as string | undefined;
      const secKey = `${eventSectionId ?? "none"}::${sectionName}`;

      if (!byGroup.has(groupKey)) {
        byGroup.set(groupKey, { groupDisplay, sections: new Map() });
      }
      const g = byGroup.get(groupKey)!;
      if (!g.sections.has(secKey)) {
        g.sections.set(secKey, { sectionName, eventSectionId, items: [] });
      }
      g.sections.get(secKey)!.items.push(r);
    }

    const groupEntries = [...byGroup.entries()].sort(([ka], [kb]) => {
      if (ka === "__ungrouped__") return 1;
      if (kb === "__ungrouped__") return -1;
      return ka.localeCompare(kb);
    });
    return groupEntries.map(([gk, g]) => ({
      groupKey: gk,
      groupDisplay: g.groupDisplay,
      sections: [...g.sections.entries()]
        .sort(([sa], [sb]) => sa.localeCompare(sb))
        .map(([sk, sec]) => ({
          secKey: sk,
          sectionName: sec.sectionName,
          eventSectionId: sec.eventSectionId,
          items: sec.items,
        })),
    }));
  }, [rows]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const performDelete = async () => {
    if (!deleteConfirm || !eventId) return;
    setDeleting(true);
    try {
      const body: {
        event_id: string;
        ticket_ids?: string[];
        event_section_id?: string;
        delete_all?: boolean;
        section_name?: string;
      } = {
        event_id: eventId,
      };
      if (deleteConfirm.deleteAll) {
        body.delete_all = true;
      } else if (deleteConfirm.eventSectionId) {
        body.event_section_id = deleteConfirm.eventSectionId;
      } else if (deleteConfirm.sectionNameForApi) {
        body.section_name = deleteConfirm.sectionNameForApi;
      } else {
        body.ticket_ids = deleteConfirm.ticketIds;
      }
      const res = await fetch("/api/admin/admissions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(`Deleted ${data.deleted_count ?? deleteConfirm.ticketIds.length} admission(s)`);
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const allTicketIds = useMemo(() => rows.map((r) => r.ticket_id).filter((id): id is string => !!id), [rows]);

  return (
    <>
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete admissions?"
        description={
          deleteConfirm
            ? deleteConfirm.deleteAll
              ? `This will remove all admissions for this event. Tickets can be scanned again.`
              : deleteConfirm.sectionName
                ? `This will remove all admissions in ${deleteConfirm.sectionName}. Tickets can be scanned again.`
                : `This will remove ${deleteConfirm.ticketIds.length} admission(s). Tickets can be scanned again.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={performDelete}
      />
      <FloatingProgressBar
        active={deleting}
        {...FLOATING_PROGRESS_PRESETS.deleting}
        message="Deleting admissions…"
        subtitle="Reports drilldown"
      />
      <div className="divide-y divide-[var(--glass-border)]">
        {canDeleteAdmissions && eventId && rows.length > 0 && (
          <div className="py-2 flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                setDeleteConfirm({
                  ticketIds: allTicketIds,
                  sectionName: "",
                  deleteAll: true,
                })
              }
              disabled={deleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete all admissions
            </Button>
          </div>
        )}
        {hierarchy.map(({ groupKey, groupDisplay, sections }) => {
          const groupExpandKey = `g:${groupKey}`;
          const groupExpanded = expanded.has(groupExpandKey);
          const groupSeatCount = sections.reduce((s, sec) => s + sec.items.length, 0);
          return (
            <div key={groupKey} className="py-1">
              <button
                type="button"
                onClick={() => toggle(groupExpandKey)}
                className="flex w-full items-center gap-2 py-2 text-left hover:bg-white/5 rounded px-2 -mx-2 transition-colors"
                aria-label={`Group ${groupDisplay}`}
              >
                {groupExpanded ? (
                  <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1 text-left font-medium text-foreground truncate">
                  {groupDisplay}
                </div>
                <span className="ml-auto self-center text-foreground-muted text-sm shrink-0">
                  {formatNumber(groupSeatCount)} seat{groupSeatCount !== 1 ? "s" : ""}
                </span>
              </button>
              {groupExpanded && (
                <div className="ml-6 min-w-0 border-l border-[var(--glass-border)] py-1 pl-3 space-y-2">
                  {sections.map((sec) => {
                    const sectionExpandKey = `${groupExpandKey}|s:${sec.secKey}`;
                    const sectionExpanded = expanded.has(sectionExpandKey);
                    const { items, sectionName, eventSectionId } = sec;
                    const sectionTicketIds = items
                      .map((r) => r.ticket_id)
                      .filter((id): id is string => !!id);
                    const sectionLabelForConfirm = `${groupDisplay} · ${sectionName}`;
                              return (
                                <div key={sec.secKey} className="py-0.5">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggle(sectionExpandKey)}
                                      className="flex flex-1 items-center gap-2 py-1.5 text-left hover:bg-white/5 rounded px-2 -mx-2 transition-colors"
                                      aria-label={`Section ${sectionName}`}
                                    >
                                      {sectionExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                                      )}
                                      <div className="min-w-0 flex-1 text-left">
                                        <div className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                                          Section
                                        </div>
                                        <div className="font-medium text-foreground truncate">{sectionName}</div>
                                      </div>
                                      <span className="ml-auto self-center text-foreground-muted text-sm shrink-0">
                                        {formatNumber(items.length)} seat{items.length !== 1 ? "s" : ""}
                                      </span>
                                    </button>
                                    {canDeleteAdmissions &&
                                      eventId &&
                                      (sectionTicketIds.length > 0 || sectionName !== "—") && (
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() =>
                                            setDeleteConfirm({
                                              ticketIds: sectionTicketIds,
                                              sectionName: sectionLabelForConfirm,
                                              eventSectionId,
                                              sectionNameForApi: eventSectionId ? undefined : sectionName,
                                            })
                                          }
                                          disabled={deleting}
                                          title={`Delete all admissions in ${sectionName}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Delete section
                                        </Button>
                                      )}
                                  </div>
                                  {sectionExpanded && (
                                    <div className="ml-6 min-w-0 border-l border-[var(--glass-border)] py-2 pl-4">
                                      <div className="overflow-x-auto">
                                        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                                          <colgroup>
                                            {canDeleteAdmissions ? (
                                              <>
                                                <col className="w-[16%]" />
                                                <col className="w-[22%]" />
                                                <col className="w-[7%]" />
                                                <col className="w-[7%]" />
                                                <col className="w-[16%]" />
                                                <col className="w-[10%]" />
                                                <col className="w-[10%]" />
                                                <col className="w-[12%]" />
                                              </>
                                            ) : (
                                              <>
                                                <col className="w-[18%]" />
                                                <col className="w-[26%]" />
                                                <col className="w-[8%]" />
                                                <col className="w-[8%]" />
                                                <col className="w-[16%]" />
                                                <col className="w-[10%]" />
                                                <col className="w-[14%]" />
                                              </>
                                            )}
                                          </colgroup>
                                          <thead>
                                            <tr className="border-b border-[var(--glass-border)]">
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom">
                                                Ticket Holder
                                              </th>
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom">
                                                Email
                                              </th>
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom whitespace-nowrap">
                                                Row
                                              </th>
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom whitespace-nowrap">
                                                Seat
                                              </th>
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom whitespace-nowrap">
                                                Check-in Time
                                              </th>
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom">
                                                Category
                                              </th>
                                              <th className="px-2 py-2 text-left text-foreground-muted font-medium align-bottom whitespace-nowrap">
                                                Admission code
                                              </th>
                                              {canDeleteAdmissions && (
                                                <th className="px-2 py-2 text-right text-foreground-muted font-medium align-bottom whitespace-nowrap">
                                                  Actions
                                                </th>
                                              )}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {items.map((r, i) => {
                                              const ticketId = r.ticket_id as string | undefined;
                                              return (
                                                <tr
                                                  key={i}
                                                  className="border-b border-[var(--glass-border)] last:border-0"
                                                >
                                                  <td className="px-2 py-1.5 align-top text-foreground break-words">
                                                    {String(r.recipient_name ?? "—")}
                                                  </td>
                                                  <td className="px-2 py-1.5 align-top text-foreground-muted break-all">
                                                    {(() => {
                                                      const e = String(r.recipient_email ?? "").trim();
                                                      return e && e !== "—" ? e : "—";
                                                    })()}
                                                  </td>
                                                  <td className="px-2 py-1.5 align-top text-foreground-muted whitespace-nowrap">
                                                    {String(r.row_label ?? "—")}
                                                  </td>
                                                  <td className="px-2 py-1.5 align-top text-foreground-muted whitespace-nowrap">
                                                    {String(r.seat_number ?? "—")}
                                                  </td>
                                                  <td className="px-2 py-1.5 align-top text-foreground-muted whitespace-nowrap">
                                                    {formatDateTime(String(r.checkin_time ?? ""))}
                                                  </td>
                                                  <td className="px-2 py-1.5 align-top text-foreground-muted capitalize break-words">
                                                    {String(r.ticket_category ?? "—")}
                                                  </td>
                                                  <td className="px-2 py-1.5 align-top text-foreground-muted font-mono text-xs break-all">
                                                    {(() => {
                                                      const c = r.admission_code;
                                                      if (c == null || c === "") return "—";
                                                      return String(c).trim() || "—";
                                                    })()}
                                                  </td>
                                                  {canDeleteAdmissions && (
                                                    <td className="px-2 py-1.5 text-right align-top whitespace-nowrap">
                                                      {ticketId && (
                                                        <Button
                                                          variant="destructive"
                                                          size="sm"
                                                          onClick={() =>
                                                            setDeleteConfirm({
                                                              ticketIds: [ticketId],
                                                              sectionName: "",
                                                            })
                                                          }
                                                          disabled={deleting}
                                                        >
                                                          <Trash2 className="h-3.5 w-3.5" />
                                                          Delete
                                                        </Button>
                                                      )}
                                                    </td>
                                                  )}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
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
    </>
  );
}

interface DrilldownTicketRow {
  ticket_id?: string;
  assignment_id?: string | null;
  section_id?: string | null;
  section_name?: string;
  row_label?: string | null;
  seat_number?: string | null;
  recipient_name?: string;
  recipient_email?: string;
  quantity?: number;
}

function GroupedByPersonTableWithActions({
  rows,
  formatNumber,
  canRelease,
  onReleased,
  recipientFallbackLabel,
}: {
  rows: Record<string, unknown>[];
  formatNumber: (n: number) => string;
  canRelease: boolean;
  onReleased?: () => void;
  recipientFallbackLabel?: string | null;
}) {
  const [expandedPerson, setExpandedPerson] = useState<Set<string>>(new Set());
  const [expandedSection, setExpandedSection] = useState<Set<string>>(new Set());
  const [releasing, setReleasing] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState<{
    ticketIds: string[];
    label: string;
  } | null>(null);

  const grouped = useMemo(() => {
    const personMap = new Map<
      string,
      {
        name: string;
        email: string;
        sections: Map<
          string,
          { sectionName: string; sectionId: string | null; items: DrilldownTicketRow[] }
        >;
        totalQty: number;
      }
    >();
    for (const r of rows as DrilldownTicketRow[]) {
      const rawName = typeof r.recipient_name === "string" ? r.recipient_name.trim() : "";
      const rawEmail = typeof r.recipient_email === "string" ? r.recipient_email.trim() : "";
      const name = rawName.length > 0 ? rawName : "—";
      const email = rawEmail.length > 0 ? rawEmail : "—";
      const personKey = `${name}|${email}`;
      if (!personMap.has(personKey)) {
        personMap.set(personKey, {
          name,
          email,
          sections: new Map(),
          totalQty: 0,
        });
      }
      const person = personMap.get(personKey)!;
      const sectionName = String(r.section_name ?? "Other");
      const sectionKey = `${personKey}|${sectionName}`;
      if (!person.sections.has(sectionKey)) {
        person.sections.set(sectionKey, {
          sectionName,
          sectionId: r.section_id ?? null,
          items: [],
        });
      }
      person.sections.get(sectionKey)!.items.push(r);
      person.totalQty += Number(r.quantity ?? 1);
    }
    return Array.from(personMap.entries());
  }, [rows]);

  const togglePerson = (key: string) => {
    setExpandedPerson((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const performRelease = async (ticketIds: string[]) => {
    if (!canRelease || ticketIds.length === 0) return;
    setReleasing(true);
    try {
      const res = await fetch("/api/admin/tickets/release-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_ids: ticketIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to release");
      toast.success(json.released_count ? `Released ${json.released_count} ticket(s)` : "Released");
      onReleased?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release");
    } finally {
      setReleasing(false);
    }
  };

  const handleReleaseConfirm = async () => {
    if (releaseConfirm) {
      await performRelease(releaseConfirm.ticketIds);
      setReleaseConfirm(null);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={!!releaseConfirm}
        onOpenChange={(open) => !open && setReleaseConfirm(null)}
        title="Release tickets?"
        description={
          releaseConfirm
            ? `This will release ${releaseConfirm.label}. The seats will become available again. This action cannot be undone.`
            : ""
        }
        confirmLabel="Release"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleReleaseConfirm}
      />
      <FloatingProgressBar
        active={releasing}
        message="Releasing tickets"
        subtitle="Reports drilldown"
        detail="Updating seat availability and sale records on the server."
      />
      <div className="divide-y divide-[var(--glass-border)]">
        {grouped.map(([personKey, { name, email, sections, totalQty }], idx) => {
          const isPersonExpanded = expandedPerson.has(personKey);
          const primaryName = name && name !== "—" ? name : (email && email !== "—" ? email : "—");
          const displayName =
            primaryName === "—" && grouped.length === 1 && idx === 0 && recipientFallbackLabel
              ? recipientFallbackLabel
              : primaryName;
          return (
            <div key={personKey} className="py-1">
              <button
                type="button"
                onClick={() => togglePerson(personKey)}
                className="flex w-full items-center gap-2 py-2 text-left hover:bg-white/5 rounded px-2 -mx-2 transition-colors"
              >
                {isPersonExpanded ? (
                  <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                )}
                <span className="font-medium text-foreground">{displayName}</span>
                {email && email !== "—" && displayName !== email && (
                  <span className="text-foreground-muted text-sm truncate">{email}</span>
                )}
                <span className="ml-auto text-foreground-muted text-sm shrink-0">
                  {formatNumber(totalQty)} ticket{totalQty !== 1 ? "s" : ""}
                </span>
              </button>
              {isPersonExpanded && (
                <div className="ml-6 border-l border-[var(--glass-border)] pl-4 py-2 space-y-2">
                  {Array.from(sections.entries()).map(([sectionKey, { sectionName, items }]) => {
                    const isSectionExpanded = expandedSection.has(sectionKey);
                    return (
                      <div key={sectionKey} className="py-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => toggleSection(sectionKey)}
                            className="flex items-center gap-1 py-1.5 text-left hover:bg-white/5 rounded px-2 -mx-2 transition-colors"
                          >
                            {isSectionExpanded ? (
                              <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                            )}
                            <span className="font-medium text-neutral-200">{sectionName}</span>
                          </button>
                        </div>
                        {isSectionExpanded && (
                          <div className="ml-6 mt-2">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-[var(--glass-border)]">
                                  <th className="text-left py-2 text-foreground-muted font-medium">Section</th>
                                  <th className="text-left py-2 text-foreground-muted font-medium">Row</th>
                                  <th className="text-left py-2 text-foreground-muted font-medium">Seat</th>
                                  <th className="text-right py-2 text-foreground-muted font-medium">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((r, i) => {
                                  return (
                                    <tr
                                      key={r.ticket_id ?? i}
                                      className="border-b border-[var(--glass-border)] last:border-0"
                                    >
                                      <td className="py-1.5 text-foreground">{String(r.section_name ?? "—")}</td>
                                      <td className="py-1.5 text-foreground-muted">
                                        {r.row_label ?? "—"}
                                      </td>
                                      <td className="py-1.5 text-foreground-muted">
                                        {r.seat_number ?? "General"}
                                      </td>
                                      <td className="py-1.5 text-right text-foreground-muted">
                                        {formatNumber(Number(r.quantity ?? 0))}
                                      </td>
                                    </tr>
                                  );
                                })}
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
    </>
  );
}

interface KpiDetailModalProps {
  metric: DrilldownMetric;
  title: string;
  distributedRecipientNames?: string | null;
  eventId: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingData?: { rows: Record<string, unknown>[] };
  canRelease?: boolean;
  canDeleteAdmissions?: boolean;
  canClearSoldSection?: boolean;
}

const METRICS_WITH_EXISTING = new Set<DrilldownMetric>(["capacity", "sold", "occupancy"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function KpiDetailModal({
  metric,
  title,
  distributedRecipientNames = null,
  eventId,
  dateFrom,
  dateTo,
  open,
  onOpenChange,
  existingData,
  canRelease = false,
  canDeleteAdmissions = false,
  canClearSoldSection = false,
}: KpiDetailModalProps) {
  const queryClient = useQueryClient();
  const [clearingSoldSection, setClearingSoldSection] = useState(false);
  const [clearSoldConfirm, setClearSoldConfirm] = useState<{
    sectionId?: string;
    sectionName: string;
  } | null>(null);

  const hasExistingData = METRICS_WITH_EXISTING.has(metric) && existingData !== undefined;
  const needsFetch = !hasExistingData;
  const { data: drilldownData, isLoading, error, refetch } = useDrilldownData({
    eventId,
    metric: needsFetch ? metric : null,
    dateFrom,
    dateTo,
    enabled: open && needsFetch,
  });

  const rows = hasExistingData
    ? (existingData!.rows ?? [])
    : (drilldownData?.rows ?? []) as Record<string, unknown>[];

  const showLoading = open && needsFetch && isLoading;
  const showError = open && needsFetch && error;
  const isDistributedOrComplimentary = metric === "distributed" || metric === "complimentary";
  const isWideDrilldown =
    isDistributedOrComplimentary || metric === "admitted";
  const maxWidth =
    metric === "occupancy" || metric === "revenue"
      ? "max-w-4xl"
      : metric === "admitted"
        ? "max-w-7xl"
        : isWideDrilldown
          ? "max-w-5xl"
          : "max-w-2xl";

  async function handleClearSoldSection() {
    if (!eventId || !clearSoldConfirm) return;
    setClearingSoldSection(true);
    try {
      const res = await fetch("/api/admin/reports/clear-sold-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          ...(clearSoldConfirm.sectionId
            ? { section_id: clearSoldConfirm.sectionId }
            : { section_name: clearSoldConfirm.sectionName }),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted_tickets?: number;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to clear sold section");
      }
      const deletedCount = payload.deleted_tickets ?? 0;
      toast.success(
        `Cleared sold data for ${clearSoldConfirm.sectionName} (${deletedCount} ticket${deletedCount === 1 ? "" : "s"}).`
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      if (needsFetch) {
        await refetch();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear sold section");
    } finally {
      setClearingSoldSection(false);
      setClearSoldConfirm(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(maxWidth, "min-w-0")}>
        <ConfirmDialog
          open={!!clearSoldConfirm}
          onOpenChange={(isOpen) => !isOpen && setClearSoldConfirm(null)}
          title="Clear sold data for section?"
          description={
            clearSoldConfirm
              ? `This will delete sold records for ${clearSoldConfirm.sectionName}, reset affected seats to available, and update related bookings/payments. This action cannot be undone.`
              : ""
          }
          confirmLabel="Clear sold data"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={handleClearSoldSection}
        />
        <FloatingProgressBar
          active={clearingSoldSection}
          message="Clearing sold section"
          subtitle="Reports drilldown"
          detail="Resetting seats and related booking or payment records for this section."
        />
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Detailed breakdown rows for this report metric.
          </DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "-mx-2 min-w-0 overflow-y-auto px-2",
            isWideDrilldown ? "max-h-[90vh]" : "max-h-[70vh]"
          )}
        >
          {showLoading && (
            <RouteLoading
              variant="panel"
              message="Loading…"
              subtitle="Fetching breakdown rows."
              className="py-2"
            />
          )}
          {showError && (
            <p className="py-4 text-red-400 text-center">{String(error?.message ?? "Failed to load")}</p>
          )}
          {!showLoading && !showError && rows.length === 0 && (
            <p className="py-8 text-foreground-muted text-center">No data for this metric</p>
          )}
          {!showLoading && !showError && rows.length > 0 && (
            <div className="overflow-x-auto">
              {metric === "capacity" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--glass-border)]">
                      <th className="text-left py-3 text-foreground-muted font-medium">Section</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--glass-border)] last:border-0">
                        <td className="py-2 text-foreground">{String(r.section_name ?? "—")}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.capacity ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {metric === "sold" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--glass-border)]">
                      <th className="text-left py-3 text-foreground-muted font-medium">Section</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Sold Online</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Capacity</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">% Sold</th>
                      {canClearSoldSection && (
                        <th className="text-right py-3 text-foreground-muted font-medium">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--glass-border)] last:border-0">
                        <td className="py-2 text-foreground">{String(r.section_name ?? "—")}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.sold_count ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.capacity ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatPercent(Number(r.sold_pct ?? 0))}</td>
                        {canClearSoldSection && (
                          <td className="py-2 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={!eventId || clearingSoldSection}
                              onClick={() =>
                                setClearSoldConfirm({
                                  sectionId:
                                    typeof r.section_id === "string" && UUID_RE.test(r.section_id)
                                      ? r.section_id
                                      : undefined,
                                  sectionName: String(r.section_name ?? "Section"),
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Clear Sold
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {metric === "occupancy" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--glass-border)]">
                      <th className="text-left py-3 text-foreground-muted font-medium">Section</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Capacity</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Sold</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Dist</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Compl</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Avail</th>
                      <th className="text-right py-3 text-foreground-muted font-medium">Occ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--glass-border)] last:border-0">
                        <td className="py-2 text-foreground">{String(r.section_name ?? "—")}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.capacity ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.sold ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.distributed ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.complimentary ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatNumber(Number(r.available ?? 0))}</td>
                        <td className="py-2 text-right text-foreground-muted">{formatPercent(Number(r.occupancy_pct ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {metric === "revenue" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--glass-border)]">
                      <th className="text-left py-3 pr-4 text-foreground-muted font-medium">Date</th>
                      <th className="text-left py-3 pr-4 text-foreground-muted font-medium">Buyer</th>
                      <th className="text-right py-3 pl-6 pr-6 text-foreground-muted font-medium whitespace-nowrap">
                        Amount
                      </th>
                      <th className="text-left py-3 pl-2 text-foreground-muted font-medium whitespace-nowrap min-w-[6.5rem]">
                        Method
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-[var(--glass-border)] last:border-0">
                        <td className="py-2 pr-4 text-foreground-muted align-top">
                          {formatDateTime(String(r.created_at ?? ""))}
                        </td>
                        <td className="py-2 pr-4 text-foreground align-top">
                          {String(r.buyer_name ?? "—")}
                          {r.buyer_email ? ` (${String(r.buyer_email)})` : ""}
                        </td>
                        <td className="py-2 pl-6 pr-6 text-right text-foreground-muted whitespace-nowrap align-top">
                          {formatCurrency(Number(r.total_cents ?? 0))}
                        </td>
                        <td className="py-2 pl-2 text-foreground-muted capitalize whitespace-nowrap align-top">
                          {String(r.payment_method ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(metric === "distributed" || metric === "complimentary") && (
                <GroupedByPersonTableWithActions
                  rows={rows}
                  formatNumber={formatNumber}
                  canRelease={canRelease}
                  onReleased={refetch}
                  recipientFallbackLabel={metric === "distributed" ? distributedRecipientNames : null}
                />
              )}
              {metric === "admitted" && (
                <GroupedBySectionTable
                  rows={rows}
                  formatNumber={formatNumber}
                  formatDateTime={formatDateTime}
                  eventId={eventId}
                  canDeleteAdmissions={canDeleteAdmissions}
                  onDeleted={refetch}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function buildExistingDataForCapacity(sectionsSales: SectionSales[]): { rows: Record<string, unknown>[] } {
  return {
    rows: sectionsSales.map((s) => ({
      section_name: s.section_name,
      capacity: s.capacity,
    })),
  };
}

export function buildExistingDataForSold(sectionsSales: SectionSales[]): { rows: Record<string, unknown>[] } {
  return {
    rows: sectionsSales.map((s) => ({
      section_id: s.section_id,
      section_name: s.section_name,
      sold_count: s.sold_count,
      capacity: s.capacity,
      sold_pct:
        s.capacity > 0
          ? Number(((s.sold_count / s.capacity) * 100).toFixed(1))
          : 0,
    })),
  };
}

export function buildExistingDataForOccupancy(vssBreakdown: VssBreakdown[]): { rows: Record<string, unknown>[] } {
  return {
    rows: vssBreakdown.map((v) => {
      const cap = v.sold + v.distributed + v.complimentary + v.available;
      const occ = cap > 0 ? ((v.sold + v.distributed + v.complimentary) / cap) * 100 : 0;
      return {
        section_name: v.section_name,
        capacity: cap,
        sold: v.sold,
        distributed: v.distributed,
        complimentary: v.complimentary,
        available: v.available,
        occupancy_pct: Math.round(occ * 10) / 10,
      };
    }),
  };
}
