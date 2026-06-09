"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumberStepper } from "@/components/ui/number-stepper";
import { RouteLoading } from "@/components/ui/route-loading";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import {
  clampInactivityMinutes,
  DEFAULT_INACTIVITY_ENABLED,
  DEFAULT_INACTIVITY_MINUTES,
  INACTIVITY_ENABLED_KEY,
  INACTIVITY_MINUTES_KEY,
} from "@/lib/inactivity-config";

export function SessionSecuritySettings() {
  const router = useRouter();
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(DEFAULT_INACTIVITY_ENABLED);
  const [minutes, setMinutes] = useState(DEFAULT_INACTIVITY_MINUTES);

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
        if (!data) return;
        setEnabled(data[INACTIVITY_ENABLED_KEY] !== false);
        setMinutes(clampInactivityMinutes(data[INACTIVITY_MINUTES_KEY]));
      })
      .catch(() => toast.error("Failed to load inactivity settings"))
      .finally(() => setLoading(false));
  }, [showPermissionDialog]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [INACTIVITY_ENABLED_KEY]: enabled,
          [INACTIVITY_MINUTES_KEY]: clampInactivityMinutes(minutes),
        }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) throw new Error("Failed to save inactivity settings");
      toast.success("Inactivity settings saved.");
      router.refresh();
    } catch {
      toast.error("Failed to save inactivity settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading session security…"
        subtitle="Inactivity auto logout."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <FloatingProgressBar
        active={saving}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message="Saving inactivity settings"
        subtitle="Session security"
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Session security</h3>
          <p className="text-sm text-foreground-muted mt-1">
            Automatically sign users out after inactivity, with cart and PayMongo flow exceptions.
            Enforcement runs when the user navigates (middleware) and on a 30-minute server sweeper—not
            via continuous client heartbeats.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <div>
            <Label className="text-foreground-muted">Enable inactivity auto logout</Label>
            <p className="text-xs text-foreground-muted mt-0.5">
              When enabled, users idle longer than the minutes below are signed out on their next
              navigation or when the periodic sweeper flags the session.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="inactivity-minutes" className="text-foreground-muted">
            Inactivity timeout (minutes)
          </Label>
          <NumberStepper
            value={minutes}
            min={1}
            max={120}
            onChange={(value) => setMinutes(clampInactivityMinutes(value))}
            className="max-w-48"
            aria-label="Inactivity timeout in minutes"
          />
        </div>

        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
