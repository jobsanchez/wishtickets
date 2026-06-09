import {
  AvailabilityHttpError,
  type AvailabilityDebugMeta,
  type AvailabilitySeatRow,
  type CanvasInfo,
  normalizeSeatingType,
  type SectionInfo,
} from "./book-page-types";

export const AVAILABILITY_FETCH_TIMEOUT_MS = 12_000;
export const AVAILABILITY_RETRY_ATTEMPTS = 3;
export const AVAILABILITY_RETRY_BASE_DELAY_MS = 250;
export const AVAILABILITY_SEAT_SECTION_CHUNK = 8;
export const AVAILABILITY_SEAT_FETCH_CONCURRENCY = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAvailabilityError(err: unknown): boolean {
  if (err instanceof AvailabilityHttpError) return err.retryable;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("aborted") ||
      msg.includes("network") ||
      msg.includes("failed to fetch")
    );
  }
  return true;
}

async function availabilityFetchJSON(
  url: string,
  timeoutMs: number
): Promise<{ json: Record<string, unknown>; debug: AvailabilityDebugMeta }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const debug = {
        branch: res.headers.get("x-availability-branch"),
        requestId: res.headers.get("x-availability-request-id"),
      };
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const msg =
          json && typeof json.error === "string" && json.error.trim()
            ? json.error
            : "Failed to load availability";
        const code =
          json && typeof json.code === "string" && json.code.trim()
            ? json.code
            : null;
        throw new AvailabilityHttpError(msg, res.status, code, debug);
      }
      if (!json || typeof json !== "object") {
        throw new Error("Invalid availability response");
      }
      return { json, debug };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Availability request timed out");
      }
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAvailabilityManifestWithRetry(eventId: string): Promise<{
  sections: SectionInfo[];
  canvases: CanvasInfo[];
  debug: AvailabilityDebugMeta;
}> {
  let lastError: unknown = null;
  const q = `${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < AVAILABILITY_RETRY_ATTEMPTS; attempt++) {
    try {
      const { json, debug } = await availabilityFetchJSON(
        `/api/events/${eventId}/availability?mode=manifest&t=${q}`,
        AVAILABILITY_FETCH_TIMEOUT_MS
      );
      return {
        sections: Array.isArray(json.sections) ? (json.sections as SectionInfo[]) : [],
        canvases: Array.isArray(json.canvases) ? (json.canvases as CanvasInfo[]) : [],
        debug,
      };
    } catch (err) {
      lastError = err;
      if (!isRetryableAvailabilityError(err)) break;
      if (attempt < AVAILABILITY_RETRY_ATTEMPTS - 1) {
        await sleep(AVAILABILITY_RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Failed to load availability");
}

export async function fetchAvailabilityFullWithRetry(eventId: string): Promise<{
  sections: SectionInfo[];
  canvases: CanvasInfo[];
  seats: AvailabilitySeatRow[];
  debug: AvailabilityDebugMeta;
}> {
  let lastError: unknown = null;
  const q = `${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < AVAILABILITY_RETRY_ATTEMPTS; attempt++) {
    try {
      const { json, debug } = await availabilityFetchJSON(
        `/api/events/${eventId}/availability?t=${q}`,
        AVAILABILITY_FETCH_TIMEOUT_MS
      );
      return {
        sections: Array.isArray(json.sections) ? (json.sections as SectionInfo[]) : [],
        canvases: Array.isArray(json.canvases) ? (json.canvases as CanvasInfo[]) : [],
        seats: Array.isArray(json.seats) ? (json.seats as AvailabilitySeatRow[]) : [],
        debug,
      };
    } catch (err) {
      lastError = err;
      if (!isRetryableAvailabilityError(err)) break;
      if (attempt < AVAILABILITY_RETRY_ATTEMPTS - 1) {
        await sleep(AVAILABILITY_RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Failed to load availability");
}

async function fetchAssignedSectionIdsFromManifest(eventId: string): Promise<string[]> {
  const manifest = await fetchAvailabilityManifestWithRetry(eventId);
  return manifest.sections
    .filter((s) => normalizeSeatingType(s.seating_type) === "assigned")
    .map((s) => s.id);
}

async function fetchAvailabilitySeatsForSections(
  eventId: string,
  sectionIdsSubset: string[] | null
): Promise<{ seats: AvailabilitySeatRow[]; debug: AvailabilityDebugMeta }> {
  const q = `${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
  const subsection =
    sectionIdsSubset != null && sectionIdsSubset.length > 0
      ? `&sectionIds=${encodeURIComponent(sectionIdsSubset.join(","))}`
      : "";
  const { json, debug } = await availabilityFetchJSON(
    `/api/events/${eventId}/availability?mode=seats&t=${q}${subsection}`,
    AVAILABILITY_FETCH_TIMEOUT_MS
  );
  return {
    seats: Array.isArray(json.seats) ? (json.seats as AvailabilitySeatRow[]) : [],
    debug,
  };
}

export async function fetchAvailabilityAllSeatsWithRetry(
  eventId: string,
  assignedSectionIds: string[]
): Promise<{ seats: AvailabilitySeatRow[]; debug: AvailabilityDebugMeta }> {
  let lastError: unknown = null;
  let fallbackAssignedSectionIds: string[] | null = null;
  for (let attempt = 0; attempt < AVAILABILITY_RETRY_ATTEMPTS; attempt++) {
    try {
      const idsForAttempt =
        assignedSectionIds.length > 0
          ? assignedSectionIds
          : (fallbackAssignedSectionIds ?? []);
      if (idsForAttempt.length === 0) {
        try {
          const out = await fetchAvailabilitySeatsForSections(eventId, null);
          return out;
        } catch (err) {
          if (!isRetryableAvailabilityError(err)) throw err;
          if (!fallbackAssignedSectionIds) {
            fallbackAssignedSectionIds =
              await fetchAssignedSectionIdsFromManifest(eventId).catch(() => []);
          }
          if (fallbackAssignedSectionIds.length === 0) throw err;
        }
      }
      const sectionIdsToUse =
        idsForAttempt.length > 0 ? idsForAttempt : fallbackAssignedSectionIds ?? [];
      if (sectionIdsToUse.length <= AVAILABILITY_SEAT_SECTION_CHUNK) {
        return await fetchAvailabilitySeatsForSections(eventId, sectionIdsToUse);
      }
      const all: AvailabilitySeatRow[] = [];
      let latestDebug: AvailabilityDebugMeta = { branch: null, requestId: null };
      const chunks: string[][] = [];
      for (
        let i = 0;
        i < sectionIdsToUse.length;
        i += AVAILABILITY_SEAT_SECTION_CHUNK
      ) {
        chunks.push(sectionIdsToUse.slice(i, i + AVAILABILITY_SEAT_SECTION_CHUNK));
      }
      for (let c = 0; c < chunks.length; c += AVAILABILITY_SEAT_FETCH_CONCURRENCY) {
        const batch = chunks.slice(c, c + AVAILABILITY_SEAT_FETCH_CONCURRENCY);
        const parts = await Promise.all(
          batch.map((chunk) => fetchAvailabilitySeatsForSections(eventId, chunk))
        );
        for (const part of parts) {
          all.push(...part.seats);
          latestDebug = part.debug;
        }
      }
      return { seats: all, debug: latestDebug };
    } catch (err) {
      lastError = err;
      if (!isRetryableAvailabilityError(err)) break;
      if (attempt < AVAILABILITY_RETRY_ATTEMPTS - 1) {
        await sleep(AVAILABILITY_RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Failed to load availability");
}
