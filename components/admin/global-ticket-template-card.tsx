"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Download, ImagePlus, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/alert-dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { getDirectTicketImageDisplayUrl, getProxiedImageUrl } from "@/lib/image-proxy";
import { toast } from "@/lib/toast";
import {
  TICKET_TEMPLATE_ACCEPT,
  TICKET_TEMPLATE_UPLOAD_MAX_BYTES,
  isTicketTemplateMimeType,
} from "@/lib/ticket-canvas-spec";

const DEFAULT_TEMPLATE_PATH = "/default-ticket-template.png";

interface GlobalTicketTemplateCardProps {
  /** Stored global template URL, or null when using built-in default. */
  templateUrl: string | null;
  expectedWidthPx: number;
  expectedHeightPx: number;
  canManageGlobalTemplate: boolean;
  onTemplateUrlChange: (url: string | null) => void;
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

export function GlobalTicketTemplateCard({
  templateUrl,
  expectedWidthPx,
  expectedHeightPx,
  canManageGlobalTemplate,
  onTemplateUrlChange,
}: GlobalTicketTemplateCardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewVersion, setPreviewVersion] = useState(() => Date.now());
  const [uploading, setUploading] = useState(false);
  const [sizeWarningOpen, setSizeWarningOpen] = useState(false);
  const [dimensionWarningOpen, setDimensionWarningOpen] = useState(false);
  const [dimensionWarningDetails, setDimensionWarningDetails] = useState("");

  useEffect(() => {
    setPreviewVersion(Date.now());
  }, [templateUrl]);

  const displayUrl = templateUrl
    ? (getDirectTicketImageDisplayUrl(templateUrl, String(previewVersion)) ?? templateUrl)
    : DEFAULT_TEMPLATE_PATH;

  const downloadFetchUrl = useMemo(() => {
    if (!templateUrl) return DEFAULT_TEMPLATE_PATH;
    return getProxiedImageUrl(templateUrl, String(previewVersion), true) ?? templateUrl;
  }, [templateUrl, previewVersion]);

  async function handleDownload() {
    const filename = templateUrl ? "ticket_template.jpg" : "default-ticket-template.png";
    try {
      const res = await fetch(downloadFetchUrl);
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
      if (width !== expectedWidthPx || height !== expectedHeightPx) {
        setDimensionWarningDetails(
          `Your image is ${width} × ${height} px. The global template must be exactly ${expectedWidthPx} × ${expectedHeightPx} px (current ticket output size). Save ticket output settings first if you changed dimensions.`
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
      fd.append("isGlobalTemplate", "true");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const newUrl = data.url as string;
      const patchRes = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global_ticket_template_url: newUrl }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save");
      }
      onTemplateUrlChange(newUrl);
      setPreviewVersion(Date.now());
      toast.success("Global ticket template updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemove() {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global_ticket_template_url: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to remove");
      }
      onTemplateUrlChange(null);
      setPreviewVersion(Date.now());
      toast.success("Global ticket template removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-4 space-y-4">
      <FloatingProgressBar
        active={uploading}
        {...FLOATING_PROGRESS_PRESETS.uploading}
        message="Uploading global ticket template"
        subtitle="ticket_template.jpg"
      />
      <div>
        <h3 className="text-sm font-semibold text-foreground">Global ticket background</h3>
        <p className="text-xs text-foreground-muted mt-1">
          JPEG used as the default ticket art for all events without their own template. Saved as{" "}
          <code className="text-[11px] rounded bg-muted/40 px-1 py-0.5">ticket_template.jpg</code> in
          storage. Click the preview for fullscreen.
        </p>
      </div>

      <PhotoProvider>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <PhotoView src={displayUrl}>
            <button
              type="button"
              className="group relative rounded-lg border border-[var(--glass-border)] overflow-hidden bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] max-w-full"
              aria-label="View ticket template fullscreen"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt="Global ticket template"
                className="max-h-64 w-auto max-w-full object-contain block cursor-zoom-in"
              />
              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                <Maximize2 className="w-3.5 h-3.5" />
                Fullscreen
              </span>
            </button>
          </PhotoView>

          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <p className="text-xs text-foreground-muted">
              Required size: <strong>{expectedWidthPx} × {expectedHeightPx} px</strong> (matches
              global ticket output). Max{" "}
              {Math.round(TICKET_TEMPLATE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB, JPEG only.
            </p>
            {!templateUrl && (
              <p className="text-xs text-foreground-muted">
                No custom file is set — the built-in placeholder is shown until a super admin uploads
                a template.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                {templateUrl ? "Download ticket_template.jpg" : "Download default template"}
              </Button>
              {canManageGlobalTemplate && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={TICKET_TEMPLATE_ACCEPT}
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={uploading}
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    Replace image
                  </Button>
                  {templateUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemove}
                      disabled={uploading}
                      className="border-[var(--glass-border)]"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  ) : null}
                </>
              )}
            </div>
            {!canManageGlobalTemplate && (
              <p className="text-xs text-foreground-muted">
                Only <strong>super admins</strong> can replace or remove the global template.
              </p>
            )}
          </div>
        </div>
      </PhotoProvider>

      <AlertDialog
        open={sizeWarningOpen}
        onOpenChange={setSizeWarningOpen}
        title="File too large"
        description={`The ticket template must be ${Math.round(TICKET_TEMPLATE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB or smaller.`}
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
