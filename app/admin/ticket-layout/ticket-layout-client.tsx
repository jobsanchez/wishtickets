"use client";

import { useEffect, useMemo, useState } from "react";
import { GlobalTicketTemplateCard } from "@/components/admin/global-ticket-template-card";
import { TicketLayoutEditor, type TicketLayoutConfig } from "@/components/admin/ticket-layout-editor";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import {
  clampTicketDpi,
  clampTicketJpegQuality,
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
  TICKET_TEMPLATE_HEIGHT_PX,
  TICKET_TEMPLATE_JPEG_QUALITY,
  TICKET_TEMPLATE_MAX_DPI,
  TICKET_TEMPLATE_MAX_HEIGHT_PX,
  TICKET_TEMPLATE_MAX_JPEG_QUALITY,
  TICKET_TEMPLATE_MAX_WIDTH_PX,
  TICKET_TEMPLATE_MIN_DPI,
  TICKET_TEMPLATE_MIN_HEIGHT_PX,
  TICKET_TEMPLATE_MIN_JPEG_QUALITY,
  TICKET_TEMPLATE_MIN_WIDTH_PX,
  TICKET_RENDER_DPI,
  TICKET_TEMPLATE_WIDTH_PX,
} from "@/lib/ticket-canvas-spec";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

interface GlobalConfig {
  ticket_template_image_url: string | null;
  ticket_layout_config: unknown;
  global_ticket_width_px: number;
  global_ticket_height_px: number;
  global_ticket_jpeg_quality: number;
  global_ticket_dpi: number;
}

interface TicketLayoutPageClientProps {
  globalConfig: GlobalConfig | null;
  /** Only super admins may PATCH global ticket template URL (matches `/api/admin/settings`). */
  canManageGlobalTemplate?: boolean;
}

export function TicketLayoutPageClient({
  globalConfig,
  canManageGlobalTemplate = false,
}: TicketLayoutPageClientProps) {
  const router = useRouter();
  const [liveTemplateUrl, setLiveTemplateUrl] = useState<string | null>(
    globalConfig?.ticket_template_image_url ?? null
  );
  useEffect(() => {
    setLiveTemplateUrl(globalConfig?.ticket_template_image_url ?? null);
  }, [globalConfig?.ticket_template_image_url]);

  const previewUrl = liveTemplateUrl ?? "/default-ticket-template.png";
  const initialConfig =
    globalConfig?.ticket_layout_config &&
    typeof globalConfig.ticket_layout_config === "object" &&
    "eventInfo" in globalConfig.ticket_layout_config
      ? (globalConfig.ticket_layout_config as TicketLayoutConfig)
      : undefined;

  const editorKey = useMemo(
    () =>
      JSON.stringify([
        globalConfig?.ticket_layout_config ?? null,
        globalConfig?.global_ticket_width_px ?? TICKET_TEMPLATE_WIDTH_PX,
        globalConfig?.global_ticket_height_px ?? TICKET_TEMPLATE_HEIGHT_PX,
      ]),
    [
      globalConfig?.ticket_layout_config,
      globalConfig?.global_ticket_height_px,
      globalConfig?.global_ticket_width_px,
    ]
  );
  const [width, setWidth] = useState<number>(
    clampTicketTemplateWidthPx(globalConfig?.global_ticket_width_px ?? TICKET_TEMPLATE_WIDTH_PX)
  );
  const [height, setHeight] = useState<number>(
    clampTicketTemplateHeightPx(globalConfig?.global_ticket_height_px ?? TICKET_TEMPLATE_HEIGHT_PX)
  );
  const [jpegQuality, setJpegQuality] = useState<number>(
    clampTicketJpegQuality(globalConfig?.global_ticket_jpeg_quality ?? TICKET_TEMPLATE_JPEG_QUALITY)
  );
  const [dpi, setDpi] = useState<number>(clampTicketDpi(globalConfig?.global_ticket_dpi ?? TICKET_RENDER_DPI));
  const [saving, setSaving] = useState(false);
  const widthInches = width / Math.max(1, dpi);
  const heightInches = height / Math.max(1, dpi);

  async function handleSaveRenderConfig() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global_ticket_width_px: width,
          global_ticket_height_px: height,
          global_ticket_jpeg_quality: jpegQuality,
          global_ticket_dpi: dpi,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to save settings");
      toast.success("Ticket render settings saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <GlobalTicketTemplateCard
        templateUrl={liveTemplateUrl}
        expectedWidthPx={width}
        expectedHeightPx={height}
        canManageGlobalTemplate={canManageGlobalTemplate}
        onTemplateUrlChange={setLiveTemplateUrl}
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Global ticket output settings</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted">Width (px)</p>
            <NumberStepper
              value={width}
              onChange={setWidth}
              min={TICKET_TEMPLATE_MIN_WIDTH_PX}
              max={TICKET_TEMPLATE_MAX_WIDTH_PX}
              aria-label="Ticket width in pixels"
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted">Height (px)</p>
            <NumberStepper
              value={height}
              onChange={setHeight}
              min={TICKET_TEMPLATE_MIN_HEIGHT_PX}
              max={TICKET_TEMPLATE_MAX_HEIGHT_PX}
              aria-label="Ticket height in pixels"
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted">JPEG quality (1-100)</p>
            <NumberStepper
              value={jpegQuality}
              onChange={setJpegQuality}
              min={TICKET_TEMPLATE_MIN_JPEG_QUALITY}
              max={TICKET_TEMPLATE_MAX_JPEG_QUALITY}
              aria-label="Ticket JPEG quality"
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted">DPI</p>
            <NumberStepper
              value={dpi}
              onChange={setDpi}
              min={TICKET_TEMPLATE_MIN_DPI}
              max={TICKET_TEMPLATE_MAX_DPI}
              aria-label="Ticket output DPI"
            />
          </div>
        </div>
        <p className="text-xs text-foreground-muted">
          Changing ticket size may require re-uploading templates so image dimensions match the configured output size.
        </p>
        <p className="text-xs text-foreground-muted">
          Current print size at {dpi} DPI: {widthInches.toFixed(2)} in × {heightInches.toFixed(2)} in
        </p>
        <Button onClick={handleSaveRenderConfig} disabled={saving}>
          {saving ? "Saving..." : "Save ticket output settings"}
        </Button>
      </div>
      <TicketLayoutEditor
        key={editorKey}
        templateImageUrl={previewUrl}
        initialConfig={initialConfig ?? null}
        canvasWidth={width}
        canvasHeight={height}
      />
    </div>
  );
}
