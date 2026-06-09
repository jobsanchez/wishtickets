import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileRole, getCurrentUserId } from "@/lib/auth";

async function emptyBucketByListRemove(
  admin: SupabaseClient,
  bucket: string,
  prefix = ""
): Promise<void> {
  const { data: items } = await admin.storage.from(bucket).list(prefix || undefined, { limit: 1000 });
  if (!items?.length) return;
  const files: string[] = [];
  for (const item of items) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      files.push(path);
    } else {
      await emptyBucketByListRemove(admin, bucket, path);
    }
  }
  if (files.length > 0) {
    await admin.storage.from(bucket).remove(files);
  }
}

// Buckets to empty (exclude ticket-templates to retain template images)
const STORAGE_BUCKETS = ["event-images", "ticket-images", "seat-map-images"];

export async function POST() {
  const role = await getProfileRole();
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin only" }, { status: 403 });
  }

  const superAdminId = await getCurrentUserId();
  if (!superAdminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    // 1. Empty storage buckets
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const storage = admin.storage as { emptyBucket?: (id: string) => Promise<{ error: unknown }> };
        if (typeof storage.emptyBucket === "function") {
          const { error } = await storage.emptyBucket(bucket);
          if (error) throw new Error((error as Error).message);
        } else {
          await emptyBucketByListRemove(admin, bucket);
        }
      } catch {
        try {
          await emptyBucketByListRemove(admin, bucket);
        } catch (fallbackErr) {
          console.warn(`[clear-database] Failed to empty bucket ${bucket}:`, (fallbackErr as Error).message);
        }
      }
    }

    // 2. Delete tables in FK-safe order (children before parents)
    const neverUuid = "00000000-0000-0000-0000-000000000000";

    const TICKET_CONFIG_KEYS = [
      "global_ticket_template_url",
      "global_ticket_layout_config",
    ];

    const deleteAll = async (table: string, excludeColumn?: string, excludeValue?: string) => {
      let query = admin.from(table).delete();
      if (excludeColumn && excludeValue) {
        query = query.neq(excludeColumn, excludeValue);
      } else if (table === "app_config") {
        // Preserve ticket template and layout config; delete all other app_config rows
        const { data: configRows } = await admin.from("app_config").select("key");
        const keysToDelete = (configRows ?? []).map((r) => r.key).filter((k) => !TICKET_CONFIG_KEYS.includes(k));
        if (keysToDelete.length === 0) return;
        query = admin.from("app_config").delete().in("key", keysToDelete);
      } else if (table === "event_administrators") {
        query = query.neq("event_id", neverUuid);
      } else {
        query = query.neq("id", neverUuid);
      }
      const { error } = await query;
      if (error) {
        console.warn(`[clear-database] Failed to delete from ${table}:`, error.message);
      }
    };

    await deleteAll("admission_records");
    await deleteAll("admin_assignment_items");
    await deleteAll("admin_seat_assignments");
    await deleteAll("tickets");
    await deleteAll("payments");
    await deleteAll("reservation_items");
    await deleteAll("reservation_carts");
    await deleteAll("event_administrators");
    await deleteAll("event_admissions_codes");
    await deleteAll("event_seats");
    await deleteAll("event_sections");
    await deleteAll("event_prices");
    await deleteAll("early_bird_prices");
    await deleteAll("promo_codes");
    await deleteAll("bookings");
    await deleteAll("events");
    await deleteAll("venue_seat_templates");
    await deleteAll("user_capabilities", "user_id", superAdminId);
    await deleteAll("profiles", "id", superAdminId);
    await deleteAll("venues");
    await deleteAll("event_producers");
    await deleteAll("event_categories");
    await deleteAll("app_config");
    await deleteAll("cities");
    await deleteAll("provinces");

    // 3. Delete other auth users
    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.warn("[clear-database] listUsers error:", error.message);
        break;
      }

      const users = data?.users ?? [];
      if (users.length === 0) break;

      for (const u of users) {
        if (u.id === superAdminId) continue;
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (delErr) {
          console.warn(`[clear-database] Failed to delete user ${u.id}:`, delErr.message);
        }
      }

      hasMore = users.length === perPage;
      page++;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[clear-database]", msg);
    return NextResponse.json(
      { error: "Failed to clear database" },
      { status: 500 }
    );
  }
}
