import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denied = await forbiddenUnlessEventSection(id, "pricing");
    if (denied) return denied;

    const supabase = await createClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select(
        "venue_id, event_start, early_bird_starts_at, early_bird_ends_at, early_bird_enabled, sale_success_email_enabled, sale_label"
      )
      .eq("id", id)
      .single();

    if (eventError) {
      return NextResponse.json(
        { error: eventError.message, hint: "Run supabase db push to apply migrations (00068 adds early_bird columns)" },
        { status: 500 }
      );
    }

    const venueId = event?.venue_id ?? null;

    const { data: eventSections } = await supabase
      .from("event_sections")
      .select("id, name, section_group, color, sort_order")
      .eq("event_id", id)
      .order("sort_order")
      .order("name");

    let sections: { id: string; name: string; section_group?: string | null; color?: string | null }[] = [];
    if (eventSections?.length) {
      sections = eventSections.map((s) => ({
        id: s.id,
        name: s.name,
        section_group: s.section_group ?? null,
        color: s.color ?? null,
      }));
    } else if (venueId) {
      const { data: venueSections } = await supabase
        .from("sections")
        .select("id, name")
        .eq("venue_id", venueId)
        .order("name");
      sections = (venueSections ?? []).map((s) => ({ id: s.id, name: s.name }));
    }

    const [{ data: prices }, { data: earlyBird }] = await Promise.all([
      supabase
        .from("event_prices")
        .select("id, section_id, price_cents")
        .eq("event_id", id),
      supabase
        .from("early_bird_prices")
        .select("id, section_id, discount_percent")
        .eq("event_id", id),
    ]);

    return NextResponse.json({
      sections,
      prices: prices ?? [],
      early_bird: (earlyBird ?? []).map((eb) => ({
        ...eb,
        discount_percent: eb.discount_percent ?? 0,
      })),
      event_start: event?.event_start ?? null,
      early_bird_starts_at: event?.early_bird_starts_at ?? null,
      early_bird_ends_at: event?.early_bird_ends_at ?? null,
      early_bird_enabled: event?.early_bird_enabled ?? false,
      sale_success_email_enabled: event?.sale_success_email_enabled ?? false,
      sale_label: event?.sale_label ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load pricing" },
      { status: 500 }
    );
  }
}

const priceSchema = z.object({
  prices: z.array(
    z.object({
      section_id: z.string().uuid(),
      price_cents: z.number().int().min(0),
    })
  ),
  early_bird: z
    .array(
      z.object({
        section_id: z.string().uuid(),
        discount_percent: z.number().int().min(0).max(100),
      })
    )
    .optional(),
  early_bird_starts_at: z.string().datetime().optional().nullable(),
  early_bird_ends_at: z.string().datetime().optional().nullable(),
  early_bird_enabled: z.boolean().optional(),
  sale_success_email_enabled: z.boolean().optional(),
  sale_label: z.union([z.string().max(100), z.null()]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "pricing");
  if (denied) return denied;

  const body = await request.json();
  const parsed = priceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    early_bird,
    early_bird_starts_at,
    early_bird_ends_at,
    early_bird_enabled,
    sale_success_email_enabled,
    sale_label,
  } = parsed.data;
  if (early_bird && early_bird.length > 0) {
    if (!early_bird_starts_at || !early_bird_ends_at) {
      return NextResponse.json(
        { error: "Early bird start and end dates are required when early bird is enabled" },
        { status: 400 }
      );
    }
    const starts = new Date(early_bird_starts_at).getTime();
    const ends = new Date(early_bird_ends_at).getTime();
    if (starts >= ends) {
      return NextResponse.json(
        { error: "Early bird start date must be before end date" },
        { status: 400 }
      );
    }
  }

  const supabase = await createClient();

  for (const p of parsed.data.prices) {
    const { error } = await supabase.from("event_prices").upsert(
      {
        event_id: id,
        section_id: p.section_id,
        price_cents: p.price_cents,
      },
      { onConflict: "event_id,section_id" }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (early_bird !== undefined) {
    await supabase.from("early_bird_prices").delete().eq("event_id", id);
    for (const eb of early_bird) {
      const { error } = await supabase.from("early_bird_prices").upsert(
        {
          event_id: id,
          section_id: eb.section_id,
          discount_percent: Math.min(100, Math.max(0, eb.discount_percent)),
        },
        { onConflict: "event_id,section_id" }
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const eventUpdate: {
    early_bird_starts_at?: string | null;
    early_bird_ends_at?: string | null;
    early_bird_enabled?: boolean;
    sale_success_email_enabled?: boolean;
    sale_label?: string | null;
  } = {};
  if (early_bird !== undefined) {
    eventUpdate.early_bird_starts_at = early_bird.length > 0 ? early_bird_starts_at ?? null : null;
    eventUpdate.early_bird_ends_at = early_bird.length > 0 ? early_bird_ends_at ?? null : null;
  }
  if (early_bird_enabled !== undefined) {
    eventUpdate.early_bird_enabled = early_bird_enabled;
  }
  if (sale_success_email_enabled !== undefined) {
    eventUpdate.sale_success_email_enabled = sale_success_email_enabled;
  }
  if (sale_label !== undefined) {
    const trimmed = sale_label?.trim() ?? "";
    eventUpdate.sale_label = trimmed.length > 0 ? trimmed : null;
  }
  if (Object.keys(eventUpdate).length > 0) {
    const { error } = await supabase.from("events").update(eventUpdate).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
