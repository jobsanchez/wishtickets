import {
  TICKET_INVENTORY_BATCH_SUCCESS_DELAY_MS,
  TICKET_INVENTORY_MAX_BATCH_ATTEMPTS,
  TICKET_INVENTORY_MAX_CONSECUTIVE_ERRORS,
  TICKET_INVENTORY_MAX_CONSECUTIVE_IDLE,
  TICKET_INVENTORY_SECTION_WORKERS,
} from "@/lib/ticket-inventory/constants";

export type TicketInventoryGenerateProgress = {
  percent: number;
  message: string;
  subtitle: string;
  detail: string;
};

export type TicketInventoryGenerateTotals = {
  created: number;
  existing: number;
  skipped_allocated: number;
  images_generated: number;
  images_failed: number;
  inventory_total: number;
};

type BatchResponse = {
  success?: boolean;
  complete?: boolean;
  created?: number;
  existing?: number;
  skipped_allocated?: number;
  images_generated?: number;
  images_failed?: number;
  ensure_seats_processed?: number;
  seats_pending?: number;
  images_pending?: number;
  inventory_total?: number;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSectionBatches(
  eventId: string,
  sectionId: string,
  sectionLabel: string,
  generateImages: boolean,
  onSectionProgress: (sectionId: string, progress: TicketInventoryGenerateProgress) => void
): Promise<
  | { ok: true; totals: TicketInventoryGenerateTotals }
  | { ok: false; error: string }
> {
  const totals: TicketInventoryGenerateTotals = {
    created: 0,
    existing: 0,
    skipped_allocated: 0,
    images_generated: 0,
    images_failed: 0,
    inventory_total: 0,
  };

  let loop = 0;
  let consecutiveIdle = 0;
  let consecutiveErrors = 0;
  let initialWork = 0;

  while (loop < TICKET_INVENTORY_MAX_BATCH_ATTEMPTS) {
    loop += 1;
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/ticket-inventory/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_ids: [sectionId],
          generate_images: generateImages,
          batch: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as BatchResponse;
      if (!res.ok || !data.success) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= TICKET_INVENTORY_MAX_CONSECUTIVE_ERRORS) {
          return { ok: false, error: data.error ?? "Failed to generate tickets" };
        }
        await sleep(Math.min(4000, 400 + consecutiveErrors * 200));
        continue;
      }

      consecutiveErrors = 0;
      totals.created += data.created ?? 0;
      totals.existing += data.existing ?? 0;
      totals.skipped_allocated += data.skipped_allocated ?? 0;
      totals.images_generated += data.images_generated ?? 0;
      totals.images_failed += data.images_failed ?? 0;
      if (typeof data.inventory_total === "number") {
        totals.inventory_total = data.inventory_total;
      }

      const seatsPending = data.seats_pending ?? 0;
      const imagesPending = data.images_pending ?? 0;
      const workRemaining = seatsPending + (generateImages ? imagesPending : 0);
      if (initialWork === 0) {
        const processedThisBatch =
          (data.ensure_seats_processed ?? 0) + (data.images_generated ?? 0);
        initialWork = workRemaining + processedThisBatch;
      }
      const done = Math.max(0, initialWork - workRemaining);
      const percent =
        initialWork > 0 ? Math.min(99, Math.round((done / initialWork) * 100)) : 10;

      onSectionProgress(sectionId, {
        percent,
        message: seatsPending > 0 ? "Creating ticket inventory" : "Rendering ticket images",
        subtitle: sectionLabel,
        detail:
          seatsPending > 0
            ? `${seatsPending} seat${seatsPending === 1 ? "" : "s"} still need inventory rows. Keep this tab open.`
            : imagesPending > 0
              ? `${imagesPending} image${imagesPending === 1 ? "" : "s"} remaining. Keep this tab open.`
              : "Finishing up…",
      });

      if (data.complete) {
        return { ok: true, totals };
      }

      const processed =
        (data.ensure_seats_processed ?? 0) + (data.images_generated ?? 0) + (data.created ?? 0);
      if (processed === 0) {
        consecutiveIdle += 1;
        if (consecutiveIdle >= TICKET_INVENTORY_MAX_CONSECUTIVE_IDLE) {
          return { ok: false, error: "Ticket generation stayed idle too long" };
        }
        await sleep(Math.min(5000, 500 + consecutiveIdle * 150));
        continue;
      }

      consecutiveIdle = 0;
      await sleep(TICKET_INVENTORY_BATCH_SUCCESS_DELAY_MS);
    } catch {
      consecutiveErrors += 1;
      if (consecutiveErrors >= TICKET_INVENTORY_MAX_CONSECUTIVE_ERRORS) {
        return { ok: false, error: "Failed to generate tickets" };
      }
      await sleep(Math.min(4000, 400 + consecutiveErrors * 200));
    }
  }

  return { ok: false, error: "Ticket generation took too long — refresh and try again if needed." };
}

/**
 * Batched ticket inventory generation for Seat Configurator: up to
 * {@link TICKET_INVENTORY_SECTION_WORKERS} sections in parallel; each section runs batch
 * requests one after another to avoid gateway timeouts.
 */
export async function runTicketInventoryGenerateClient(opts: {
  eventId: string;
  sectionIds: string[];
  generateImages: boolean;
  sectionLabelById: Map<string, string>;
  onProgress: (progress: TicketInventoryGenerateProgress) => void;
}): Promise<
  | { ok: true; totals: TicketInventoryGenerateTotals }
  | { ok: false; error: string }
> {
  const sectionIds = [...new Set(opts.sectionIds.filter(Boolean))];
  if (sectionIds.length === 0) {
    return { ok: false, error: "No sections selected" };
  }

  const merged: TicketInventoryGenerateTotals = {
    created: 0,
    existing: 0,
    skipped_allocated: 0,
    images_generated: 0,
    images_failed: 0,
    inventory_total: 0,
  };

  const progressBySection = new Map<string, TicketInventoryGenerateProgress>();
  let nextSectionIndex = 0;
  const workerCount = Math.min(TICKET_INVENTORY_SECTION_WORKERS, sectionIds.length);

  const reportAggregateProgress = () => {
    const entries = [...progressBySection.values()];
    const avgPercent =
      entries.length > 0
        ? Math.round(entries.reduce((sum, p) => sum + p.percent, 0) / entries.length)
        : 5;
    const active = entries.find((p) => p.percent < 99) ?? entries[entries.length - 1];
    opts.onProgress({
      percent: avgPercent,
      message: active?.message ?? "Generating ticket inventory",
      subtitle:
        sectionIds.length > 1
          ? `${sectionIds.length} sections · Seat configurator`
          : (active?.subtitle ?? "Seat configurator"),
      detail: active?.detail ?? "Processing in batches. Keep this tab open.",
    });
  };

  opts.onProgress({
    percent: 5,
    message: "Generating ticket inventory",
    subtitle:
      sectionIds.length > 1
        ? `${sectionIds.length} sections · Seat configurator`
        : (opts.sectionLabelById.get(sectionIds[0]!) ?? "Seat configurator"),
    detail: `Starting ${workerCount} parallel worker${workerCount === 1 ? "" : "s"}; each section runs batch-by-batch.`,
  });

  async function worker(): Promise<{ ok: false; error: string } | null> {
    for (;;) {
      const idx = nextSectionIndex;
      nextSectionIndex += 1;
      if (idx >= sectionIds.length) return null;
      const sectionId = sectionIds[idx]!;
      const sectionLabel = opts.sectionLabelById.get(sectionId) ?? "Section";
      const result = await runSectionBatches(
        opts.eventId,
        sectionId,
        sectionLabel,
        opts.generateImages,
        (sid, progress) => {
          progressBySection.set(sid, progress);
          reportAggregateProgress();
        }
      );
      if (!result.ok) return result;
      merged.created += result.totals.created;
      merged.existing += result.totals.existing;
      merged.skipped_allocated += result.totals.skipped_allocated;
      merged.images_generated += result.totals.images_generated;
      merged.images_failed += result.totals.images_failed;
      merged.inventory_total = Math.max(merged.inventory_total, result.totals.inventory_total);
    }
  }

  const workers = await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const failure = workers.find((w) => w !== null);
  if (failure) {
    return failure;
  }

  return { ok: true, totals: merged };
}
