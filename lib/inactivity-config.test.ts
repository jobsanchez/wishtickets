import { describe, expect, it } from "vitest";
import {
  DEFAULT_INACTIVITY_MINUTES,
  shouldForceInactivityLogout,
  type InactivityConfig,
} from "./inactivity-config";

const enabledConfig: InactivityConfig = {
  enabled: true,
  minutes: DEFAULT_INACTIVITY_MINUTES,
};

function staleTimestamp(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

describe("shouldForceInactivityLogout", () => {
  it("returns true when force_logout is set even if logged_in is false", () => {
    expect(
      shouldForceInactivityLogout(
        {
          logged_in: false,
          force_logout: true,
          has_active_cart: false,
          in_paymongo_flow: false,
          last_activity_at: staleTimestamp(60),
          last_heartbeat_at: staleTimestamp(60),
        },
        enabledConfig
      )
    ).toBe(true);
  });

  it("returns true when logged in and idle past cutoff", () => {
    expect(
      shouldForceInactivityLogout(
        {
          logged_in: true,
          force_logout: false,
          has_active_cart: false,
          in_paymongo_flow: false,
          last_activity_at: staleTimestamp(DEFAULT_INACTIVITY_MINUTES + 1),
          last_heartbeat_at: staleTimestamp(DEFAULT_INACTIVITY_MINUTES + 1),
        },
        enabledConfig
      )
    ).toBe(true);
  });

  it("returns false when logged out with no force_logout flag", () => {
    expect(
      shouldForceInactivityLogout(
        {
          logged_in: false,
          force_logout: false,
          has_active_cart: false,
          in_paymongo_flow: false,
          last_activity_at: staleTimestamp(60),
          last_heartbeat_at: staleTimestamp(60),
        },
        enabledConfig
      )
    ).toBe(false);
  });

  it("returns false when user has an active cart", () => {
    expect(
      shouldForceInactivityLogout(
        {
          logged_in: true,
          force_logout: false,
          has_active_cart: true,
          in_paymongo_flow: false,
          last_activity_at: staleTimestamp(60),
          last_heartbeat_at: staleTimestamp(60),
        },
        enabledConfig
      )
    ).toBe(false);
  });

  it("returns false when user is in PayMongo checkout flow", () => {
    expect(
      shouldForceInactivityLogout(
        {
          logged_in: true,
          force_logout: false,
          has_active_cart: false,
          in_paymongo_flow: true,
          last_activity_at: staleTimestamp(60),
          last_heartbeat_at: staleTimestamp(60),
        },
        enabledConfig
      )
    ).toBe(false);
  });

  it("returns false when inactivity auto-logout is disabled", () => {
    expect(
      shouldForceInactivityLogout(
        {
          logged_in: true,
          force_logout: true,
          has_active_cart: false,
          in_paymongo_flow: false,
          last_activity_at: staleTimestamp(60),
          last_heartbeat_at: staleTimestamp(60),
        },
        { enabled: false, minutes: DEFAULT_INACTIVITY_MINUTES }
      )
    ).toBe(false);
  });
});
