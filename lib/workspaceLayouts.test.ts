import { describe, expect, it } from "vitest";
import { COLUMN_BOUNDS } from "@/lib/layout";
import { BUILT_IN_LAYOUTS, MAX_LAYOUT_NAME, MAX_SAVED_LAYOUTS, newLayout, readSavedLayouts, sanitizeState, type LayoutState } from "@/lib/workspaceLayouts";

const state: LayoutState = {
  widgetOrder: ["signals", "watchlist", "activity"],
  collapsedWidgets: ["activity"],
  widgetsOpen: true,
  agentOpen: false,
  tradingOpen: true,
  automationOpen: false,
  columnWidths: { widgets: 280 },
  railExpanded: true,
};

describe("sanitizeState", () => {
  it("holds every width to lib/layout.ts's bounds", () => {
    const held = sanitizeState({ ...state, columnWidths: { widgets: 9999, agent: 10, route: 400.4 } });
    expect(held.columnWidths.widgets).toBe(COLUMN_BOUNDS.widgets.max);
    expect(held.columnWidths.agent).toBe(COLUMN_BOUNDS.agent.min);
    expect(held.columnWidths.route).toBe(400);
  });

  it("drops unknown columns, widgets and values", () => {
    const held = sanitizeState({
      widgetOrder: ["watchlist", "chart", "watchlist"],
      collapsedWidgets: ["chart", "signals", "signals"],
      columnWidths: { chart: 900, widgets: "wide" },
      agentOpen: "yes",
    });
    expect(held.widgetOrder).toEqual(["watchlist", "signals", "activity"]);
    expect(held.collapsedWidgets).toEqual(["signals"]);
    expect(held.columnWidths).toEqual({});
    expect(held.agentOpen).toBe(true);
  });

  it("keeps a valid arrangement as it is", () => {
    expect(sanitizeState(state)).toEqual(state);
  });
});

describe("built-in layouts", () => {
  it("are already inside the bounds", () => {
    for (const layout of BUILT_IN_LAYOUTS) {
      const state = sanitizeState(layout);
      expect({ ...layout, ...state }).toEqual(layout);
    }
  });

  it("never size the chart: it takes what is left", () => {
    for (const layout of BUILT_IN_LAYOUTS) expect(Object.keys(layout.columnWidths).every((id) => id in COLUMN_BOUNDS)).toBe(true);
  });
});

describe("newLayout", () => {
  it("saves a named layout of the arrangement now", () => {
    const made = newLayout("  Night   desk ", state, [], 1000);
    expect(made).toEqual({ layout: { id: "saved:rs", name: "Night desk", builtIn: false, ...state } });
  });

  it("replaces a layout of the same name rather than adding one", () => {
    const first = newLayout("Desk", state, [], 1);
    if (!("layout" in first)) throw new Error("expected a layout");
    const again = newLayout("desk", { ...state, agentOpen: true }, [first.layout], 2);
    expect("layout" in again && again.layout.id).toBe(first.layout.id);
  });

  it("refuses an empty name and a seventh layout", () => {
    expect(newLayout("   ", state, [], 1)).toEqual({ error: "Name the layout." });
    const full = Array.from({ length: MAX_SAVED_LAYOUTS }, (_, index) => {
      const made = newLayout(`L${index}`, state, [], index);
      if (!("layout" in made)) throw new Error("expected a layout");
      return made.layout;
    });
    expect(newLayout("One more", state, full, 99)).toHaveProperty("error");
  });

  it("cuts a long name", () => {
    const made = newLayout("x".repeat(100), state, [], 1);
    expect("layout" in made && made.layout.name.length).toBe(MAX_LAYOUT_NAME);
  });
});

describe("readSavedLayouts", () => {
  it("drops malformed entries and holds the rest to the shell", () => {
    const read = readSavedLayouts([{ id: "saved:a", name: "A", ...state, columnWidths: { agent: 5000 } }, { name: "no id" }, null, "x"]);
    expect(read).toHaveLength(1);
    expect(read[0].columnWidths.agent).toBe(COLUMN_BOUNDS.agent.max);
    expect(read[0].builtIn).toBe(false);
  });

  it("is empty for anything but a list", () => {
    expect(readSavedLayouts(undefined)).toEqual([]);
    expect(readSavedLayouts({})).toEqual([]);
  });
});
