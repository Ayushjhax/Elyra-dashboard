import { describe, expect, it } from "vitest";
import { activationRateText, activationStep, poolProgress } from "@/lib/referrals/display";

describe("activationStep", () => {
  it("turns each server rule into the step's own words", () => {
    expect(activationStep("They connect a wallet and hold at least $10 in it.")).toBe("Connect a wallet and hold at least $10.");
    expect(activationStep("They create an Elyra account.")).toBe("Create an Elyra account.");
    expect(activationStep("They connect a Solana wallet to Elyra.")).toBe("Connect a Solana wallet to Elyra.");
    /* A configured minimum flows through rather than a hardcoded $10. */
    expect(activationStep("They connect a wallet and hold at least $25 in it.")).toBe("Connect a wallet and hold at least $25.");
  });
});

describe("activationRateText", () => {
  it("is a dash with nothing to divide by, and a percentage otherwise", () => {
    expect(activationRateText(null)).toBe("—");
    expect(activationRateText(0)).toBe("0%");
    expect(activationRateText(62.5)).toBe("62.5%");
    expect(activationRateText(100)).toBe("100%");
  });
});

describe("poolProgress", () => {
  const pool = (progress: number, lifetime: number) => ({ target: 5, progress, nextBonusPoints: 500, completedPools: Math.floor(lifetime / 5), lifetimeActivations: lifetime });

  it("counts what the current pool still needs, and restarts after each bonus", () => {
    expect(poolProgress(pool(0, 0))).toEqual({ filled: 0, remaining: 5 });
    expect(poolProgress(pool(3, 3))).toEqual({ filled: 3, remaining: 2 });
    /* Exactly five: the bonus for that pool is paid, and a fresh one starts. */
    expect(poolProgress(pool(0, 5))).toEqual({ filled: 0, remaining: 5 });
    /* Thirteen: two pools paid, three slots into the third. */
    expect(poolProgress(pool(3, 13))).toEqual({ filled: 3, remaining: 2 });
  });
});
