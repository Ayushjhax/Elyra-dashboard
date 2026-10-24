import { describeRule } from "@/lib/prediction/alertTypes";
import { cents, closing, points, probability, usdShort } from "~/components/research/prediction/format";

/* How prediction figures and alert rules read in the app. */

describe("prediction figures", () => {
  it("shows a price as cents and as a probability — the same number", () => {
    expect(cents(0.63)).toBe("63¢");
    expect(cents(0.115)).toBe("11.5¢");
    expect(probability(0.634)).toBe("63.4%");
    expect(cents(null)).toBe("—");
  });

  it("writes moves in points and money short", () => {
    expect(points(2.5)).toBe("+2.5 pts");
    expect(points(-10)).toBe("-10.0 pts");
    expect(usdShort(1_250_000)).toBe("$1.3M");
    expect(usdShort(34_500)).toBe("$34.5k");
    expect(usdShort(7.5)).toBe("$7.50");
  });

  it("says when a market closes", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(closing("2026-10-23T15:00:00Z", now)).toBe("Closes in 3h");
    expect(closing("2026-11-14T00:00:00Z", now)).toBe("Closes 14 Nov");
    expect(closing(null, now)).toBe("No close date");
    expect(closing("2026-11-14T00:00:00Z", now, true)).toBe("Closed");
  });
});

describe("describeRule", () => {
  it("states each condition plainly", () => {
    expect(describeRule({ kind: "price_above", threshold: 0.65 })).toBe("Rises above 65%");
    expect(describeRule({ kind: "price_below", threshold: 0.4 })).toBe("Falls below 40%");
    expect(describeRule({ kind: "probability_change", threshold: 5 })).toBe("Moves 5 points");
    expect(describeRule({ kind: "market_resolution", threshold: null })).toBe("Resolves");
  });
});
