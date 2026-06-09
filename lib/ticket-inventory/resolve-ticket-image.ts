import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInventoryImages } from "@/lib/ticket-inventory/generate-images";

/**
 * Resolve ticket PNG URL: prefer tickets.ticket_image_url, then linked print_tickets row.
 * Optionally generates inventory image when missing.
 */
export async function resolveTicketImageUrl(
  admin: SupabaseClient,
  ticket: {
    id: string;
    ticket_image_url?: string | null;
    print_ticket_id?: string | null;
  },
  options?: { generateIfMissing?: boolean }
): Promise<string | null> {
  const direct = ticket.ticket_image_url?.trim();
  if (direct) return direct;

  const printTicketId = ticket.print_ticket_id?.trim();
  if (!printTicketId) return null;

  const { data: inv } = await admin
    .from("print_tickets")
    .select("ticket_image_url")
    .eq("id", printTicketId)
    .maybeSingle();

  const invUrl = (inv?.ticket_image_url as string | null)?.trim();
  if (invUrl) {
    await admin.from("tickets").update({ ticket_image_url: invUrl }).eq("id", ticket.id);
    return invUrl;
  }

  if (options?.generateIfMissing !== true) return null;

  const result = await generateInventoryImages(admin, [printTicketId]);
  if (result.images_generated < 1) return null;

  const { data: after } = await admin
    .from("print_tickets")
    .select("ticket_image_url")
    .eq("id", printTicketId)
    .maybeSingle();
  const url = (after?.ticket_image_url as string | null)?.trim() ?? null;
  if (url) {
    await admin.from("tickets").update({ ticket_image_url: url }).eq("id", ticket.id);
  }
  return url;
}
