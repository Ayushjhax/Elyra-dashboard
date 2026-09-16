import { describe, expect, it } from "vitest";

import { isSignalCallback, renderSignalCard } from "@/lib/telegram/prediction-signals";
import { isPredictionCallback } from "@/lib/telegram/prediction";
import type { PredictionTechnicalSignal } from "@/lib/prediction/signal-types";

/* ---------------------------------------------------------------------------
   Telegram signal rendering.

   The card is the surface most likely to be screenshotted and least likely to
   be read carefully, so what it must NOT say matters more than what it does:
   no invented win rate, no stop presented as a guaranteed fill, no number
   this file computed itself.
--------------------------------------------------------------------------- */

function signal(over: Partial<PredictionTechnicalSignal> = {}): PredictionTechnicalSignal {
  return {
    id: "sig-1",
    marketId: "2252244",
    conditionId: "0xcondition",
    tokenId: "111",
    outcomeId: "111",
    marketQuestion: "Will it happen?",
    outcomeLabel: "Yes",
    strategyId: "PM_ORDERBOOK_IMBALANCE_V1",
    strategyVersion: "1.0.0",
    direction: "long_yes",
    entry: { type: "zone", minPrice: 0.61, maxPrice: 0.63 },
    target: { price: 0.7, basis: "A fixed 6-point move from entry." },
    stop: { price: 0.57, basis: "A fixed 4-point move against the entry.", executable: true },
    riskReward: 1.75,
    historicalWinRate: null,
    winRateUnavailableReason: null,
    strength: "medium",
    liquidityQuality: "good",
    evidence: [
      {
        key: "imbalance_top5",
        label: "Top-5 notional imbalance",
        value: "0.310",
        direction: "supports",
        source: "orderbook_analytics",
        timestamp: new Date().toISOString(),
      },
    ],
    timeToResolutionMs: 86_400_000,
    resolutionProximity: "near",
    eventRisk: false,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    dataFreshnessMs: 1_200,
    transport: "realtime",
    warnings: [],
    snapshot: {
      bestBid: 0.61,
      bestAsk: 0.63,
      midpoint: 0.62,
      microprice: 0.624,
      spreadPoints: 2,
      imbalanceTop5: 0.31,
      basketProbability: 0.641,
      basketDeviationPoints: 1.1,
      depthTop5Usd: 35_000,
    },
    ...over,
  };
}

describe("callback routing", () => {
  it("owns a prefix disjoint from the prediction menu's", () => {
    /* The menu's prefix carries its colon — "pm:" — so "pms:" does not match
       it in either direction. Asserted because the two are one character
       apart and a future rename could quietly make them overlap, which would
       route every signal button to the positions menu. */
    expect(isSignalCallback("pms:sig:2252244")).toBe(true);
    expect(isSignalCallback("pm:positions")).toBe(false);
    expect(isPredictionCallback("pms:sig:2252244")).toBe(false);
    expect(isPredictionCallback("pm:positions")).toBe(true);
  });

  it("keeps every callback inside Telegram's 64-byte limit", () => {
    /* A CLOB token id alone is 77 digits, so it can never travel here. The
       market's Gamma id is short, which is why the card carries that. */
    for (const prefix of ["pms:sig:", "pms:book:", "pms:basket:", "pms:alert:"]) {
      const payload = `${prefix}2252244`;
      expect(Buffer.byteLength(payload, "utf8")).toBeLessThanOrEqual(64);
    }
  });
});

describe("renderSignalCard", () => {
  it("renders direction, entry, target, invalidation and risk/reward", () => {
    const { html } = renderSignalCard(signal(), "https://polymarket.com/market/x");
    expect(html).toContain("LONG YES");
    expect(html).toContain("61¢–63¢");
    expect(html).toContain("70¢");
    expect(html).toContain("57¢");
    expect(html).toContain("1.75");
  });

  it("prints a missing win rate as a stated absence", () => {
    /* The single number a reader is most likely to act on. An empty row here
       invites the reader to supply their own figure. */
    const { html } = renderSignalCard(signal(), null);
    expect(html).toContain("Historical Win Rate");
    expect(html).toContain("no comparable historical sample");
    expect(html).not.toMatch(/\d+\.\d%\s*·\s*\d+ comparable/);
  });

  it("prints the engine's own reason, including collection progress", () => {
    /* "No win rate" and "no win rate yet, 120 observations across 40
       outcomes" lead a reader to opposite conclusions about whether the
       feature works. The card must not flatten the second into the first. */
    const { html } = renderSignalCard(
      signal({
        winRateUnavailableReason:
          "No win rate yet. 120 observations recorded across 40 outcome(s), but none has yet " +
          "reached the 60 needed to simulate a strategy.",
      }),
      null,
    );
    expect(html).toContain("No win rate yet");
    expect(html).toContain("120 observations");
    expect(html).toContain("40 outcome");
  });

  it("refuses to headline an unstable percentage", () => {
    const { html } = renderSignalCard(
      signal({
        historicalWinRate: {
          valuePct: 71.4,
          sampleSize: 14,
          wins: 10,
          losses: 4,
          noEntry: 2,
          strategyId: "PM_MOMENTUM_BREAKOUT_V1",
          strategyVersion: "1.0.0",
          lookback: "60-minute bars",
          marketUniverse: "Liquid open binary markets",
          successDefinition: "Target before invalidation",
          dataSource: "polymarket_prices_history",
          insufficientSample: true,
          averageRiskReward: 1.5,
          warnings: [],
        },
      }),
      null,
    );

    expect(html).toContain("Insufficient sample");
    expect(html).toContain("14 comparable signals");
    /* The percentage itself must not appear. */
    expect(html).not.toContain("71.4%");
  });

  it("shows a real win rate with its universe", () => {
    const { html } = renderSignalCard(
      signal({
        historicalWinRate: {
          valuePct: 58.4,
          sampleSize: 137,
          wins: 80,
          losses: 57,
          noEntry: 12,
          strategyId: "PM_MOMENTUM_BREAKOUT_V1",
          strategyVersion: "1.0.0",
          lookback: "60-minute bars",
          marketUniverse: "Liquid open binary markets, entry probability 20–80%",
          successDefinition: "Target before invalidation",
          dataSource: "polymarket_prices_history",
          insufficientSample: false,
          averageRiskReward: 1.5,
          warnings: [],
        },
      }),
      null,
    );

    expect(html).toContain("58.4%");
    expect(html).toContain("137 comparable signals");
    expect(html).toContain("entry probability");
  });

  it("calls the level an invalidation when a fill cannot be promised", () => {
    const thin = renderSignalCard(
      signal({
        liquidityQuality: "fair",
        stop: { price: 0.57, basis: "A fixed move.", executable: false },
      }),
      null,
    );
    expect(thin.html).toContain("Invalidation");
    expect(thin.html).not.toContain("<b>Stop</b>");

    const deep = renderSignalCard(signal(), null);
    expect(deep.html).toContain("<b>Stop</b>");
  });

  it("omits entry, target and stop for a WATCH", () => {
    /* A watch has no setup. Printing levels beside it would read as one. */
    const { html } = renderSignalCard(
      signal({
        direction: "watch",
        entry: { type: "confirmation", trigger: "Imbalance has held 1 of the 3 updates required." },
      }),
      null,
    );
    expect(html).toContain("WATCH");
    expect(html).toContain("1 of the 3 updates");
    expect(html).not.toContain("<b>Target</b>");
    expect(html).not.toContain("<b>Risk / Reward</b>");
  });

  it("says whether the book was live or a snapshot", () => {
    expect(renderSignalCard(signal(), null).html).toContain("live feed");
    expect(renderSignalCard(signal({ transport: "rest_snapshot" }), null).html).toContain(
      "REST snapshot",
    );
  });

  it("never rounds a sub-cent value onto a quote", () => {
    /* A midpoint of 11.5¢ on a book quoting 11/12 printed as "12¢" — which
       reads as the mid sitting exactly on the ask, and looks like a broken
       feed rather than a rounding choice. */
    const { html } = renderSignalCard(
      signal({
        entry: { type: "zone", minPrice: 0.115, maxPrice: 0.125 },
        target: { price: 0.2, basis: "fixed" },
        stop: { price: 0.075, basis: "fixed", executable: true },
      }),
      null,
    );
    expect(html).toContain("11.5¢");
    expect(html).toContain("12.5¢");
    /* Whole cents keep no misleading trailing decimal. */
    expect(html).toContain("20¢");
    expect(html).not.toContain("20.0¢");
  });

  it("states that a signal is not advice and places no order", () => {
    const { html } = renderSignalCard(signal(), null);
    expect(html).toContain("does not place an order");
  });

  it("escapes a market question containing markup", () => {
    /* Questions are venue-supplied text and go into an HTML parse mode. */
    const { html } = renderSignalCard(
      signal({ marketQuestion: "Will <b>X</b> & Y happen?" }),
      null,
    );
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
  });

  it("offers navigation without an external link when none is known", () => {
    const { buttons } = renderSignalCard(signal(), null);
    const flat = buttons.flat();
    expect(flat.some((button) => button.text === "Live book")).toBe(true);
    expect(flat.some((button) => button.text === "Set alert")).toBe(true);
    expect(flat.every((button) => button.url === undefined)).toBe(true);
  });

  it("renders a named outcome rather than a yes/no direction", () => {
    const { html } = renderSignalCard(
      signal({
        direction: "long_outcome",
        outcomeLabel: "Carolina M. Alves",
        marketQuestion: "Sao Paulo Open: Suzan Lamens vs Carolina M. Alves",
      }),
      null,
    );
    expect(html).toContain("LONG OUTCOME");
    expect(html).toContain("Carolina M. Alves");
    expect(html).not.toContain("LONG NO");
  });
});
