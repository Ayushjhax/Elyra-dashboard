import { describe, expect, it } from "vitest";
import { baseTicker, hyperliquidIcon } from "@/lib/market/tickerLogos";

describe("baseTicker", () => {
  it("drops Hyperliquid's k prefix for 1000x lots and venue suffixes", () => {
    expect(baseTicker("kPEPE")).toBe("PEPE");
    expect(baseTicker("SOL-PERP")).toBe("SOL");
    expect(baseTicker("HYPE")).toBe("HYPE");
    expect(baseTicker("eth")).toBe("ETH");
  });

  it("leaves a ticker that only starts with K alone", () => {
    expect(baseTicker("KAITO")).toBe("KAITO");
  });

  it("builds Hyperliquid's icon URL from the base coin", () => {
    expect(hyperliquidIcon("kBONK")).toBe("https://app.hyperliquid.xyz/coins/BONK.svg");
  });
});
