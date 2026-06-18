"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import {
  DEFAULT_PAYMONGO_METHODS,
  PAYMONGO_METHOD_LIST_FEES,
  PAYMONGO_METHOD_OPTIONS,
  sanitizePaymongoMethods,
  type PaymongoMethodId,
} from "@/lib/paymongo-methods";
import {
  PAYMONGO_BUCKET_LABELS,
  PAYMONGO_PAYMENT_BUCKETS,
  DEFAULT_PAYMONGO_PROCESSING_FEES,
  parsePaymongoProcessingFees,
  serializePaymongoProcessingFees,
  type PaymongoPaymentBucket,
  type PaymongoProcessingFeesConfig,
} from "@/lib/paymongo-processing-fees";

export function PaymongoSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [mode, setMode] = useState<"test" | "live">("test");
  const [testSecret, setTestSecret] = useState("");
  const [liveSecret, setLiveSecret] = useState("");
  const [testWebhookSecret, setTestWebhookSecret] = useState("");
  const [liveWebhookSecret, setLiveWebhookSecret] = useState("");
  const [testSecretConfigured, setTestSecretConfigured] = useState(false);
  const [liveSecretConfigured, setLiveSecretConfigured] = useState(false);
  const [testWebhookConfigured, setTestWebhookConfigured] = useState(false);
  const [liveWebhookConfigured, setLiveWebhookConfigured] = useState(false);
  const [enabledMethods, setEnabledMethods] = useState<PaymongoMethodId[]>([
    ...DEFAULT_PAYMONGO_METHODS,
  ]);
  const [processingFees, setProcessingFees] = useState<PaymongoProcessingFeesConfig>(() =>
    serializePaymongoProcessingFees(DEFAULT_PAYMONGO_PROCESSING_FEES)
  );

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => {
        if (r.status === 403) {
          showPermissionDialog();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data === null) return;
        if (data.paymongo_mode === "live" || data.paymongo_mode === "test") {
          setMode(data.paymongo_mode);
        }
        const parseSecret = (val: unknown): { configured: boolean } => {
          if (val && typeof val === "object" && "configured" in val) {
            return { configured: (val as { configured: boolean }).configured };
          }
          return { configured: false };
        };
        const t = parseSecret(data.paymongo_test_secret);
        setTestSecretConfigured(t.configured);
        const l = parseSecret(data.paymongo_live_secret);
        setLiveSecretConfigured(l.configured);
        const tw = parseSecret(data.paymongo_test_webhook_secret);
        setTestWebhookConfigured(tw.configured);
        const lw = parseSecret(data.paymongo_live_webhook_secret);
        setLiveWebhookConfigured(lw.configured);
        const methods = sanitizePaymongoMethods(data.paymongo_enabled_methods);
        setEnabledMethods(methods.length > 0 ? methods : [...DEFAULT_PAYMONGO_METHODS]);
        setProcessingFees(
          serializePaymongoProcessingFees(parsePaymongoProcessingFees(data.paymongo_processing_fees))
        );
      })
      .catch(() => toast.error("Failed to load Paymongo settings"))
      .finally(() => setLoading(false));
  }, [showPermissionDialog]);

  async function handleSave() {
    if (enabledMethods.length === 0) {
      toast.error("Select at least one payment method.");
      return;
    }
    for (const bucket of PAYMONGO_PAYMENT_BUCKETS) {
      const p = processingFees[bucket].percent;
      if (!Number.isFinite(p) || p < 0 || p >= 1) {
        toast.error(`${PAYMONGO_BUCKET_LABELS[bucket]}: fee percent must be between 0 and 100 (exclusive of 100%).`);
        return;
      }
      const f = processingFees[bucket].fixed_cents;
      if (!Number.isFinite(f) || f < 0) {
        toast.error(`${PAYMONGO_BUCKET_LABELS[bucket]}: fixed fee cannot be negative.`);
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { paymongo_mode: mode };
      if (testSecret.trim()) body.paymongo_test_secret = testSecret.trim();
      if (liveSecret.trim()) body.paymongo_live_secret = liveSecret.trim();
      if (testWebhookSecret.trim()) body.paymongo_test_webhook_secret = testWebhookSecret.trim();
      if (liveWebhookSecret.trim()) body.paymongo_live_webhook_secret = liveWebhookSecret.trim();
      body.paymongo_enabled_methods = enabledMethods;
      body.paymongo_processing_fees = serializePaymongoProcessingFees(processingFees);

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) {
        let message = "Failed to save";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // Keep default error
        }
        throw new Error(message);
      }
      toast.success("Paymongo settings saved.");
      setTestSecret("");
      setLiveSecret("");
      setTestWebhookSecret("");
      setLiveWebhookSecret("");
      if (testSecret.trim()) setTestSecretConfigured(true);
      if (liveSecret.trim()) setLiveSecretConfigured(true);
      if (testWebhookSecret.trim()) setTestWebhookConfigured(true);
      if (liveWebhookSecret.trim()) setLiveWebhookConfigured(true);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Failed to save Paymongo settings.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading Paymongo…"
        subtitle="Payment keys and enabled methods."
      />
    );
  }

  function patchProcessingFeesBucket(
    bucket: PaymongoPaymentBucket,
    patch: Partial<PaymongoProcessingFeesConfig[PaymongoPaymentBucket]>
  ) {
    setProcessingFees((prev) => ({
      ...prev,
      [bucket]: { ...prev[bucket], ...patch },
    }));
  }

  function toggleMethod(methodId: PaymongoMethodId, checked: boolean) {
    setEnabledMethods((prev) => {
      if (checked) {
        if (prev.includes(methodId)) return prev;
        return [...prev, methodId];
      }
      return prev.filter((m) => m !== methodId);
    });
  }

  return (
    <div className="space-y-8">
      <FloatingProgressBar
        active={saving}
        message="Saving PayMongo settings"
        subtitle="Admin settings"
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Paymongo Control Panel</h3>
        <p className="text-sm text-foreground-muted mb-6">
          Store Paymongo API and webhook secrets in the database. Use the switch to toggle between test and live mode.
          Checkout and webhook verification will use the selected mode.
        </p>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Switch
              checked={mode === "live"}
              onCheckedChange={(checked) => setMode(checked ? "live" : "test")}
            />
            <div>
              <Label className="text-foreground-muted">Mode</Label>
              <p className="text-sm text-foreground font-medium">
                {mode === "live" ? "Live" : "Test"}
              </p>
              <p className="text-xs text-foreground-muted mt-0.5">
                {mode === "live" ? "Production payments" : "Test payments use test keys and webhook secrets"}
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Label className="text-foreground-muted">Test secret key</Label>
              <Input
                type="password"
                value={testSecret}
                onChange={(e) => setTestSecret(e.target.value)}
                placeholder={testSecretConfigured ? "Leave blank to keep current" : "Enter test key"}
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-foreground-muted">Live secret key</Label>
              <Input
                type="password"
                value={liveSecret}
                onChange={(e) => setLiveSecret(e.target.value)}
                placeholder={liveSecretConfigured ? "Leave blank to keep current" : "Enter live key"}
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Label className="text-foreground-muted">Test webhook secret</Label>
              <Input
                type="password"
                value={testWebhookSecret}
                onChange={(e) => setTestWebhookSecret(e.target.value)}
                placeholder={testWebhookConfigured ? "Leave blank to keep current" : "Enter test webhook secret"}
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-foreground-muted">Live webhook secret</Label>
              <Input
                type="password"
                value={liveWebhookSecret}
                onChange={(e) => setLiveWebhookSecret(e.target.value)}
                placeholder={liveWebhookConfigured ? "Leave blank to keep current" : "Enter live webhook secret"}
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--glass-border)] p-4 space-y-4">
            <div>
              <Label className="text-foreground-muted">Checkout processing surcharge</Label>
              <p className="text-xs text-foreground-muted mt-1">
                Buyers pay <span className="font-mono">net ticket total + surcharge</span>. Percent applies to{" "}
                <strong>net</strong> (after promos): surcharge includes <span className="font-mono">⌈net × percent⌉</span>{" "}
                plus fixed PHP where the fee model is <em>percent + fixed</em>, or <span className="font-mono">max(⌈net × percent⌉, fixed)</span>{" "}
                for <em>max</em> (typical direct-debit minimums). Tune these cushions vs PayMongo&apos;s actual fees.
              </p>
            </div>
            <div className="space-y-4">
              {PAYMONGO_PAYMENT_BUCKETS.map((bucket) => {
                const cfg = processingFees[bucket];
                const pctDisplay = (cfg.percent * 100).toFixed(4).replace(/\.?0+$/, "");
                const fixedPeso = (cfg.fixed_cents / 100).toFixed(2);
                return (
                  <div
                    key={bucket}
                    className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_1fr_1fr] sm:items-end border-t border-[var(--glass-border)] pt-4 first:border-t-0 first:pt-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{PAYMONGO_BUCKET_LABELS[bucket]}</p>
                      {bucket === "banks" ? (
                        <p className="text-xs text-foreground-muted mt-1">
                          Fee model: surcharge is the larger of <span className="font-mono">⌈net × percent⌉</span> or the
                          fixed amount.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <Label className="text-xs text-foreground-muted">Percent (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={99.999}
                        step={0.01}
                        value={Number.isFinite(cfg.percent) ? pctDisplay : ""}
                        onChange={(e) => {
                          const v = Number.parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v < 0) {
                            patchProcessingFeesBucket(bucket, { percent: 0 });
                            return;
                          }
                          patchProcessingFeesBucket(bucket, { percent: Math.min(v, 99.999) / 100 });
                        }}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-foreground-muted">Fixed (PHP)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={fixedPeso}
                        onChange={(e) => {
                          const v = Number.parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v < 0) {
                            patchProcessingFeesBucket(bucket, { fixed_cents: 0 });
                            return;
                          }
                          patchProcessingFeesBucket(bucket, { fixed_cents: Math.round(v * 100) });
                        }}
                        className="mt-1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-foreground-muted">Buyer checkout payment methods</Label>
            <p className="text-xs text-foreground-muted mt-0.5 mb-3">
              Select what buyers can see on the PayMongo checkout page.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PAYMONGO_METHOD_OPTIONS.map((method) => (
                <label
                  key={method.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--glass-border)] px-3 py-2"
                >
                  <Checkbox
                    checked={enabledMethods.includes(method.id)}
                    onCheckedChange={(checked) => toggleMethod(method.id, checked === true)}
                  />
                  <span className="text-sm text-foreground">
                    {method.label}
                    {PAYMONGO_METHOD_LIST_FEES[method.id] != null ? (
                      <span className="text-foreground-muted">
                        {" "}
                        · PayMongo {(PAYMONGO_METHOD_LIST_FEES[method.id]! * 100).toFixed(2).replace(/\.?0+$/, "")}%
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={saving} className="mt-6">
          {saving ? "Saving..." : "Save Paymongo settings"}
        </Button>
      </div>
    </div>
  );
}
