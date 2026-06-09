import {
  buildUniquePrintFolderDownloadItems,
  buildFolderZipDownloadUrl,
  buildPrebuiltZipDownloadUrl,
} from "@/lib/print-tickets/folder-links";
import { getAdminClientIfAvailable } from "@/lib/supabase/admin";

type DownloadItem = { url: string; label: string };

export async function resolveBestPrintDownloadLinks(
  eventId: string,
  ticketImageUrls: string[]
): Promise<DownloadItem[]> {
  const folderItems = buildUniquePrintFolderDownloadItems(eventId, ticketImageUrls);
  if (!folderItems.length) return [];
  const bySectionPrefix = new Map<string, { sectionLabel: string; fallback: string }>();
  for (const item of folderItems) {
    const prefix = item.folderPath.replace(/\/part-\d+$/i, "");
    if (!bySectionPrefix.has(prefix)) {
      bySectionPrefix.set(prefix, {
        sectionLabel: item.sectionLabel,
        fallback: buildFolderZipDownloadUrl(eventId, item.folderPath),
      });
    }
  }

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return [...bySectionPrefix.values()]
      .map((v) => ({ url: v.fallback, label: v.sectionLabel }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const prefixes = [...bySectionPrefix.keys()];
  const { data: rows } = await admin
    .from("print_folder_zip_jobs")
    .select("folder_prefix, status, zip_object_path, zip_object_paths")
    .eq("event_id", eventId)
    .eq("status", "completed")
    .in("folder_prefix", prefixes);

  const completedByPrefix = new Map<string, string[]>();
  for (const row of (rows ?? []) as Array<{
    folder_prefix?: string | null;
    zip_object_path?: string | null;
    zip_object_paths?: string[] | null;
  }>) {
    if (row.folder_prefix) {
      const paths = Array.isArray(row.zip_object_paths)
        ? row.zip_object_paths.filter((p): p is string => typeof p === "string" && p.length > 0)
        : [];
      if (paths.length > 0) {
        completedByPrefix.set(row.folder_prefix, paths);
      } else if (row.zip_object_path) {
        completedByPrefix.set(row.folder_prefix, [row.zip_object_path]);
      }
    }
  }

  const out: Array<{ url: string; label: string }> = [];
  for (const prefix of prefixes) {
    const meta = bySectionPrefix.get(prefix)!;
    const paths = completedByPrefix.get(prefix) ?? [];
    if (paths.length === 0) {
      out.push({ url: meta.fallback, label: meta.sectionLabel });
      continue;
    }
    if (paths.length === 1) {
      out.push({
        url: buildPrebuiltZipDownloadUrl(eventId, paths[0]!),
        label: meta.sectionLabel,
      });
      continue;
    }
    for (let i = 0; i < paths.length; i++) {
      out.push({
        url: buildPrebuiltZipDownloadUrl(eventId, paths[i]!),
        label: `${meta.sectionLabel}-Part-${i + 1}`,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

