import { describe, expect, it } from "vitest";
import { alertState, appDeliveryFor, isPast, suggestedTarget } from "@/lib/alerts/rules";
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
});
