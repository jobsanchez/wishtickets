import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DELETE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT";

type CancelAccountBody = {
  emailConfirmation?: string;
  phraseConfirmation?: string;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as CancelAccountBody | null;
    const phraseConfirmation = body?.phraseConfirmation?.trim() ?? "";
    const emailConfirmation = body?.emailConfirmation?.trim().toLowerCase() ?? "";
    const accountEmail = (user.email ?? "").trim().toLowerCase();

    if (phraseConfirmation !== DELETE_ACCOUNT_PHRASE) {
      return NextResponse.json(
        { error: "Confirmation phrase does not match." },
        { status: 400 }
      );
    }
    if (!accountEmail || emailConfirmation !== accountEmail) {
      return NextResponse.json(
        { error: "Email confirmation does not match your account." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const anonEmail = `deleted+${user.id.slice(0, 8)}@deleted.local`;

    const { data: bookings, error: bookingsLookupError } = await admin
      .from("bookings")
      .select("id")
      .eq("user_id", user.id);
    if (bookingsLookupError) {
      console.error("[account cancel] bookings lookup", bookingsLookupError);
      return NextResponse.json(
        { error: "Could not prepare account cancellation." },
        { status: 500 }
      );
    }

    const bookingIds = (bookings ?? []).map((row) => row.id);
    if (bookingIds.length > 0) {
      const { error: bookingAnonymizeError } = await admin
        .from("bookings")
        .update({
          user_id: null,
          buyer_email_override: anonEmail,
          buyer_phone: null,
          special_request_details: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", bookingIds);
      if (bookingAnonymizeError) {
        console.error("[account cancel] bookings anonymize", bookingAnonymizeError);
        return NextResponse.json(
          { error: "Could not anonymize booking history." },
          { status: 500 }
        );
      }
    }

    const { error: profileDeleteError } = await admin
      .from("profiles")
      .delete()
      .eq("id", user.id);
    if (profileDeleteError) {
      console.error("[account cancel] profiles delete", profileDeleteError);
      return NextResponse.json(
        { error: "Could not remove profile data." },
        { status: 500 }
      );
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      console.error("[account cancel] auth delete", authDeleteError);
      return NextResponse.json(
        { error: "Could not remove authentication account." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[account cancel] unexpected", error);
    return NextResponse.json(
      { error: "Something went wrong while canceling your account." },
      { status: 500 }
    );
  }
}
