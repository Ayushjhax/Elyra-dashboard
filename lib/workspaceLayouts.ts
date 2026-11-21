import { msg } from "@/lib/i18n/translate";
import { clampColumn, COLUMN_BOUNDS, type ColumnWidths, type ShellColumnId } from "@/lib/layout";
import type { WidgetKey } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Workspace layouts: a named arrangement of the shell — which side columns
   show, how wide, the widgets' order and which are folded, the panels under
   the chart — saved and switched in one move. Pure.

   A layout carries what the operator could set by hand and nothing else, and
   every width in it is held to `COLUMN_BOUNDS` by `clampColumn` when it is
   saved and again when it is applied — lib/layout.ts stays the one
   authority, so a layout can never ask for a column the fitter would not
   allow from a drag. The chart is never one of the columns it sizes: it
   takes what is left, as always.
--------------------------------------------------------------------------- */

export interface WorkspaceLayout {
  id: string;
  /** For a built-in, an English key the menu translates; for a saved one, the operator's own words. */
  name: string;
  builtIn: boolean;
  widgetOrder: WidgetKey[];
  collapsedWidgets: WidgetKey[];
  widgetsOpen: boolean;
  agentOpen: boolean;
  tradingOpen: boolean;
  automationOpen: boolean;
  columnWidths: ColumnWidths;
  railExpanded: boolean;
}

export type LayoutState = Omit<WorkspaceLayout, "id" | "name" | "builtIn">;

export const MAX_SAVED_LAYOUTS = 6;
export const MAX_LAYOUT_NAME = 32;

const WIDGETS: readonly WidgetKey[] = ["watchlist", "signals", "activity"];
const COLUMNS = Object.keys(COLUMN_BOUNDS) as ShellColumnId[];

const base: LayoutState = {
  widgetOrder: ["watchlist", "signals", "activity"],
  collapsedWidgets: [],
  widgetsOpen: true,
  agentOpen: true,
  tradingOpen: true,
  automationOpen: true,
  columnWidths: {},
  railExpanded: false,
};

export const BUILT_IN_LAYOUTS: readonly WorkspaceLayout[] = [
  { id: "builtin:default", name: msg("Default"), builtIn: true, ...base },
  {
    id: "builtin:trading",
    name: msg("Trading"),
    builtIn: true,
    ...base,
    widgetOrder: ["watchlist", "activity", "signals"],
    collapsedWidgets: ["signals"],
    agentOpen: false,
  },
  {
    id: "builtin:chart",
    name: msg("Chart and orders"),
    builtIn: true,
    ...base,
    widgetsOpen: false,
    agentOpen: false,
    automationOpen: false,
  },
  {
    id: "builtin:research",
    name: msg("Research with Elyra"),
    builtIn: true,
    ...base,
    widgetOrder: ["signals", "watchlist", "activity"],
    collapsedWidgets: ["activity"],
    tradingOpen: false,
    columnWidths: { agent: COLUMN_BOUNDS.agent.max },
  },
];

/** The arrangement now, as a layout's state: only what a layout holds. */
export function captureLayout(state: LayoutState): LayoutState {
  return sanitizeState(state);
}

/** Held to what the shell allows: known widgets once each, widths inside their bounds. */
export function sanitizeState(raw: Partial<Record<keyof LayoutState, unknown>>): LayoutState {
  const order = Array.isArray(raw.widgetOrder) ? raw.widgetOrder.filter((key): key is WidgetKey => WIDGETS.includes(key as WidgetKey)) : [];
  const unique = [...new Set(order)];
  const widgetOrder = unique.length === WIDGETS.length ? unique : [...base.widgetOrder];
  const collapsedWidgets = Array.isArray(raw.collapsedWidgets)
    ? [...new Set(raw.collapsedWidgets.filter((key): key is WidgetKey => WIDGETS.includes(key as WidgetKey)))]
    : [];
  const widths: ColumnWidths = {};
  if (typeof raw.columnWidths === "object" && raw.columnWidths !== null) {
    for (const id of COLUMNS) {
      const value = (raw.columnWidths as Record<string, unknown>)[id];
      if (typeof value === "number" && Number.isFinite(value)) widths[id] = clampColumn(id, value);
    }
  }
  const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  return {
    widgetOrder,
    collapsedWidgets,
    widgetsOpen: flag(raw.widgetsOpen, true),
    agentOpen: flag(raw.agentOpen, true),
    tradingOpen: flag(raw.tradingOpen, true),
    automationOpen: flag(raw.automationOpen, true),
    columnWidths: widths,
    railExpanded: flag(raw.railExpanded, false),
  };
}

/** A layout to save, or why not. Names are the operator's own; they are not translated. */
export function newLayout(name: string, state: LayoutState, saved: readonly WorkspaceLayout[], now: number): { layout: WorkspaceLayout } | { error: string } {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_LAYOUT_NAME);
  if (trimmed.length === 0) return { error: msg("Name the layout.") };
  const replacing = saved.find((layout) => layout.name.toLowerCase() === trimmed.toLowerCase());
  if (replacing === undefined && saved.length >= MAX_SAVED_LAYOUTS) return { error: msg("Six layouts are saved, the most there can be. Delete one first.") };
  return { layout: { id: replacing?.id ?? `saved:${now.toString(36)}`, name: trimmed, builtIn: false, ...captureLayout(state) } };
}

/** Saved layouts as read back from storage: malformed ones dropped, each held to the shell. */
export function readSavedLayouts(raw: unknown): WorkspaceLayout[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string" && typeof (entry as { name?: unknown }).name === "string")
    .slice(0, MAX_SAVED_LAYOUTS)
    .map((entry) => ({ id: String(entry.id), name: String(entry.name).slice(0, MAX_LAYOUT_NAME), builtIn: false, ...sanitizeState(entry) }));
}
