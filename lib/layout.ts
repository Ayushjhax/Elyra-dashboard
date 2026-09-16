/* ---------------------------------------------------------------------------
   How wide each shell column may be, and what gives when they do not all fit.

   Pure arithmetic with no DOM in it, so the rule that protects the chart can be
   tested directly. The shell measures the viewport, hands the width in, and
   applies the three track strings that come back — one per breakpoint, because
   the media query, not this file, decides which columns are on screen.

   The single invariant: the middle column is never squeezed out. Opening the
   components palette, the panel column or the assistant takes its width from
   the other side columns, in a fixed order, and only what is left over comes
   out of the chart. MAIN_MIN is the floor it stops at.
--------------------------------------------------------------------------- */

/** The columns that flank the chart. Everything else is the chart. */
export type ShellColumnId = "rail" | "palette" | "stack" | "route" | "assist";

export interface ColumnBounds {
  /** Narrowest the operator — or the fitter — may take it. */
  min: number;
  max: number;
  /** What it opens at, and what a double-click on its handle restores. */
  initial: number;
  /** Names the resize handle for assistive tech: "Resize the … column". */
  label: string;
}

export const COLUMN_BOUNDS: Record<ShellColumnId, ColumnBounds> = {
  /* 56 is the icon rail: the width the nav collapses to below 900px, and the
     same width it reaches when it is dragged all the way in. */
  rail: { min: 56, max: 300, initial: 216, label: "navigation" },
  palette: { min: 180, max: 380, initial: 232, label: "components" },
  stack: { min: 220, max: 520, initial: 288, label: "panels" },
  /* Whatever route you are on other than Home. It opens beside the chart
     rather than over it — see `routeOpen` — so it is sized like a side column
     and not like a page. */
  route: { min: 220, max: 640, initial: 360, label: "section" },
  assist: { min: 280, max: 560, initial: 352, label: "assistant" },
};

/** --gap-shell, in px. The fitter has to account for the gaps it creates. */
export const SHELL_GAP = 12;

/** The shell's own padding, one side. `p-3` on the grid. */
export const SHELL_PAD = 12;

/**
 * The narrowest the chart column may become.
 *
 * A candlestick chart under about this width stops being readable — the axis
 * labels collide and TradingView starts dropping candles. Below it the answer
 * is to close a column, not to keep shaving the chart, so this is the number
 * every other column yields to.
 */
export const MAIN_MIN = 360;

/** The rail draws icons only below this — its labels no longer fit. */
export const RAIL_LABEL_MIN = 132;

/**
 * The routes that take the whole main column instead of opening beside the
 * chart — an allowlist, currently of one.
 *
 * Every other route is a column next to the market, and MAIN_MIN above is the
 * rule that protects it. These are deliberate exceptions to that rule, not a
 * loosening of it. Assets is a treasury console — a full page of accounts,
 * balances and movement — and Personalized is a conversation beside a context
 * rail; both were unreadable three hundred pixels wide next to a candlestick
 * chart, which is what they were redesigned away from.
 *
 * A route named here gets the layout the shell already gives every route
 * below 900px — the chart, the composed panel column and the assistant stand
 * down, and the page takes the middle track. Nothing new had to be invented
 * for it; `shellLayout` simply receives those columns as closed.
 *
 * The store flags behind those columns are NOT written when this happens. An
 * operator who had the assistant open returns to it open on the next route,
 * because what is suppressed here is the rendering, not the preference.
 *
 * Keep this list short. Each entry is a page that has earned the whole screen.
 */
export const FULL_BLEED_ROUTES: readonly string[] = [
  "/assets",
  "/personalized",
  "/referrals",
];

/** Whether `pathname` is one of them. */
export function isFullBleedRoute(pathname: string): boolean {
  return FULL_BLEED_ROUTES.includes(pathname);
}

/**
 * Routes that render with NO shell at all — not even a status bar.
 *
 * Distinct from `FULL_BLEED_ROUTES`, which still live inside the workspace
 * and keep its chrome. These do not: the Telegram Mini App runs in a webview
 * roughly 380px wide, inside an app that draws its own header and back
 * button, and every piece of Elyra's shell there is a second navigation
 * fighting the first for a screen that has room for neither.
 *
 * Adding to this list is a deliberate decision, like the full-bleed one. A
 * route here gives up the rail, the palette, the chart and the assistant, so
 * it has to be somewhere those genuinely do not belong.
 */
export const STANDALONE_ROUTES: readonly string[] = ["/telegram"];

export function isStandaloneRoute(pathname: string): boolean {
  return STANDALONE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Which column gives up width first when the row does not fit.
 *
 * The rail leads because it loses the least: at its minimum it is still a
 * complete icon rail with tooltips. The assistant is late because it holds
 * running prose, which reflows worst. The route column is last of all: it is
 * the thing the operator just asked for by name.
 */
const SQUEEZE_ORDER: readonly ShellColumnId[] = [
  "rail",
  "palette",
  "stack",
  "assist",
  "route",
];

/** The chart's track. `minmax(0, 1fr)` so the grid can never overflow. */
const MAIN_TRACK = "minmax(0, 1fr)";

export type ColumnWidths = Partial<Record<ShellColumnId, number>>;

export function clampColumn(id: ShellColumnId, px: number): number {
  const { min, max } = COLUMN_BOUNDS[id];
  return Math.round(Math.min(max, Math.max(min, px)));
}

/** The width the operator asked for, held inside the column's own bounds. */
export function columnWidth(widths: ColumnWidths, id: ShellColumnId): number {
  return clampColumn(id, widths[id] ?? COLUMN_BOUNDS[id].initial);
}

/**
 * Fit `visible` beside the chart inside `available` px.
 *
 * `available` is the grid's content width — the viewport less the shell's own
 * padding. Null means nothing has been measured yet, on the server and for the
 * first paint, where the stored widths are used as they are.
 *
 * Columns are taken down to their minimums in SQUEEZE_ORDER. If even the
 * minimums do not fit, the chart takes what is left: it is still open, which
 * is the point, and `minmax(0, 1fr)` keeps the grid inside the viewport.
 */
export function fitColumns(
  visible: readonly ShellColumnId[],
  widths: ColumnWidths,
  available: number | null,
): Map<ShellColumnId, number> {
  const fitted = new Map<ShellColumnId, number>();
  for (const id of visible) fitted.set(id, columnWidth(widths, id));
  if (available === null) return fitted;

  /* One more track than there are side columns — the chart — so one gap per
     side column. */
  const gaps = SHELL_GAP * visible.length;
  let sides = 0;
  for (const width of fitted.values()) sides += width;

  let over = sides + MAIN_MIN + gaps - available;
  if (over <= 0) return fitted;

  for (const id of SQUEEZE_ORDER) {
    if (over <= 0) break;
    const width = fitted.get(id);
    if (width === undefined) continue;
    const give = Math.min(width - COLUMN_BOUNDS[id].min, over);
    if (give <= 0) continue;
    fitted.set(id, width - give);
    over -= give;
  }

  return fitted;
}

export interface ShellLayoutInput {
  /** Viewport width in px, or null before the first measurement. */
  viewport: number | null;
  widths: ColumnWidths;
  paletteOpen: boolean;
  stackOpen: boolean;
  assistOpen: boolean;
  /**
   * The operator is on a route other than Home.
   *
   * Those used to replace the middle column, which took the chart off screen.
   * They now open as a column beside it, exactly like the palette, so the chart
   * is never the thing a navigation costs you.
   */
  routeOpen?: boolean;
  /**
   * The operator pressed the rail's collapse control.
   *
   * A flag rather than a width, so the width they dragged the rail to is still
   * there when they expand it again. It pins the rail to its minimum, which is
   * the icon rail — `railIcons` then follows from the width like it does for
   * every other reason the rail can end up narrow.
   */
  railCollapsed?: boolean;
}

export interface ShellLayout {
  /** `grid-template-columns` for each of the three wide breakpoints. */
  compact: string;
  mid: string;
  full: string;
  /** The rail's fitted width at the breakpoint that is actually on screen. */
  railWidth: number;
  /** True when the fitted rail is too narrow to carry its labels. */
  railIcons: boolean;
}

function tracks(fitted: Map<ShellColumnId, number>, order: readonly ShellColumnId[]): string {
  const before: string[] = [];
  const after: string[] = [];
  for (const id of order) {
    const width = fitted.get(id);
    if (width === undefined) continue;
    /* The assistant is the one column that sits after the chart. */
    (id === "assist" ? after : before).push(`${width}px`);
  }
  return [...before, MAIN_TRACK, ...after].join(" ");
}

/**
 * The whole grid, for all three breakpoints at once.
 *
 * All three are computed from the same measured viewport and published as
 * custom properties; the media queries in `globals.css` pick the one that
 * applies. Doing it that way rather than resolving the breakpoint here keeps a
 * single authority for which columns are on screen — the same media queries
 * that hide the elements — so the tracks can never disagree with the items.
 */
export function shellLayout(input: ShellLayoutInput): ShellLayout {
  const { viewport, paletteOpen, stackOpen, assistOpen, routeOpen, railCollapsed } =
    input;
  const available = viewport === null ? null : viewport - SHELL_PAD * 2;

  /* Collapsing pins the rail to its minimum for this pass only. The stored
     width is untouched, so expanding gives back exactly what was there. */
  const widths: ColumnWidths = railCollapsed
    ? { ...input.widths, rail: COLUMN_BOUNDS.rail.min }
    : input.widths;

  /* Left to right, and the route column sits closest to the chart because it
     is the one you opened last and are reading now. */
  const midOrder: ShellColumnId[] = ["rail"];
  if (paletteOpen) midOrder.push("palette");
  if (stackOpen) midOrder.push("stack");
  if (routeOpen) midOrder.push("route");
  const fullOrder: ShellColumnId[] = assistOpen ? [...midOrder, "assist"] : midOrder;

  const midFit = fitColumns(midOrder, widths, available);
  const fullFit = fitColumns(fullOrder, widths, available);

  /* Below 900px the rail is the icon rail and nothing else is on screen, so
     there is nothing to fit and no width for the operator to set. */
  const compact = `${COLUMN_BOUNDS.rail.min}px ${MAIN_TRACK}`;

  const railWidth =
    viewport === null
      ? columnWidth(widths, "rail")
      : viewport >= 1280
        ? (fullFit.get("rail") ?? COLUMN_BOUNDS.rail.min)
        : viewport >= 900
          ? (midFit.get("rail") ?? COLUMN_BOUNDS.rail.min)
          : COLUMN_BOUNDS.rail.min;

  return {
    compact,
    mid: tracks(midFit, midOrder),
    full: tracks(fullFit, fullOrder),
    railWidth,
    /* Below 900px the labels are already hidden by the breakpoint itself, so
       this only has to answer for the two wide layouts. */
    railIcons: viewport !== null && viewport >= 900 && railWidth < RAIL_LABEL_MIN,
  };
}

/* ---------------------------------------------------------------------------
   Rows.

   The same idea one axis over: a stack of panels divides its column by flex
   weight, and a handle between two of them moves weight from one to the other.
   Weights rather than pixels, so the split survives the window being resized.
--------------------------------------------------------------------------- */

/** The shortest a panel may be dragged to. Below this its header is all there is. */
export const ROW_MIN = 88;

/** The middle column's own split, and the ids its handle writes under. */
export const CHART_GROW = 1.15;
export const LEDGER_GROW = 1;

/**
 * Move weight across one boundary.
 *
 * `heights` are what the two rows currently measure, so a drag in pixels lands
 * where the pointer is however the weights happen to be scaled.
 */
export function splitRows(
  heights: [number, number],
  grows: [number, number],
  deltaPx: number,
): [number, number] {
  const total = heights[0] + heights[1];
  const weight = grows[0] + grows[1];
  if (total <= 0 || weight <= 0) return grows;

  const first = Math.min(
    Math.max(heights[0] + deltaPx, ROW_MIN),
    Math.max(total - ROW_MIN, ROW_MIN),
  );
  const share = (first / total) * weight;
  return [share, weight - share];
}
