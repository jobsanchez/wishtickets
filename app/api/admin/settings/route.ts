import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import {
  clampTicketDpi,
  clampTicketJpegQuality,
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
  TICKET_TEMPLATE_HEIGHT_PX,
  TICKET_TEMPLATE_JPEG_QUALITY,
  TICKET_TEMPLATE_WIDTH_PX,
} from "@/lib/ticket-canvas-spec";
import {
  DEFAULT_PAYMONGO_METHODS,
  sanitizePaymongoMethods,
} from "@/lib/paymongo-methods";
import {
  parsePaymongoProcessingFees,
  serializePaymongoProcessingFees,
} from "@/lib/paymongo-processing-fees";
import {
  parseTicketScanSourceMode,
  TICKET_SCAN_SOURCE_KEY,
} from "@/lib/admissions/ticket-scan-source";
import {
  clampInactivityMinutes,
  DEFAULT_INACTIVITY_ENABLED,
  DEFAULT_INACTIVITY_MINUTES,
  INACTIVITY_ENABLED_KEY,
  INACTIVITY_MINUTES_KEY,
} from "@/lib/inactivity-config";
import {
  META_PIXEL_APP_CONFIG_KEY,
  normalizeMetaPixelPatchBody,
  parseMetaPixelAppConfig,
} from "@/lib/meta-pixel-config";

export async function GET() {
  const canAccess = await requireSuperAdmin();
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("app_config")
    .select("key, value");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const config: Record<string, unknown> = {};
  const SECRET_KEYS = [
    "paymongo_test_secret",
    "paymongo_live_secret",
    "paymongo_test_webhook_secret",
    "paymongo_live_webhook_secret",
    "smtp_user",
    "smtp_pass",
  ] as const;
  for (const row of data ?? []) {
    const val = row.value;
    if (SECRET_KEYS.includes(row.key as (typeof SECRET_KEYS)[number])) {
      const s = typeof val === "string" ? val : "";
      config[row.key] = s.length > 4 ? { configured: true, masked: "..." + s.slice(-4) } : { configured: false };
    } else {
      config[row.key] = val;
    }
  }
  config.global_ticket_width_px = clampTicketTemplateWidthPx(config.global_ticket_width_px);
  config.global_ticket_height_px = clampTicketTemplateHeightPx(config.global_ticket_height_px);
  config.global_ticket_jpeg_quality = clampTicketJpegQuality(config.global_ticket_jpeg_quality);
  config.global_ticket_dpi = clampTicketDpi(config.global_ticket_dpi);
  if (!("global_ticket_width_px" in config)) config.global_ticket_width_px = TICKET_TEMPLATE_WIDTH_PX;
  if (!("global_ticket_height_px" in config)) config.global_ticket_height_px = TICKET_TEMPLATE_HEIGHT_PX;
  if (!("global_ticket_jpeg_quality" in config)) config.global_ticket_jpeg_quality = TICKET_TEMPLATE_JPEG_QUALITY;
  if (!("global_ticket_dpi" in config)) config.global_ticket_dpi = 300;
  config.paymongo_enabled_methods = sanitizePaymongoMethods(config.paymongo_enabled_methods);
  if (!Array.isArray(config.paymongo_enabled_methods) || config.paymongo_enabled_methods.length === 0) {
    config.paymongo_enabled_methods = DEFAULT_PAYMONGO_METHODS;
  }
  config.paymongo_processing_fees = serializePaymongoProcessingFees(
    parsePaymongoProcessingFees(config.paymongo_processing_fees)
  );
  config[TICKET_SCAN_SOURCE_KEY] = parseTicketScanSourceMode(config[TICKET_SCAN_SOURCE_KEY]);
  config[INACTIVITY_ENABLED_KEY] =
    typeof config[INACTIVITY_ENABLED_KEY] === "boolean"
      ? config[INACTIVITY_ENABLED_KEY]
      : DEFAULT_INACTIVITY_ENABLED;
  config[INACTIVITY_MINUTES_KEY] = clampInactivityMinutes(config[INACTIVITY_MINUTES_KEY]);
  if (!(INACTIVITY_ENABLED_KEY in config)) config[INACTIVITY_ENABLED_KEY] = DEFAULT_INACTIVITY_ENABLED;
  if (!(INACTIVITY_MINUTES_KEY in config)) config[INACTIVITY_MINUTES_KEY] = DEFAULT_INACTIVITY_MINUTES;
  config[META_PIXEL_APP_CONFIG_KEY] = parseMetaPixelAppConfig(config[META_PIXEL_APP_CONFIG_KEY]);
  return NextResponse.json(config);
}

export async function PATCH(request: NextRequest) {
  const canAccess = await requireSuperAdmin();
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createAdminClient();

  if (body.reservation) {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "reservation",
          value: body.reservation,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body.event_defaults) {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "event_defaults",
          value: body.event_defaults,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const emailTicketKeys = ["email_ticket_subject", "email_ticket_body"] as const;
  for (const key of emailTicketKeys) {
    if (body[key] !== undefined) {
      const { error } = await supabase
        .from("app_config")
        .upsert(
          {
            key,
            value: typeof body[key] === "string" ? body[key] : body[key],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const globalTicketKeys = ["global_ticket_template_url", "global_ticket_layout_config"] as const;
  for (const key of globalTicketKeys) {
    if (body[key] !== undefined) {
      const { error } = await supabase
        .from("app_config")
        .upsert(
          {
            key,
            value: body[key],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const renderConfigKeys = [
    "global_ticket_width_px",
    "global_ticket_height_px",
    "global_ticket_jpeg_quality",
    "global_ticket_dpi",
  ] as const;
  const renderConfigNormalizers = {
    global_ticket_width_px: clampTicketTemplateWidthPx,
    global_ticket_height_px: clampTicketTemplateHeightPx,
    global_ticket_jpeg_quality: clampTicketJpegQuality,
    global_ticket_dpi: clampTicketDpi,
  } as const;
  for (const key of renderConfigKeys) {
    if (body[key] !== undefined) {
      const { error } = await supabase
        .from("app_config")
        .upsert(
          {
            key,
            value: renderConfigNormalizers[key](body[key]),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const paymongoKeys = [
    "paymongo_mode",
    "paymongo_test_secret",
    "paymongo_live_secret",
    "paymongo_test_webhook_secret",
    "paymongo_live_webhook_secret",
  ] as const;
  for (const key of paymongoKeys) {
    if (body[key] !== undefined) {
      const { error } = await supabase
        .from("app_config")
        .upsert(
          {
            key,
            value: typeof body[key] === "string" ? body[key] : body[key],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (body.paymongo_enabled_methods !== undefined) {
    const methods = sanitizePaymongoMethods(body.paymongo_enabled_methods);
    const value = methods.length > 0 ? methods : [...DEFAULT_PAYMONGO_METHODS];
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "paymongo_enabled_methods",
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body.paymongo_processing_fees !== undefined) {
    const normalized = serializePaymongoProcessingFees(
      parsePaymongoProcessingFees(body.paymongo_processing_fees)
    );
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "paymongo_processing_fees",
          value: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body[TICKET_SCAN_SOURCE_KEY] !== undefined) {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: TICKET_SCAN_SOURCE_KEY,
          value: parseTicketScanSourceMode(body[TICKET_SCAN_SOURCE_KEY]),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body[INACTIVITY_ENABLED_KEY] !== undefined) {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: INACTIVITY_ENABLED_KEY,
          value: body[INACTIVITY_ENABLED_KEY] === true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body[INACTIVITY_MINUTES_KEY] !== undefined) {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: INACTIVITY_MINUTES_KEY,
          value: clampInactivityMinutes(body[INACTIVITY_MINUTES_KEY]),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body[META_PIXEL_APP_CONFIG_KEY] !== undefined) {
    const patch = normalizeMetaPixelPatchBody(body[META_PIXEL_APP_CONFIG_KEY]);
    if (!patch) {
      return NextResponse.json({ error: "Invalid meta_pixel payload" }, { status: 400 });
    }
    if (patch.enabled && !patch.pixel_id) {
      return NextResponse.json(
        { error: "Meta Pixel ID is required when Meta Pixel is enabled" },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: META_PIXEL_APP_CONFIG_KEY,
          value: patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const smtpKeys = ["smtp_user", "smtp_pass", "smtp_from"] as const;
  for (const key of smtpKeys) {
    if (body[key] !== undefined) {
      const { error } = await supabase
        .from("app_config")
        .upsert(
          {
            key,
            value: typeof body[key] === "string" ? body[key] : body[key],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (
    body.global_ticket_template_url !== undefined ||
    body.global_ticket_layout_config !== undefined
  ) {
    revalidatePath("/admin/settings");
    revalidatePath("/admin/ticket-layout");
  }
  if (body[TICKET_SCAN_SOURCE_KEY] !== undefined) {
    revalidatePath("/admin/settings");
    revalidatePath("/admissions/scan");
  }
  if (body[META_PIXEL_APP_CONFIG_KEY] !== undefined) {
    revalidatePath("/admin/settings");
    revalidatePath("/");
  }

  return NextResponse.json({ success: true });
}
