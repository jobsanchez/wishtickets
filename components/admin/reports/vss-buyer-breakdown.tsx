"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import {
  useVssBuyerSummaries,
  useVssBuyerTickets,
  type VssBuyerSummary,
} from "@/hooks/use-vss-buyer-data";

interface VssBuyerBreakdownProps {
  eventId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

function formatPaymentMethod(method: string): string {
  return method
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function methodsLabel(buyer: VssBuyerSummary): string {
  return buyer.payment_methods
    .map(({ method, count }) => `${formatPaymentMethod(method)} (${count})`)
    .join(", ");
}

function buyerRowKey(buyer: VssBuyerSummary): string {
  return `${buyer.buyer_name}|${buyer.buyer_email}`;
}

function collectUniqueBuyerEmails(buyers: VssBuyerSummary[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const buyer of buyers) {
    const trimmed = buyer.buyer_email.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(trimmed);
  }
  return emails.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function BuyerTicketTable({
  eventId,
  buyer,
  dateFrom,
  dateTo,
  expanded,
}: {
  eventId: string;
  buyer: VssBuyerSummary;
  dateFrom: string | null;
  dateTo: string | null;
  expanded: boolean;
}) {
  const { data, isLoading, error } = useVssBuyerTickets({
    eventId,
    buyerName: buyer.buyer_name,
    buyerEmail: buyer.buyer_email,
    dateFrom,
    dateTo,
    enabled: expanded,
  });

  const tickets = data?.tickets ?? [];

  if (isLoading) {
    return (
      <div className="ml-6 flex items-center gap-2 border-l border-[var(--glass-border)] py-3 pl-4 text-sm text-foreground-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tickets…
      </div>
    );
  }

  if (error) {
    return (
      <p className="ml-6 border-l border-[var(--glass-border)] py-2 pl-4 text-sm text-red-400">
        {String(error.message ?? "Failed to load tickets")}
      </p>
    );
  }

  if (tickets.length === 0) {
    return (
      <p className="ml-6 border-l border-[var(--glass-border)] py-2 pl-4 text-sm text-foreground-muted">
        No tickets found for this buyer.
      </p>
    );
  }

  return (
    <div className="ml-6 border-l border-[var(--glass-border)] pl-4 py-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--glass-border)]">
            <th className="text-left py-2 text-foreground-muted font-medium">Section</th>
            <th className="text-left py-2 text-foreground-muted font-medium">Row</th>
            <th className="text-left py-2 text-foreground-muted font-medium">Seat</th>
            <th className="text-left py-2 text-foreground-muted font-medium">How Bought</th>
            <th className="text-left py-2 text-foreground-muted font-medium">Purchased</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.ticket_id} className="border-b border-[var(--glass-border)] last:border-0">
              <td className="py-1.5 text-foreground">{ticket.section_name}</td>
              <td className="py-1.5 text-foreground-muted">{ticket.row_label}</td>
              <td className="py-1.5 text-foreground-muted">{ticket.seat_number}</td>
              <td className="py-1.5 text-foreground-muted">
                {formatPaymentMethod(ticket.payment_method)}
              </td>
              <td className="py-1.5 text-foreground-muted">{formatDateTime(ticket.purchased_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VssBuyerBreakdown({
  eventId = null,
  dateFrom = null,
  dateTo = null,
}: VssBuyerBreakdownProps) {
  const [cardOpen, setCardOpen] = useState(false);
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());
  const [emailsDialogOpen, setEmailsDialogOpen] = useState(false);
  const { data, isLoading, error } = useVssBuyerSummaries({
    eventId,
    dateFrom,
    dateTo,
    enabled: !!eventId && cardOpen,
  });

  const buyers = useMemo(() => data?.buyers ?? [], [data?.buyers]);

  const totalTickets = buyers.reduce((sum, buyer) => sum + buyer.ticket_count, 0);
  const totalBuyers = buyers.length;
  const uniqueEmails = useMemo(() => collectUniqueBuyerEmails(buyers), [buyers]);
  const buyersWithoutEmail = useMemo(
    () => buyers.filter((b) => !b.buyer_email.trim()).length,
    [buyers]
  );
  const emailsNewlineText = useMemo(() => uniqueEmails.join("\n"), [uniqueEmails]);
  const emailsCommaText = useMemo(() => uniqueEmails.join(", "), [uniqueEmails]);

  async function copyEmails(text: string, label: string) {
    if (!text) {
      toast.error("No buyer emails to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  const toggleBuyer = (key: string) => {
    setExpandedBuyers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-[var(--glass-border)] bg-white/5 [html[data-theme=light]_&]:bg-black/[0.03]">
      <button
        type="button"
        onClick={() => setCardOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/5 [html[data-theme=light]_&]:hover:bg-black/[0.04] transition-colors"
      >
        {cardOpen ? (
          <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
        )}
        <div className="flex flex-1 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">VSS Breakdown (Buyer List View)</p>
            <p className="text-xs text-foreground-muted">
              Grouped by buyer (name/email). Expand a buyer to load each ticket individually.
            </p>
          </div>
          {cardOpen && !isLoading && (
            <p className="text-xs text-foreground-muted shrink-0">
              {totalBuyers} buyer{totalBuyers !== 1 ? "s" : ""} · {totalTickets} ticket
              {totalTickets !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </button>

      {cardOpen && (
        <div className="border-t border-[var(--glass-border)] px-4 py-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading buyers…
            </div>
          )}

          {!isLoading && error && (
            <p className="text-sm text-red-400">{String(error.message ?? "Failed to load buyer VSS")}</p>
          )}

          {!isLoading && !error && buyers.length === 0 && (
            <p className="text-sm text-foreground-muted">No buyer purchase data found for this event/date range.</p>
          )}

          {!isLoading && !error && buyers.length > 0 && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEmailsDialogOpen(true)}
                >
                  <Mail className="h-4 w-4" />
                  Show buyers emails
                </Button>
              </div>
              <div className="divide-y divide-[var(--glass-border)]">
              {buyers.map((buyer) => {
                const key = buyerRowKey(buyer);
                const isOpen = expandedBuyers.has(key);
                return (
                  <div key={key} className="py-1">
                    <button
                      type="button"
                      onClick={() => toggleBuyer(key)}
                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-white/5 [html[data-theme=light]_&]:hover:bg-black/[0.04] transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{buyer.buyer_name}</p>
                        <p className="text-xs text-foreground-muted truncate">
                          {buyer.buyer_email || "—"}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-foreground-muted">
                          {buyer.ticket_count} ticket{buyer.ticket_count !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-foreground-muted max-w-[32rem] truncate">
                          {methodsLabel(buyer) || "—"}
                        </p>
                      </div>
                    </button>

                    {isOpen && eventId && (
                      <BuyerTicketTable
                        eventId={eventId}
                        buyer={buyer}
                        dateFrom={dateFrom}
                        dateTo={dateTo}
                        expanded={isOpen}
                      />
                    )}
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={emailsDialogOpen} onOpenChange={setEmailsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buyer emails</DialogTitle>
            <DialogDescription>
              {uniqueEmails.length} unique email{uniqueEmails.length !== 1 ? "s" : ""} in this list
              {buyersWithoutEmail > 0
                ? ` (${buyersWithoutEmail} buyer${buyersWithoutEmail !== 1 ? "s" : ""} without email omitted)`
                : ""}
              . Select all in the box below or use Copy.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            readOnly
            value={emailsNewlineText}
            placeholder="No emails on file for these buyers."
            className="min-h-[220px] font-mono text-sm resize-y"
            onFocus={(e) => e.target.select()}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uniqueEmails.length === 0}
              onClick={() => void copyEmails(emailsCommaText, "Copied comma-separated emails")}
            >
              Copy comma-separated
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={uniqueEmails.length === 0}
              onClick={() => void copyEmails(emailsNewlineText, "Copied emails (one per line)")}
            >
              <Copy className="h-4 w-4" />
              Copy all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
