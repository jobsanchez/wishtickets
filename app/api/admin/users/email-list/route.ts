import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfileRole } from "@/lib/auth";
import { sendAdminDigestEmail } from "@/lib/email";

const bodySchema = z.object({
  to: z.string().email(),
});

function isStaffAdminRole(role: string | null): boolean {
  const r = (role ?? "").trim();
  return r === "admin" || r === "super_admin";
}

function escapeCell(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  const role = await getProfileRole();
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  const { to } = parsed.data;

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (profiles ?? []).filter((p) => !isStaffAdminRole(p.role as string | null));
  const generatedAt = new Date().toISOString();

  const textLines = [
    `Wish Tickets Portal — registered users (admins and super admins excluded)`,
    `Generated: ${generatedAt}`,
    `Count: ${rows.length}`,
    "",
    "Name\tEmail",
    ...rows.map((r) => {
      const name = (r.full_name ?? "").trim() || "—";
      const email = (r.email ?? "").trim() || "—";
      return `${name}\t${email}`;
    }),
  ];
  const textBody = textLines.join("\n");

  const tableRows = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeCell(
          (r.full_name ?? "").trim() || "—"
        )}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeCell(
          (r.email ?? "").trim() || "—"
        )}</td></tr>`
    )
    .join("");

  const htmlBody = `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#FF6B00;color:#fff;padding:20px;text-align:center;">
    <div style="font-size:20px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:15px;margin-top:6px;">Registered users</div>
  </td></tr>
  <tr><td style="padding:16px 20px;background:#fff;font-size:14px;color:#334155;">
    <p style="margin:0 0 12px 0;">Admins and super admins are excluded. Generated <strong>${escapeCell(
      generatedAt
    )}</strong>. Total: <strong>${rows.length}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="background:#f8fafc;">
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;">Name</th>
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;">Email</th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="2" style="padding:12px;">No registered users.</td></tr>'}</tbody>
    </table>
  </td></tr>
</table>`;

  try {
    await sendAdminDigestEmail({
      to,
      subject: `Wish Tickets — registered users (${rows.length})`,
      text: textBody,
      html: htmlBody,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send email";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
