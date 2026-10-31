import { describe, expect, it } from "vitest";
import { alertState, appDeliveryFor, distancePct, isPast, parseTarget, suggestedTarget } from "@/lib/alerts/rules";
import type { PriceAlert } from "@/lib/alerts/types";

const above: PriceAlert = { id: "a", symbol: "SOL", direction: "above", target: 200, createdPrice: 180, triggeredAt: null };

describe("alert rules", () => {
  it("reads crossed from the live price, and fired from the server's stamp", () => {
    expect(isPast(above, 199.99)).toBe(false);
    expect(isPast(above, 200)).toBe(true);
    expect(isPast(above, null)).toBe(false);
    expect(alertState(above, 150)).toBe("Armed");
    expect(alertState(above, 210)).toBe("Crossed");
    expect(alertState({ ...above, triggeredAt: "2026-10-22T00:00:00Z" }, 150)).toBe("Fired");
  });

  it("suggests a level two per cent away at the instrument's precision", () => {
    expect(suggestedTarget(100, "above")).toBe("102.0000");
    expect(suggestedTarget(100, "below")).toBe("98.0000");
    expect(suggestedTarget(null, "above")).toBe("");
    expect(Number(suggestedTarget(0.00001234, "above"))).toBeGreaterThan(0);
  });

  it("follows the delivery engine's channels for the app", () => {
    expect(appDeliveryFor({ priceAlertsOn: true, hasApp: true, canPush: true })).toBe("push");
    expect(appDeliveryFor({ priceAlertsOn: true, hasApp: true, canPush: false })).toBe("inbox");
    expect(appDeliveryFor({ priceAlertsOn: false, hasApp: true, canPush: true })).toBe("off");
    expect(appDeliveryFor({ priceAlertsOn: true, hasApp: false, canPush: false })).toBe("none");
  });

  it("measures a level's distance from the price, and has none without a price", () => {
    expect(distancePct(110, 100)).toBeCloseTo(10);
    expect(distancePct(95, 100)).toBeCloseTo(-5);
    expect(distancePct(110, null)).toBeNull();
    expect(distancePct(110, 0)).toBeNull();
  });

  it("parses a typed level: finite, above zero, at the precision it is shown at", () => {
    expect(parseTarget("")).toEqual({ ok: false, error: null });
    expect(parseTarget("104.5560")).toEqual({ ok: true, value: 104.556 });
    expect(parseTarget("0,06654")).toEqual({ ok: true, value: 0.06654 });
    expect(parseTarget(".5")).toEqual({ ok: true, value: 0.5 });
    expect(parseTarget("0").ok).toBe(false);
    expect(parseTarget("1e3").ok).toBe(false);
    expect(parseTarget("1.2.3").ok).toBe(false);
    expect(parseTarget("Infinity").ok).toBe(false);
    /* 104 takes four places; a fifth would be saved but never shown. */
    expect(parseTarget("104.55601")).toEqual({ ok: false, error: "A price this size goes to 4 decimal places." });
    expect(parseTarget("0.00000421")).toEqual({ ok: true, value: 0.00000421 });
  });
});
