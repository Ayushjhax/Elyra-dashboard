import type { CatalogueStrategy } from "@/lib/backtest/types";
import { checkBuilder, numberOr } from "~/lib/backtestForm";

const rsi: CatalogueStrategy = {
  id: "RSI",
  name: "RSI (12) — mean reversion",
  category: "mean_reversion" as CatalogueStrategy["category"],
  rules: { entry: "e", exit: "x" },
  parameters: [
    { key: "period", label: "RSI period", type: "number", default: 12, min: 2, max: 100, description: "" },
    { key: "oversold", label: "Oversold", type: "number", default: 30, min: 1, max: 50, description: "" },
  ],
  requiresVolume: false,
  intradayOnly: false,
  version: 1,
};

const base = { strategy: rsi, params: {}, fee: "10", slippage: "10", timeframe: "1h" };

describe("the strategy builder's checks", () => {
  it("reads numbers strictly", () => {
    expect(numberOr("12")).toBe(12);
    expect(numberOr("0,5")).toBe(0.5);
    expect(numberOr("")).toBeNaN();
    expect(numberOr("1e3")).toBeNaN();
  });

  it("passes the defaults and the costs through unchanged", () => {
    expect(checkBuilder(base)).toEqual({ ok: true, params: { period: 12, oversold: 30 }, feeBps: 10, slippageBps: 10 });
  });

  it("names the field that is out of range rather than clamping it", () => {
    expect(checkBuilder({ ...base, params: { period: "1" } })).toEqual({ ok: false, error: "RSI period must be at least 2." });
    expect(checkBuilder({ ...base, params: { oversold: "abc" } })).toEqual({ ok: false, error: "Oversold needs a number." });
    expect(checkBuilder({ ...base, fee: "1001" }).ok).toBe(false);
    expect(checkBuilder({ ...base, slippage: "-1" }).ok).toBe(false);
  });

  it("refuses a daily timeframe for an intraday-only strategy", () => {
    expect(checkBuilder({ ...base, strategy: { ...rsi, intradayOnly: true }, timeframe: "1d" }).ok).toBe(false);
  });
});
