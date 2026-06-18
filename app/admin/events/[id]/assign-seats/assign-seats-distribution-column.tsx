"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  ChevronDown,
  ChevronRight,
  List,
  Loader2,
  Mail,
  Package,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SectionTicketSummaryLines } from "./assign-seats-section-summary";
import {
  assignmentExpectedTickets,
  assignmentGeneratedTicketImages,
  assignmentTicketCount,
  mergeSectionCountRowsForAssignments,
  sectionCountRowsForAssignment,
} from "./assign-seats-helpers";
import type { Assignment, SectionInfo, SectionZipStatus, SeatInfo } from "./assign-seats-types";

/** Pastel status colors for dark UI; stronger contrast on light theme cards. */
const STATUS_EMERALD_OK =
  "text-emerald-400 [html[data-theme=light]_&]:text-emerald-700";
const STATUS_AMBER_WARN =
  "text-amber-300 [html[data-theme=light]_&]:text-amber-900";
/** Slightly brighter amber on dark; still dark enough on light cards. */
const STATUS_AMBER_MUTED =
  "text-amber-400 [html[data-theme=light]_&]:text-amber-900";
const STATUS_RED_ERR = "text-red-400 [html[data-theme=light]_&]:text-red-700";

export type AssignSeatsDistributionColumnProps = {
  assignmentsEmpty: boolean;
  groupedByRecipient: Array<[string, Assignment[]]>;
  seatsById: Map<string, SeatInfo>;
  sections: SectionInfo[];
  expandedRecipients: Set<string>;
  setExpandedRecipients: Dispatch<SetStateAction<Set<string>>>;
  zipStatusBySection: Record<string, SectionZipStatus>;
  zippingAssignmentId: string | null;
  submitting: boolean;
  sendingEmailId: string | null;
  editingEmailId: string | null;
  editingEmailValue: string;
  setEditingEmailId: (id: string | null) => void;
  setEditingEmailValue: (v: string) => void;
  getAssignmentSectionIds: (a: Assignment) => string[];
  onManageSeatsClick: (a: Assignment) => void;
  onConfirm: (assignmentId: string) => void;
  onReleaseClick: (assignmentId: string) => void;
  onOpenAdjustAllocation: (a: Assignment) => void;
  onReverseClick: (assignmentId: string) => void;
  onSendEmail: (assignmentId: string) => void;
  onRezipAssignment: (a: Assignment) => void;
  onDeleteAssignmentZip: (a: Assignment) => void;
  onSaveEmail: (assignmentId: string, email: string) => void;
};

export function AssignSeatsDistributionColumn({
  assignmentsEmpty,
  groupedByRecipient,
  seatsById,
  sections,
  expandedRecipients,
  setExpandedRecipients,
  zipStatusBySection,
  zippingAssignmentId,
  submitting,
  sendingEmailId,
  editingEmailId,
  editingEmailValue,
  setEditingEmailId,
  setEditingEmailValue,
  getAssignmentSectionIds,
  onManageSeatsClick,
  onConfirm,
  onReleaseClick,
  onOpenAdjustAllocation,
  onReverseClick,
  onSendEmail,
  onRezipAssignment,
  onDeleteAssignmentZip,
  onSaveEmail,
}: AssignSeatsDistributionColumnProps) {
  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <h2 className="text-lg font-semibold text-foreground mb-1">Manual Distribution</h2>
      {assignmentsEmpty ? (
        <p className="text-foreground-muted">No manual distribution yet.</p>
      ) : (
        <div className="space-y-4">
          {groupedByRecipient.map(([normalizedKey, recipientAssignments]) => {
            const displayName =
              normalizedKey === "__unnamed__"
                ? "Unnamed"
                : (recipientAssignments[0]?.recipient_name ?? "").trim();
            const recipientEmailForHeader = recipientAssignments
              .map((x) => (x.recipient_email ?? "").trim())
              .find((e) => e.length > 0);
            const recipientHeaderLabel =
              recipientEmailForHeader && recipientEmailForHeader.length > 0
                ? `${displayName} - ${recipientEmailForHeader}`
                : displayName;
            const totalTickets = recipientAssignments.reduce(
              (sum, a) => sum + assignmentTicketCount(a),
              0
            );
            const recipientSectionSummary = mergeSectionCountRowsForAssignments(
              recipientAssignments,
              seatsById,
              sections
            );
            const summary =
              recipientAssignments.length > 1
                ? `${totalTickets} tickets across ${recipientAssignments.length} distributions`
                : totalTickets === 1
                  ? "1 ticket"
                  : `${totalTickets} tickets`;

            const isExpanded = expandedRecipients.has(normalizedKey);
            const toggleExpand = () => {
              setExpandedRecipients((prev) => {
                const next = new Set(prev);
                if (next.has(normalizedKey)) next.delete(normalizedKey);
                else next.add(normalizedKey);
                return next;
              });
            };

            return (
              <div
                key={normalizedKey}
                className="rounded-lg border border-[var(--glass-border)] bg-white/5 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={toggleExpand}
                  className="w-full p-4 flex items-center gap-2 text-left hover:bg-white/5 transition-colors border-b border-[var(--glass-border)]"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-foreground-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" />
                  )}
                  <p className="font-medium text-foreground flex-1 min-w-0 text-left break-words">
                    {recipientHeaderLabel}
                  </p>
                  {!isExpanded && (
                    <p className="text-sm text-foreground-muted">{summary}</p>
                  )}
                </button>
                {isExpanded && (
                  <>
                    <div className="px-4 pt-2 pb-1">
                      <p className="text-sm text-foreground-muted">{summary}</p>
                      <SectionTicketSummaryLines
                        rows={recipientSectionSummary.rows}
                        total={recipientSectionSummary.total}
                      />
                    </div>
                    <div className="divide-y divide-[var(--glass-border)]">
                      {recipientAssignments.map((a) => {
                        const sectionSummary = sectionCountRowsForAssignment(
                          a,
                          seatsById,
                          sections
                        );
                        const sectionIds = getAssignmentSectionIds(a);
                        const zipStatuses = sectionIds.map((id) => zipStatusBySection[id]);
                        const noSectionMapping = sectionIds.length === 0;
                        const zipReady =
                          !noSectionMapping &&
                          zipStatuses.every((s) => s?.status === "completed" && !!s.zipObjectPath);
                        const zipHasFailure = zipStatuses.some((s) => s?.status === "failed");
                        const zipHasActive = zipStatuses.some(
                          (s) => s?.status === "pending" || s?.status === "processing"
                        );
                        const zipPendingCount = zipStatuses.filter(
                          (s) => s?.status === "pending" || s?.status === "processing"
                        ).length;
                        const zipReadyCount = zipStatuses.filter(
                          (s) => s?.status === "completed" && !!s?.zipObjectPath
                        ).length;
                        const activeZipStatuses = zipStatuses.filter(
                          (s): s is SectionZipStatus =>
                            !!s && (s.status === "pending" || s.status === "processing")
                        );
                        const zipAvgProgressPct =
                          activeZipStatuses.length > 0
                            ? Math.round(
                                activeZipStatuses.reduce((sum, s) => sum + (s.progressPct ?? 0), 0) /
                                  activeZipStatuses.length
                              )
                            : 0;
                        const zipStageLabel =
                          activeZipStatuses
                            .map((s) => (s.currentStage ?? "").trim())
                            .find((x) => x.length > 0 && x !== "pending" && x !== "processing") ??
                          (zipHasActive ? "Preparing ZIP files" : "");
                        const zipStatusToneClass = zipReady
                          ? STATUS_EMERALD_OK
                          : noSectionMapping
                            ? STATUS_AMBER_WARN
                            : zipHasFailure
                              ? STATUS_RED_ERR
                              : zipHasActive
                                ? STATUS_AMBER_WARN
                                : "text-foreground-muted";
                        const zipStatusText = zipReady
                          ? `ZIP ready (${zipReadyCount}/${sectionIds.length} sections)`
                          : noSectionMapping
                            ? "No section mapping for this booking"
                            : zipHasFailure
                              ? "ZIP failed for one or more sections"
                              : zipHasActive
                                ? `ZIP in progress (${zipPendingCount} section${zipPendingCount === 1 ? "" : "s"})`
                                : `ZIP not generated (${zipReadyCount}/${sectionIds.length} ready)`;
                        const zipProgressText = zipHasActive
                          ? `${zipAvgProgressPct}% · ${zipStageLabel}`
                          : null;
                        const isThisZipBusy = zippingAssignmentId === a.id;
                        const zipFailureDetail = zipHasFailure
                          ? zipStatuses
                              .map((s) =>
                                s?.status === "failed" ? (s.errorMessage ?? "").trim() : ""
                              )
                              .find((msg) => msg.length > 0) ?? null
                          : null;
                        const zipStatusAndProgressText =
                          zipHasActive && zipProgressText
                            ? `${zipStatusText} · ${zipProgressText}`
                            : isThisZipBusy && !zipHasFailure && !zipReady && !zipHasActive
                              ? "Creating section ZIPs… (this can take a minute on large orders)"
                              : zipStatusText;
                        const showZipActivitySpinner =
                          !zipHasFailure &&
                          (zipHasActive ||
                            (isThisZipBusy && !zipReady && !zipHasActive));
                        const isConfirmedWithBooking =
                          a.status === "confirmed" && Boolean(a.booking_id);
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "flex gap-2 px-4 py-2",
                              isConfirmedWithBooking
                                ? "flex-col items-stretch"
                                : "flex flex-wrap items-center justify-between"
                            )}
                          >
                            <div>
                              <p className="text-sm text-foreground-muted">
                                {new Date(a.created_at).toLocaleString()}
                              </p>
                              <SectionTicketSummaryLines
                                rows={sectionSummary.rows}
                                total={sectionSummary.total}
                              />
                              <p className="text-xs text-foreground-muted capitalize">
                                {a.status}
                                {a.distribution_category === "complementary" && (
                                  <span className={cn("ml-1.5", STATUS_AMBER_MUTED)}>
                                    • Complimentary
                                  </span>
                                )}
                              </p>
                              {a.status === "confirmed" && a.booking_id && (
                                <p
                                  className={cn(
                                    "text-xs",
                                    assignmentGeneratedTicketImages(a) >= assignmentExpectedTickets(a)
                                      ? STATUS_EMERALD_OK
                                      : assignmentGeneratedTicketImages(a) === 0
                                        ? STATUS_RED_ERR
                                        : STATUS_AMBER_WARN
                                  )}
                                >
                                  Ticket images: {assignmentGeneratedTicketImages(a)} /{" "}
                                  {assignmentExpectedTickets(a)}
                                  {assignmentGeneratedTicketImages(a) === 0 &&
                                    " (generate tickets in Seat Configurator)"}
                                </p>
                              )}
                              {a.status === "confirmed" && a.booking_id && (
                                <p
                                  className={cn(
                                    "text-xs flex items-center gap-2 flex-wrap",
                                    showZipActivitySpinner ? STATUS_AMBER_WARN : zipStatusToneClass
                                  )}
                                >
                                  {showZipActivitySpinner && (
                                    <Loader2
                                      className="h-3.5 w-3.5 shrink-0 animate-spin"
                                      aria-hidden
                                    />
                                  )}
                                  <span>{zipStatusAndProgressText}</span>
                                </p>
                              )}
                              {a.status === "confirmed" && a.booking_id && zipFailureDetail && (
                                <p className={cn("text-[11px]", STATUS_RED_ERR)}>{zipFailureDetail}</p>
                              )}
                            </div>
                            {a.status === "reserved" && (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onManageSeatsClick(a)}
                                  disabled={submitting}
                                >
                                  <List className="h-3.5 w-3 mr-1" />
                                  Manage seats
                                </Button>
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => onConfirm(a.id)}
                                  disabled={submitting}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => onReleaseClick(a.id)}
                                  disabled={submitting}
                                >
                                  Release
                                </Button>
                              </div>
                            )}
                            {isConfirmedWithBooking && (
                              <div className="flex w-full flex-col gap-2 items-center">
                                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => onOpenAdjustAllocation(a)}
                                    disabled={submitting}
                                  >
                                    Adjust Allocation
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => onReverseClick(a.id)}
                                    disabled={submitting}
                                  >
                                    Reverse
                                  </Button>
                                  {a.recipient_email && (
                                    <Button
                                      size="sm"
                                      variant="success"
                                      onClick={() => onSendEmail(a.id)}
                                      disabled={
                                        !!sendingEmailId || !zipReady || zippingAssignmentId === a.id
                                      }
                                      title={
                                        zipReady ? undefined : "Generate ZIP first before sending email"
                                      }
                                    >
                                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                                      Send email ({a.email_sent_count ?? 0})
                                    </Button>
                                  )}
                                  {!a.recipient_email && editingEmailId !== a.id && (
                                    <Button
                                      size="sm"
                                      variant="success"
                                      onClick={() => {
                                        setEditingEmailId(a.id);
                                        setEditingEmailValue("");
                                      }}
                                      disabled={submitting}
                                    >
                                      Add email
                                    </Button>
                                  )}
                                </div>
                                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="!border-0 !bg-sky-600 !text-white hover:!bg-sky-500 focus-visible:ring-sky-500 disabled:!border-slate-300 disabled:!bg-slate-200 disabled:!text-slate-700 disabled:!opacity-100 disabled:[&_svg]:!text-slate-700"
                                    onClick={() => onRezipAssignment(a)}
                                    disabled={submitting || zippingAssignmentId === a.id}
                                  >
                                    <Package className="h-3.5 w-3.5 mr-1.5" />
                                    Create Zip
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="!border-0 !bg-sky-600 !text-white hover:!bg-sky-500 focus-visible:ring-sky-500 disabled:!border-slate-300 disabled:!bg-slate-200 disabled:!text-slate-700 disabled:!opacity-100 disabled:[&_svg]:!text-slate-700"
                                    onClick={() => onDeleteAssignmentZip(a)}
                                    disabled={submitting || zippingAssignmentId === a.id}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    Delete ZIP
                                  </Button>
                                </div>
                                {editingEmailId === a.id ? (
                                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                                    <Input
                                      type="email"
                                      value={editingEmailValue}
                                      onChange={(e) => setEditingEmailValue(e.target.value)}
                                      placeholder="Email address"
                                      className="h-8 max-w-[180px]"
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          onSaveEmail(a.id, editingEmailValue);
                                        }
                                        if (e.key === "Escape") {
                                          setEditingEmailId(null);
                                          setEditingEmailValue("");
                                        }
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onSaveEmail(a.id, editingEmailValue)}
                                      disabled={submitting || !editingEmailValue.trim()}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingEmailId(null);
                                        setEditingEmailValue("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : a.recipient_email ? (
                                  <div className="flex w-full justify-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-sky-500/50 text-sky-300 hover:bg-sky-500/15 hover:text-sky-200 [html[data-theme=light]_&]:border-sky-600/45 [html[data-theme=light]_&]:text-sky-900 [html[data-theme=light]_&]:hover:bg-sky-500/12 [html[data-theme=light]_&]:hover:text-sky-950"
                                      onClick={() => {
                                        setEditingEmailId(a.id);
                                        setEditingEmailValue(a.recipient_email ?? "");
                                      }}
                                    >
                                      Edit email
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
