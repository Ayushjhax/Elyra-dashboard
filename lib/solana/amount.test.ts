import { describe, expect, it } from "vitest";
import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";

describe("fromBaseUnits", () => {
  it("prints base units as a plain decimal, exactly", () => {
    expect(fromBaseUnits(BigInt(1_500_000), 6)).toBe("1.5");
    expect(fromBaseUnits("1", 9)).toBe("0.000000001");
    expect(fromBaseUnits(BigInt(0), 6)).toBe("0");
    expect(fromBaseUnits(BigInt(42), 0)).toBe("42");
    expect(fromBaseUnits(BigInt(-2_500_000), 6)).toBe("-2.5");
  });

  it("round-trips with toBaseUnits", () => {
    for (const [text, decimals] of [["1234.567891", 6], ["0.000000001", 9], ["7", 8]] as const) {
      expect(fromBaseUnits(toBaseUnits(text, decimals)!, decimals)).toBe(text);
    }
  });
});
