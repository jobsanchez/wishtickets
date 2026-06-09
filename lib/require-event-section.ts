import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EventAdminSectionId } from "@/lib/event-admin-sections";

/**
 * Returns a 403 NextResponse if the current user may not access this event section.
 * Super admins always pass (via RPC).
 */
export async function forbiddenUnlessEventSection(
  eventId: string,
  section: EventAdminSectionId
): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_authorized_for_event_section", {
    p_event_id: eventId,
    p_section: section,
  });
  if (error || !data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Allow if the user has any of the listed sections (e.g. shared seating + selector APIs). */
export async function forbiddenUnlessAnyEventSection(
  eventId: string,
  sections: EventAdminSectionId[]
): Promise<NextResponse | null> {
  const supabase = await createClient();
  for (const section of sections) {
    const { data, error } = await supabase.rpc("is_authorized_for_event_section", {
      p_event_id: eventId,
      p_section: section,
    });
    if (!error && data) return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
