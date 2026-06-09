import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  STORAGE_ORPHAN_BUCKET_IDS,
  isStorageOrphanBucketId,
  type StorageOrphanBucketId,
} from "@/lib/storage/storage-orphan-buckets";
import { deleteOrphanedObjectsForBucket } from "@/lib/storage/storage-orphan-scan";

/** Listing + deletes across buckets can exceed default limits on large buckets. */
export const maxDuration = 300;

function getCronSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

async function handleCron(request: NextRequest): Promise<NextResponse> {
  const secret = getCronSecret(request);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketParam = request.nextUrl.searchParams.get("bucket")?.trim() ?? "";
  const buckets: StorageOrphanBucketId[] = bucketParam
    ? isStorageOrphanBucketId(bucketParam)
      ? [bucketParam]
      : []
    : [...STORAGE_ORPHAN_BUCKET_IDS];

  if (bucketParam && buckets.length === 0) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const results: { bucket: StorageOrphanBucketId; deletedCount: number }[] = [];
    for (const bucket of buckets) {
      const { deletedCount } = await deleteOrphanedObjectsForBucket(admin, bucket);
      results.push({ bucket, deletedCount });
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    console.error("[cron/storage-orphans-delete]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** External schedulers (or manual curl). */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

/** Supabase pg_net (`net.http_post`) invokes POST by default. */
export async function POST(request: NextRequest) {
  return handleCron(request);
}
