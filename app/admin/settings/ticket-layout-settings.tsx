import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TicketLayoutPageClient } from "../ticket-layout/ticket-layout-client";
import {
  clampTicketDpi,
  clampTicketJpegQuality,
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
} from "@/lib/ticket-canvas-spec";

export async function TicketLayoutSettings() {
  let globalConfig:
    | {
        ticket_template_image_url: string | null;
        ticket_layout_config: unknown;
        global_ticket_width_px: number;
        global_ticket_height_px: number;
        global_ticket_jpeg_quality: number;
        global_ticket_dpi: number;
      }
    | null = null;

  try {
    const adminClient = createAdminClient();
    const { data: configRows } = await adminClient
      .from("app_config")
      .select("key, value")
      .in("key", [
        "global_ticket_template_url",
        "global_ticket_layout_config",
        "global_ticket_width_px",
        "global_ticket_height_px",
        "global_ticket_jpeg_quality",
        "global_ticket_dpi",
      ]);

    const map = new Map<string, unknown>();
    for (const row of configRows ?? []) {
      map.set(row.key, row.value);
    }
    const url = map.get("global_ticket_template_url");
    const layout = map.get("global_ticket_layout_config");
    globalConfig = {
      ticket_template_image_url: typeof url === "string" ? url : null,
      ticket_layout_config: layout ?? null,
      global_ticket_width_px: clampTicketTemplateWidthPx(map.get("global_ticket_width_px")),
      global_ticket_height_px: clampTicketTemplateHeightPx(map.get("global_ticket_height_px")),
      global_ticket_jpeg_quality: clampTicketJpegQuality(map.get("global_ticket_jpeg_quality")),
      global_ticket_dpi: clampTicketDpi(map.get("global_ticket_dpi")),
    };
  } catch {
    globalConfig = null;
  }

  let canManageGlobalTemplate = false;
  try {
    const userClient = await createClient();
    const { data: role } = await userClient.rpc("get_my_role");
    canManageGlobalTemplate = role === "super_admin";
  } catch {
    canManageGlobalTemplate = false;
  }

  return (
    <div>
      <p className="text-foreground-muted text-sm mb-6">
        Overlay positions and sizes are <strong>global</strong> for all events. The preview uses the
        global default background if set; otherwise a placeholder. Each event can still upload its own{" "}
        <strong>background image</strong> on the event page — only that image is per event.
      </p>
      <TicketLayoutPageClient
        globalConfig={globalConfig}
        canManageGlobalTemplate={canManageGlobalTemplate}
      />
    </div>
  );
}
