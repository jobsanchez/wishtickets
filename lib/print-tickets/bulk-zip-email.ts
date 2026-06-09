import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";

/** Same bucket as generated ticket images (`lib/ticket-image.ts`). */
const BUCKET = "ticket-images";

/** Above this many tickets, email uses one ZIP + signed link instead of inline image attachments. Pre-generated batches (2+ tickets, all with images) also use ZIP; see `runPrintTicketsEmailFromRows`. */
export function getBulkPrintZipThreshold(): number {
  const raw = process.env.BULK_PRINT_ZIP_THRESHOLD;
  if (raw === undefined || raw === "") return 50;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 100_000);
}

/** Signed URL lifetime for bulk folder links (seconds). Default 7 days. */
export function getBulkZipSignedUrlSeconds(): number {
  const defaultSec = 7 * 24 * 60 * 60;
  const raw = process.env.BULK_PRINT_ZIP_SIGNED_URL_SEC;
  if (raw === undefined || raw === "") return defaultSec;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60) return defaultSec;
  return Math.min(n, 60 * 24 * 60 * 60);
}

/** Soft chunk budget for background workers (image sum + small overhead). */
const ZIP_PART_MAX_BYTES = 50 * 1024 * 1024;
const ZIP_PART_MIN_ENV_BYTES = 4 * 1024 * 1024;

/**
 * Max uncompressed payload per worker chunk (sum of image sizes + small overhead).
 * Used by queue collectors to keep each processing tick bounded.
 * Default: 50 MiB. Override with `BULK_PRINT_ZIP_PART_MAX_BYTES` (capped at this ceiling).
 */
export function getBulkZipPartMaxBytes(): number {
  const raw = process.env.BULK_PRINT_ZIP_PART_MAX_BYTES;
  if (raw === undefined || raw === "") return ZIP_PART_MAX_BYTES;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < ZIP_PART_MIN_ENV_BYTES) return ZIP_PART_MAX_BYTES;
  return Math.min(n, ZIP_PART_MAX_BYTES);
}

/** Rough per-file overhead used by chunk collectors. */
export const ZIP_BYTES_PER_FILE_SLOP = 128;

/**
 * Hard cap on ticket file count per ZIP chunk and per `print-by-section/.../part-N/` folder.
 * Byte-based estimates were overshooting real image sizes (~100 MiB ZIPs); 250 tickets balances part count and folder size.
 */
export const BULK_PRINT_ZIP_MAX_TICKETS_PER_PART = 250;

/** Same per-part byte budget used when building each ZIP before upload (matches `partitionFilesForZipParts`). */
export function getZipPartUncompressedBudgetBytes(): number {
  return Math.floor(getBulkZipPartMaxBytes() * 0.98);
}

function slugifySegment(input: string, maxLen: number): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return s.length > 0 ? s : "x";
}

/**
 * Upload ticket image buffers individually into a per-send folder and return one app URL
 * that renders a signed per-file folder view.
 */
export type BulkZipPathLabels = {
  /** Event slug or title (will be slugified). */
  eventSlug: string;
  /** Section name or `multi` when spanning sections (will be slugified). */
  sectionSlug: string;
};

export async function uploadPrintTicketsZipAndGetSignedUrl(
  eventId: string,
  files: { filename: string; buffer: Buffer }[],
  pathLabels: BulkZipPathLabels
): Promise<string[]> {
  if (files.length === 0) {
    throw new Error("No files to zip");
  }

  const ev = slugifySegment(pathLabels.eventSlug, 42);
  const sec = slugifySegment(pathLabels.sectionSlug, 34);
  const stamp = randomBytes(3).toString("hex");
  const folderPath = `print-bulk-folders/${ev}-${sec}-${stamp}`;
  const admin = createAdminClient();
  const expiresIn = getBulkZipSignedUrlSeconds();

  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const idx = String(i + 1).padStart(4, "0");
    const normalized = f.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || `${idx}.jpg`;
    const objectPath = `${folderPath}/${idx}-${normalized}`;
    await uploadFileWithRetries(admin, objectPath, f.buffer, "image/jpeg");
  }

  const origin = getSiteOrigin();
  const folderUrl = new URL("/api/print-ticket-folders/download-zip", origin);
  folderUrl.searchParams.set("eventId", eventId);
  folderUrl.searchParams.set("folder", folderPath);
  folderUrl.searchParams.set("expiresIn", String(expiresIn));
  return [folderUrl.toString()];
}

/**
 * Upload file via raw Buffer with retries.
 */
async function uploadFileWithRetries(
  admin: SupabaseClient,
  objectPath: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const attempts = 5;
  let lastMessage = "unknown error";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { error } = await admin.storage.from(BUCKET).upload(objectPath, body, {
      contentType,
      upsert: true,
    });
    if (!error) return;
    lastMessage = error.message || "unknown error";
    console.warn("[bulk-zip-email] upload attempt failed", {
      attempt,
      objectPath,
      message: lastMessage,
    });
    const nonRetryable =
      /Bucket not found|not found|403|401|Invalid JWT|JWT expired|mime type .*not supported|exceeded the maximum allowed size/i.test(
        lastMessage
      );
    if (nonRetryable || attempt === attempts) {
      throw new Error(`Storage upload failed: ${lastMessage}`);
    }
    await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
}

