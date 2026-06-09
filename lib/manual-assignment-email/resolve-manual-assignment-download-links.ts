import type { SupabaseClient } from "@supabase/supabase-js";
import { BULK_PRINT_ZIP_MAX_TICKETS_PER_PART } from "@/lib/print-tickets/bulk-zip-email";
import {
  buildPrebuiltZipDownloadUrl,
  buildTicketScopedDownloadItems,
} from "@/lib/print-tickets/folder-links";

type DownloadItem = { url: string; label: string };

function prettifySectionSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Manual distribution emails must only include tickets for this booking — not every PNG in a
 * shared section folder (inventory-backed images live under the same `print-by-section/...` tree).
 * Prefer booking-scoped prebuilt ZIPs from Create Zip; otherwise build file-scoped download links.
 */
export async function resolveManualAssignmentDownloadLinks(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    bookingId: string;
    ticketImageUrls: string[];
  }
): Promise<DownloadItem[]> {
  const { eventId, bookingId, ticketImageUrls } = opts;

  const { data: jobs } = await admin
    .from("print_folder_zip_jobs")
    .select("zip_object_path, zip_object_paths, section_slug, status")
    .eq("event_id", eventId)
    .eq("source_booking_id", bookingId)
    .eq("status", "completed");

  const prebuilt: DownloadItem[] = [];
  for (const row of (jobs ?? []) as Array<{
    zip_object_path?: string | null;
    zip_object_paths?: string[] | null;
    section_slug?: string | null;
  }>) {
    const paths = Array.isArray(row.zip_object_paths)
      ? row.zip_object_paths.filter((p): p is string => typeof p === "string" && p.length > 0)
      : [];
    const zipPaths =
      paths.length > 0
        ? paths
        : typeof row.zip_object_path === "string" && row.zip_object_path.length > 0
          ? [row.zip_object_path]
          : [];
    if (zipPaths.length === 0) continue;
    const sectionLabel = prettifySectionSlug(row.section_slug ?? "section");
    if (zipPaths.length === 1) {
      prebuilt.push({
        url: buildPrebuiltZipDownloadUrl(eventId, zipPaths[0]!),
        label: sectionLabel,
      });
      continue;
    }
    for (let i = 0; i < zipPaths.length; i++) {
      prebuilt.push({
        url: buildPrebuiltZipDownloadUrl(eventId, zipPaths[i]!),
        label: `${sectionLabel}-Part-${i + 1}`,
      });
    }
  }

  if (prebuilt.length > 0) {
    return prebuilt.sort((a, b) => a.label.localeCompare(b.label));
  }

  return buildTicketScopedDownloadItems(eventId, ticketImageUrls, {
    maxFilesPerZip: BULK_PRINT_ZIP_MAX_TICKETS_PER_PART,
  });
}
