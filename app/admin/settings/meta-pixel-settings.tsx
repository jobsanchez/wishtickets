"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RouteLoading } from "@/components/ui/route-loading";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import {
  META_PIXEL_APP_CONFIG_KEY,
  normalizeMetaPixelId,
  parseMetaPixelAppConfig,
  type MetaPixelAppConfig,
} from "@/lib/meta-pixel-config";

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j?.error && typeof j.error === "string") return j.error;
  } catch {
    /* ignore */
  }
  return "Request failed";
}

export function MetaPixelSettings() {
  const router = useRouter();
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [savingPixel, setSavingPixel] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pixelIdDraft, setPixelIdDraft] = useState("");
  const [committedPixelId, setCommittedPixelId] = useState("");

  const applyMetaPixel = useCallback((raw: unknown) => {
    const cfg = parseMetaPixelAppConfig(raw);
    setEnabled(cfg.enabled);
    setPixelIdDraft(cfg.pixel_id);
    setCommittedPixelId(cfg.pixel_id);
  }, []);

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
        applyMetaPixel(data[META_PIXEL_APP_CONFIG_KEY]);
      })
      .catch(() => toast.error("Failed to load Meta Pixel settings"))
      .finally(() => setLoading(false));
  }, [applyMetaPixel, showPermissionDialog]);

  const effectivePixelId = normalizeMetaPixelId(pixelIdDraft) || committedPixelId;

  async function patchMetaPixel(payload: MetaPixelAppConfig) {
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [META_PIXEL_APP_CONFIG_KEY]: payload }),
    });
    if (res.status === 403) {
      showPermissionDialog();
      throw new Error("forbidden");
    }
    if (!res.ok) {
      throw new Error(await readErrorMessage(res));
    }
  }

  async function onEnabledChange(checked: boolean) {
    if (checked && !effectivePixelId) {
      toast.error("Enter a Pixel ID before enabling Meta Pixel.");
      return;
    }
    setToggling(true);
    try {
      await patchMetaPixel({
        enabled: checked,
        pixel_id: effectivePixelId,
      });
      setEnabled(checked);
      const nextId = effectivePixelId;
      setCommittedPixelId(nextId);
      setPixelIdDraft(nextId);
      toast.success(checked ? "Meta Pixel enabled." : "Meta Pixel disabled.");
      router.refresh();
    } catch (e) {
      if ((e as Error).message !== "forbidden") {
        toast.error((e as Error).message || "Failed to update Meta Pixel.");
      }
    } finally {
      setToggling(false);
    }
  }

  async function handleSavePixelId() {
    const normalized = normalizeMetaPixelId(pixelIdDraft);
    if (enabled && !normalized) {
      toast.error("Pixel ID cannot be empty while Meta Pixel is enabled.");
      return;
    }
    setSavingPixel(true);
    try {
      await patchMetaPixel({
        enabled,
        pixel_id: normalized,
      });
      setCommittedPixelId(normalized);
      setPixelIdDraft(normalized);
      toast.success("Pixel ID saved.");
      router.refresh();
    } catch (e) {
      if ((e as Error).message !== "forbidden") {
        toast.error((e as Error).message || "Failed to save Pixel ID.");
      }
    } finally {
      setSavingPixel(false);
    }
  }

  const progressActive = toggling || savingPixel;
  const progressMessage = toggling ? "Updating Meta Pixel" : savingPixel ? "Saving Pixel ID" : "Saving";

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading Meta Pixel…"
        subtitle="Facebook / Meta site tag."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <FloatingProgressBar
        active={progressActive}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message={progressMessage}
        subtitle="Meta Pixel"
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Meta Pixel</h3>
          <p className="text-sm text-foreground-muted mt-1">
            Loads the official Meta Pixel on the public site when enabled (production only). Pixel ID
            is stored in app configuration.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--glass-border)] bg-background/40 px-4 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="meta-pixel-enabled" className="text-base">
              Meta Pixel enabled
            </Label>
            <p className="text-xs text-foreground-muted">Applies on the next page load sitewide.</p>
          </div>
          <Switch
            id="meta-pixel-enabled"
            checked={enabled}
            disabled={toggling || savingPixel}
            onCheckedChange={(v) => void onEnabledChange(v)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="meta-pixel-id">Pixel ID</Label>
          <Input
            id="meta-pixel-id"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 2040348413586033"
            value={pixelIdDraft}
            disabled={toggling || savingPixel}
            onChange={(e) => setPixelIdDraft(e.target.value)}
          />
          <p className="text-xs text-foreground-muted">Digits only. Save before enabling if you pasted spaces or labels.</p>
          <Button
            type="button"
            variant="secondary"
            disabled={toggling || savingPixel}
            onClick={() => void handleSavePixelId()}
          >
            Save Pixel ID
          </Button>
        </div>
      </div>
    </div>
  );
}
