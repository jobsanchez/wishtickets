"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, ArrowLeft, AlertTriangle, Minus, Plus, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";

function formatRefundPercentForDisplay(p: number): string {
  if (!Number.isFinite(p)) return "";
  return p.toLocaleString("en-PH", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function clampRefundPercent(n: number): number {
  if (!Number.isFinite(n)) return 0.01;
  const rounded = Math.round(n * 100) / 100;
  return Math.min(100, Math.max(0.01, rounded));
}

const REFUND_REASONS: { value: "requested_by_customer" | "duplicate" | "fraudulent"; label: string }[] = [
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "duplicate", label: "Duplicate" },
  { value: "fraudulent", label: "Fraudulent" },
];

type LookupResult = {
  bookingId: string;
  paymongoId: string;
  paymentIds: string[];
  amount_cents: number | null;
  status: string | null;
  event_title: string | null;
  buyer_email: string | null;
  /** PayMongo payment source method (e.g. qrph); may be null if not resolved. */
  payment_source_type?: string | null;
  /** PayMongo blocks API refunds for some source types (e.g. QR Ph). */
  refund_via_api_blocked?: boolean;
  refund_via_api_block_reason?: string | null;
};

export default function RefundLookupPage() {
  const [bookingId, setBookingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  /** Share of payment to refund (1–100%); centavos are derived server-side for PayMongo via POST. */
  const [refundPercent, setRefundPercent] = useState(100);
  const [refundReason, setRefundReason] =
    useState<(typeof REFUND_REASONS)[number]["value"]>("requested_by_customer");
  const [refundNotes, setRefundNotes] = useState("");
  const [confirmRefundOpen, setConfirmRefundOpen] = useState(false);
  const [apiRefundBlockedDialogOpen, setApiRefundBlockedDialogOpen] = useState(false);
  const [lastRefund, setLastRefund] = useState<{
    refund_id: string;
    status: string | null;
    amount_cents: number;
  } | null>(null);

  const maxRefundCents = result?.amount_cents ?? 0;

  const effectiveRefundPercent = useMemo(() => {
    const p = Number.isFinite(refundPercent) ? refundPercent : 100;
    if (p <= 0) return 0;
    return clampRefundPercent(p);
  }, [refundPercent]);

  const refundAmountCents = useMemo(() => {
    if (maxRefundCents <= 0 || effectiveRefundPercent <= 0) return 0;
    const raw = Math.round((maxRefundCents * effectiveRefundPercent) / 100);
    return Math.min(Math.max(raw, 0), maxRefundCents);
  }, [maxRefundCents, effectiveRefundPercent]);

  useEffect(() => {
    if (!result?.paymentIds?.length) {
      setSelectedPaymentId("");
      return;
    }
    setSelectedPaymentId((prev) =>
      prev && result.paymentIds.includes(prev) ? prev : result.paymentIds[0]
    );
  }, [result?.paymentIds, result?.bookingId]);

  useEffect(() => {
    if (result?.amount_cents != null && result.amount_cents > 0) {
      setRefundPercent(100);
    }
  }, [result?.amount_cents, result?.bookingId]);

  const refundSummary = useMemo(() => {
    if (!result || !selectedPaymentId || maxRefundCents <= 0 || effectiveRefundPercent <= 0) {
      return null;
    }
    return {
      peso: (refundAmountCents / 100).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      percentLabel: formatRefundPercentForDisplay(effectiveRefundPercent),
    };
  }, [result, selectedPaymentId, maxRefundCents, refundAmountCents, effectiveRefundPercent]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const id = bookingId.trim();
    if (!id) {
      setError("Enter a booking ID");
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    setApiRefundBlockedDialogOpen(false);
    try {
      const res = await fetch(`/api/admin/refund-lookup?bookingId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setResult(data);
      if (data.refund_via_api_blocked) {
        setApiRefundBlockedDialogOpen(true);
      }
    } catch {
      setError("Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  async function submitRefund(): Promise<boolean | void> {
    if (!result || !selectedPaymentId) return false;
    const pct = clampRefundPercent(Number.isFinite(refundPercent) ? refundPercent : 100);
    setRefundPercent(pct);
    const amountCentsToPost =
      maxRefundCents <= 0
        ? 0
        : Math.min(
            Math.max(Math.round((maxRefundCents * pct) / 100), 0),
            maxRefundCents
          );
    if (amountCentsToPost < 1 || amountCentsToPost > maxRefundCents) {
      toast.error(
        "That percentage rounds to zero or exceeds the payment. Increase percentage or lower it slightly."
      );
      return false;
    }
    try {
      const res = await fetch("/api/admin/refund-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: result.bookingId,
          payment_id: selectedPaymentId,
          amount_cents: amountCentsToPost,
          reason: refundReason,
          notes: refundNotes.trim() || undefined,
        }),
      });
      let data: {
        error?: string;
        detail?: unknown;
        paymongo_status?: number;
        refund_id?: string;
        status?: string | null;
        amount_cents?: number;
      };
      try {
        data = await res.json();
      } catch {
        toast.error("Could not read server response.");
        return false;
      }
      if (!res.ok) {
        const base = data.error ?? `Refund failed (${res.status})`;
        const suffix =
          data.detail !== undefined && data.detail !== null
            ? ` — ${typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)}`
            : "";
        const pm =
          typeof data.paymongo_status === "number"
            ? ` (PayMongo HTTP ${data.paymongo_status})`
            : "";
        toast.error(`${base}${suffix}${pm}`);
        return false;
      }
      if (data.refund_id) {
        setLastRefund({
          refund_id: data.refund_id,
          status: data.status ?? null,
          amount_cents: data.amount_cents ?? amountCentsToPost,
        });
        toast.success("Refund created in PayMongo");
      }
    } catch {
      toast.error("Request failed. Check your connection and try again.");
      return false;
    }
  }


  return (
    <div>
      <NavButtonWithProgress
        href="/admin"
        variant="link"
        className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground mb-6 p-0 h-auto font-normal"
        loadingMessage="Loading dashboard…"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </NavButtonWithProgress>
      <h1 className="text-2xl font-bold text-foreground mb-2">Refund lookup</h1>
      <p className="text-foreground-muted mb-6">
        Enter the booking ID (Invoice # from the ticket email) to get the PayMongo{" "}
        <span className="text-foreground font-medium">pay_</span> ID used for refunds. We store the checkout session (
        <span className="font-mono text-foreground">cs_</span>) or link on the booking; PayMongo shows the captured
        payment as <span className="font-mono text-foreground">pay_</span> (and often a <span className="font-mono text-foreground">pi_</span>{" "}
        payment intent underneath).
      </p>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Look up payment</CardTitle>
          <CardDescription>Booking ID is the UUID shown as Invoice # in the ticket confirmation email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="bookingId">Booking ID</Label>
              <Input
                id="bookingId"
                placeholder="e.g. 69bb94f0-b110-408d-97bc-ccb74de6fd60"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                Look up
              </Button>
            </div>
          </form>

          {error && (
            <p className="mt-4 text-red-400 text-sm">{error}</p>
          )}

          {result && (
            <div className="mt-6 space-y-4 rounded-lg border border-[var(--glass-border)] p-4 bg-white/5">
              <h3 className="font-semibold text-foreground">Result</h3>
              {result.event_title && (
                <p className="text-sm text-foreground-muted">
                  <span className="text-foreground-muted">Event:</span> {result.event_title}
                </p>
              )}
              {result.buyer_email && (
                <p className="text-sm text-foreground-muted">
                  <span className="text-foreground-muted">Buyer:</span> {result.buyer_email}
                </p>
              )}
              {result.amount_cents != null && (
                <p className="text-sm text-foreground-muted">
                  <span className="text-foreground-muted">Amount:</span> ₱{(result.amount_cents / 100).toLocaleString("en-PH")}
                </p>
              )}
              {result.status && (
                <p className="text-sm text-foreground-muted">
                  <span className="text-foreground-muted">Status:</span> {result.status}
                </p>
              )}
              <p className="text-sm text-foreground-muted">
                <span className="text-foreground-muted">Stored PayMongo ID (session or link):</span>{" "}
                <span className="font-mono text-foreground">{result.paymongoId}</span>
              </p>
              <div>
                <p className="text-sm text-foreground-muted mb-2">Payment ID(s) for refund (pay_xxx):</p>
                {result.paymentIds.length > 0 ? (
                  <div className="space-y-2">
                    {result.paymentIds.map((id) => (
                      <div
                        key={id}
                        className="flex items-center gap-2 rounded bg-white/5 px-3 py-2 font-mono text-sm"
                      >
                        <span className="text-[var(--wish-orange)]">{id}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => copyToClipboard(id, "Payment ID")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-amber-400 space-y-2">
                    <p>No <span className="font-mono">pay_</span> IDs returned from PayMongo for this session yet.</p>
                    <p className="text-foreground-muted">
                      In PayMongo → Payments, search by the ticket description (event title), amount,
                      or paid date. Use the green <span className="font-mono text-foreground">pay_</span> value for
                      refunds (not <span className="font-mono">pi_</span> or <span className="font-mono">cs_</span>).
                    </p>
                  </div>
                )}
              </div>

              {result.paymentIds.length > 0 && result.amount_cents != null && result.amount_cents > 0 && (
                <div className="pt-4 border-t border-[var(--glass-border)] space-y-4">
                  <h4 className="font-semibold text-foreground">Issue refund</h4>
                  {result.payment_source_type && (
                    <p className="text-xs text-foreground-muted">
                      Payment method (PayMongo source type):{" "}
                      <span className="font-mono text-foreground">{result.payment_source_type}</span>
                    </p>
                  )}
                  {result.refund_via_api_blocked && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                      <span>
                        Refunds for this payment can’t be issued from the portal (PayMongo API limitation).
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-amber-200 underline-offset-4 hover:text-amber-50"
                        onClick={() => setApiRefundBlockedDialogOpen(true)}
                      >
                        Why, and what to do
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-foreground-muted">
                    Creates a refund in PayMongo for the selected captured payment. Set the percentage of the original
                    payment to refund (100% = full refund).
                  </p>

                  {lastRefund && (
                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm">
                      <p className="text-emerald-200 font-medium">Last refund</p>
                      <p className="font-mono text-foreground mt-1">
                        {lastRefund.refund_id}
                        {lastRefund.status != null && lastRefund.status !== "" && (
                          <span className="text-foreground-muted ml-2">({lastRefund.status})</span>
                        )}
                      </p>
                      <p className="text-foreground-muted mt-1">
                        ₱{(lastRefund.amount_cents / 100).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Payment to refund</Label>
                    {result.paymentIds.length > 1 ? (
                      <Select
                        value={selectedPaymentId}
                        onValueChange={setSelectedPaymentId}
                        disabled={!!result.refund_via_api_blocked}
                      >
                        <SelectTrigger className="w-full font-mono">
                          <SelectValue placeholder="Select pay_ ID" />
                        </SelectTrigger>
                        <SelectContent>
                          {result.paymentIds.map((id) => (
                            <SelectItem key={id} value={id} className="font-mono">
                              {id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-mono text-sm text-[var(--wish-orange)]">{selectedPaymentId}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refundPercent">Refund amount (% of payment)</Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 border-[var(--glass-border)] bg-white/5 hover:bg-white/10"
                        aria-label="Decrease by 1 percent"
                        disabled={!!result.refund_via_api_blocked}
                        onClick={() =>
                          setRefundPercent((p) => clampRefundPercent((Number.isFinite(p) ? p : 100) - 1))
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        id="refundPercent"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="max-w-[5.75rem] text-center tabular-nums font-medium"
                        disabled={!!result.refund_via_api_blocked}
                        value={Number.isFinite(refundPercent) ? String(refundPercent) : ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (v === "") {
                            setRefundPercent(0);
                            return;
                          }
                          const n = parseFloat(v.replace(",", "."));
                          if (!Number.isNaN(n)) setRefundPercent(n);
                        }}
                        onBlur={() => {
                          if (!Number.isFinite(refundPercent) || refundPercent <= 0) {
                            setRefundPercent(100);
                            return;
                          }
                          setRefundPercent((p) => clampRefundPercent(p));
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 border-[var(--glass-border)] bg-white/5 hover:bg-white/10"
                        aria-label="Increase by 1 percent"
                        disabled={!!result.refund_via_api_blocked}
                        onClick={() =>
                          setRefundPercent((p) => clampRefundPercent((Number.isFinite(p) ? p : 0) + 1))
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-foreground-muted shrink-0 pl-0.5">%</span>
                    </div>
                    {refundSummary && (
                      <p className="text-xs text-foreground-muted">
                        ≈ ₱{refundSummary.peso} ({refundSummary.percentLabel}% of ₱
                        {(maxRefundCents / 100).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        ) · {refundAmountCents.toLocaleString("en-PH")} centavos
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select
                      value={refundReason}
                      onValueChange={(v) =>
                        setRefundReason(v as (typeof REFUND_REASONS)[number]["value"])
                      }
                      disabled={!!result.refund_via_api_blocked}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REFUND_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refundNotes">Notes (optional)</Label>
                    <Input
                      id="refundNotes"
                      maxLength={255}
                      placeholder="Shown in PayMongo"
                      value={refundNotes}
                      disabled={!!result.refund_via_api_blocked}
                      onChange={(e) => setRefundNotes(e.target.value)}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      !selectedPaymentId ||
                      !!result.refund_via_api_blocked
                    }
                    onClick={() => setConfirmRefundOpen(true)}
                  >
                    Issue refund
                  </Button>

                  <ConfirmDialog
                    open={confirmRefundOpen}
                    onOpenChange={setConfirmRefundOpen}
                    title="Issue PayMongo refund?"
                    description={
                      refundSummary && selectedPaymentId
                        ? `Refund ${refundSummary.percentLabel}% (≈ ₱${refundSummary.peso}, ${refundAmountCents} centavos) for ${selectedPaymentId}. This cannot be undone in the portal.`
                        : "Confirm refund in PayMongo."
                    }
                    confirmLabel="Issue refund"
                    variant="destructive"
                    loadingMessage="Issuing refund"
                    loadingSubtitle="PayMongo"
                    loadingDetail="Creating the refund in PayMongo. Keep this tab open until it finishes."
                    onConfirm={submitRefund}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <FloatingProgressBar
        active={loading}
        {...FLOATING_PROGRESS_PRESETS.genericLoad}
        message="Looking up payment"
        subtitle="Refund lookup"
        detail="Fetching PayMongo data for this payment ID."
      />

      <Dialog open={apiRefundBlockedDialogOpen} onOpenChange={setApiRefundBlockedDialogOpen}>
        <DialogContent className="sm:max-w-md border-amber-500/25 bg-[var(--card)] shadow-xl">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-foreground pr-8">
                  Refund isn’t available from the portal for this payment
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3 text-sm text-foreground-muted">
                    <p>
                      PayMongo does not allow creating refunds through the API for some payment sources. This payment’s
                      method is <span className="font-mono text-foreground">{result?.payment_source_type ?? "—"}</span>{" "}
                      (QR Ph payments use source type{" "}
                      <span className="font-mono text-foreground">qrph</span>). The Issue refund button is disabled
                      because this screen uses PayMongo’s refund API only.
                    </p>
                    {result?.refund_via_api_block_reason && (
                      <p className="rounded-md bg-white/5 px-3 py-2 text-foreground-muted">
                        {result.refund_via_api_block_reason}
                      </p>
                    )}
                    <p className="text-foreground">
                      Use the PayMongo Dashboard to process the refund for this booking, or contact PayMongo Support if you
                      need help.
                    </p>
                  </div>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <a
              href="https://dashboard.paymongo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--glass-border)] bg-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/15"
            >
              Open PayMongo Dashboard
              <ExternalLink className="h-4 w-4 opacity-80" aria-hidden />
            </a>
            <Button type="button" className="w-full" onClick={() => setApiRefundBlockedDialogOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
