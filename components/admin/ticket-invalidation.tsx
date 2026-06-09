"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { toast } from "@/lib/toast";
import {
  adminInvalidateTicketAction,
  adminVerifyTicketAction,
  type AdminVerifyTicketActionResult,
} from "@/app/admin/ticket-invalidation/actions";

type VerifiedTicket = {
  ticketId: string;
  bookingId: string;
  eventTitle: string | null;
  eventStart: string | null;
  seatGroup: string | null;
  sectionDisplay: string | null;
  admitted: boolean;
  reEntryGranted: boolean;
  seatingType: "assigned" | "free" | "standing";
  sectionLabel: string | null;
  rowLabel: string | null;
  seatLabel: string | null;
};

function formatEventStart(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${dateLabel} | ${timeLabel}`;
}

function formatSeatLabel(ticket: VerifiedTicket): string {
  if (ticket.seatingType === "free") return "Free Seating";
  if (ticket.seatingType === "standing") return "Standing";

  const row = ticket.rowLabel?.trim();
  const seat = ticket.seatLabel?.trim();
  if (row && seat) return `Row ${row} Seat ${seat}`;
  if (seat) return `Seat ${seat}`;
  if (row) return `Row ${row}`;
  return ticket.sectionLabel || "N/A";
}

export function TicketInvalidation() {
  const [qrInput, setQrInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [invalidating, setInvalidating] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifiedTicket | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const progressCopy = useMemo(() => {
    if (invalidating) {
      return {
        message: "Invalidating ticket",
        subtitle: "Ticket invalidation",
        detail:
          "Removing the ticket and restoring seat availability. Please keep this tab open.",
      };
    }
    if (verifying) {
      return {
        message: "Verifying ticket",
        subtitle: "Ticket invalidation",
        detail: "Looking up the encrypted QR and loading ticket details.",
      };
    }
    return {
      message: FLOATING_PROGRESS_PRESETS.genericLoad.message,
      subtitle: "Ticket invalidation",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [invalidating, verifying]);

  async function handleVerify() {
    const encryptedQr = qrInput.trim();
    if (!encryptedQr) {
      toast.error("Please enter an encrypted QR value.");
      return;
    }
    setVerifying(true);
    try {
      const result: AdminVerifyTicketActionResult = await adminVerifyTicketAction(encryptedQr);
      if (result.httpStatus !== 200 || !result.ok || !result.ticket) {
        throw new Error(result.error ?? "Ticket verification failed");
      }
      setVerifyResult(result.ticket);
      toast.success("Ticket verified. You can now invalidate it.");
    } catch (error) {
      setVerifyResult(null);
      toast.error(error instanceof Error ? error.message : "Ticket verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleInvalidate() {
    if (!verifyResult) return;
    setInvalidating(true);
    try {
      const inv = await adminInvalidateTicketAction(qrInput.trim(), verifyResult.ticketId);
      if (inv.httpStatus !== 200 || !inv.ok) {
        throw new Error(inv.error ?? "Failed to invalidate ticket");
      }
      setConfirmOpen(false);
      setQrInput("");
      setVerifyResult(null);
      toast.success(
        inv.seatStatus === "reserved"
          ? "Ticket invalidated. Seat is now reserved for assignment."
          : "Ticket invalidated. Seat is now available."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invalidate ticket");
    } finally {
      setInvalidating(false);
    }
  }

  return (
    <div className="space-y-6">
      <FloatingProgressBar
        active={verifying || invalidating}
        message={progressCopy.message}
        subtitle={progressCopy.subtitle}
        detail={progressCopy.detail}
      />
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Invalidate Ticket</h1>
        <p className="text-base text-foreground-muted max-w-2xl">
          Verify using the seat&apos;s current encrypted QR (same value stored on the seat record)
          or the ticket&apos;s codes, then invalidate. This deletes the ticket, frees the seat, and
          generates a new encrypted QR for that seat so future sales use a different code.
        </p>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-5 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Verify ticket</h2>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="encryptedQr">
            Encrypted QR
          </label>
          <Input
            id="encryptedQr"
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder="Enter encrypted QR"
            disabled={verifying || invalidating}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-foreground-muted">
            Use Verify Ticket first. Invalidate is locked until verification succeeds.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={handleVerify}
            disabled={verifying || invalidating || qrInput.trim().length === 0}
          >
            {verifying ? "Verifying…" : "Verify Ticket"}
          </Button>
        </div>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Verified ticket details</h2>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!verifyResult || invalidating || verifying}
          >
            Invalidate Ticket
          </Button>
        </div>
        {!verifyResult ? (
          <p className="text-sm text-foreground-muted">
            No verified ticket yet. Verify an encrypted QR to enable invalidation.
          </p>
        ) : (
          <div className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-4 space-y-1.5 text-sm">
            <p className="text-foreground">
              <span className="text-foreground-muted">Ticket ID:</span> {verifyResult.ticketId}
            </p>
            <p className="text-foreground">
              <span className="text-foreground-muted">Booking ID:</span> {verifyResult.bookingId}
            </p>
            <p className="text-foreground">
              <span className="text-foreground-muted">Event:</span>{" "}
              {verifyResult.eventTitle || "Unknown event"}
            </p>
            <p className="text-foreground-muted" suppressHydrationWarning>
              Event start: {formatEventStart(verifyResult.eventStart)}
            </p>
            <p className="text-foreground">
              <span className="text-foreground-muted">Seat group:</span>{" "}
              {verifyResult.seatGroup ?? "—"}
            </p>
            <p className="text-foreground">
              <span className="text-foreground-muted">Section:</span>{" "}
              {verifyResult.sectionDisplay ?? "—"}
            </p>
            <p className="text-foreground">
              <span className="text-foreground-muted">Seat:</span>{" "}
              {formatSeatLabel(verifyResult)}
            </p>
            <p className="text-foreground">
              <span className="text-foreground-muted">Admission status:</span>{" "}
              {verifyResult.admitted ? "Already admitted" : "Not admitted"}
              {verifyResult.reEntryGranted ? " (re-entry granted)" : ""}
            </p>
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalidate this ticket?</DialogTitle>
            <DialogDescription>
              This action is not reversible. The ticket will be permanently deleted and the
              linked seat will be made sellable again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={invalidating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleInvalidate}
              disabled={invalidating || !verifyResult}
            >
              {invalidating ? "Invalidating…" : "Confirm Invalidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

