"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RouteLoading } from "@/components/ui/route-loading";
import { toast } from "@/lib/toast";
import {
  DEFAULT_TICKET_SCAN_SOURCE_MODE,
  parseTicketScanSourceMode,
  TICKET_SCAN_SOURCE_KEY,
  TICKET_SCAN_SOURCE_OPTIONS,
  type TicketScanSourceMode,
} from "@/lib/admissions/ticket-scan-source";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

export function TicketScanningSourceSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<TicketScanSourceMode>(DEFAULT_TICKET_SCAN_SOURCE_MODE);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json();
      })
      .then((data) => {
        setMode(parseTicketScanSourceMode(data?.[TICKET_SCAN_SOURCE_KEY]));
      })
      .catch(() => {
        toast.error("Failed to load ticket scanning source.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [TICKET_SCAN_SOURCE_KEY]: mode,
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      toast.success("Ticket scanning source updated.");
    } catch {
      toast.error("Failed to save ticket scanning source.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading ticket scanning source…"
        subtitle="Admissions scan source configuration."
      />
    );
  }

  return (
    <section className="glass rounded-2xl border border-[var(--glass-border)] p-5 md:p-6 space-y-4">
      <FloatingProgressBar
        active={saving}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message="Saving scan source"
        subtitle="Ticket Scanning Source"
      />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Ticket Scanning Source</h2>
        <p className="text-sm text-foreground-muted">
          Choose how the admissions scanner resolves ticket codes for online scan and offline sync.
        </p>
      </div>
      <div className="space-y-2 max-w-xl">
        <Label htmlFor="scan-source-select">Scan source mode</Label>
        <Select value={mode} onValueChange={(v) => setMode(parseTicketScanSourceMode(v))}>
          <SelectTrigger id="scan-source-select" disabled={saving}>
            <SelectValue placeholder="Select scan source" />
          </SelectTrigger>
          <SelectContent>
            {TICKET_SCAN_SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </section>
  );
}
