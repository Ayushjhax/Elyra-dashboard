import { describe, expect, it } from "vitest";
import { predictionUnavailable } from "@/lib/portfolio/compose";
import { prepareAction, revalidate } from "@/lib/personalized/actions";
import { deriveInsights, suggestedPrompts, welcomeLines } from "@/lib/personalized/insights";
import { validateMemory, MemoryValidationError } from "@/lib/personalized/memory";
import type { PersonalizedMemory } from "@/lib/personalized/types";
import type { PerpPosition, PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The safety boundary.

   The spec names one scenario outright: "Sell half my SOL" must not execute,
   must compute the amount from the real current balance, must return a
   preview, and must require confirmation. That is the first test below, and
   the rest guard the ways a model could otherwise put a number in front of
   the operator that no balance supports.
--------------------------------------------------------------------------- */

function holding(over: Partial<SpotHolding> = {}): SpotHolding {
  return {
    id: "wallet:SOL", venue: "wallet", chain: "Solana", address: null,
    symbol: "SOL", name: "Solana", logo: null, quantity: 42.5, decimals: 9,
    priceUsd: 100, valueUsd: 4250, change24hPct: null, allocationPct: null,
    avgCostUsd: null, pnlUsd: null, pnlPct: null, verified: true, liquid: false,
    ...over,
  };
}

function perp(over: Partial<PerpPosition> = {}): PerpPosition {
  return {
    id: "hyperliquid:SOL-PERP:long", venue: "hyperliquid", market: "SOL-PERP",
    side: "long", size: 10, entryPrice: 100, markPrice: 110, leverage: 5,
    marginUsd: 220, liquidationPrice: 80, notionalUsd: 1100,
    unrealizedPnlUsd: 100, roePct: 45.45, fundingUsd: null,
    ...over,
  };
}

function snapshot(over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    asOf: "2026-09-16T00:00:00.000Z",
    summary: {
      totalValueUsd: 10_000, availableCapitalUsd: null, unrealizedPnlUsd: null,
      pnl24hUsd: null, pnl24hPct: null, agentManagedValueUsd: null,
      agentManagedPct: null,
    },
    scopes: [], spot: [], perps: [], defi: [], orders: [], activity: [],
    history: [],
    /* No prediction account linked — a different state from having no
       positions, which the snapshot is required to carry. */
    prediction: predictionUnavailable("No prediction-market account is linked."),
    notes: [], partial: false,
    ...over,
  };
}

function memory(over: Partial<PersonalizedMemory> = {}): PersonalizedMemory {
  return {
    id: "m1", type: "concentration_limit", key: "concentration_limit", value: 30,
    confidence: 1, source: "explicit", label: "Max 30% in any one asset",
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe('"Sell half my SOL"', () => {
  const base = snapshot({ spot: [holding({ quantity: 42.5, priceUsd: 100 })] });

  it("computes the amount from the real balance, not from the request", () => {
    const action = prepareAction({ kind: "swap", symbol: "SOL", fraction: 0.5 }, base);
    expect(action.summary).toContain("21.25");
    expect(action.fields.find((f) => f.label === "Amount")?.value).toContain("21.25");
  });

  it("marks every resolved field as server-derived", () => {
    const action = prepareAction({ kind: "swap", symbol: "SOL", fraction: 0.5 }, base);
    const amount = action.fields.find((field) => field.label === "Amount");
    expect(amount?.derived).toBe(true);
  });

  it("reports a swap as ready, because one can now be signed and routed", () => {
    const action = prepareAction({ kind: "swap", symbol: "SOL", fraction: 0.5 }, base);
    expect(action.readiness).toBe("ready");
    /* Ready carries no reason — the field exists to say why something is not. */
    expect(action.reason).toBeNull();
  });

  it("still refuses a transfer, because a proposal carries no destination", () => {
    /* Readiness is per kind, not per shape: a transfer takes the same branch
       as a swap, so a change that made swaps executable could silently carry
       transfers with it — and a transfer with no recipient is a Confirm
       button over a send with nowhere to go. */
    const action = prepareAction({ kind: "transfer", symbol: "SOL", fraction: 0.5 }, base);
    expect(action.readiness).toBe("unsupported");
    expect(action.reason).toMatch(/destination address/i);
  });

  it("shows the balance that would remain", () => {
    const action = prepareAction({ kind: "swap", symbol: "SOL", fraction: 0.5 }, base);
    expect(action.fields.find((f) => f.label === "Balance after")?.value).toContain("21.25");
  });
});

describe("prepareAction guards", () => {
  it("rejects an asset the account does not hold", () => {
    const action = prepareAction(
      { kind: "transfer", symbol: "BTC", fraction: 1 },
      snapshot({ spot: [holding()] }),
    );
    expect(action.readiness).toBe("rejected");
    expect(action.reason).toContain("No BTC balance");
  });

  it("clamps an amount larger than the balance and says so", () => {
    /* The intent is clear; the operator should see the real maximum rather
       than an error. */
    const action = prepareAction(
      { kind: "transfer", symbol: "SOL", quantity: 1_000_000 },
      snapshot({ spot: [holding({ quantity: 42.5 })] }),
    );
    expect(action.readiness).not.toBe("rejected");
    expect(action.warnings.join(" ")).toMatch(/larger than the balance/i);
    expect(action.fields.find((f) => f.label === "Amount")?.value).toContain("42.5");
  });

  it("rejects an amount that was never specified", () => {
    const action = prepareAction(
      { kind: "transfer", symbol: "SOL" },
      snapshot({ spot: [holding()] }),
    );
    expect(action.readiness).toBe("rejected");
    expect(action.reason).toContain("No amount");
  });

  it("warns when a swap would breach a saved concentration limit", () => {
    const action = prepareAction(
      { kind: "swap", symbol: "SOL", toSymbol: "USDC", fraction: 1 },
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 10_000 },
        spot: [
          holding({ quantity: 42.5, valueUsd: 4_250, priceUsd: 100 }),
          holding({ id: "u", symbol: "USDC", quantity: 2_000, valueUsd: 2_000, priceUsd: 1 }),
        ],
      }),
      { concentrationLimit: 30 },
    );
    expect(action.warnings.join(" ")).toMatch(/above your saved 30% limit/i);
  });

  it("picks the riskiest position itself when none was named", () => {
    /* "Close my riskiest perp" names no market — the server ranks by
       liquidation proximity, which is computed, not a model opinion. */
    const action = prepareAction(
      { kind: "close_perp" },
      snapshot({
        perps: [
          perp({ id: "far", market: "BTC-PERP", markPrice: 100, liquidationPrice: 40 }),
          perp({ id: "near", market: "SOL-PERP", markPrice: 100, liquidationPrice: 96 }),
        ],
      }),
    );
    expect(action.summary).toContain("SOL-PERP");
  });

  it("rejects a cancel when no such order is open", () => {
    const action = prepareAction({ kind: "cancel_order", orderId: "whatever" }, snapshot());
    expect(action.readiness).toBe("rejected");
    expect(action.reason).toContain("no open orders");
  });
});

describe("revalidate", () => {
  it("detects that the balance moved between preview and confirm", () => {
    const before = snapshot({ spot: [holding({ quantity: 42.5 })] });
    const action = prepareAction({ kind: "swap", symbol: "SOL", fraction: 0.5 }, before);

    const after = snapshot({ spot: [holding({ quantity: 10 })] });
    const result = revalidate(action, { kind: "swap", symbol: "SOL", fraction: 0.5 }, after);

    expect(result.changed).toBe(true);
    expect(result.action.summary).toContain("5");
  });

  it("reports no change when nothing moved", () => {
    const base = snapshot({ spot: [holding()] });
    const action = prepareAction({ kind: "swap", symbol: "SOL", fraction: 0.5 }, base);
    expect(revalidate(action, { kind: "swap", symbol: "SOL", fraction: 0.5 }, base).changed)
      .toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   Memory validation
--------------------------------------------------------------------------- */

describe("validateMemory", () => {
  it("accepts a concentration limit and writes its own label", () => {
    const validated = validateMemory({ type: "concentration_limit", value: 25 });
    expect(validated.value).toBe(25);
    expect(validated.label).toBe("Max 25% in any one asset");
  });

  it("keys singleton preferences on their type, so re-saying updates", () => {
    expect(validateMemory({ type: "stablecoin_buffer", value: 20 }).key).toBe(
      "stablecoin_buffer",
    );
  });

  it("keys a watched symbol on the symbol, so several can coexist", () => {
    expect(validateMemory({ type: "watch_symbol", value: "sol" }).key).toBe("SOL");
  });

  it("refuses a value its type cannot hold", () => {
    /* A limit of "banana" would silently disable the limit the operator
       thought they had set. */
    expect(() => validateMemory({ type: "concentration_limit", value: "banana" })).toThrow(
      MemoryValidationError,
    );
    expect(() => validateMemory({ type: "concentration_limit", value: 500 })).toThrow();
    expect(() => validateMemory({ type: "watch_symbol", value: "not a symbol!" })).toThrow();
  });
});

/* ---------------------------------------------------------------------------
   Insights
--------------------------------------------------------------------------- */

describe("deriveInsights", () => {
  it("fires a concentration insight only against a saved limit", () => {
    const base = snapshot({
      summary: { ...snapshot().summary, totalValueUsd: 1_000 },
      spot: [holding({ quantity: 3.5, valueUsd: 350, priceUsd: 100 })],
    });

    const withLimit = deriveInsights(base, [memory({ value: 30 })]);
    expect(withLimit.find((insight) => insight.id === "concentration")).toBeDefined();

    /* Without a saved limit there is no rule to breach, so it must not claim
       one was breached. */
    const withoutLimit = deriveInsights(base, []);
    expect(withoutLimit.find((insight) => insight.id === "concentration")).toBeUndefined();
  });

  it("leads with liquidation proximity when a position is close", () => {
    const insights = deriveInsights(
      snapshot({ perps: [perp({ markPrice: 100, liquidationPrice: 90 })] }),
      [],
    );
    expect(insights[0].id).toBe("liquidation");
    expect(insights[0].tone).toBe("risk");
  });

  it("names the venues that could not be read", () => {
    const insights = deriveInsights(
      snapshot({ notes: [{ scope: "hyperliquid", reason: "timed out", kind: "failed" }] }),
      [],
    );
    const partial = insights.find((insight) => insight.id === "partial");
    expect(partial?.detail).toContain("hyperliquid");
  });

  it("says nothing about an account with nothing in it", () => {
    expect(deriveInsights(snapshot(), [])).toEqual([]);
  });
});

describe("suggestedPrompts and welcomeLines", () => {
  it("only suggests prompts this account's data can answer", () => {
    /* A prompt that would return "you have no positions" advertises a
       capability and then demonstrates emptiness. */
    const prompts = suggestedPrompts(snapshot(), []);
    expect(prompts).not.toContain("Review my open positions.");
  });

  it("suggests a position review once positions exist", () => {
    expect(suggestedPrompts(snapshot({ perps: [perp()] }), [])).toContain(
      "Review my open positions.",
    );
  });

  it("states only figures that exist", () => {
    const lines = welcomeLines(
      snapshot({ summary: { ...snapshot().summary, totalValueUsd: null } }),
    );
    expect(lines.join(" ")).not.toMatch(/\$/);
  });
});
