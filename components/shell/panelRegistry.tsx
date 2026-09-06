import { Activity as ActivityIcon, Bot, Eye, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { ActivityPanel } from "@/components/panels/ActivityPanel";
import { AgentChatPanel } from "@/components/panels/AgentChatPanel";
import { AutomationPanel } from "@/components/panels/AutomationPanel";
import { SmartMoneySignalPanel } from "@/components/panels/SmartMoneySignalPanel";
import { WatchlistPanel } from "@/components/panels/WatchlistPanel";
import type { PanelKey } from "@/lib/types";

/* ---------------------------------------------------------------------------
   What a panel key means.

   The store holds keys, this file holds everything else — so a saved layout is
   plain JSON and a component can be renamed or re-grouped without migrating
   anyone's workspace. Adding a component to the palette is adding one entry
   here and one key to PanelKey; nothing else in the shell needs to know.
--------------------------------------------------------------------------- */

/** The two headings the palette groups under, in the order they are shown. */
export const PANEL_GROUPS = ["Market", "Agent"] as const;
export type PanelGroup = (typeof PANEL_GROUPS)[number];

export interface PanelEntry {
  key: PanelKey;
  label: string;
  /** One line saying what the component is for, shown under its name. */
  hint: string;
  group: PanelGroup;
  icon: LucideIcon;
  /**
   * How much of the column this component wants relative to its neighbours.
   * These are the weights the fixed layout used before the column became
   * composable — a watchlist earns more rows than a rule list.
   */
  grow: number;
  render: () => React.ReactNode;
}

export const PANEL_REGISTRY: Record<PanelKey, PanelEntry> = {
  activity: {
    key: "activity",
    label: "Activity",
    hint: "Fills, triggers and signals as they land",
    group: "Market",
    icon: ActivityIcon,
    grow: 1,
    render: () => <ActivityPanel />,
  },
  watchlist: {
    key: "watchlist",
    label: "Watchlist",
    hint: "Live Pyth prices for the markets you follow",
    group: "Market",
    icon: Eye,
    grow: 1.2,
    render: () => <WatchlistPanel />,
  },
  automation: {
    key: "automation",
    label: "Automation",
    hint: "Rules the agent is holding armed",
    group: "Agent",
    icon: Zap,
    grow: 0.8,
    render: () => <AutomationPanel />,
  },
  signals: {
    key: "signals",
    label: "Signals",
    hint: "Setups the agent has raised, with its reasoning",
    group: "Agent",
    icon: Sparkles,
    grow: 1.4,
    render: () => <SmartMoneySignalPanel />,
  },
  chat: {
    key: "chat",
    label: "Chat",
    hint: "Ask Elyra about the selected market",
    group: "Agent",
    icon: Bot,
    grow: 1.4,
    render: () => <AgentChatPanel />,
  },
};

/** Every entry, grouped and in palette order. */
export const PANELS_BY_GROUP: Array<{ group: PanelGroup; entries: PanelEntry[] }> =
  PANEL_GROUPS.map((group) => ({
    group,
    entries: Object.values(PANEL_REGISTRY).filter((entry) => entry.group === group),
  }));

/** The MIME type a dragged panel key travels under. */
export const PANEL_DRAG_TYPE = "application/x-elyra-panel";

/** Narrows a string off a drop event, which can carry anything. */
export function isPanelKey(value: string): value is PanelKey {
  return value in PANEL_REGISTRY;
}
