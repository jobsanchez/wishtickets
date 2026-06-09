/** Stable client/server id for free/standing slots before a `print_tickets` row exists. */
const PREFIX = "virtual:";

export function buildVirtualPrintSlotSeatId(sectionId: string, slot: number): string {
  return `${PREFIX}${sectionId}:${slot}`;
}

export function parseVirtualPrintSlotSeatId(
  id: string
): { sectionId: string; slot: number } | null {
  if (!id.startsWith(PREFIX)) return null;
  const rest = id.slice(PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon <= 0) return null;
  const sectionId = rest.slice(0, lastColon);
  const slot = parseInt(rest.slice(lastColon + 1), 10);
  if (!Number.isFinite(slot) || slot < 1 || !sectionId) return null;
  return { sectionId, slot };
}
