import { describe, expect, it } from "vitest";
import {
  parseSwapCommand,
  toBaseUnits,
  mintFor,
  knownSymbols,
  catalogue,
  refusalFor,
  assetFor,
} from "@/lib/trade";
import { parseAlertCommand, hasCrossed } from "@/lib/alerts/store";

/* ---------------------------------------------------------------------------
   The parsers that turn a chat message into something touching money.

   Every one of these has a failure mode that is silent rather than loud: an
   amount off by a factor of ten, a direction inverted, a symbol resolved to
   the wrong mint. None of them would throw. All of them would trade.
--------------------------------------------------------------------------- */

describe("parseSwapCommand", () => {
  it("reads the shapes people actually type", () => {
    for (const input of [
      "1.5 SOL to USDC",
      "1.5 SOL USDC",
      "1.5 sol for usdc",
      "1.5 SOL -> USDC",
      "1.5 SOL into USDC",
    ]) {
      expect(parseSwapCommand(input)).toEqual({
        amountText: "1.5",
        amount: 1.5,
        fromSymbol: "SOL",
        toSymbol: "USDC",
      });
    }
  });

  it("handles a thousands separator", () => {
    expect(parseSwapCommand("1,500 USDC to SOL")?.amountText).toBe("1500");
  });

  it("refuses anything it does not confidently understand", () => {
    /* The correct failure for something that moves money: no preview. */
    for (const input of ["", "SOL to USDC", "swap everything", "1.5 SOL", "-5 SOL to USDC"]) {
      expect(parseSwapCommand(input)).toBeNull();
    }
  });

  it("refuses a zero amount", () => {
    expect(parseSwapCommand("0 SOL to USDC")).toBeNull();
  });
});

describe("toBaseUnits", () => {
  it("converts exactly, with no floating point anywhere", () => {
    expect(toBaseUnits("1.1", 9)).toBe("1100000000");
    expect(toBaseUnits("0.1", 9)).toBe("100000000");
    expect(toBaseUnits("1.5", 9)).toBe("1500000000");
    expect(toBaseUnits("1", 6)).toBe("1000000");
  });

  it("keeps the last unit of a figure a double would lose", () => {
    /* Number("1234.567891") is 1234.56789099999991… Truncating that drops the
       user's final unit; rounding it up quotes more than they typed. Neither
       happens because the digits never become a double. */
    expect(toBaseUnits("1234.567891", 6)).toBe("1234567891");
    expect(toBaseUnits("0.000000000000001", 18)).toBe("1000");
  });

  it("truncates beyond the token's precision rather than rounding up", () => {
    /* Rounding up would quote a swap for more than the user has. */
    expect(toBaseUnits("0.0000000019", 9)).toBe("1");
    expect(toBaseUnits("1.9999999999", 9)).toBe("1999999999");
  });

  it("does not produce exponential notation for small amounts", () => {
    const result = toBaseUnits("0.000001", 9);
    expect(result).toBe("1000");
    expect(result).not.toMatch(/e/i);
  });

  it("returns null for anything unusable", () => {
    expect(toBaseUnits("0", 9)).toBeNull();
    expect(toBaseUnits("-1", 9)).toBeNull();
    expect(toBaseUnits("abc", 9)).toBeNull();
    expect(toBaseUnits("", 9)).toBeNull();
    expect(toBaseUnits(".", 9)).toBeNull();
    /* Below one base unit is not a trade. */
    expect(toBaseUnits("0.0000000001", 9)).toBeNull();
  });
});

describe("mint resolution", () => {
  it("resolves only symbols on the verified allowlist", () => {
    expect(mintFor("SOL")).toBe("So11111111111111111111111111111111111111112");
    expect(mintFor("usdc")).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  });

  it("refuses an unknown symbol rather than guessing", () => {
    /* A fuzzy search that resolves "USDC" to a lookalike mint is how someone
       swaps a balance into a worthless token with a familiar name. */
    expect(mintFor("USDCC")).toBeNull();
    expect(mintFor("SOLANA")).toBeNull();
    expect(mintFor("")).toBeNull();
  });

  it("lists what it can quote, so the refusal can name alternatives", () => {
    expect(knownSymbols()).toContain("SOL");
    expect(knownSymbols().length).toBeGreaterThan(3);
  });

  it("carries gold, stocks and indices, each with the right class", () => {
    expect(assetFor("GLDX")?.class).toBe("metal");
    expect(assetFor("XAUT")?.class).toBe("metal");
    expect(assetFor("NVDAX")?.class).toBe("equity");
    expect(assetFor("SPYX")?.class).toBe("index");
    expect(assetFor("USDC")?.class).toBe("stablecoin");
  });

  it("names every tokenised security's issuer, and holds its mint to that issuer's pattern", () => {
    /* Backed Finance mints all begin "Xs"; Ondo's all end "ondo". Not a
       substitute for verifying each one by hand, but it catches a paste of
       the wrong address — and every lookalike of an Ondo portfolio token
       found while adding these ended in "pump" or nothing at all. */
    for (const symbol of knownSymbols()) {
      const asset = assetFor(symbol)!;
      if (asset.class === "equity" || asset.class === "index" || asset.class === "bond") {
        expect(asset.issuer, symbol).toBeDefined();
      }
      if (asset.issuer === "backed") expect(asset.mint.startsWith("Xs"), symbol).toBe(true);
      if (asset.issuer === "ondo") {
        expect(asset.mint.endsWith("ondo"), symbol).toBe(true);
        expect(symbol.endsWith("ON"), symbol).toBe(true);
      }
    }
  });

  it("never lists the same mint under two symbols", () => {
    /* A duplicated mint means one of the two entries is a paste error, and
       the symbol it is under would trade into the wrong asset. */
    const mints = knownSymbols().map((symbol) => assetFor(symbol)!.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it("groups the catalogue without losing anything", () => {
    const grouped = catalogue().flatMap((group) => group.symbols);
    expect(new Set(grouped)).toEqual(new Set(knownSymbols()));
  });

  it("refuses silver with the real reason, not a not-found", () => {
    /* "I cannot find SLVX" reads as a gap in the product. The truth is the
       market for it is about a dollar deep, which is a different fact and
       the one the user needs. */
    expect(mintFor("SLVX")).toBeNull();
    expect(refusalFor("SLVX")).toMatch(/liquidity/i);
    expect(refusalFor("SILVER")).toMatch(/liquidity/i);
  });

  it("has no refusal for a symbol it can actually trade", () => {
    for (const symbol of knownSymbols()) {
      expect(refusalFor(symbol)).toBeNull();
    }
  });
});

describe("parseAlertCommand", () => {
  it("reads an explicit direction", () => {
    expect(parseAlertCommand("SOL > 120", 96)).toEqual({
      symbol: "SOL",
      direction: "above",
      target: 120,
    });
    expect(parseAlertCommand("SOL below 80", 96)).toEqual({
      symbol: "SOL",
      direction: "below",
      target: 80,
    });
    expect(parseAlertCommand("sol under $80", 96)?.direction).toBe("below");
  });

  it("infers a direction from the current price when none is given", () => {
    /* "alert me at 120" is only meaningful relative to where it is now —
       the other reading fires instantly. */
    expect(parseAlertCommand("SOL 120", 96)?.direction).toBe("above");
    expect(parseAlertCommand("SOL 80", 96)?.direction).toBe("below");
  });

  it("refuses to infer without a current price", () => {
    /* Guessing produces an alert that fires instantly or never, and the user
       would not find out which until it mattered. */
    expect(parseAlertCommand("SOL 120", null)).toBeNull();
    /* An explicit direction still works with no price. */
    expect(parseAlertCommand("SOL > 120", null)?.direction).toBe("above");
  });

  it("never inverts an explicit direction to match the market", () => {
    /* An alert created while the market moves must still mean what was typed. */
    expect(parseAlertCommand("SOL > 50", 96)?.direction).toBe("above");
    expect(parseAlertCommand("SOL < 200", 96)?.direction).toBe("below");
  });

  it("refuses nonsense", () => {
    for (const input of ["", "SOL", "> 120", "SOL > 0", "SOL > -5"]) {
      expect(parseAlertCommand(input, 96)).toBeNull();
    }
  });
});

describe("hasCrossed", () => {
  const alert = (direction: "above" | "below", target: number) => ({
    id: "a",
    symbol: "SOL",
    direction,
    target,
    createdPrice: null,
    triggeredAt: null,
  });

  it("fires at the level, not only past it", () => {
    /* Exactly 120 is "above 120" for an alert's purposes — a user who asked
       to be told at 120 is not served by silence at 120.00. */
    expect(hasCrossed(alert("above", 120), 120)).toBe(true);
    expect(hasCrossed(alert("below", 80), 80)).toBe(true);
  });

  it("does not fire on the wrong side", () => {
    expect(hasCrossed(alert("above", 120), 119.99)).toBe(false);
    expect(hasCrossed(alert("below", 80), 80.01)).toBe(false);
  });
});
