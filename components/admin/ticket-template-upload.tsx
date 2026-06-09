"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Download, ImagePlus, Maximize2, X } from "lucide-react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import {
  getDirectTicketImageDisplayUrl,
  getProxiedImageUrl,
} from "@/lib/image-proxy";
import { AlertDialog } from "@/components/ui/alert-dialog";
import {
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
  TICKET_TEMPLATE_WIDTH_PX,
  TICKET_TEMPLATE_HEIGHT_PX,
  TICKET_TEMPLATE_UPLOAD_MAX_BYTES,
  TICKET_TEMPLATE_ACCEPT,
  isTicketTemplateMimeType,
} from "@/lib/ticket-canvas-spec";

interface TicketTemplateUploadProps {
  eventId: string;
  initialUrl?: string | null;
  onSaved?: (url: string | null) => void;
}

export function TicketTemplateUpload({
  eventId,
  initialUrl,
  onSaved,
}: TicketTemplateUploadProps) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [previewVersion, setPreviewVersion] = useState<number>(() => Date.now());
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sizeWarningOpen, setSizeWarningOpen] = useState(false);
  const [dimensionWarningOpen, setDimensionWarningOpen] = useState(false);
  const [dimensionWarningDetails, setDimensionWarningDetails] = useState<string>("");
  const [expectedTicketWidth, setExpectedTicketWidth] = useState(TICKET_TEMPLATE_WIDTH_PX);
  const [expectedTicketHeight, setExpectedTicketHeight] = useState(TICKET_TEMPLATE_HEIGHT_PX);
  const [globalTemplateUrl, setGlobalTemplateUrl] = useState<string | null>(null);
  const [globalPreviewVersion, setGlobalPreviewVersion] = useState<number>(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setGlobalTemplateUrl(
          typeof data.global_ticket_template_url === "string"
            ? data.global_ticket_template_url
            : null
        );
        setGlobalPreviewVersion(Date.now());
        setExpectedTicketWidth(clampTicketTemplateWidthPx(data.global_ticket_width_px));
        setExpectedTicketHeight(clampTicketTemplateHeightPx(data.global_ticket_height_px));
      })
      .catch(() => {});
  }, []);

  const globalDisplayUrl = globalTemplateUrl
    ? (getDirectTicketImageDisplayUrl(globalTemplateUrl, globalPreviewVersion.toString()) ??
      globalTemplateUrl)
    : "/default-ticket-template.png";

  async function handleDownloadGlobalTemplate() {
    const downloadUrl = globalTemplateUrl
      ? (getProxiedImageUrl(globalTemplateUrl, globalPreviewVersion.toString(), true) ??
        globalTemplateUrl)
      : "/default-ticket-template.png";
    const filename = globalTemplateUrl ? "ticket_template.jpg" : "default-ticket-template.png";
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error("Download failed. Try opening the image in a new tab.");
    }
  }

  function checkImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };
      img.src = objectUrl;
    });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isTicketTemplateMimeType(file.type)) {
      toast.error("Ticket template must be a JPEG (.jpg) file.");
      e.target.value = "";
      return;
    }
    if (file.size > TICKET_TEMPLATE_UPLOAD_MAX_BYTES) {
      setSizeWarningOpen(true);
      e.target.value = "";
      return;
    }
    try {
      const { width, height } = await checkImageDimensions(file);
      if (width !== expectedTicketWidth || height !== expectedTicketHeight) {
        setDimensionWarningDetails(
          `Your image is ${width} × ${height} px. The ticket template must be exactly ${expectedTicketWidth} × ${expectedTicketHeight} px.`
        );
        setDimensionWarningOpen(true);
        e.target.value = "";
        return;
      }
    } catch {
      toast.error("Failed to read image dimensions.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "ticket-templates");
      fd.append("eventId", eventId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const newUrl = data.url as string;
      const patchRes = await fetch(`/api/admin/events/${eventId}/ticket-template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_template_image_url: newUrl }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        throw new Error(err.error ?? "Failed to save");
      }
      setUrl(newUrl);
      setPreviewVersion(Date.now());
      onSaved?.(newUrl);
      router.refresh();
      toast.success("Ticket template uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemove() {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/ticket-template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_template_image_url: null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to remove");
      }
      setUrl(null);
      setPreviewVersion(Date.now());
      onSaved?.(null);
      router.refresh();
      toast.success("Ticket template removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  async function handleRegenerate() {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "Regenerate ticket images for this event using the current template? This will overwrite existing ticket images for all bookings of this event."
          );
    if (!confirmed) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/tickets/regenerate-images`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to regenerate ticket images");
      }
      const regenerated = (data.regenerated as number | undefined) ?? 0;
      const message =
        (data.message as string | undefined) ??
        `Regenerated ${regenerated} ticket image${regenerated === 1 ? "" : "s"}.`;
      toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate ticket images");
    } finally {
      setRegenerating(false);
    }
  }

  const templateProgress = useMemo(() => {
    if (uploading) {
      return {
        message: "Uploading ticket template",
        subtitle: "This event",
        detail: FLOATING_PROGRESS_PRESETS.uploading.detail,
      };
    }
    if (regenerating) {
      return {
        message: "Regenerating ticket images",
        subtitle: "This event",
        detail:
          "Rebuilding ticket images for bookings that use this template. This can take a while.",
      };
    }
    return { message: "Working…", subtitle: "Ticket template", detail: undefined };
  }, [uploading, regenerating]);

  return (
    <div className="space-y-4">
      <FloatingProgressBar
        active={uploading || regenerating}
        message={templateProgress.message}
        subtitle={templateProgress.subtitle}
        detail={templateProgress.detail}
      />
      <p className="text-sm text-foreground-muted">
        Upload a JPEG (.jpg) image for the ticket background. Must be exactly {expectedTicketWidth} ×{" "}
        {expectedTicketHeight} px. Max {Math.round(TICKET_TEMPLATE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.
      </p>
      {!url && (
        <p className="text-xs text-foreground-muted">
          This event is currently using the <span className="font-semibold">global</span> ticket
          template (set in Email &amp; Tickets settings). Uploading a template here will override
          the global one for this event only. Removing the template will switch this event back to
          the global default and will not change other events.
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={TICKET_TEMPLATE_ACCEPT}
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus className="w-4 h-4 mr-2" />
          {url ? "Replace template" : "Upload template"}
        </Button>
        {url && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRemove}
            disabled={uploading || regenerating}
            className="border-[var(--glass-border)]"
          >
            <X className="w-4 h-4 mr-2" />
            Remove
          </Button>
        )}
        {url && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRegenerate}
            disabled={uploading || regenerating}
          >
            Regenerate ticket images for this event
          </Button>
        )}
      </div>
      {url && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getDirectTicketImageDisplayUrl(url, previewVersion.toString()) ?? url}
            alt="Ticket template preview"
            className="h-48 w-auto rounded-lg border border-[var(--glass-border)] object-contain"
          />
        </div>
      )}
      <div className="rounded-lg border border-[var(--glass-border)] p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-foreground mb-1">Global template (reference)</h3>
        <p className="text-xs text-foreground-muted mb-3">
          Default background used when this event has no custom template. Click preview to open full
          screen, or download a copy.
        </p>
        <PhotoProvider>
          <div className="flex flex-wrap items-start gap-4">
            <PhotoView src={globalDisplayUrl}>
              <button
                type="button"
                className="group relative rounded-lg border border-[var(--glass-border)] overflow-hidden bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)]"
                aria-label="View global ticket template fullscreen"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={globalDisplayUrl}
                  alt="Global ticket template"
                  className="h-40 w-auto object-contain block cursor-zoom-in"
                />
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <Maximize2 className="w-3.5 h-3.5" />
                  Fullscreen
                </span>
              </button>
            </PhotoView>
            <div className="space-y-2">
              <Button type="button" variant="secondary" onClick={handleDownloadGlobalTemplate}>
                <Download className="w-4 h-4 mr-2" />
                {globalTemplateUrl ? "Download ticket_template.jpg" : "Download default template"}
              </Button>
              <p className="text-xs text-foreground-muted">
                Expected size: {expectedTicketWidth} × {expectedTicketHeight} px.
              </p>
            </div>
          </div>
        </PhotoProvider>
      </div>
      <AlertDialog
        open={sizeWarningOpen}
        onOpenChange={setSizeWarningOpen}
        title="File too large"
        description={`The ticket template must be ${Math.round(TICKET_TEMPLATE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB or smaller. Please choose a smaller file or re-export the JPEG at lower quality.`}
      />
      <AlertDialog
        open={dimensionWarningOpen}
        onOpenChange={setDimensionWarningOpen}
        title="Wrong dimensions"
        description={dimensionWarningDetails}
      />
    </div>
  );
}
