import { describe, expect, it } from "vitest";
import { assessRestrictions } from "@/lib/exchange/binance";

/* ---------------------------------------------------------------------------
   A Binance key is stored only when Binance says it can read and nothing
   else. The form asking for read-only is not the check; this is.
--------------------------------------------------------------------------- */

const READ_ONLY = {
  ipRestrict: true,
  enableReading: true,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  permitsUniversalTransfer: false,
  enableMargin: false,
  enableFutures: false,
  enableVanillaOptions: false,
  enableSpotAndMarginTrading: false,
  enablePortfolioMarginTrading: false,
  enableFixApiTrade: false,
};

describe("assessRestrictions", () => {
  it("accepts a read-only key and reports its IP allowlist", () => {
    expect(assessRestrictions(READ_ONLY)).toEqual({ ok: true, ipRestricted: true });
    expect(assessRestrictions({ ...READ_ONLY, ipRestrict: false })).toEqual({ ok: true, ipRestricted: false });
  });

  it("refuses a key that cannot read", () => {
    const check = assessRestrictions({ ...READ_ONLY, enableReading: false });
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toBe("cannot_read");
  });

  it("refuses a key that can trade, and names what it can do", () => {
    const check = assessRestrictions({ ...READ_ONLY, enableSpotAndMarginTrading: true, enableFutures: true });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("can_write");
    expect(check.message).toContain("spot and margin trading");
    expect(check.message).toContain("futures");
  });

  it("refuses a key that can withdraw or transfer", () => {
    expect(assessRestrictions({ ...READ_ONLY, enableWithdrawals: true }).ok).toBe(false);
    expect(assessRestrictions({ ...READ_ONLY, permitsUniversalTransfer: true }).ok).toBe(false);
  });

  it("treats a missing field as not granted, not as an error", () => {
    expect(assessRestrictions({ enableReading: true })).toEqual({ ok: true, ipRestricted: false });
  });
});
