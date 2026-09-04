import { describe, expect, it } from "vitest";
import {
  COLUMN_BOUNDS,
  MAIN_MIN,
  ROW_MIN,
  SHELL_GAP,
  SHELL_PAD,
  clampColumn,
  fitColumns,
  shellLayout,
  splitRows,
} from "@/lib/layout";

/** What the chart is left with, given the tracks the fitter produced. */
function mainWidth(viewport: number, sides: number[]): number {
  const gaps = SHELL_GAP * sides.length;
  return viewport - SHELL_PAD * 2 - gaps - sides.reduce((a, b) => a + b, 0);
}

describe("clampColumn", () => {
  it("holds a width inside the column's own bounds", () => {
    expect(clampColumn("rail", 10)).toBe(COLUMN_BOUNDS.rail.min);
    expect(clampColumn("rail", 9999)).toBe(COLUMN_BOUNDS.rail.max);
    expect(clampColumn("stack", 300.4)).toBe(300);
  });
});

describe("fitColumns", () => {
  it("leaves stored widths alone when there is room", () => {
    const fitted = fitColumns(["rail", "stack"], { rail: 216, stack: 288 }, 1600);
    expect(fitted.get("rail")).toBe(216);
    expect(fitted.get("stack")).toBe(288);
  });

  it("falls back to each column's initial width", () => {
    const fitted = fitColumns(["rail", "assist"], {}, 2000);
    expect(fitted.get("rail")).toBe(COLUMN_BOUNDS.rail.initial);
    expect(fitted.get("assist")).toBe(COLUMN_BOUNDS.assist.initial);
  });

  it("squeezes the rail before the assistant", () => {
    /* Only 40px short: the rail alone should cover it. */
    const available =
      COLUMN_BOUNDS.rail.initial +
      COLUMN_BOUNDS.assist.initial +
      MAIN_MIN +
      SHELL_GAP * 2 -
      40;
    const fitted = fitColumns(["rail", "assist"], {}, available);
    expect(fitted.get("rail")).toBe(COLUMN_BOUNDS.rail.initial - 40);
    expect(fitted.get("assist")).toBe(COLUMN_BOUNDS.assist.initial);
  });

  it("never takes a column below its minimum", () => {
    const fitted = fitColumns(["rail", "palette", "stack"], {}, 400);
    expect(fitted.get("rail")).toBe(COLUMN_BOUNDS.rail.min);
    expect(fitted.get("palette")).toBe(COLUMN_BOUNDS.palette.min);
    expect(fitted.get("stack")).toBe(COLUMN_BOUNDS.stack.min);
  });

  it("does nothing before the shell has been measured", () => {
    const fitted = fitColumns(["rail", "palette", "stack", "assist"], {}, null);
    expect(fitted.get("rail")).toBe(COLUMN_BOUNDS.rail.initial);
    expect(fitted.get("assist")).toBe(COLUMN_BOUNDS.assist.initial);
  });
});

describe("shellLayout", () => {
  it("keeps the chart at or above its floor, or has spent every column doing it", () => {
    /* The floor is not a promise the arithmetic can always keep — five columns
       and a chart do not fit in 900px at any width. What it can promise is that
       the chart is the last thing to give: either it is above the floor, or
       every column beside it is already at its minimum. */
    for (const viewport of [900, 1024, 1180, 1280, 1440, 1600, 1920]) {
      for (const paletteOpen of [false, true]) {
        for (const stackOpen of [false, true]) {
          for (const assistOpen of [false, true]) {
            for (const routeOpen of [false, true]) {
              const layout = shellLayout({
                viewport,
                widths: {},
                paletteOpen,
                stackOpen,
                assistOpen,
                routeOpen,
              });
              const track = viewport >= 1280 ? layout.full : layout.mid;
              const sides = [...track.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
              const where = `${viewport}px palette=${paletteOpen} stack=${stackOpen} assist=${assistOpen} route=${routeOpen}`;

              const chart = mainWidth(viewport, sides);
              if (chart >= MAIN_MIN) continue;

              const floor =
                COLUMN_BOUNDS.rail.min +
                (paletteOpen ? COLUMN_BOUNDS.palette.min : 0) +
                (stackOpen ? COLUMN_BOUNDS.stack.min : 0) +
                (routeOpen ? COLUMN_BOUNDS.route.min : 0) +
                (assistOpen && viewport >= 1280 ? COLUMN_BOUNDS.assist.min : 0);
              expect(
                sides.reduce((a, b) => a + b, 0),
                `${where} — below the floor, so every column must be at its minimum`,
              ).toBe(floor);
              /* And the chart is still on screen, which is the whole point. */
              expect(chart, where).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("opens a route beside the chart rather than over it", () => {
    const home = shellLayout({
      viewport: 1440,
      widths: {},
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
    });
    const onRoute = shellLayout({
      viewport: 1440,
      widths: {},
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
      routeOpen: true,
    });
    const sidesOf = (track: string) =>
      [...track.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));

    /* One more track than at Home, and the chart is still above its floor. */
    expect(sidesOf(onRoute.full)).toHaveLength(sidesOf(home.full).length + 1);
    expect(mainWidth(1440, sidesOf(onRoute.full))).toBeGreaterThanOrEqual(MAIN_MIN);
    /* Its track sits between the panels and the chart. */
    expect(onRoute.full).toMatch(/^\d+px \d+px \d+px minmax\(0, 1fr\) \d+px$/);
  });

  it("squeezes the route column last, being the one just asked for", () => {
    /* 1600 is wide enough that the squeeze runs out before it reaches the
       route column; at 1280 there is nothing left over and everything lands on
       its minimum, which proves nothing about the order. */
    const layout = shellLayout({
      viewport: 1600,
      widths: {},
      paletteOpen: true,
      stackOpen: true,
      assistOpen: true,
      routeOpen: true,
    });
    const sides = [...layout.full.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
    /* rail, palette, stack, [chart], assist — route is the 4th track. */
    const route = sides[3];
    expect(route).toBeGreaterThan(COLUMN_BOUNDS.route.min);
    expect(sides[0]).toBe(COLUMN_BOUNDS.rail.min);
  });

  it("opens the palette out of the other columns, not the chart", () => {
    const closed = shellLayout({
      viewport: 1440,
      widths: {},
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
    });
    const opened = shellLayout({
      viewport: 1440,
      widths: {},
      paletteOpen: true,
      stackOpen: true,
      assistOpen: true,
    });
    const sidesOf = (track: string) =>
      [...track.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));

    expect(mainWidth(1440, sidesOf(closed.full))).toBeGreaterThanOrEqual(MAIN_MIN);
    expect(mainWidth(1440, sidesOf(opened.full))).toBeGreaterThanOrEqual(MAIN_MIN);
    /* The palette arrived and the rail paid for most of it. */
    expect(sidesOf(opened.full)[0]).toBeLessThan(sidesOf(closed.full)[0]);
  });

  it("puts the assistant's track after the chart's", () => {
    const layout = shellLayout({
      viewport: 1440,
      widths: {},
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
    });
    expect(layout.full).toMatch(/^\d+px \d+px minmax\(0, 1fr\) \d+px$/);
  });

  it("drops a closed column's track entirely", () => {
    const layout = shellLayout({
      viewport: 1440,
      widths: {},
      paletteOpen: false,
      stackOpen: false,
      assistOpen: false,
    });
    expect(layout.full).toBe(`${COLUMN_BOUNDS.rail.initial}px minmax(0, 1fr)`);
    expect(layout.mid).toBe(layout.full);
  });

  it("collapses the rail to icons only once it is too narrow for labels", () => {
    const wide = shellLayout({
      viewport: 1600,
      widths: {},
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
    });
    expect(wide.railIcons).toBe(false);

    const tight = shellLayout({
      viewport: 900,
      widths: {},
      paletteOpen: true,
      stackOpen: true,
      assistOpen: true,
    });
    expect(tight.railIcons).toBe(true);
  });

  it("pins the rail to its minimum when collapsed, and makes it an icon rail", () => {
    const layout = shellLayout({
      viewport: 1440,
      widths: { rail: 280 },
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
      railCollapsed: true,
    });
    expect(layout.railWidth).toBe(COLUMN_BOUNDS.rail.min);
    expect(layout.railIcons).toBe(true);
    expect(layout.full.startsWith(`${COLUMN_BOUNDS.rail.min}px `)).toBe(true);
  });

  it("gives back the dragged width when the rail is expanded again", () => {
    const args = {
      viewport: 1440,
      widths: { rail: 280 },
      paletteOpen: false,
      stackOpen: true,
      assistOpen: true,
    };
    /* The same stored width, collapsed and not: collapsing must not spend it. */
    expect(shellLayout({ ...args, railCollapsed: true }).railWidth).toBe(
      COLUMN_BOUNDS.rail.min,
    );
    expect(shellLayout({ ...args, railCollapsed: false }).railWidth).toBe(280);
    expect(shellLayout(args).railWidth).toBe(280);
  });

  it("still keeps the chart above its floor with the rail collapsed", () => {
    for (const viewport of [900, 1280, 1440]) {
      const layout = shellLayout({
        viewport,
        widths: {},
        paletteOpen: true,
        stackOpen: true,
        assistOpen: true,
        railCollapsed: true,
      });
      const track = viewport >= 1280 ? layout.full : layout.mid;
      const sides = [...track.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
      expect(mainWidth(viewport, sides), `${viewport}px`).toBeGreaterThanOrEqual(
        MAIN_MIN,
      );
    }
  });

  it("reports no icon rail before the first measurement", () => {
    const layout = shellLayout({
      viewport: null,
      widths: {},
      paletteOpen: true,
      stackOpen: true,
      assistOpen: true,
    });
    expect(layout.railIcons).toBe(false);
    expect(layout.railWidth).toBe(COLUMN_BOUNDS.rail.initial);
  });
});

describe("splitRows", () => {
  it("moves weight in proportion to the pixels dragged", () => {
    const [a, b] = splitRows([200, 200], [1, 1], 100);
    expect(a).toBeCloseTo(1.5);
    expect(b).toBeCloseTo(0.5);
  });

  it("stops at the row minimum on both sides", () => {
    const [a] = splitRows([200, 200], [1, 1], -1000);
    expect(a).toBeCloseTo((ROW_MIN / 400) * 2);

    const [, b] = splitRows([200, 200], [1, 1], 1000);
    expect(b).toBeCloseTo((ROW_MIN / 400) * 2);
  });

  it("leaves the weights alone when there is nothing measured to divide", () => {
    expect(splitRows([0, 0], [1, 1], 40)).toEqual([1, 1]);
  });
});
