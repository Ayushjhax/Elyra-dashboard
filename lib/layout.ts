/* ---------------------------------------------------------------------------
   How wide each shell column may be, and what gives when they do not all fit.

   Pure arithmetic with no DOM in it, so the rule that protects the chart can be
   tested directly. The shell measures the viewport, hands the width in, and
   applies the track strings that come back — one per breakpoint, because the
   media queries in app/globals.css, not this file, decide which columns are on
   screen.

   The shape, left to right:

     rail | widgets-or-route | centre (chart, trading, automation) | agent

   The single invariant: the centre column is never squeezed out. Opening the
   agent, widening the widgets or opening a route takes its width from the
   other side columns, in a fixed order, and only what is left over comes out
   of the centre. MAIN_MIN is the floor it stops at.

   The floor keeps the chart working; MAIN_SHARE keeps it the point of the
   screen. The side columns open at widths chosen on a wide screen, and on a
   laptop those same widths left the chart barely half the row — so a column
   the screen is sizing gives width back as the screen narrows.
--------------------------------------------------------------------------- */

/** The resizable columns that flank the centre. The centre is everything else. */
export type ShellColumnId = "widgets" | "route" | "agent";

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
  /* Activity, watchlist and signals, stacked. Narrower than this and a
     watchlist row can no longer hold a ticker, a price and a change. */
  widgets: { min: 230, max: 320, initial: 256, label: "widgets" },
  /* A route other than Home, opened beside the chart in the widgets' place —
     sized like a side column, not like a page. */
  route: { min: 300, max: 560, initial: 400, label: "section" },
  /* The agent. Prose reflows worst of anything here, so it keeps a wider
     floor than the widgets do. */
  agent: { min: 320, max: 480, initial: 364, label: "agent" },
};

/** The nav rail's two widths: icons, and icons with labels. */
export const RAIL_COLLAPSED = 64;
export const RAIL_EXPANDED = 224;

/** --pad-workspace and --gap-workspace, in px. The fitter has to count them. */
export const WORKSPACE_PAD = 20;
export const WORKSPACE_GAP = 16;

/**
 * The narrowest the centre column may become.
 *
 * Below about this width the chart's price axis and the trading table's
 * columns start colliding, and the centre stops being the dominant part of the
 * workspace. Past it the answer is to close a column, not to keep shaving the
 * chart, so this is the number every other column yields to.
 */
export const MAIN_MIN = 480;

/**
 * The share of the workspace row the centre keeps against the columns the
 * screen is sizing.
 *
 * A side column the operator has not sized — no drag, no key, no "widen" — is
 * the screen's to size. It opens at its initial width where the centre still
 * has this share beside it, and gives width back where it does not, in
 * SQUEEZE_ORDER, each column down to its minimum. What the operator chose is
 * theirs and gives only to MAIN_MIN: a width they set, the rail's labels, and
 * a route, which is the thing they just asked for by name.
 *
 * 0.6 leaves a 1920px screen exactly as the columns open, with or without the
 * rail's labels. On a 1470px laptop it takes the widgets and the agent to their
 * minimums, which gives the chart 784px where it had 714.
 */
export const MAIN_SHARE = 0.6;

/** The width the centre is owed out of `available` px: its share, never below its floor. */
export function centreShare(available: number): number {
  return Math.max(MAIN_MIN, Math.round(available * MAIN_SHARE));
}

/**
 * The routes that take the whole workspace instead of opening beside the
 * chart — an allowlist.
 *
 * Every other route opens in the widgets' place beside the chart, and
 * MAIN_MIN above is the rule that protects it. These are deliberate exceptions
 * to that rule, not a loosening of it: each is a page of tables or a
 * conversation beside a context rail that was unreadable four hundred pixels
 * wide next to a candlestick chart.
 *
 * A route named here takes the workspace body. The chart is not unmounted for
 * it — the workspace is hidden, not torn down, so the TradingView widget is
 * still there on the way back. The store flags behind the side columns are
 * NOT written either: what is suppressed is the rendering, not the preference.
 *
 * Keep this list short. Each entry is a page that has earned the whole screen.
 */
export const FULL_BLEED_ROUTES: readonly string[] = [
  "/assets",
  "/personalized",
  "/referrals",
  /* Research renders tables of filings, signals and yields side by side —
     content that does not fit a column beside the chart. */
  "/research",
];

/** Whether `pathname` is one of them. */
export function isFullBleedRoute(pathname: string): boolean {
  return FULL_BLEED_ROUTES.includes(pathname);
}

/**
 * Routes that render with NO shell at all — not even the header.
 *
 * Distinct from `FULL_BLEED_ROUTES`, which still live inside the workspace
 * and keep its chrome. The Telegram Mini App runs in a webview roughly 380px
 * wide, inside an app that draws its own header and back button, and every
 * piece of Elyra's shell there is a second navigation fighting the first.
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
 * The widgets lead because they lose the least: every one of them scrolls on
 * its own. The agent is next — it holds prose. The route column is last of
 * all: it is the thing the operator just asked for by name. (The rail is
 * handled before any of these: it drops to icons, which costs no information.)
 */
const SQUEEZE_ORDER: readonly ShellColumnId[] = ["widgets", "agent", "route"];

/** The centre's track. `minmax(0, 1fr)` so the grid can never overflow. */
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

/** Whether `id` gives width to the centre's share, and not only to its floor. */
function sizedByScreen(id: ShellColumnId, widths: ColumnWidths): boolean {
  return id !== "route" && widths[id] === undefined;
}

/**
 * Fit `visible` beside the centre inside `available` px.
 *
 * `available` is the workspace grid's content width. Null means nothing has
 * been measured yet — on the server and for the first paint — where the stored
 * widths are used as they are.
 *
 * Two passes, both in SQUEEZE_ORDER and neither taking a column below its
 * minimum. The columns the screen is sizing give first, until the centre has
 * its share of the row (MAIN_SHARE); then every column gives, until it has its
 * floor (MAIN_MIN). If even the minimums do not fit, the centre takes what is
 * left: it is still open, which is the point, and `minmax(0, 1fr)` keeps the
 * grid inside the viewport.
 */
export function fitColumns(
  visible: readonly ShellColumnId[],
  widths: ColumnWidths,
  available: number | null,
): Map<ShellColumnId, number> {
  const fitted = new Map<ShellColumnId, number>();
  for (const id of visible) fitted.set(id, columnWidth(widths, id));
  if (available === null) return fitted;

  squeeze(fitted, available, centreShare(available), (id) => sizedByScreen(id, widths));
  squeeze(fitted, available, MAIN_MIN, () => true);
  return fitted;
}

/** Narrow the columns that `gives` allows until the centre has `centre` px. */
function squeeze(
  fitted: Map<ShellColumnId, number>,
  available: number,
  centre: number,
  gives: (id: ShellColumnId) => boolean,
): void {
  let over = overflow(fitted, available, centre);
  for (const id of SQUEEZE_ORDER) {
    if (over <= 0) return;
    const width = fitted.get(id);
    if (width === undefined || !gives(id)) continue;
    const give = Math.min(width - COLUMN_BOUNDS[id].min, over);
    if (give <= 0) continue;
    fitted.set(id, width - give);
    over -= give;
  }
}

/** How far `fitted` plus a centre of `centre` px runs past `available`. */
function overflow(
  fitted: Map<ShellColumnId, number>,
  available: number,
  centre: number,
): number {
  /* One gap per side column: each sits beside the centre or beside another. */
  let sides = WORKSPACE_GAP * fitted.size;
  for (const width of fitted.values()) sides += width;
  return sides + centre - available;
}

export interface ShellLayoutInput {
  /** Viewport width in px, or null before the first measurement. */
  viewport: number | null;
  widths: ColumnWidths;
  /** The operator asked for labels in the rail. */
  railExpanded: boolean;
  widgetsOpen: boolean;
  agentOpen: boolean;
  /**
   * The operator is on a route that opens beside the chart. It takes the
   * widgets' place rather than adding a fourth column — there is not room for
   * a fourth without the centre paying for it.
   */
  routeOpen: boolean;
  /** Focus mode: the chart alone. Suppresses every side column. */
  focus: boolean;
}

export interface TrackSet {
  /** 640–899px. */
  compact: string;
  /** 900–1279px. */
  mid: string;
  /** 1280px and up. */
  full: string;
}

export interface ShellLayout {
  /** `grid-template-columns` for the frame: the rail, then the rest. */
  frame: TrackSet;
  /** `grid-template-columns` for the workspace grid under the overview. */
  workspace: Omit<TrackSet, "compact">;
  /** What occupies the left side column at 900px and up, if anything. */
  left: "widgets" | "route" | null;
  /**
   * The rail draws icons only. True below 900px, where it is always the icon
   * rail; above it, true when the operator collapsed it or when the fitter
   * had to drop its labels to keep the centre above its floor.
   */
  railIcons: boolean;
}

interface Fit {
  rail: number;
  columns: Map<ShellColumnId, number>;
}

/** One wide breakpoint: rail first, then the side columns in squeeze order. */
function fitBreakpoint(
  viewport: number | null,
  visible: readonly ShellColumnId[],
  widths: ColumnWidths,
  railExpanded: boolean,
): Fit {
  const railWanted = railExpanded ? RAIL_EXPANDED : RAIL_COLLAPSED;
  if (viewport === null) {
    return { rail: railWanted, columns: fitColumns(visible, widths, null) };
  }

  const availableFor = (rail: number) => viewport - rail - WORKSPACE_PAD * 2;

  /* Labels in the rail are the cheapest thing on screen to give up, so they go
     before any column is narrowed to hold the centre's floor. Not for its
     share: the labels are always the operator's choice — the rail opens as
     icons — and a toggle the screen overrules would do nothing on a laptop. */
  let rail = railWanted;
  const atWanted = new Map<ShellColumnId, number>();
  for (const id of visible) atWanted.set(id, columnWidth(widths, id));
  if (rail === RAIL_EXPANDED && overflow(atWanted, availableFor(rail), MAIN_MIN) > 0) {
    rail = RAIL_COLLAPSED;
  }

  return { rail, columns: fitColumns(visible, widths, availableFor(rail)) };
}

function tracks(columns: Map<ShellColumnId, number>, left: ShellColumnId | null): string {
  const out: string[] = [];
  if (left !== null) {
    const width = columns.get(left);
    if (width !== undefined) out.push(`${width}px`);
  }
  out.push(MAIN_TRACK);
  /* The agent is the one column after the centre. */
  const agent = columns.get("agent");
  if (agent !== undefined) out.push(`${agent}px`);
  return out.join(" ");
}

/**
 * The whole shell, for every breakpoint at once.
 *
 * All of it is computed from the same measured viewport and published as
 * custom properties; the media queries in `globals.css` pick the one that
 * applies. Resolving the breakpoint here instead would give the tracks and
 * the items two authorities, and they could disagree.
 */
export function shellLayout(input: ShellLayoutInput): ShellLayout {
  const { viewport, widths, railExpanded, widgetsOpen, agentOpen, routeOpen, focus } =
    input;

  const left: ShellColumnId | null = focus
    ? null
    : routeOpen
      ? "route"
      : widgetsOpen
        ? "widgets"
        : null;

  const midVisible: ShellColumnId[] = left === null ? [] : [left];
  /* The agent is a column only from 1280px; below it, it is a drawer. */
  const fullVisible: ShellColumnId[] =
    agentOpen && !focus ? [...midVisible, "agent"] : midVisible;

  const mid = fitBreakpoint(viewport, midVisible, widths, railExpanded);
  const full = fitBreakpoint(viewport, fullVisible, widths, railExpanded);

  const railIcons =
    viewport === null
      ? !railExpanded
      : viewport < 900
        ? true
        : (viewport >= 1280 ? full.rail : mid.rail) === RAIL_COLLAPSED;

  return {
    frame: {
      /* Below 900px the rail is the icon rail and nothing else is on screen
         beside the workspace, so there is nothing to fit. */
      compact: `${RAIL_COLLAPSED}px ${MAIN_TRACK}`,
      mid: `${mid.rail}px ${MAIN_TRACK}`,
      full: `${full.rail}px ${MAIN_TRACK}`,
    },
    workspace: {
      mid: tracks(mid.columns, left),
      full: tracks(full.columns, left),
    },
    left: left === "route" ? "route" : left === "widgets" ? "widgets" : null,
    railIcons,
  };
}
