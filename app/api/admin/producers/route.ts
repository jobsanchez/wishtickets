import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { z } from "zod";

const producerSchema = z.object({
  name: z.string().min(1),
  producer_representative: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("event_producers")
    .select("id, name, producer_representative, contact, email")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = producerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("event_producers")
    .insert({
      name: parsed.data.name,
      producer_representative: parsed.data.producer_representative ?? null,
      contact: parsed.data.contact ?? null,
      email:
        parsed.data.email === "" || parsed.data.email == null
          ? null
          : parsed.data.email,
      updated_at: new Date().toISOString(),
    })
    .select("id, name, producer_representative, contact, email")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
