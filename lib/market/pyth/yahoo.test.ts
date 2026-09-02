import { describe, expect, it } from "vitest";
import { yahooSymbol } from "@/lib/market/pyth/yahoo";
import type { PythAsset } from "@/lib/market/pyth/types";

function asset(over: Partial<PythAsset>): PythAsset {
  return {
    id: 1, symbol: "X", name: "X", pythSymbol: "Crypto.X/USD",
    assetType: "crypto", quoteCurrency: "USD", exponent: -8,
    logo: null, tradingViewSymbol: null, ...over,
  };
}

describe("yahooSymbol", () => {
  it("leaves crypto to the exchanges, which have a true 24h window", () => {
    expect(yahooSymbol(asset({ symbol: "SOL", assetType: "crypto" }))).toBeNull();
    expect(yahooSymbol(asset({ symbol: "BTC", assetType: "crypto" }))).toBeNull();
  });

  it("maps US equities to their bare ticker", () => {
    expect(yahooSymbol(asset({
      symbol: "TSLA", assetType: "equity", pythSymbol: "Equity.US.TSLA/USD",
    }))).toBe("TSLA");
  });

  it("refuses a foreign listing, where the ticker is another company", () => {
    expect(yahooSymbol(asset({
      symbol: "C3M", assetType: "equity", pythSymbol: "Equity.FR.C3M/EUR",
    }))).toBeNull();
  });

  it("maps metals to their COMEX contract", () => {
    expect(yahooSymbol(asset({ symbol: "XAU", assetType: "metal" }))).toBe("GC=F");
    expect(yahooSymbol(asset({ symbol: "XAG", assetType: "metal" }))).toBe("SI=F");
    /* The synthetic index feed names the metal outright. */
    expect(yahooSymbol(asset({ symbol: "GOLD", assetType: "metal" }))).toBe("GC=F");
  });

  it("maps FX pairs to Yahoo's =X suffix", () => {
    expect(yahooSymbol(asset({ symbol: "EURUSD", assetType: "fx" }))).toBe("EURUSD=X");
    /* A ticker that is not a six-letter pair has no dependable mapping. */
    expect(yahooSymbol(asset({ symbol: "EUR", assetType: "fx" }))).toBeNull();
  });

  it("maps the charted commodities to continuous contracts", () => {
    expect(yahooSymbol(asset({ symbol: "PYTHOIL", assetType: "commodity" }))).toBe("CL=F");
    expect(yahooSymbol(asset({ symbol: "BRENT", assetType: "commodity" }))).toBe("BZ=F");
    /* A dated contract is not one of them. */
    expect(yahooSymbol(asset({ symbol: "WTIZ6", assetType: "commodity" }))).toBeNull();
  });
});
