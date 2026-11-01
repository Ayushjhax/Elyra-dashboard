import type { YieldOpportunity } from "@/lib/research/types";
import { checkStatus, searchPools, sharedTime, sortPools } from "~/lib/researchViews";

const pool = (id: string, name: string, apyPct: number | null, apy30dPct: number | null, tvlUsd: number | null): YieldOpportunity =>
  ({ provider: "kamino", id, name, asset: "USDC", mint: "m", strategy: "vault", apyPct, apy30dPct, rewardApyPct: null, tvlUsd, availableUsd: null, holders: null, flags: [], asOf: null }) as unknown as YieldOpportunity;

const base = { noun: "price", loading: false, failed: false, hasData: true, triggered: false };

describe("signal check status", () => {
  it("calls only an evaluated, untriggered check within thresholds", () => {
    expect(checkStatus({ ...base, state: "evaluated" })).toMatchObject({ label: "Within thresholds", within: true });
    expect(checkStatus({ ...base, state: "stale" }).within).toBe(false);
    expect(checkStatus({ ...base, state: "unavailable" })).toMatchObject({ label: "Feed unavailable", within: false });
    expect(checkStatus({ ...base, state: "unsupported" }).within).toBe(false);
    expect(checkStatus({ ...base, state: undefined }).within).toBe(false);
  });

  it("says crossed, loading and failed as they are", () => {
    expect(checkStatus({ ...base, state: "evaluated", triggered: true }).label).toBe("Threshold crossed");
    expect(checkStatus({ ...base, state: undefined, loading: true }).label).toBe("Evaluating…");
    expect(checkStatus({ ...base, state: undefined, hasData: false, failed: true }).label).toBe("Evaluation failed");
  });
});

describe("pools", () => {
  const pools = [pool("c", "Gamma", 5, null, 100), pool("a", "Alpha", 8.45, 7.96, 44_800_000), pool("b", "Beta", null, 7.71, 3_770_000), pool("d", "Delta", 8.45, 6, 1)];

  it("sorts numerically, highest first, missing last, ties by name", () => {
    expect(sortPools(pools, "apyPct").map((p) => p.id)).toEqual(["a", "d", "c", "b"]);
    expect(sortPools(pools, "apy30dPct").map((p) => p.id)).toEqual(["a", "b", "d", "c"]);
    expect(sortPools(pools, "tvlUsd").map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("searches name, asset and vault", () => {
    expect(searchPools(pools, "  beta ").map((p) => p.id)).toEqual(["b"]);
    expect(searchPools(pools, "usdc")).toHaveLength(4);
    expect(searchPools(pools, "")).toHaveLength(4);
  });
});

describe("shared source time", () => {
  it("groups only a time every row has", () => {
    expect(sharedTime(["2026-11-01T10:32:00Z", "2026-11-01T10:32:00.000Z"])).toBe("2026-11-01T10:32:00Z");
    expect(sharedTime(["2026-11-01T10:32:00Z", "2026-11-01T10:33:00Z"])).toBeNull();
    expect(sharedTime(["2026-11-01T10:32:00Z", null])).toBeNull();
    expect(sharedTime([])).toBeNull();
  });
});
