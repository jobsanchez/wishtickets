"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/ui/number-stepper";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";

interface ReservationConfig {
  ttl_minutes?: number;
  warn_before_minutes?: number;
  heartbeat_divisor?: number;
}

export function SeatSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [saving, setSaving] = useState(false);
  const [reservation, setReservation] = useState<ReservationConfig>({
    ttl_minutes: 15,
    warn_before_minutes: 1,
    heartbeat_divisor: 2,
  });

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
        if (data.reservation) setReservation((prev) => ({ ...prev, ...data.reservation }));
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [showPermissionDialog]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Settings saved.");
      router.refresh();
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading seat settings…"
        subtitle="Reservation timers and heartbeat options."
      />
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={saving}
        message="Saving seat settings"
        subtitle="Admin settings"
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <div className="space-y-8">
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Reservation config</h3>
        <p className="text-sm text-foreground-muted mb-6">
          TTL, expiry warning, and heartbeat for reservation carts.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-foreground-muted">TTL (minutes)</Label>
            <NumberStepper
              min={1}
              max={60}
              value={reservation.ttl_minutes ?? 15}
              onChange={(n) =>
                setReservation((p) => ({ ...p, ttl_minutes: n }))
              }
              className="mt-1"
              aria-label="TTL in minutes"
            />
          </div>
          <div>
            <Label className="text-foreground-muted">Warn before expiry (minutes)</Label>
            <NumberStepper
              min={0}
              max={10}
              value={reservation.warn_before_minutes ?? 1}
              onChange={(n) =>
                setReservation((p) => ({
                  ...p,
                  warn_before_minutes: n,
                }))
              }
              className="mt-1"
              aria-label="Warn before expiry in minutes"
            />
          </div>
          <div>
            <Label className="text-foreground-muted">Heartbeat divisor</Label>
            <NumberStepper
              min={2}
              max={10}
              value={reservation.heartbeat_divisor ?? 2}
              onChange={(n) =>
                setReservation((p) => ({
                  ...p,
                  heartbeat_divisor: n,
                }))
              }
              className="mt-1"
              aria-label="Heartbeat divisor"
            />
          </div>
        </div>
        <p className="text-xs text-foreground-muted mt-2">
          Heartbeat interval = TTL / divisor (e.g. 15min / 2 = 7.5min).
        </p>
      </div>

      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
    </>
  );
}
