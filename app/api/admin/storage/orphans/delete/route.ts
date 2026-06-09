import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { isStorageOrphanBucketId } from "@/lib/storage/storage-orphan-buckets";
import { deleteOrphanedObjectsForBucket } from "@/lib/storage/storage-orphan-scan";

export const maxDuration = 300;

const CONFIRM_TOKEN = "DELETE_ORPHANS";

export async function POST(request: Request) {
  const ok = await requireSuperAdmin();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { bucket?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bucket = typeof body.bucket === "string" ? body.bucket.trim() : "";
  if (!bucket || !isStorageOrphanBucketId(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM_TOKEN) {
    return NextResponse.json(
      { error: `Confirmation required: pass { confirm: "${CONFIRM_TOKEN}" }` },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { deletedCount } = await deleteOrphanedObjectsForBucket(admin, bucket);
    return NextResponse.json({ bucket, deletedCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    console.error("[storage/orphans/delete]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
