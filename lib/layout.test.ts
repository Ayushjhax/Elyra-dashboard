import { describe, expect, it } from "vitest";
import {
  COLUMN_BOUNDS,
  MAIN_MIN,
  MAIN_SHARE,
  RAIL_COLLAPSED,
  RAIL_EXPANDED,
  WORKSPACE_GAP,
  WORKSPACE_PAD,
  centreShare,
  clampColumn,
  fitColumns,
  shellLayout,
  type ShellLayoutInput,
} from "@/lib/layout";

const BASE: ShellLayoutInput = {
  /* Wide enough that nothing has to be fitted. A test about fitting sets its
     own width. */
  viewport: 2400,
  widths: {},
  railExpanded: false,
  widgetsOpen: true,
  agentOpen: true,
  routeOpen: false,
  focus: false,
};

/** Every px width in a track string, in order. */
function px(track: string): number[] {
  return [...track.matchAll(/(\d+)px/g)].map((match) => Number(match[1]));
}

/** What the centre is left with, given the frame and workspace tracks. */
function centreWidth(viewport: number, frame: string, workspace: string): number {
  const [rail] = px(frame);
  const sides = px(workspace);
  return (
    viewport -
    rail -
    WORKSPACE_PAD * 2 -
    WORKSPACE_GAP * sides.length -
    sides.reduce((a, b) => a + b, 0)
  );
}

describe("clampColumn", () => {
  it("holds a width inside the column's own bounds", () => {
    expect(clampColumn("widgets", 10)).toBe(COLUMN_BOUNDS.widgets.min);
    expect(clampColumn("agent", 9999)).toBe(COLUMN_BOUNDS.agent.max);
    expect(clampColumn("route", 400.4)).toBe(400);
  });
});

describe("fitColumns", () => {
  it("leaves stored widths alone when there is room", () => {
    const fitted = fitColumns(["widgets", "agent"], { widgets: 280, agent: 380 }, 2000);
    expect(fitted.get("widgets")).toBe(280);
    expect(fitted.get("agent")).toBe(380);
  });

  it("falls back to each column's initial width", () => {
    const fitted = fitColumns(["widgets", "agent"], {}, 2400);
    expect(fitted.get("widgets")).toBe(COLUMN_BOUNDS.widgets.initial);
    expect(fitted.get("agent")).toBe(COLUMN_BOUNDS.agent.initial);
  });

  it("squeezes the widgets before the agent", () => {
    /* Only 20px short of the floor: the widgets alone should cover it. The
       widths are the operator's, so only the floor applies to them. */
    const widths = { widgets: COLUMN_BOUNDS.widgets.initial, agent: COLUMN_BOUNDS.agent.initial };
    const available =
      COLUMN_BOUNDS.widgets.initial +
      COLUMN_BOUNDS.agent.initial +
      MAIN_MIN +
      WORKSPACE_GAP * 2 -
      20;
    const fitted = fitColumns(["widgets", "agent"], widths, available);
    expect(fitted.get("widgets")).toBe(COLUMN_BOUNDS.widgets.initial - 20);
    expect(fitted.get("agent")).toBe(COLUMN_BOUNDS.agent.initial);
  });

  it("squeezes the agent before a route the operator just opened", () => {
    const widths = { agent: COLUMN_BOUNDS.agent.initial };
    const available =
      COLUMN_BOUNDS.route.initial +
      COLUMN_BOUNDS.agent.initial +
      MAIN_MIN +
      WORKSPACE_GAP * 2 -
      30;
    const fitted = fitColumns(["route", "agent"], widths, available);
    expect(fitted.get("agent")).toBe(COLUMN_BOUNDS.agent.initial - 30);
    expect(fitted.get("route")).toBe(COLUMN_BOUNDS.route.initial);
  });

  it("never takes a column below its minimum", () => {
    const fitted = fitColumns(["widgets", "agent"], {}, 400);
    expect(fitted.get("widgets")).toBe(COLUMN_BOUNDS.widgets.min);
    expect(fitted.get("agent")).toBe(COLUMN_BOUNDS.agent.min);
  });

  it("does nothing before the shell has been measured", () => {
    const fitted = fitColumns(["widgets", "agent"], {}, null);
    expect(fitted.get("widgets")).toBe(COLUMN_BOUNDS.widgets.initial);
    expect(fitted.get("agent")).toBe(COLUMN_BOUNDS.agent.initial);
  });
});

describe("shellLayout", () => {
  it("keeps the centre at or above its floor, or has spent every column doing it", () => {
    /* The floor is not a promise the arithmetic can always keep — a rail, two
       side columns and a 480px centre do not fit in 900px. What it can promise
       is that the centre is the last thing to give: either it is above the
       floor, or the rail is at its icons and every column beside the centre
       is at its minimum. */
    for (let viewport = 900; viewport <= 2560; viewport += 20) {
      for (const railExpanded of [false, true]) {
        for (const widgetsOpen of [false, true]) {
          for (const agentOpen of [false, true]) {
            for (const routeOpen of [false, true]) {
              const layout = shellLayout({
                ...BASE,
                viewport,
                railExpanded,
                widgetsOpen,
                agentOpen,
                routeOpen,
              });
              const wide = viewport >= 1280;
              const frame = wide ? layout.frame.full : layout.frame.mid;
              const workspace = wide ? layout.workspace.full : layout.workspace.mid;
              const where = `${viewport}px rail=${railExpanded} widgets=${widgetsOpen} agent=${agentOpen} route=${routeOpen}`;

              const centre = centreWidth(viewport, frame, workspace);
              if (centre >= MAIN_MIN) continue;

              expect(px(frame)[0], `${where} — rail should be icons`).toBe(RAIL_COLLAPSED);
              const floor =
                (routeOpen
                  ? COLUMN_BOUNDS.route.min
                  : widgetsOpen
                    ? COLUMN_BOUNDS.widgets.min
                    : 0) + (agentOpen && wide ? COLUMN_BOUNDS.agent.min : 0);
              expect(
                px(workspace).reduce((a, b) => a + b, 0),
                `${where} — below the floor, so every column must be at its minimum`,
              ).toBe(floor);
              /* And the centre is still on screen, which is the whole point. */
              expect(centre, where).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("puts a route in the widgets' place rather than adding a column", () => {
    const layout = shellLayout({ ...BASE, routeOpen: true });
    expect(layout.left).toBe("route");
    expect(px(layout.workspace.full)).toEqual([
      COLUMN_BOUNDS.route.initial,
      COLUMN_BOUNDS.agent.initial,
    ]);
  });

  it("puts the agent's track after the centre's, and only from 1280px", () => {
    const layout = shellLayout(BASE);
    expect(layout.workspace.full).toBe(
      `${COLUMN_BOUNDS.widgets.initial}px minmax(0, 1fr) ${COLUMN_BOUNDS.agent.initial}px`,
    );
    expect(layout.workspace.mid).toBe(`${COLUMN_BOUNDS.widgets.initial}px minmax(0, 1fr)`);
  });

  it("drops a closed column's track entirely", () => {
    const layout = shellLayout({ ...BASE, widgetsOpen: false, agentOpen: false });
    expect(layout.workspace.full).toBe("minmax(0, 1fr)");
    expect(layout.left).toBeNull();
  });

  it("gives the chart everything in focus mode, without touching the preferences", () => {
    const input = { ...BASE, focus: true, routeOpen: true };
    const layout = shellLayout(input);
    expect(layout.workspace.full).toBe("minmax(0, 1fr)");
    expect(layout.workspace.mid).toBe("minmax(0, 1fr)");
    /* The flags are the caller's and come back unchanged on exit. */
    expect(input.widgetsOpen).toBe(true);
    expect(input.agentOpen).toBe(true);
  });

  it("keeps the rail's labels when there is room for them", () => {
    const layout = shellLayout({ ...BASE, viewport: 1920, railExpanded: true });
    expect(px(layout.frame.full)[0]).toBe(RAIL_EXPANDED);
    expect(layout.railIcons).toBe(false);
  });

  it("drops the rail's labels before narrowing any column", () => {
    /* 1280 with everything open: the expanded rail cannot fit beside two
       side columns and the centre's floor. */
    const layout = shellLayout({ ...BASE, viewport: 1280, railExpanded: true });
    expect(px(layout.frame.full)[0]).toBe(RAIL_COLLAPSED);
    expect(layout.railIcons).toBe(true);
  });

  it("is always the icon rail below 900px", () => {
    const layout = shellLayout({ ...BASE, viewport: 800, railExpanded: true });
    expect(layout.frame.compact).toBe(`${RAIL_COLLAPSED}px minmax(0, 1fr)`);
    expect(layout.railIcons).toBe(true);
  });

  it("follows the stored preference before the first measurement", () => {
    expect(shellLayout({ ...BASE, viewport: null, railExpanded: true }).railIcons).toBe(false);
    expect(shellLayout({ ...BASE, viewport: null, railExpanded: false }).railIcons).toBe(true);
  });
});

describe("the centre's share", () => {
  /** The row a viewport leaves the workspace grid, with the rail at `rail`. */
  const row = (viewport: number, rail: number) => viewport - rail - WORKSPACE_PAD * 2;

  it("narrows the side columns on a laptop so the chart keeps its share", () => {
    /* A 13-inch MacBook Air's browser window. */
    const layout = shellLayout({ ...BASE, viewport: 1470 });
    expect(px(layout.workspace.full)).toEqual([
      COLUMN_BOUNDS.widgets.min,
      COLUMN_BOUNDS.agent.min,
    ]);
    expect(centreWidth(1470, layout.frame.full, layout.workspace.full)).toBe(784);
  });

  it("leaves a 1920px screen exactly as the columns open", () => {
    for (const railExpanded of [false, true]) {
      const layout = shellLayout({ ...BASE, viewport: 1920, railExpanded });
      expect(px(layout.frame.full)[0]).toBe(railExpanded ? RAIL_EXPANDED : RAIL_COLLAPSED);
      expect(px(layout.workspace.full)).toEqual([
        COLUMN_BOUNDS.widgets.initial,
        COLUMN_BOUNDS.agent.initial,
      ]);
    }
  });

  it("gives width back as the screen narrows, the widgets before the agent", () => {
    /* A row 10px short of the share: the widgets alone should cover it. */
    const sides =
      COLUMN_BOUNDS.widgets.initial + COLUMN_BOUNDS.agent.initial + WORKSPACE_GAP * 2;
    const available = Math.round((sides - 10) / (1 - MAIN_SHARE));
    const short = centreShare(available) - (available - sides);
    expect(short).toBeGreaterThan(0);
    expect(short).toBeLessThan(COLUMN_BOUNDS.widgets.initial - COLUMN_BOUNDS.widgets.min);

    const fitted = fitColumns(["widgets", "agent"], {}, available);
    expect(fitted.get("widgets")).toBe(COLUMN_BOUNDS.widgets.initial - short);
    expect(fitted.get("agent")).toBe(COLUMN_BOUNDS.agent.initial);
  });

  it("keeps a width the operator chose, which gives only to the floor", () => {
    /* "Widen" on the agent, on a laptop: the agent stays wide, the widgets
       still give what they can, and the centre is above its floor. */
    const layout = shellLayout({
      ...BASE,
      viewport: 1470,
      widths: { agent: COLUMN_BOUNDS.agent.max },
    });
    expect(px(layout.workspace.full)).toEqual([
      COLUMN_BOUNDS.widgets.min,
      COLUMN_BOUNDS.agent.max,
    ]);
    expect(centreWidth(1470, layout.frame.full, layout.workspace.full)).toBeGreaterThanOrEqual(
      MAIN_MIN,
    );
  });

  it("does not narrow a route for the share", () => {
    const layout = shellLayout({ ...BASE, viewport: 1470, routeOpen: true });
    expect(px(layout.workspace.full)).toEqual([
      COLUMN_BOUNDS.route.initial,
      COLUMN_BOUNDS.agent.min,
    ]);
  });

  it("keeps the rail's labels the operator asked for while the floor allows", () => {
    /* The labels are a choice, so the share does not take them; the columns
       the screen is sizing still give what they can. */
    const layout = shellLayout({ ...BASE, viewport: 1470, railExpanded: true });
    expect(px(layout.frame.full)[0]).toBe(RAIL_EXPANDED);
    expect(layout.railIcons).toBe(false);
    expect(px(layout.workspace.full)).toEqual([
      COLUMN_BOUNDS.widgets.min,
      COLUMN_BOUNDS.agent.min,
    ]);
  });

  it("keeps the centre its share, or has spent every column the screen is sizing on it", () => {
    for (let viewport = 900; viewport <= 2560; viewport += 20) {
      for (const railExpanded of [false, true]) {
        for (const widgetsOpen of [false, true]) {
          for (const agentOpen of [false, true]) {
            for (const routeOpen of [false, true]) {
              const layout = shellLayout({
                ...BASE,
                viewport,
                railExpanded,
                widgetsOpen,
                agentOpen,
                routeOpen,
              });
              const wide = viewport >= 1280;
              const frame = wide ? layout.frame.full : layout.frame.mid;
              const workspace = wide ? layout.workspace.full : layout.workspace.mid;
              const where = `${viewport}px rail=${railExpanded} widgets=${widgetsOpen} agent=${agentOpen} route=${routeOpen}`;

              const [rail] = px(frame);
              const centre = centreWidth(viewport, frame, workspace);
              if (centre >= centreShare(row(viewport, rail))) continue;

              /* The columns come back left first, then the agent. A route and
                 the rail's labels are not the screen's to size, so only the
                 floor binds them. */
              const [first, second] = px(workspace);
              const agent = agentOpen && wide ? (layout.left === null ? first : second) : null;
              if (layout.left === "widgets") {
                expect(first, `${where} — widgets at their minimum`).toBe(COLUMN_BOUNDS.widgets.min);
              }
              if (agent !== null) {
                expect(agent, `${where} — agent at its minimum`).toBe(COLUMN_BOUNDS.agent.min);
              }
            }
          }
        }
      }
    }
  });
});
