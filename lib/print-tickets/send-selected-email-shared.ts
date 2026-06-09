export type ParsedSendItem = {
  sectionId: string;
  seatId: string | null;
  sectionSlotIndex?: number;
};

export type ParsedSendSelectedBody = {
  eventId: string;
  recipientEmail: string;
  items: ParsedSendItem[];
};

function parseItemsFromBody(itemsRaw: unknown): ParsedSendItem[] {
  if (!Array.isArray(itemsRaw)) return [];
  return itemsRaw
    .map((it) => {
      if (it && typeof it === "object" && "sectionId" in it) {
        const sectionId =
          typeof (it as { sectionId?: string }).sectionId === "string"
            ? (it as { sectionId: string }).sectionId
            : null;
        const seatIdVal = (it as { seatId?: string | null }).seatId;
        const seatId = typeof seatIdVal === "string" ? seatIdVal : null;
        const slotRaw = (it as { sectionSlotIndex?: unknown }).sectionSlotIndex;
        const sectionSlotIndex =
          typeof slotRaw === "number" && Number.isFinite(slotRaw) && slotRaw >= 1
            ? Math.floor(slotRaw)
            : undefined;
        if (!sectionId) return null;
        const out: ParsedSendItem = { sectionId, seatId };
        if (sectionSlotIndex !== undefined) out.sectionSlotIndex = sectionSlotIndex;
        return out;
      }
      return null;
    })
    .filter((x): x is ParsedSendItem => x !== null);
}

/** Parse JSON body for send-selected-email (sync route and job enqueue). */
export function parseSendSelectedEmailBody(body: unknown):
  | { ok: true; value: ParsedSendSelectedBody }
  | { ok: false; error: string; status: number } {
  const eventId =
    typeof (body as { eventId?: string }).eventId === "string"
      ? (body as { eventId: string }).eventId
      : null;
  const recipientEmail =
    typeof (body as { recipientEmail?: string }).recipientEmail === "string"
      ? (body as { recipientEmail: string }).recipientEmail.trim()
      : null;
  const items = parseItemsFromBody((body as { items?: unknown[] }).items);

  if (!eventId || items.length === 0) {
    return { ok: false, error: "eventId and items are required", status: 400 };
  }
  if (!recipientEmail) {
    return { ok: false, error: "At least one recipient email is required", status: 400 };
  }

  return { ok: true, value: { eventId, recipientEmail, items } };
}
