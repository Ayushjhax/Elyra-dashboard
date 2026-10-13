import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceUsd } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";

describe("priceDecimals", () => {
  it("keeps majors and mid-caps at their usual places", () => {
    expect(priceDecimals(83_198.44)).toBe(2);
    expect(priceDecimals(107.7439)).toBe(4);
    expect(priceDecimals(0.32977)).toBe(5);
    expect(priceDecimals(0.00498)).toBe(6);
  });

  it("follows the first significant digit below a hundredth of a cent", () => {
    expect(priceDecimals(0.00000421)).toBe(8);
    expect(priceDecimals(0.000000421)).toBe(9);
    expect(priceDecimals(1e-11)).toBe(14);
  });
});

describe("small-token prices", () => {
  it("render as plain decimals, never exponent notation or zero", () => {
    expect(formatPrice(0.00000421, priceDecimals(0.00000421))).toBe("0.00000421");
    expect(formatPriceUsd(0.00000421)).toBe("$0.00000421");
    expect(formatPriceUsd(0.000000421)).toBe("$0.000000421");
    expect(formatPriceUsd(4.21e-9)).not.toMatch(/e-|^\$0\.0+$/);
  });

  it("formats ordinary prices and missing values", () => {
    expect(formatPriceUsd(107.7439)).toBe("$107.7439");
    expect(formatPriceUsd(83_198.44)).toBe("$83,198.44");
    expect(formatPriceUsd(null)).toBe("—");
    expect(formatPriceUsd(Number.NaN)).toBe("—");
  });
});
