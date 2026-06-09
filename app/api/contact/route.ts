import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendContactFormEmail } from "@/lib/email";
import { getSmtpCredentials } from "@/lib/smtp-config";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = contactSchema.safeParse(body);
  if (!result.success) {
    const first = result.error.flatten().fieldErrors;
    const msg =
      (first.name?.[0] ?? first.email?.[0] ?? first.subject?.[0] ?? first.message?.[0]) ??
      "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { name, email, subject, message } = result.data;

  const smtp = await getSmtpCredentials();
  if (!smtp) {
    return NextResponse.json(
      { error: "Contact form is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }

  try {
    await sendContactFormEmail({ name, email, subject, message });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] send failed:", err);
    return NextResponse.json(
      { error: "Failed to send message. Please try again later." },
      { status: 500 }
    );
  }
}
