import { describe, expect, it } from "vitest";
import { cleanLabel, OPEN_FOR_HOURS, requestFormProblem } from "@/lib/rails/requestForm";

/* The drawer's "Get paid" form is enabled exactly when createRequest would accept it. */

const valid = { amount: "25", label: "Design review", hasWallet: true };

describe("the Get paid form", () => {
  it("accepts what the server accepts", () => {
    expect(requestFormProblem(valid)).toBeNull();
    expect(requestFormProblem({ ...valid, amount: "12.50" })).toBeNull();
    expect(requestFormProblem({ ...valid, amount: "50,000" })).toBeNull();
    /* Past six decimals the server truncates, as here. */
    expect(requestFormProblem({ ...valid, amount: "0.0000019" })).toBeNull();
  });

  it("needs a Solana wallet to be paid into before anything else", () => {
    expect(requestFormProblem({ amount: "", label: "", hasWallet: false })).toBe("wallet");
  });

  it("refuses an amount that is not USDC above zero, or above the cap", () => {
    for (const amount of ["", "0", "0.0000001", "-5", "abc", "1e3", "."]) {
      expect(requestFormProblem({ ...valid, amount })).toBe("amount");
    }
    expect(requestFormProblem({ ...valid, amount: "50000.000001" })).toBe("too_much");
  });

  it("needs a label the payer will see", () => {
    expect(requestFormProblem({ ...valid, label: "   " })).toBe("label");
    expect(requestFormProblem({ ...valid, label: "\u0000\u0007" })).toBe("label");
    expect(cleanLabel("  two\nlines  ")).toBe("two lines");
    expect(cleanLabel("x".repeat(100))).toHaveLength(80);
  });

  it("offers only expiries the server allows (5 minutes to 7 days)", () => {
    for (const hours of OPEN_FOR_HOURS) {
      expect(hours * 60).toBeGreaterThanOrEqual(5);
      expect(hours * 60).toBeLessThanOrEqual(7 * 24 * 60);
    }
  });
});
