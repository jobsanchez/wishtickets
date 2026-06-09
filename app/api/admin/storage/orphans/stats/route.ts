import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import {
  STORAGE_ORPHAN_BUCKET_IDS,
  isStorageOrphanBucketId,
} from "@/lib/storage/storage-orphan-buckets";
import { computeStorageOrphanStats } from "@/lib/storage/storage-orphan-scan";

/** Listing large buckets can exceed default function timeouts. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const ok = await requireSuperAdmin();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bucket = request.nextUrl.searchParams.get("bucket")?.trim() ?? "";
  if (!bucket || !isStorageOrphanBucketId(bucket)) {
    return NextResponse.json(
      {
        error: "Invalid or missing bucket query parameter.",
        allowedBuckets: [...STORAGE_ORPHAN_BUCKET_IDS],
      },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const stats = await computeStorageOrphanStats(admin, bucket);
    return NextResponse.json({
      bucket,
      fileCountInUse: stats.fileCountInUse,
      fileCountOrphaned: stats.fileCountOrphaned,
      scannedAt: stats.scannedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    console.error("[storage/orphans/stats]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
