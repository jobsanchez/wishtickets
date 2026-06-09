/** True when section should use capacity slots, not `event_seats`, for print tickets. */
export function isFreeStandingSeatingType(
  seatingType: string | null | undefined
): boolean {
  const t = (seatingType ?? "").toString().trim().toLowerCase();
  return t === "free" || t === "standing";
}
