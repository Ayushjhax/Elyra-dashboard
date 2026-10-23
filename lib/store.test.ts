import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_ORDER, migratePersisted } from "@/lib/store";

describe("migratePersisted", () => {
  it("moves an operator on the old default order to the new one", () => {
    const next = migratePersisted({ widgetOrder: ["activity", "watchlist", "signals"] }, 2);
    expect(next.widgetOrder).toEqual(DEFAULT_WIDGET_ORDER);
    expect(next.marketType).toBe("all");
  });

  it("keeps an order the operator arranged themselves", () => {
    const next = migratePersisted({ widgetOrder: ["signals", "activity", "watchlist"] }, 2);
    expect(next.widgetOrder).toEqual(["signals", "activity", "watchlist"]);
  });

  it("adds pivot levels without touching the indicators already set", () => {
    const next = migratePersisted({ chartIndicators: { ema: false, volume: true } }, 3);
    expect(next.chartIndicators).toEqual({ ema: false, volume: true, levels: true });
  });

  it("carries the version-1 column switches over and drops the old stack", () => {
    const next = migratePersisted({ stack: ["activity"], stackOpen: false, assistOpen: true, rowGrow: {} }, 1);
    expect(next.widgetsOpen).toBe(false);
    expect(next.agentOpen).toBe(true);
    expect(next).not.toHaveProperty("stack");
    expect(next).not.toHaveProperty("rowGrow");
  });

  it("drops the sample rule and action switches", () => {
    const next = migratePersisted(
      { disabledRules: ["r1"], dismissedActions: ["pa_r1"], reviewedActions: { pa_r1: "x" }, widgetsOpen: false },
      4,
    );
    expect(next).not.toHaveProperty("disabledRules");
    expect(next).not.toHaveProperty("dismissedActions");
    expect(next).not.toHaveProperty("reviewedActions");
    expect(next.widgetsOpen).toBe(false);
  });

  it("leaves current state alone", () => {
    const state = { widgetOrder: ["activity", "signals", "watchlist"], chartIndicators: { ema: true, volume: false, levels: false } };
    expect(migratePersisted(state, 5)).toEqual(state);
  });
});
