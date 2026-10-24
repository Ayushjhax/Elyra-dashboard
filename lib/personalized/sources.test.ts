import { describe, expect, it } from "vitest";
import { accountContextOn, sourceStatuses, usable, type SourceInputs } from "@/lib/personalized/sources";

const READ: SourceInputs = {
  wallet: { loading: false, hasAddress: true, unconfigured: false, read: true, stale: false, error: null },
  portfolio: { loading: false, read: true, positions: 0, positionsFailed: false, error: null },
  activity: { loading: false, unconfigured: false, count: 4, error: null },
  memory: { loading: false, count: 0, error: null },
};

describe("sourceStatuses", () => {
  it("does not call cached activity or partial positions included successfully after a failure", () => {
    const statuses = sourceStatuses({ ...READ,
      portfolio: { ...READ.portfolio, positions: 2, positionsFailed: true },
      activity: { ...READ.activity, count: 4, error: "Refresh failed" },
    });
    expect(statuses.positions).toEqual({ state: "failed", label: "2 open · partly unread" });
    expect(statuses.activity).toEqual({ state: "failed", label: "Last read failed" });
  });
  it("reads a connected, empty account the way the reference shows it", () => {
    const statuses = sourceStatuses(READ);
    expect(statuses.wallet).toEqual({ state: "connected", label: "Connected" });
    expect(statuses.positions).toEqual({ state: "empty", label: "None yet" });
    expect(statuses.activity).toEqual({ state: "available", label: "Available" });
    expect(statuses.memory).toEqual({ state: "empty", label: "Not set" });
  });

  it("never calls a failed read empty", () => {
    const statuses = sourceStatuses({
      ...READ,
      wallet: { ...READ.wallet, read: false, error: "503" },
      portfolio: { ...READ.portfolio, read: false, error: "timeout" },
      activity: { ...READ.activity, count: 0, error: "RPC" },
      memory: { ...READ.memory, error: "table missing" },
    });
    expect(Object.values(statuses).map((status) => status.state)).toEqual(["failed", "failed", "failed", "failed"]);
  });

  it("says positions may be missing when a venue failed and none were read", () => {
    expect(sourceStatuses({ ...READ, portfolio: { ...READ.portfolio, positionsFailed: true } }).positions.label).toBe("Partly unread");
    /* Keep the known count and the incomplete-read reason together. */
    expect(sourceStatuses({ ...READ, portfolio: { ...READ.portfolio, positions: 2, positionsFailed: true } }).positions.label).toBe("2 open · partly unread");
  });

  it("tells not configured and no wallet apart from a failure", () => {
    const statuses = sourceStatuses({
      ...READ,
      wallet: { ...READ.wallet, hasAddress: false },
      activity: { ...READ.activity, unconfigured: true },
    });
    expect(statuses.wallet).toEqual({ state: "unavailable", label: "No wallet" });
    expect(statuses.activity.state).toBe("unavailable");
    expect(usable(statuses.activity)).toBe(false);
    expect(usable({ state: "empty", label: "None yet" })).toBe(true);
  });

  it("marks a stale wallet reading rather than calling it connected", () => {
    expect(sourceStatuses({ ...READ, wallet: { ...READ.wallet, stale: true } }).wallet.state).toBe("failed");
  });
});

describe("accountContextOn", () => {
  it("is on only with a wallet and at least one source", () => {
    expect(accountContextOn(true, true, ["portfolio"])).toBe(true);
    expect(accountContextOn(true, true, [])).toBe(false);
    expect(accountContextOn(true, false, ["portfolio"])).toBe(false);
    expect(accountContextOn(false, true, ["portfolio"])).toBe(false);
  });
});
