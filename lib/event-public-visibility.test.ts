import { describe, expect, it } from "vitest";
import {
  getEventCardCountdownDisplay,
  getEventPublicListVisibleUntilDate,
  getManilaCalendarDate,
  isEventInProgress,
  isEventPubliclyListed,
} from "./event-public-visibility";

/** May 31, 2026 7:00 PM Manila = 2026-05-31T11:00:00.000Z */
const WISHDATE_START = "2026-05-31T11:00:00.000Z";

describe("event-public-visibility", () => {
  it("derives Manila calendar date from event start", () => {
    expect(getManilaCalendarDate(WISHDATE_START)).toBe("2026-05-31");
    expect(getEventPublicListVisibleUntilDate(WISHDATE_START)).toBe("2026-06-01");
  });

  it("shows countdown before start while still listed", () => {
    const beforeStart = Date.parse("2026-05-30T12:00:00.000Z");
    expect(getEventCardCountdownDisplay(WISHDATE_START, false, beforeStart)).toBe("countdown");
    expect(isEventPubliclyListed(WISHDATE_START, beforeStart)).toBe(true);
    expect(isEventInProgress(WISHDATE_START, beforeStart)).toBe(false);
  });

  it("shows in progress after showtime through grace day", () => {
    const afterShowtimeMay31 = Date.parse("2026-05-31T14:00:00.000Z");
    expect(getEventCardCountdownDisplay(WISHDATE_START, false, afterShowtimeMay31)).toBe(
      "in_progress"
    );
    expect(isEventInProgress(WISHDATE_START, afterShowtimeMay31)).toBe(true);
    expect(isEventPubliclyListed(WISHDATE_START, afterShowtimeMay31)).toBe(true);

    const dayAfter = Date.parse("2026-06-01T10:00:00.000Z");
    expect(getEventCardCountdownDisplay(WISHDATE_START, false, dayAfter)).toBe("in_progress");
    expect(isEventPubliclyListed(WISHDATE_START, dayAfter)).toBe(true);
  });

  it("hides from public listing two Manila days after event date", () => {
    const june2Manila = Date.parse("2026-06-01T18:00:00.000Z");
    expect(isEventPubliclyListed(WISHDATE_START, june2Manila)).toBe(false);
    expect(getEventCardCountdownDisplay(WISHDATE_START, false, june2Manila)).toBe("hidden");
    expect(isEventInProgress(WISHDATE_START, june2Manila)).toBe(false);
  });

  it("returns hidden when schedule is TBA", () => {
    expect(getEventCardCountdownDisplay(WISHDATE_START, true, Date.now())).toBe("hidden");
  });
});
