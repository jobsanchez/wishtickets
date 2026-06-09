import type { SupabaseClient } from "@supabase/supabase-js";
import { collectNextPrintTicketsForZipBudget } from "@/lib/print-tickets/collect-next-print-tickets-for-zip-budget";
import { fetchPrintTicketsForEmailByIds } from "@/lib/print-tickets/fetch-print-tickets-for-email-by-ids";
import { buildPrintTicketsEmailSubject } from "@/lib/email/scoped-email-subject";
import { formatEventDateTimeLong } from "@/lib/event-datetime";
import { sendPrintTicketEmail } from "@/lib/send-print-ticket-email";
import { runPrintTicketsEmailFromRows } from "@/lib/print-tickets/run-print-tickets-email-from-rows";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";
import { resolveBestPrintDownloadLinks } from "@/lib/print-tickets/resolve-download-links";

const EMAIL_LOG_CHUNK = 500;
const EMAIL_JOB_PROGRESS_STEP = 320;

type SectionRowForZip = {
  id: string;
  name: string | null;
  section_code: string | null;
};

export type PrintTicketEmailJobRow = {
  id: string;
  event_id: string;
  created_by: string;
  recipient_emails: string[] | unknown;
  print_ticket_ids: string[] | unknown;
  cursor: number;
  status: string;
  chunks_completed: number;
  accumulated_signed_urls?: string[] | null;
  email_finalized?: boolean | null;
  zip_pack_stamp?: string | null;
};

function asStringArray(v: string[] | unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function nowIso() {
  return new Date().toISOString();
}

async function claimEmailSendOnce(admin: SupabaseClient, jobId: string): Promise<boolean> {
  const stamp = `sending:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const { data, error } = await admin
    .from("print_ticket_email_jobs")
    .update({
      zip_pack_stamp: stamp,
      last_activity_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .eq("email_finalized", false)
    .is("zip_pack_stamp", null)
    .select("id")
    .limit(1);
  if (error) {
    throw new Error(error.message);
  }
  return Array.isArray(data) && data.length > 0;
}

async function releaseEmailSendClaim(admin: SupabaseClient, jobId: string): Promise<void> {
  await admin
    .from("print_ticket_email_jobs")
    .update({
      zip_pack_stamp: null,
      last_activity_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .eq("email_finalized", false);
}

async function finalizePrintTicketJobFromAccumulatedUrls(
  admin: SupabaseClient,
  job: PrintTicketEmailJobRow,
  ticketIds: string[],
  recipientEmails: string[],
  total: number
): Promise<void> {
  const { rows: metaRows, error: metaErr } = await fetchPrintTicketsForEmailByIds(admin, ticketIds);
  if (metaErr || metaRows.length === 0) {
    throw new Error(metaErr ?? "Could not load print tickets for email summary");
  }

  const byId = new Map(metaRows.map((r) => [r.id, r]));
  const ticketsInOrder: PrintTicketEmailRow[] = [];
  for (const id of ticketIds) {
    const row = byId.get(id);
    if (row) ticketsInOrder.push(row);
  }

  if (ticketsInOrder.length !== total) {
    throw new Error("Some print tickets were missing when building the email summary");
  }
  const ticketImageUrls = ticketsInOrder
    .map((t) => t.ticket_image_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  const downloadItems = await resolveBestPrintDownloadLinks(job.event_id, ticketImageUrls);
  const allUrls = downloadItems.map((x) => x.url);
  const allLabels = downloadItems.map((x) => x.label);
  if (allUrls.length === 0) {
    throw new Error("No pre-generated print folder links found. Regenerate print tickets first.");
  }

  const { data: eventRow, error: evErr } = await admin
    .from("events")
    .select("title, event_start, venue_id, slug")
    .eq("id", job.event_id)
    .single();

  if (evErr || !eventRow) {
    throw new Error("Event not found");
  }

  const sectionIds = [...new Set(ticketsInOrder.map((t) => t.event_section_id))];
  let sectionsDisplayForEmail = "—";
  if (sectionIds.length > 0) {
    const { data: secRows, error: secErr } = await admin
      .from("event_sections")
      .select("id, name, section_code")
      .in("id", sectionIds);

    if (!secErr && secRows?.length) {
      const typed = secRows as SectionRowForZip[];
      const names = typed
        .map((s) => (typeof s.name === "string" ? s.name.trim() : ""))
        .filter((n) => n.length > 0)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      if (names.length > 0) {
        sectionsDisplayForEmail = names.join(", ");
      }
    }
  }

  const venueName = eventRow.venue_id
    ? (
        await admin
          .from("venues")
          .select("name")
          .eq("id", eventRow.venue_id)
          .single()
      ).data?.name ?? "TBA"
    : "TBA";

  const eventDate = eventRow.event_start
    ? formatEventDateTimeLong(eventRow.event_start)
    : "TBA";

  const seatForEmail =
    total > 40
      ? "Various seats or slots — see the PNG files in the download folder."
      : total > 1
        ? "Multiple seats – see attached tickets."
        : "See attached ticket.";

  const subjectLine = buildPrintTicketsEmailSubject(
    sectionsDisplayForEmail,
    eventRow.title ?? "Event"
  );

  const commonMail = {
    eventTitle: eventRow.title ?? "Event",
    eventDate,
    venueName,
    sectionName: sectionsDisplayForEmail,
    seatNumbers: seatForEmail,
    attachments: [] as { filename: string; content: Buffer }[],
    bulkDownloadUrls: allUrls,
    bulkDownloadLinkLabels: allLabels,
    bulkTicketCount: total,
    subjectLine,
  };

  for (const to of recipientEmails) {
    await sendPrintTicketEmail({
      to,
      ...commonMail,
    });
  }

  for (const to of recipientEmails) {
    const emailRows = ticketsInOrder.map((pt) => ({
      print_ticket_id: pt.id,
      recipient_email: to,
    }));
    for (let i = 0; i < emailRows.length; i += EMAIL_LOG_CHUNK) {
      const chunk = emailRows.slice(i, i + EMAIL_LOG_CHUNK);
      const { error: insErr } = await admin.from("print_ticket_emails").insert(chunk);
      if (insErr) {
        console.error("[finalizePrintTicketJobFromAccumulatedUrls] print_ticket_emails insert:", insErr);
      }
    }
  }

}

/**
 * One worker tick: upload the next ticket folder batch, or send the summary email when done.
 */
export async function processPrintTicketEmailJobChunkWork(
  admin: SupabaseClient,
  job: PrintTicketEmailJobRow
): Promise<void> {
  if (job.status === "cancelled" || job.status === "failed" || job.status === "completed") {
    return;
  }

  const ticketIds = asStringArray(job.print_ticket_ids);
  const recipientEmails = asStringArray(job.recipient_emails);
  const total = ticketIds.length;

  if (recipientEmails.length === 0) {
    await admin
      .from("print_ticket_email_jobs")
      .update({
        status: "failed",
        error_message: "No recipient emails on job",
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    return;
  }

  if (total === 0) {
    await admin
      .from("print_ticket_email_jobs")
      .update({
        status: "completed",
        email_finalized: true,
        cursor: 0,
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    return;
  }

  if (job.email_finalized === true) {
    return;
  }

  if (total === 1) {
    const claimed = await claimEmailSendOnce(admin, job.id);
    if (!claimed) {
      return;
    }
    const batch = await collectNextPrintTicketsForZipBudget(admin, {
      orderedTicketIds: ticketIds,
      startIndex: 0,
    });
    if (batch.ticketRows.length === 0) {
      await admin
        .from("print_ticket_email_jobs")
        .update({
          status: "failed",
          error_message: "Could not load print ticket for send",
          zip_pack_stamp: null,
          last_activity_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", job.id);
      return;
    }
    await runPrintTicketsEmailFromRows(admin, {
      eventId: job.event_id,
      ticketsInOrder: batch.ticketRows,
      recipientEmails,
      sectionNameForEmail: "",
      seatNumbersSummary: "See attached ticket.",
      preloadedPngBuffers: batch.pngBuffers,
    });
    await admin
      .from("print_ticket_email_jobs")
      .update({
        status: "completed",
        email_finalized: true,
        cursor: 1,
        chunks_completed: (job.chunks_completed ?? 0) + 1,
        zip_pack_stamp: null,
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    return;
  }

  const cursor = Math.max(0, Math.floor(job.cursor ?? 0));

  try {
    if (cursor < total) {
      const nextCursor = Math.min(total, cursor + EMAIL_JOB_PROGRESS_STEP);

      await admin
        .from("print_ticket_email_jobs")
        .update({
          cursor: nextCursor,
          chunks_completed: (job.chunks_completed ?? 0) + 1,
          last_activity_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", job.id);
      return;
    }

    const claimed = await claimEmailSendOnce(admin, job.id);
    if (!claimed) {
      return;
    }

    await finalizePrintTicketJobFromAccumulatedUrls(admin, job, ticketIds, recipientEmails, total);

    await admin
      .from("print_ticket_email_jobs")
      .update({
        status: "completed",
        email_finalized: true,
        chunks_completed: (job.chunks_completed ?? 0) + 1,
        zip_pack_stamp: null,
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send print ticket email job";
    const zipStillPreparing = /ZIP preparation still in progress/i.test(msg);
    if (zipStillPreparing) {
      await admin
        .from("print_ticket_email_jobs")
        .update({
          status: "processing",
          error_message: msg,
          zip_pack_stamp: null,
          last_activity_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", job.id);
      return;
    }
    await releaseEmailSendClaim(admin, job.id);
    await admin
      .from("print_ticket_email_jobs")
      .update({
        status: "failed",
        error_message: msg,
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
  }
}
