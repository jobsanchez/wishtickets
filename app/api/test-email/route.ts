import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSmtpCredentials } from "@/lib/smtp-config";
import { sendTicketEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

/** GET /api/test-email – Check SMTP config and verify connection. Admin-only. */
export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const creds = await getSmtpCredentials();
  if (!creds) {
    return NextResponse.json(
      { configured: false, error: "SMTP credentials not set (Global Settings or SMTP_USER/SMTP_PASS env)" },
      { status: 503 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: creds.user, pass: creds.pass },
  });

  try {
    await transporter.verify();
    return NextResponse.json({
      configured: true,
      user: creds.user,
      message: "SMTP connection verified",
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        user: creds.user,
        error: err instanceof Error ? err.message : "Connection failed",
      },
      { status: 502 }
    );
  }
}

/** POST /api/test-email – Send a test ticket email to verify SMTP. Admin-only. */
export async function POST() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const to = user?.email;
  if (!to) {
    return NextResponse.json({ error: "No authenticated user email" }, { status: 400 });
  }

  const creds = await getSmtpCredentials();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "SMTP not configured. Set credentials in Global Settings (Email & Tickets) or SMTP_USER/SMTP_PASS env vars.",
      },
      { status: 503 }
    );
  }

  try {
    await sendTicketEmail({
      to,
      eventTitle: "Test Event",
      eventDate: new Date().toLocaleString(),
      venueName: "Test Venue",
      attachments: [],
    });
    return NextResponse.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    console.error("[test-email] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test email" },
      { status: 500 }
    );
  }
}
