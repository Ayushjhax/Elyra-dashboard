import { describe, expect, it } from "vitest";
import { tradingViewSymbol } from "@/lib/market/pyth/tradingview";
import type { PythAssetType } from "@/lib/market/pyth/types";

function derive(
  symbol: string,
  base: string,
  assetType: PythAssetType,
  pythSymbol: string,
  quote = "USD",
) {
  return tradingViewSymbol({ symbol, base, quote, assetType, pythSymbol });
}

describe("tradingViewSymbol", () => {
  it("maps crypto to TradingView's cross-exchange aggregate", () => {
    expect(derive("SOL", "SOL", "crypto", "Crypto.SOL/USD")).toBe("CRYPTO:SOLUSD");
    expect(derive("BTC", "BTC", "crypto", "Crypto.BTC/USD")).toBe("CRYPTO:BTCUSD");
  });

  it("prefers an override where the derived symbol would be wrong", () => {
    /* Hyperliquid is not on the aggregate. */
    expect(derive("HYPE", "HYPE", "crypto", "Crypto.HYPE/USD")).toBe("MEXC:HYPEUSDT");
    /* Metals are quoted on OANDA, and gold's override matches the class rule. */
    expect(derive("XAU", "XAU", "metal", "Metal.XAU/USD")).toBe("OANDA:XAUUSD");
  });

  it("maps FX to the pair", () => {
    expect(derive("EURUSD", "EUR", "fx", "FX.EUR/USD")).toBe("FX:EURUSD");
    expect(derive("USDJPY", "USD", "fx", "FX.USD/JPY", "JPY")).toBe("FX:USDJPY");
  });

  it("charts US equities by bare ticker", () => {
    expect(derive("TSLA", "TSLA", "equity", "Equity.US.TSLA/USD")).toBe("TSLA");
    expect(derive("NVDA", "NVDA", "equity", "Equity.US.NVDA/USD")).toBe("NVDA");
  });

  it("returns null for a non-US listing rather than someone else's price", () => {
    /* A bare ticker would resolve to the US line, which is a different
       instrument in a different currency. */
    expect(derive("C3M", "C3M", "equity", "Equity.FR.C3M/EUR", "EUR")).toBeNull();
    expect(derive("0002", "0002", "equity", "Equity.HK.0002/HKD", "HKD")).toBeNull();
  });

  it("returns null where no naming rule is dependable", () => {
    expect(derive("PYTHOIL", "PYTHOIL", "commodity", "Commodities.Index.PYTHOIL/USD")).toBeNull();
    expect(derive("SSI", "SSI", "crypto-index", "Crypto.Index.SSI")).toBeNull();
  });
});

describe("Pyth's synthetic index feeds", () => {
  it("has no chart, rather than a plausible-looking wrong one", () => {
    /* `OANDA:GOLDUSD` does not exist — OANDA quotes gold as XAUUSD. The
       canonical Metal.XAU/USD entry is what charts. */
    expect(derive("GOLD", "GOLD", "metal", "Metal.Index.GOLD/USD")).toBeNull();
    expect(derive("SILVER", "SILVER", "metal", "Metal.Index.SILVER/USD")).toBeNull();
    expect(derive("EURUSD", "EUR", "fx", "FX.Index.EUR/USD")).toBeNull();
  });

  it("leaves the canonical spot feed for the same underlying charting", () => {
    expect(derive("XAU", "XAU", "metal", "Metal.XAU/USD")).toBe("OANDA:XAUUSD");
    expect(derive("EURUSD", "EUR", "fx", "FX.EUR/USD")).toBe("FX:EURUSD");
  });
});
