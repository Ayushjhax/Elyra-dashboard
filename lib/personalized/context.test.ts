import { describe, expect, it } from "vitest";
import { renderContext, withhold } from "@/lib/personalized/context";
import type { PersonalizedContext } from "@/lib/personalized/types";

/* What the composer's source chips promise: a source the person turned off is
   not in the prompt at all — not as a figure, not as "unknown". */

const FULL: PersonalizedContext = {
  asOf: "2026-10-15T12:00:00.000Z",
  totalEquityUsd: 4920.37,
  availableCapitalUsd: 1840.12,
  change24h: { usdChange: 12.5, pctChange: 0.25, coveragePct: 100 },
  exposures: [{ symbol: "SOL", valueUsd: 662.89, pct: 13.5, venues: ["Spot"] }],
  largestExposure: { symbol: "SOL", valueUsd: 662.89, pct: 13.5, venues: ["Spot"] },
  positionCount: 2,
  openOrderCount: 1,
  risk: [{ key: "concentration", label: "Largest asset", value: "37.4%", limit: "30%", breached: true, detail: "USDC" }],
  today: [],
  memories: [
    {
      id: "m1", type: "concentration_limit", key: "concentration_limit", value: 30, confidence: 1,
      source: "explicit", label: "Max 30% in any one asset", createdAt: "", updatedAt: "",
    },
  ],
  prediction: null,
  activity: [{ at: "2026-10-14T09:00:00.000Z", status: "confirmed", title: "Swapped 2 SOL for 290.41 USDC" }],
  excluded: [],
  unavailable: [],
  empty: false,
};

describe("withhold", () => {
  it("leaves everything in when nothing is withheld", () => {
    const text = renderContext(withhold(FULL, []));
    expect(text).toContain("Total equity: $4920.37");
    expect(text).toContain("Open positions: 2");
    expect(text).toContain("Swapped 2 SOL for 290.41 USDC");
    expect(text).toContain("Max 30% in any one asset");
    expect(text).not.toContain("WITHHELD");
  });

  it("removes a withheld portfolio entirely and says it was withheld", () => {
    const text = renderContext(withhold(FULL, ["portfolio"]));
    expect(text).not.toContain("4920");
    expect(text).not.toContain("Total equity");
    expect(text).not.toContain("Exposure by symbol");
    expect(text).toContain("WITHHELD BY THE USER");
    expect(text).toContain("- portfolio:");
    /* Withheld is not the same as unreadable. */
    expect(text).not.toContain("unknown");
  });

  it("drops positions, activity and memory each on its own", () => {
    const positions = renderContext(withhold(FULL, ["positions"]));
    expect(positions).not.toContain("Open positions");
    expect(positions).toContain("Total equity");

    const activity = renderContext(withhold(FULL, ["activity"]));
    expect(activity).not.toContain("Swapped");

    const memory = withhold(FULL, ["memory"]);
    expect(memory.memories).toEqual([]);
    /* A limit read from a withheld preference must not survive in the risk rows. */
    expect(memory.risk[0]).toMatchObject({ limit: null, breached: false });
    expect(renderContext(memory)).not.toContain("Max 30%");
  });

  it("tells an empty activity read apart from one that was not read", () => {
    expect(renderContext({ ...FULL, activity: [] })).toContain("Recent wallet transactions: none.");
    expect(renderContext({ ...FULL, activity: null })).not.toContain("Recent wallet transactions");
  });
});
