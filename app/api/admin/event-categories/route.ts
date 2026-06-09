import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { z } from "zod";

const categorySchema = z.object({
  label: z.string().min(1),
});

const patchSchema = z.object({
  categories: z.array(categorySchema),
});

export async function GET() {
  const canAccess = await requireSuperAdmin();
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, label, sort_order")
    .order("sort_order")
    .order("label");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const canAccess = await requireSuperAdmin();
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: existing } = await supabase.from("event_categories").select("id");
  const ids = ((existing ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length > 0) {
    const { error: deleteError } = await supabase
      .from("event_categories")
      .delete()
      .in("id", ids);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  if (parsed.data.categories.length === 0) {
    return NextResponse.json({ success: true });
  }

  const rows = parsed.data.categories.map((c, i) => ({
    label: c.label,
    sort_order: i,
  }));

  const { error: insertError } = await supabase
    .from("event_categories")
    .insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
