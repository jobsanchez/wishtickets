"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import { ImagePlus, X } from "lucide-react";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { getDirectTicketImageDisplayUrl } from "@/lib/image-proxy";
import {
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
  TICKET_TEMPLATE_WIDTH_PX,
  TICKET_TEMPLATE_HEIGHT_PX,
  TICKET_TEMPLATE_UPLOAD_MAX_BYTES,
  TICKET_TEMPLATE_ACCEPT,
  isTicketTemplateMimeType,
} from "@/lib/ticket-canvas-spec";

const PLACEHOLDERS = [
  "{{eventTitle}}",
  "{{eventDate}}",
  "{{venueName}}",
  "{{buyerName}}",
  "{{ticketDetails}}",
  "{{subtotal}}",
  "{{discount}}",
  "{{total}}",
  "{{discountDescription}}",
  "{{invoiceNumber}}",
  "{{eventImageBlock}}",
  "{{eventImageUrl}}",
  "{{addOnsBlock}}",
];

export function EmailTicketSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailSubject, setEmailSubject] = useState("Your tickets: {{eventTitle}}");
  const [emailBody, setEmailBody] = useState(
    `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#f97316;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Order Confirmation</div>
  </td></tr>
  {{eventImageBlock}}
  <tr><td style="padding:24px;background:#fff;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 12px 0;font-size:18px;">Hi {{buyerName}},</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Thank you for securing your tickets to <strong>{{eventTitle}}</strong>.</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Date:</strong> {{eventDate}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Order summary:</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;font-size:18px;">
      <thead><tr style="border-bottom:2px solid #e5e7eb;"><th style="text-align:left;padding:8px 0;">Section</th><th style="text-align:left;padding:8px 0;">Seat</th><th style="text-align:right;padding:8px 0;">Price</th></tr></thead>
      <tbody>{{ticketDetails}}</tbody>
    </table>
    {{addOnsBlock}}
    <p style="margin:0 0 4px 0;font-size:18px;">Subtotal: {{subtotal}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;">Discount: {{discount}} {{discountDescription}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Total: {{total}}</strong></p>
    <p style="margin:0 0 12px 0;font-size:18px;">Invoice #: {{invoiceNumber}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Your ticket images are attached to this email as PNG files. Please have them ready upon entry.</p>
    <div style="background:#f0f9ff;border-left:4px solid #f97316;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:18px;">Your ticket images are attached as PNG files. No need to print — present the ticket image (with QR code) on your phone. If the QR code cannot be displayed or scanned, contact our Admissions Staff for assistance.</p>
    </div>
    <p style="margin:12px 0 8px 0;font-size:18px;"><strong>To ensure smooth entry:</strong></p>
    <ul style="margin:8px 0;padding-left:24px;font-size:18px;">
      <li style="margin-bottom:6px;">Keep your ticket image personal and unshared</li>
      <li style="margin-bottom:6px;">One ticket = One valid entry</li>
      <li style="margin-bottom:6px;">For temporary exit and return, approach the Admissions Desk for re-entry assistance</li>
    </ul>
    <div style="background:#f8fafc;padding:16px;margin:16px 0;border-radius:4px;">
      <p style="margin:0;font-size:18px;">If you have any questions or need support, feel free to reach out.</p>
    </div>
    <p style="margin:12px 0 0 0;font-size:18px;">Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`
  );
  const [globalTemplateUrl, setGlobalTemplateUrl] = useState<string | null>(null);
  /** Bumped on upload/remove so preview updates when the storage path is unchanged (global default.jpg upsert). */
  const [globalTemplatePreviewV, setGlobalTemplatePreviewV] = useState(0);
  const [testingEmail, setTestingEmail] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpUserConfigured, setSmtpUserConfigured] = useState(false);
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [smtpFromValue, setSmtpFromValue] = useState<string | null>(null);
  const [expectedTicketWidth, setExpectedTicketWidth] = useState(TICKET_TEMPLATE_WIDTH_PX);
  const [expectedTicketHeight, setExpectedTicketHeight] = useState(TICKET_TEMPLATE_HEIGHT_PX);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function ensureAddOnsBlockInTemplate(body: string): string {
    if (body.includes("{{addOnsBlock}}")) return body;
    const subtotalNeedle = "Subtotal:";
    const idx = body.indexOf(subtotalNeedle);
    if (idx >= 0) return `${body.slice(0, idx)}{{addOnsBlock}}\n    ${body.slice(idx)}`;
    return `${body}\n{{addOnsBlock}}`;
  }

  useEffect(() => {
    fetch("/api/test-email", { method: "GET" })
      .then((r) => r.json())
      .then((data) => setSmtpConfigured(data.configured === true))
      .catch(() => setSmtpConfigured(false));
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
        if (data === null) return;
        if (typeof data.email_ticket_subject === "string") {
          setEmailSubject(data.email_ticket_subject);
        }
        if (typeof data.email_ticket_body === "string") {
          setEmailBody(data.email_ticket_body);
        }
        if (typeof data.global_ticket_template_url === "string") {
          setGlobalTemplateUrl(data.global_ticket_template_url);
        }
        setExpectedTicketWidth(clampTicketTemplateWidthPx(data.global_ticket_width_px));
        setExpectedTicketHeight(clampTicketTemplateHeightPx(data.global_ticket_height_px));
        const parseSecret = (val: unknown): boolean =>
          val && typeof val === "object" && "configured" in val
            ? (val as { configured: boolean }).configured
            : false;
        setSmtpUserConfigured(parseSecret(data.smtp_user));
        setSmtpPassConfigured(parseSecret(data.smtp_pass));
        if (typeof data.smtp_from === "string") {
          setSmtpFromValue(data.smtp_from);
          setSmtpFrom(data.smtp_from);
        }
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [showPermissionDialog]);

  async function handleSaveEmail() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_ticket_subject: emailSubject,
          email_ticket_body: ensureAddOnsBlockInTemplate(emailBody),
        }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Email template saved.");
      router.refresh();
    } catch {
      toast.error("Failed to save email template.");
    } finally {
      setSaving(false);
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
      toast.error(
        `File too large. Maximum size is ${Math.round(TICKET_TEMPLATE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`
      );
      e.target.value = "";
      return;
    }
    try {
      const { width, height } = await checkImageDimensions(file);
      if (width !== expectedTicketWidth || height !== expectedTicketHeight) {
        toast.error(
          `Template must be exactly ${expectedTicketWidth} × ${expectedTicketHeight} px. This file is ${width} × ${height} px.`
        );
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
        const err = await patchRes.json();
        throw new Error(err.error ?? "Failed to save");
      }
      setGlobalTemplateUrl(newUrl);
      setGlobalTemplatePreviewV((v) => v + 1);
      toast.success("Global ticket template uploaded");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSendTestEmail() {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/test-email", { method: "POST" });
      const data = await res.json();
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      toast.success(`Test email sent to your account. Check your inbox (and spam).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setTestingEmail(false);
    }
  }

  async function handleSaveSmtp() {
    setSavingSmtp(true);
    try {
      const body: Record<string, string> = {};
      if (smtpUser.trim()) body.smtp_user = smtpUser.trim();
      if (smtpPass.trim()) body.smtp_pass = smtpPass.trim();
      if (smtpFrom.trim() !== (smtpFromValue ?? "")) body.smtp_from = smtpFrom.trim();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) throw new Error("Failed to save");
      toast.success("SMTP credentials saved.");
      setSmtpUser("");
      setSmtpPass("");
      if (smtpUser.trim()) setSmtpUserConfigured(true);
      if (smtpPass.trim()) setSmtpPassConfigured(true);
      if (smtpFrom.trim()) setSmtpFromValue(smtpFrom.trim());
      fetch("/api/test-email", { method: "GET" })
        .then((r) => r.json())
        .then((d) => setSmtpConfigured(d.configured === true))
        .catch(() => {});
      router.refresh();
    } catch {
      toast.error("Failed to save SMTP credentials.");
    } finally {
      setSavingSmtp(false);
    }
  }

  async function handleRemoveTemplate() {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global_ticket_template_url: null }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) throw new Error("Failed to remove");
      setGlobalTemplateUrl(null);
      setGlobalTemplatePreviewV((v) => v + 1);
      toast.success("Global ticket template removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  const emailTicketProgress = useMemo(() => {
    if (uploading) {
      return {
        message: "Uploading default ticket template",
        subtitle: "Email & tickets",
        detail: FLOATING_PROGRESS_PRESETS.uploading.detail,
      };
    }
    if (savingSmtp) {
      return {
        message: "Saving SMTP credentials",
        subtitle: "Email & tickets",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    if (saving) {
      return {
        message: "Saving email template",
        subtitle: "Email & tickets",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    if (testingEmail) {
      return {
        message: "Sending test email",
        subtitle: "Email & tickets",
        detail: "Delivering a sample message using your SMTP settings.",
      };
    }
    return {
      message: "Working…",
      subtitle: "Email & tickets",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [uploading, savingSmtp, saving, testingEmail]);

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading settings…"
        subtitle="Email and ticket template options."
      />
    );
  }

  return (
    <div className="space-y-8">
      <FloatingProgressBar
        active={savingSmtp || saving || testingEmail || uploading}
        message={emailTicketProgress.message}
        subtitle={emailTicketProgress.subtitle}
        detail={emailTicketProgress.detail}
      />
      {smtpConfigured === false && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-4">
          <p className="font-medium text-amber-200">SMTP not configured — ticket emails will not be sent</p>
          <p className="mt-1 text-sm text-amber-200/80">
            Store SMTP credentials below, or add SMTP_USER and SMTP_PASS to environment variables (e.g. Netlify Site env vars, or .env.local). See docs/EMAIL_SETUP.md for Gmail setup.
          </p>
        </div>
      )}
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">SMTP credentials</h3>
        <p className="text-sm text-foreground-muted mb-6">
          Store Gmail (or other SMTP) credentials for sending ticket emails. Values are saved in the database. Env vars (SMTP_USER, SMTP_PASS) are used as fallback when DB is empty.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-foreground-muted">SMTP user (email)</Label>
            <Input
              type="text"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder={smtpUserConfigured ? "Leave blank to keep current" : "your.email@gmail.com"}
              className="mt-1"
              autoComplete="off"
            />
          </div>
          <div>
            <Label className="text-foreground-muted">SMTP password (App Password)</Label>
            <Input
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={smtpPassConfigured ? "Leave blank to keep current" : "16-char App Password"}
              className="mt-1"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="mt-4">
          <Label className="text-foreground-muted">From address (optional)</Label>
          <Input
            type="text"
            value={smtpFrom}
            onChange={(e) => setSmtpFrom(e.target.value)}
            placeholder="Wish Tickets Portal <sales@wish1075.com>"
            className="mt-1"
            autoComplete="off"
          />
          <p className="text-xs text-foreground-muted mt-1">
            Gmail requirement: From email must match SMTP_USER or be a &quot;Send mail as&quot; alias.
          </p>
        </div>
        <Button type="button" onClick={handleSaveSmtp} disabled={savingSmtp} className="mt-4">
          {savingSmtp ? "Saving..." : "Save SMTP credentials"}
        </Button>
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Ticket email template</h3>
        <p className="text-sm text-foreground-muted mb-6">
          Customize the subject and body of the email sent to buyers with their tickets. Use placeholders:{" "}
          {PLACEHOLDERS.map((p) => (
            <code key={p} className="text-[var(--wish-orange)] mx-0.5">{p}</code>
          ))}
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-foreground-muted">Subject</Label>
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Your tickets: {{eventTitle}}"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-foreground-muted">Body (HTML)</Label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="<p>Your tickets for {{eventTitle}}...</p>"
              rows={8}
              className="flex w-full rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground mt-1 font-mono"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-4">
          <Button type="button" onClick={handleSaveEmail} disabled={saving}>
            {saving ? "Saving..." : "Save email template"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleSendTestEmail} disabled={testingEmail}>
            {testingEmail ? "Sending..." : "Send test email"}
          </Button>
        </div>
        <p className="text-sm text-foreground-muted mt-2">
          Test email sends to your account address. Use it to verify SMTP works.
        </p>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Global default ticket template</h3>
        <p className="text-sm text-foreground-muted mb-6">
          Upload a JPEG (.jpg) image used as the default ticket background for all events that don&apos;t have their own template. Must be exactly {expectedTicketWidth} × {expectedTicketHeight} px. Max{" "}
          {Math.round(TICKET_TEMPLATE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.
        </p>
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
            {globalTemplateUrl ? "Replace template" : "Upload template"}
          </Button>
          {globalTemplateUrl && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleRemoveTemplate}
              disabled={uploading}
            >
              <X className="w-4 h-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
        {globalTemplateUrl && (
          <div className="relative inline-block mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                getDirectTicketImageDisplayUrl(
                  globalTemplateUrl,
                  String(globalTemplatePreviewV)
                ) ?? globalTemplateUrl
              }
              alt="Global ticket template preview"
              className="h-48 w-auto rounded-lg border border-[var(--glass-border)] object-contain"
            />
          </div>
        )}
        <p className="text-sm text-foreground-muted mt-4">
          To edit overlay positions (event info, QR code, etc.) for <strong>all</strong> events, go to{" "}
          <NavButtonWithProgress
            href="/admin/ticket-layout"
            variant="link"
            className="text-[var(--wish-orange)] hover:underline p-0 h-auto font-normal inline"
            loadingMessage="Loading ticket layout…"
          >
            Ticket layout
          </NavButtonWithProgress>
          .
        </p>
      </div>
    </div>
  );
}
