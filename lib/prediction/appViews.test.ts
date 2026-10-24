import { describe, expect, it } from "vitest";
import { predictionViewTool } from "@/lib/prediction/appViews";

const call = (view: string, query = "") => predictionViewTool(view, new URLSearchParams(query));

describe("predictionViewTool", () => {
  it("maps each view to its agent tool", () => {
    expect(call("trending")).toEqual({ name: "prediction_get_trending", args: { limit: 30 } });
    expect(call("summary")).toEqual({ name: "prediction_get_portfolio_summary", args: {} });
    expect(call("expiring")).toEqual({ name: "prediction_get_expiring_positions", args: { withinHours: 168 } });
    expect(call("orders")).toEqual({ name: "prediction_get_open_orders", args: {} });
  });

  it("refuses a view it does not know, rather than passing it to the registry", () => {
    expect(call("prediction_create_alert")).toEqual({ error: "Unknown view." });
    expect(call("")).toEqual({ error: "Unknown view." });
  });

  it("checks the category, market and size it passes on", () => {
    expect(call("events", "category=crypto")).toEqual({ name: "prediction_search_events", args: { limit: 20, category: "crypto" } });
    expect(call("events", "category=DROP%20TABLE")).toEqual({ error: "That is not a category." });
    expect(call("execution", "market=12345&notionalUsd=500&side=sell&outcome=Yes")).toEqual({
      name: "prediction_estimate_execution",
      args: { market: "12345", side: "sell", notionalUsd: 500, outcome: "Yes" },
    });
    expect(call("execution", "market=12345&notionalUsd=0")).toMatchObject({ error: expect.stringContaining("$1") });
    expect(call("execution", "market=../../etc&notionalUsd=500")).toEqual({ error: "Name a market." });
    expect(call("exit", "market=12345&shares=-3")).toEqual({ error: "State how many shares are held." });
  });

  it("reads history only for a numeric outcome token, on a known window", () => {
    expect(call("history", "tokenId=123&interval=1w")).toEqual({ name: "prediction_get_market_history", args: { outcomeTokenId: "123", interval: "1w" } });
    expect(call("history", "tokenId=123&interval=forever")).toMatchObject({ args: { interval: "1d" } });
    expect(call("history", "tokenId=abc")).toEqual({ error: "Name an outcome." });
  });
});
