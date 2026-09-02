import { describe, expect, it } from "vitest";
import { logoFor, type LogoInput } from "@/lib/market/pyth/logos";

function input(over: Partial<LogoInput>): LogoInput {
  return { symbol: "X", base: "X", assetType: "crypto", cmcId: null, region: null, ...over };
}

describe("logoFor", () => {
  it("uses the CoinMarketCap id wherever the feed carries one", () => {
    expect(logoFor(input({ symbol: "SOL", cmcId: 5426 })))
      .toBe("https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png");
  });

  it("treats a zero cmc id as absent, as the catalogue uses it", () => {
    expect(logoFor(input({ symbol: "PUMP", cmcId: 0 }))).toBeNull();
  });

  it("resolves US equities by ticker", () => {
    expect(logoFor(input({ symbol: "TSLA", assetType: "equity", region: "US" })))
      .toBe("https://assets.parqet.com/logos/symbol/TSLA");
  });

  it("gives a foreign listing the chip rather than another company's logo", () => {
    expect(logoFor(input({ symbol: "C3M", assetType: "equity", region: "FR" }))).toBeNull();
  });

  it("resolves metals by element", () => {
    expect(logoFor(input({ symbol: "XAU", base: "XAU", assetType: "metal" })))
      .toBe("https://s3-symbol-logo.tradingview.com/metal/gold--big.svg");
    expect(logoFor(input({ symbol: "XAG", base: "XAG", assetType: "metal" })))
      .toBe("https://s3-symbol-logo.tradingview.com/metal/silver--big.svg");
  });

  it("flies the base currency's flag for FX", () => {
    expect(logoFor(input({ symbol: "EURUSD", base: "EUR", assetType: "fx" })))
      .toBe("https://s3-symbol-logo.tradingview.com/country/EU--big.svg");
    expect(logoFor(input({ symbol: "USDJPY", base: "USD", assetType: "fx" })))
      .toBe("https://s3-symbol-logo.tradingview.com/country/US--big.svg");
  });

  it("returns null where nothing dependable exists", () => {
    expect(logoFor(input({ symbol: "PYTHOIL", assetType: "commodity" }))).toBeNull();
    expect(logoFor(input({ symbol: "SSI", assetType: "crypto-index" }))).toBeNull();
  });
});
