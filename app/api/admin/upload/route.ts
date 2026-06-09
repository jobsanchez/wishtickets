import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, requireSuperAdminOrCapability } from "@/lib/auth";
import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
  TICKET_TEMPLATE_WIDTH_PX,
  TICKET_TEMPLATE_HEIGHT_PX,
  TICKET_TEMPLATE_UPLOAD_MAX_BYTES,
  isTicketTemplateMimeType,
} from "@/lib/ticket-canvas-spec";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB (seat-map-images and other small buckets)
const EVENT_IMAGE_MAX_SIZE = 25 * 1024 * 1024; // 25MB (event-images; Sharp converts/optimizes)
const TEASER_VIDEO_MAX_SIZE = 200 * 1024 * 1024; // 200MB upload ceiling (phase 1 no transcode)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_TEASER_VIDEO_TYPES = ["video/mp4", "video/webm"];
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 500;
const EVENT_BANNER_WIDTH = 1280;
const EVENT_BANNER_HEIGHT = 543;
const EVENT_IMAGE_LANDSCAPE_MAX_WIDTH = 1920;
const EVENT_IMAGE_PORTRAIT_MAX_HEIGHT = 1080;
const ADD_ON_IMAGE_MAX_PX = 1000;

function buildTeaserVideoUploadPath(slug: string, mimeType: string): string {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 64) || "temp";
  const uuid = randomUUID();
  const ext = mimeType === "video/webm" ? "webm" : "mp4";
  return `teaser-videos/original/${safeSlug}/${uuid}.${ext}`;
}

function classifyStorageUploadError(
  message: string,
  isTeaserVideo: boolean
): { status: number; error: string } {
  const lower = message.toLowerCase();
  const isValidationError =
    lower.includes("mime") ||
    lower.includes("content type") ||
    lower.includes("file size") ||
    lower.includes("size limit") ||
    lower.includes("too large") ||
    lower.includes("entity too large") ||
    lower.includes("payload too large") ||
    lower.includes("allowed_mime_types") ||
    lower.includes("violates check constraint") ||
    lower.includes("check constraint");

  if (
    lower.includes("entity too large") ||
    lower.includes("payload too large") ||
    lower.includes("request body") ||
    lower.includes("body exceeded")
  ) {
    return {
      status: 413,
      error:
        "Upload is too large for this request. Try a smaller file or increase the server request body size limit.",
    };
  }

  if (isValidationError) {
    if (isTeaserVideo) {
      return {
        status: 400,
        error:
          "Teaser video upload rejected by bucket rules. Ensure `event-images` allows `video/mp4` and `video/webm` and has a 200MB file size limit, then retry.",
      };
    }
    return { status: 400, error: message };
  }

  if (lower.includes("row-level security") || lower.includes("policy")) {
    return {
      status: 403,
      error:
        "Upload blocked by storage policy. Verify your admin permissions for this bucket and try again.",
    };
  }

  return { status: 500, error: message };
}

export async function POST(request: NextRequest) {
  try {
    const contentTypeHeader = request.headers.get("content-type") ?? "";
    if (contentTypeHeader.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | {
            action?: string;
            slug?: string;
            assetKind?: string;
            mimeType?: string;
          }
        | null;
      if (body?.action === "createTeaserSignedUpload") {
        const canManage = await requireSuperAdminOrCapability("manage_events");
        if (!canManage) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (body.assetKind !== "teaser-video") {
          return NextResponse.json(
            { error: "Invalid asset kind for signed upload." },
            { status: 400 }
          );
        }
        const mimeType = (body.mimeType ?? "").trim().toLowerCase();
        if (!ALLOWED_TEASER_VIDEO_TYPES.includes(mimeType)) {
          return NextResponse.json(
            { error: "Invalid video type. Use MP4 or WebM." },
            { status: 400 }
          );
        }
        const slug = (body.slug ?? "temp").trim() || "temp";
        const path = buildTeaserVideoUploadPath(slug, mimeType);
        const supabase = await createAdminClient();
        const { data: signedData, error: signedError } = await supabase.storage
          .from("event-images")
          .createSignedUploadUrl(path);
        if (signedError || !signedData?.token) {
          return NextResponse.json(
            { error: signedError?.message ?? "Failed to create signed upload URL" },
            { status: 500 }
          );
        }
        const { data: publicData } = supabase.storage
          .from("event-images")
          .getPublicUrl(path);
        return NextResponse.json({
          bucket: "event-images",
          path,
          token: signedData.token,
          url: publicData.publicUrl,
          storageRef: `storage://event-images/${path}`,
        });
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slug = (formData.get("slug") as string) || "temp";
    const bucket = (formData.get("bucket") as string) || "event-images";
    const eventId = formData.get("eventId") as string | null;
    const isGlobalTemplate = formData.get("isGlobalTemplate") === "true";
    const isThumbnail = formData.get("isThumbnail") === "true";
    const assetKind = (formData.get("assetKind") as string | null)?.trim() ?? "";
    const isTeaserVideo = assetKind === "teaser-video";

    const isTicketTemplatesBucket = bucket === "ticket-templates";
    if (isTicketTemplatesBucket && isGlobalTemplate) {
      if (!(await requireSuperAdmin())) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      const canManage = await requireSuperAdminOrCapability(
        isTicketTemplatesBucket ? "manage_ticket_templates" : "manage_events"
      );
      if (!canManage) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (bucket === "event-banners" && !eventId?.trim()) {
      return NextResponse.json(
        { error: "eventId is required for event-banners uploads" },
        { status: 400 }
      );
    }

    const sizeLimit =
      isTeaserVideo
        ? TEASER_VIDEO_MAX_SIZE
        : bucket === "event-images" || bucket === "event-banners"
          ? EVENT_IMAGE_MAX_SIZE
          : bucket === "ticket-templates"
            ? TICKET_TEMPLATE_UPLOAD_MAX_BYTES
            : MAX_SIZE;
    if (file.size > sizeLimit) {
      const maxLabel =
        isTeaserVideo
          ? "200MB"
          : bucket === "event-images" || bucket === "event-banners"
            ? "25MB"
            : bucket === "ticket-templates"
              ? "5MB"
              : "2MB";
      return NextResponse.json(
        { error: `File too large. Maximum ${maxLabel}.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = await createAdminClient();

    if (bucket === "ticket-templates") {
      if (!isGlobalTemplate && !eventId?.trim()) {
        return NextResponse.json(
          { error: "eventId or isGlobalTemplate required for ticket-templates bucket" },
          { status: 400 }
        );
      }
      if (!isTicketTemplateMimeType(file.type)) {
        return NextResponse.json(
          { error: "Ticket template must be a JPEG (.jpg) file." },
          { status: 400 }
        );
      }
      const { data: renderConfigRows } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["global_ticket_width_px", "global_ticket_height_px"]);
      const renderConfigMap = new Map<string, unknown>();
      for (const row of renderConfigRows ?? []) {
        renderConfigMap.set(row.key, row.value);
      }
      const expectedWidth = clampTicketTemplateWidthPx(
        renderConfigMap.get("global_ticket_width_px") ?? TICKET_TEMPLATE_WIDTH_PX
      );
      const expectedHeight = clampTicketTemplateHeightPx(
        renderConfigMap.get("global_ticket_height_px") ?? TICKET_TEMPLATE_HEIGHT_PX
      );
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w !== expectedWidth || h !== expectedHeight) {
        return NextResponse.json(
          {
            error: `Ticket template must be exactly ${expectedWidth}×${expectedHeight} px. Got ${w}×${h}.`,
          },
          { status: 400 }
        );
      }
    } else if (isTeaserVideo) {
      if (!ALLOWED_TEASER_VIDEO_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: "Invalid video type. Use MP4 or WebM." },
          { status: 400 }
        );
      }
      if (bucket !== "event-images") {
        return NextResponse.json(
          { error: "Teaser videos must use the event-images bucket." },
          { status: 400 }
        );
      }
    } else if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    let uploadBuffer = buffer;
    let ext = file.type.split("/")[1] || "jpg";
    let contentType = file.type;

    if (isTeaserVideo && bucket === "event-images") {
      // Phase 1: keep original upload; transcode/compression lands in phase 2.
      uploadBuffer = buffer;
      if (file.type === "video/mp4") {
        ext = "mp4";
        contentType = "video/mp4";
      } else {
        ext = "webm";
        contentType = "video/webm";
      }
    } else if (bucket === "event-banners") {
      const processed = await sharp(buffer)
        .resize(EVENT_BANNER_WIDTH, EVENT_BANNER_HEIGHT, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();
      uploadBuffer = Buffer.from(processed);
      ext = "webp";
      contentType = "image/webp";
    } else if (assetKind === "add-on" && bucket === "event-images") {
      const meta = await sharp(buffer).rotate().metadata();
      const w0 = meta.width ?? 0;
      const h0 = meta.height ?? 0;
      const maxSide = Math.max(w0, h0, 1);
      const scale =
        maxSide > ADD_ON_IMAGE_MAX_PX ? ADD_ON_IMAGE_MAX_PX / maxSide : 1;
      const w1 = Math.max(1, Math.round(w0 * scale));
      const h1 = Math.max(1, Math.round(h0 * scale));
      const squareSide = Math.max(w1, h1);
      const processed = await sharp(buffer)
        .rotate()
        .resize(w1, h1)
        .resize(squareSide, squareSide, { fit: "fill" })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      uploadBuffer = Buffer.from(processed);
      ext = "webp";
      contentType = "image/webp";
    } else if (isThumbnail && bucket === "event-images") {
      const processed = await sharp(buffer)
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();
      uploadBuffer = Buffer.from(processed);
      ext = "webp";
      contentType = "image/webp";
    } else if (!isThumbnail && bucket === "event-images") {
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const isLandscape = w >= h;
      let pipeline = sharp(buffer);

      if (isLandscape) {
        pipeline = pipeline.resize({ width: EVENT_IMAGE_LANDSCAPE_MAX_WIDTH });
      } else {
        pipeline = pipeline.resize({ height: EVENT_IMAGE_PORTRAIT_MAX_HEIGHT });
      }

      const processed = await pipeline.webp({ quality: 85 }).toBuffer();
      uploadBuffer = Buffer.from(processed);
      ext = "webp";
      contentType = "image/webp";
    }

    const uuid = randomUUID();
    let path: string;
    let targetBucket: string;

    if (bucket === "ticket-templates") {
      targetBucket = "ticket-templates";
      if (isGlobalTemplate) {
        path = "global/default.jpg";
      } else if (eventId?.trim()) {
        const safeEventId = eventId.trim().replace(/[^a-zA-Z0-9-]/g, "");
        if (!safeEventId) {
          return NextResponse.json(
            { error: "eventId required for ticket-templates bucket" },
            { status: 400 }
          );
        }
        path = `${safeEventId}/${uuid}.jpg`;
      } else {
        return NextResponse.json(
          { error: "eventId or isGlobalTemplate required for ticket-templates bucket" },
          { status: 400 }
        );
      }
    } else if (bucket === "event-banners") {
      const safeEventId = eventId?.trim().replace(/[^a-zA-Z0-9-]/g, "") ?? "";
      if (!safeEventId) {
        return NextResponse.json(
          { error: "eventId is required for event-banners uploads" },
          { status: 400 }
        );
      }
      targetBucket = "event-banners";
      path = `events/${safeEventId}/${uuid}.${ext}`;
    } else if (bucket === "seat-map-images" && eventId?.trim()) {
      const safeEventId = eventId.trim().replace(/[^a-zA-Z0-9-]/g, "");
      if (!safeEventId) {
        return NextResponse.json(
          { error: "eventId required for seat-map-images bucket" },
          { status: 400 }
        );
      }
      targetBucket = "seat-map-images";
      path = `${safeEventId}/${uuid}.${ext}`;
    } else {
      targetBucket = "event-images";
      const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 64) || "temp";
      if (isTeaserVideo) {
        path = buildTeaserVideoUploadPath(safeSlug, contentType);
      } else {
        path = `${safeSlug}/${uuid}.${ext}`;
      }
    }

    const { error } = await supabase.storage
      .from(targetBucket)
      .upload(path, uploadBuffer, {
        contentType: bucket === "ticket-templates" ? "image/jpeg" : contentType,
        upsert: isGlobalTemplate,
      });

    if (error) {
      const msg = error.message ?? "Upload failed";
      const classified = classifyStorageUploadError(msg, isTeaserVideo);
      return NextResponse.json(
        { error: classified.error },
        { status: classified.status }
      );
    }

    const { data: urlData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      storageRef: isTeaserVideo ? `storage://${targetBucket}/${path}` : null,
    });
  } catch (e) {
    console.error("[api/admin/upload] failed:", e);
    const rawMessage = e instanceof Error ? e.message : "Upload failed";
    const classified = classifyStorageUploadError(rawMessage, false);
    return NextResponse.json(
      { error: classified.error },
      { status: classified.status }
    );
  }
}
