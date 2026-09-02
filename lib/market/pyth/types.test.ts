import { describe, expect, it } from "vitest";
import { decodePrice } from "@/lib/market/pyth/types";
import { priceDecimals } from "@/lib/market/precision";

describe("decodePrice", () => {
  it("applies a negative exponent exactly", () => {
    /* Real responses observed from /v1/latest_price. */
    expect(decodePrice("9760248731", -8)).toBe(97.60248731);
    expect(decodePrice("7638708598132", -8)).toBe(76387.08598132);
    expect(decodePrice("4307657", -3)).toBe(4307.657);
    expect(decodePrice("236035498866", -8)).toBe(2360.35498866);
  });

  it("does not accumulate binary rounding error", () => {
    /* The naive `Number(m) * 10 ** e` drifts here; the string shift does not. */
    expect(decodePrice("1", -2)).toBe(0.01);
    expect(decodePrice("3", -1)).toBe(0.3);
    expect(decodePrice("29", -2)).toBe(0.29);
    expect(String(decodePrice("810000000", -8))).toBe("8.1");
  });

  it("pads a mantissa shorter than the exponent", () => {
    expect(decodePrice("5", -8)).toBe(0.00000005);
    expect(decodePrice("123", -5)).toBe(0.00123);
  });

  it("handles a positive exponent and zero", () => {
    expect(decodePrice("5", 2)).toBe(500);
    expect(decodePrice("42", 0)).toBe(42);
    expect(decodePrice("0", -8)).toBe(0);
  });

  it("keeps the sign", () => {
    expect(decodePrice("-1234", -2)).toBe(-12.34);
    expect(decodePrice(-1234, -2)).toBe(-12.34);
  });

  it("accepts a number mantissa, as the confidence field sometimes is", () => {
    expect(decodePrice(3689114, -8)).toBe(0.03689114);
  });
});

describe("priceDecimals", () => {
  it("scales with magnitude so a move stays visible", () => {
    expect(priceDecimals(76387.08)).toBe(2);
    expect(priceDecimals(97.6)).toBe(4);
    expect(priceDecimals(0.211)).toBe(5);
    expect(priceDecimals(0.0008)).toBe(6);
    expect(priceDecimals(0.00000812)).toBe(8);
  });

  it("falls back to 2 for a missing or unusable price", () => {
    expect(priceDecimals(null)).toBe(2);
    expect(priceDecimals(undefined)).toBe(2);
    expect(priceDecimals(Number.NaN)).toBe(2);
    expect(priceDecimals(0)).toBe(2);
  });

  it("is sign-independent", () => {
    expect(priceDecimals(-0.5)).toBe(priceDecimals(0.5));
  });
});
