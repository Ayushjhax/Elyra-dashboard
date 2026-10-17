"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_ASSET_ID,
  DEFAULT_FAVORITE_IDS,
  DEFAULT_WATCHLIST_IDS,
} from "@/lib/market/defaults";
import type { ComposerAttachment } from "@/lib/attachments";
import { CONTEXT_SOURCES, type ContextSource } from "@/lib/personalized/types";
import { rememberRead } from "@/lib/activity/notifications";
import { clampColumn, type ColumnWidths, type ShellColumnId } from "@/lib/layout";
import type {
  AgentTab,
  ChartIndicators,
  ChartStyle,
  ChatMessage,
  Interval,
  LedgerTab,
  MarketFilter,
  WidgetKey,
} from "@/lib/types";

/** The left column, top to bottom, before the operator has moved anything. */
export const DEFAULT_WIDGET_ORDER: WidgetKey[] = ["watchlist", "signals", "activity"];

/** The order version 2 shipped with — the one migration 3 may replace. */
const PREVIOUS_DEFAULT_ORDER: WidgetKey[] = ["activity", "watchlist", "signals"];

interface ElyraState {
  /* ---- the spine ---- */
  /** Pyth feed id of the selected market. */
  selectedAssetId: number;
  setSelectedAssetId: (id: number) => void;

  /* ---- trading activity (persisted) ---- */
  marketType: MarketFilter;
  setMarketType: (market: MarketFilter) => void;
  ledgerTab: LedgerTab;
  setLedgerTab: (tab: LedgerTab) => void;

  /* ---- chart (persisted) ---- */
  interval: Interval;
  setInterval: (interval: Interval) => void;
  chartStyle: ChartStyle;
  setChartStyle: (style: ChartStyle) => void;
  chartIndicators: ChartIndicators;
  toggleIndicator: (key: keyof ChartIndicators) => void;
  /** TradingView's drawing toolbar is showing (persisted). */
  chartDrawing: boolean;
  setChartDrawing: (on: boolean) => void;

  /* ---- watchlist (Pyth feed ids) ---- */
  watchlist: number[];
  addToWatchlist: (id: number) => void;
  removeFromWatchlist: (id: number) => void;
  favorites: number[];
  toggleFavorite: (id: number) => void;

  /* ---- portfolio ---- */
  /**
   * Balances rendered as ▒▒▒▒ rather than figures.
   *
   * Persisted, because the reason to turn it on — a shared screen, a desk in
   * an open office, a recording — outlives the tab it was turned on in.
   */
  balancesHidden: boolean;
  setBalancesHidden: (hidden: boolean) => void;

  /* ---- capital intelligence ---- */
  /**
   * What Capital Intelligence may read for each question — the composer's
   * "Using" chips. Persisted: leaving activity out is a standing choice, not
   * one to make again on every visit.
   */
  contextSources: ContextSource[];
  setContextSources: (sources: ContextSource[]) => void;
  /** The context rail folded away beside the conversation. */
  contextRailCollapsed: boolean;
  setContextRailCollapsed: (collapsed: boolean) => void;

  /* ---- agent ---- */
  /**
   * The conversation. Held here rather than in the panel so that closing the
   * panel, or the drawer it becomes on a narrow screen, loses nothing — and so
   * that a reply that lands while it is closed is there when it reopens.
   */
  messages: ChatMessage[];
  appendMessage: (message: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  /** Drops the conversation, the draft and anything staged: the account
      they belonged to has signed out. `endConversation` in lib/agentChat.ts
      calls it, after stopping a reply still arriving. */
  clearConversation: () => void;
  /** A request to the agent is in flight. One at a time. */
  agentPending: boolean;
  setAgentPending: (pending: boolean) => void;
  /** The id of the reply currently being painted in, or null. */
  streamingId: string | null;
  setStreamingId: (id: string | null) => void;
  composerDraft: string;
  setComposerDraft: (value: string) => void;
  /**
   * Files staged for the next question. In the store for the draft's
   * reason — the composer can unmount between column and drawer — and never
   * persisted: a file's bytes do not belong in localStorage.
   */
  composerAttachments: ComposerAttachment[];
  addComposerAttachments: (files: ComposerAttachment[]) => void;
  removeComposerAttachment: (id: string) => void;
  clearComposerAttachments: () => void;
  /** Bumped when another surface wants the composer focused. */
  composerFocusNonce: number;
  /** Prefill the composer and bring the agent into view. */
  askElyra: (prompt: string) => void;
  /** Bring the agent into view: the column from 1280px, the drawer below. */
  revealAgent: () => void;
  agentTab: AgentTab;
  setAgentTab: (tab: AgentTab) => void;
  /** Bumped by the overview's pending-action badge: the agent panel opens on
      Ask Elyra and brings the review card into view. */
  pendingFocusNonce: number;
  reviewPendingActions: () => void;
  /** The decision brief above the conversation is open (persisted). */
  decisionBriefOpen: boolean;
  setDecisionBriefOpen: (open: boolean) => void;

  /* ---- workspace layout (persisted) ---- */
  widgetOrder: WidgetKey[];
  /** Keyboard-reachable equivalent of dragging a widget one place. */
  moveWidget: (key: WidgetKey, delta: -1 | 1) => void;
  collapsedWidgets: WidgetKey[];
  toggleWidgetCollapsed: (key: WidgetKey) => void;
  /** Whether the left widget column is showing at all. */
  widgetsOpen: boolean;
  setWidgetsOpen: (open: boolean) => void;
  /** Whether the agent column is showing at all, from 1280px. */
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
  /** Trading activity under the chart: open or folded to its header. */
  tradingOpen: boolean;
  setTradingOpen: (open: boolean) => void;
  automationOpen: boolean;
  setAutomationOpen: (open: boolean) => void;
  /**
   * What the operator dragged each column to. A column with no entry sits at
   * its initial width; every entry is held inside `COLUMN_BOUNDS`, and the
   * fitter in `lib/layout.ts` may still show it narrower when the centre's
   * floor demands it.
   */
  columnWidths: ColumnWidths;
  setColumnWidth: (id: ShellColumnId, px: number) => void;
  resetColumnWidth: (id: ShellColumnId) => void;
  /** The rail shows its labels. */
  railExpanded: boolean;
  setRailExpanded: (expanded: boolean) => void;
  /**
   * A resize handle is being dragged right now.
   *
   * The grids animate between widths so a collapse glides, and that animation
   * has to be off while a drag is running or the columns lag the pointer.
   */
  resizing: boolean;
  setResizing: (resizing: boolean) => void;
  /**
   * Focus mode: the chart alone.
   *
   * Deliberately NOT persisted, and deliberately a flag of its own rather
   * than a write to `widgetsOpen` and `agentOpen`: it suppresses the side
   * columns while it is on, and turning it off finds them exactly as they
   * were.
   */
  focusMode: boolean;
  setFocusMode: (on: boolean) => void;
  /** Every arrangement back to its default: order, widths, sections, columns. */
  resetLayout: () => void;

  /* ---- floating surfaces (never persisted) ---- */
  agentDrawerOpen: boolean;
  setAgentDrawerOpen: (open: boolean) => void;
  navSheetOpen: boolean;
  setNavSheetOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  /**
   * The wallet panel, opened from the account control in the header.
   *
   * Not persisted. A panel showing an address and a balance is a thing you
   * opened just now, not a preference.
   */
  walletSheetOpen: boolean;
  setWalletSheetOpen: (open: boolean) => void;
  /** Close every collapsed surface — used when the viewport grows past a breakpoint. */
  closeCollapsedSurfaces: () => void;

  /* ---- notifications (persisted) ---- */
  /** Every notification at or before this ISO time is read; null if none has been. */
  notificationsSeenAt: string | null;
  /** Mark all read: everything up to `at`, and forget the ids read one by one. */
  markNotificationsSeen: (at: string) => void;
  /** Notifications opened one at a time since the watermark, newest first. */
  notificationsReadIds: string[];
  markNotificationRead: (id: string) => void;
}

/**
 * Everything up to version 3.
 *
 * Version 2 was the workspace redesign: the composed column (`stack`), its
 * row weights and the palette went, and the left column became three widgets.
 * Column widths did not carry over — their ids changed meaning.
 *
 * Version 3 is the trading-workspace layout: Watchlist, Live signals and
 * Activity, and the venue filter gains "all". Only an operator still on the
 * OLD default order is moved to the new one; an order someone arranged
 * themselves is kept.
 */
function migrateToV3(state: Record<string, unknown>, from: number): Record<string, unknown> {
  if (from >= 3) return state;

  if (from === 2) {
    const order = Array.isArray(state.widgetOrder) ? (state.widgetOrder as string[]) : [];
    const untouched = PREVIOUS_DEFAULT_ORDER.every((key, index) => order[index] === key);
    return {
      ...state,
      widgetOrder:
        untouched || order.length !== DEFAULT_WIDGET_ORDER.length ? DEFAULT_WIDGET_ORDER : order,
      marketType: "all",
    };
  }

  const {
    stack: _stack,
    rowGrow: _rowGrow,
    stackOpen,
    assistOpen,
    railCollapsed: _railCollapsed,
    columnWidths: _columnWidths,
    ...rest
  } = state;
  void _stack;
  void _rowGrow;
  void _railCollapsed;
  void _columnWidths;

  return {
    ...rest,
    widgetOrder: DEFAULT_WIDGET_ORDER,
    marketType: "all",
    widgetsOpen: typeof stackOpen === "boolean" ? stackOpen : true,
    agentOpen: typeof assistOpen === "boolean" ? assistOpen : true,
  };
}

/** The whole persisted-state migration, exported for its tests. */
export function migratePersisted(persisted: unknown, from: number): Record<string, unknown> {
  let state = migrateToV3((persisted ?? {}) as Record<string, unknown>, from);
  if (from < 4) {
    /* Version 4 adds pivot levels to the chart's indicators, on by default,
       without touching the two the operator already set. */
    const indicators = (state.chartIndicators ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      chartIndicators: { ema: true, volume: true, ...indicators, levels: indicators.levels ?? true },
    };
  }
  if (from < 5) {
    /* Version 5 drops the switches the sample automation rules and their
       derived actions kept in this browser. Rules are price alerts on the
       server now, and an action is dismissed or confirmed on its stored row,
       so ids from the sample would only ever be stale. */
    const { disabledRules, dismissedActions, reviewedActions, ...rest } = state;
    void disabledRules;
    void dismissedActions;
    void reviewedActions;
    state = rest;
  }
  return state;
}

/** True from 1280px, where the agent is a column rather than a drawer. */
function agentIsColumn(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches;
}

export const useElyraStore = create<ElyraState>()(
  persist(
    (set) => ({
      selectedAssetId: DEFAULT_ASSET_ID,
      setSelectedAssetId: (id) => set({ selectedAssetId: id }),

      marketType: "all",
      setMarketType: (market) => set({ marketType: market }),
      ledgerTab: "positions",
      setLedgerTab: (tab) => set({ ledgerTab: tab }),

      interval: "1H",
      setInterval: (interval) => set({ interval }),
      chartStyle: "candles",
      setChartStyle: (chartStyle) => set({ chartStyle }),
      chartIndicators: { ema: true, volume: true, levels: true },
      chartDrawing: false,
      setChartDrawing: (chartDrawing) => set({ chartDrawing }),
      toggleIndicator: (key) =>
        set((state) => ({
          chartIndicators: { ...state.chartIndicators, [key]: !state.chartIndicators[key] },
        })),

      watchlist: DEFAULT_WATCHLIST_IDS,
      addToWatchlist: (id) =>
        set((state) =>
          state.watchlist.includes(id)
            ? state
            : { watchlist: [...state.watchlist, id] },
        ),
      removeFromWatchlist: (id) =>
        set((state) => ({
          watchlist: state.watchlist.filter((entry) => entry !== id),
        })),
      favorites: DEFAULT_FAVORITE_IDS,
      toggleFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.includes(id)
            ? state.favorites.filter((entry) => entry !== id)
            : [...state.favorites, id],
        })),

      balancesHidden: false,
      setBalancesHidden: (hidden) => set({ balancesHidden: hidden }),

      contextSources: [...CONTEXT_SOURCES],
      /* Kept in a fixed order, so the chips never reshuffle as they toggle. */
      setContextSources: (sources) =>
        set({ contextSources: CONTEXT_SOURCES.filter((source) => sources.includes(source)) }),
      contextRailCollapsed: false,
      setContextRailCollapsed: (collapsed) => set({ contextRailCollapsed: collapsed }),

      /* No seeded conversation. A transcript the operator never had is a
         claim about their account; the panel opens on an invitation instead. */
      messages: [],
      appendMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      patchMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === id ? { ...message, ...patch } : message,
          ),
        })),
      clearConversation: () =>
        set({
          messages: [],
          agentPending: false,
          streamingId: null,
          composerDraft: "",
          composerAttachments: [],
        }),
      agentPending: false,
      setAgentPending: (agentPending) => set({ agentPending }),
      streamingId: null,
      setStreamingId: (streamingId) => set({ streamingId }),
      composerDraft: "",
      setComposerDraft: (value) => set({ composerDraft: value }),
      composerAttachments: [],
      addComposerAttachments: (files) =>
        set((state) => ({ composerAttachments: [...state.composerAttachments, ...files] })),
      removeComposerAttachment: (id) =>
        set((state) => ({ composerAttachments: state.composerAttachments.filter((file) => file.id !== id) })),
      clearComposerAttachments: () => set({ composerAttachments: [] }),
      composerFocusNonce: 0,
      askElyra: (prompt) =>
        set((state) => ({
          composerDraft: prompt,
          composerFocusNonce: state.composerFocusNonce + 1,
          agentTab: "ask",
          ...(agentIsColumn() ? { agentOpen: true } : { agentDrawerOpen: true }),
        })),
      revealAgent: () =>
        set(agentIsColumn() ? { agentOpen: true, focusMode: false } : { agentDrawerOpen: true }),
      agentTab: "ask",
      setAgentTab: (agentTab) => set({ agentTab }),
      pendingFocusNonce: 0,
      reviewPendingActions: () =>
        set((state) => ({
          agentTab: "ask",
          pendingFocusNonce: state.pendingFocusNonce + 1,
          ...(agentIsColumn() ? { agentOpen: true, focusMode: false } : { agentDrawerOpen: true }),
        })),
      decisionBriefOpen: true,
      setDecisionBriefOpen: (decisionBriefOpen) => set({ decisionBriefOpen }),

      widgetOrder: DEFAULT_WIDGET_ORDER,
      moveWidget: (key, delta) =>
        set((state) => {
          const from = state.widgetOrder.indexOf(key);
          const to = from + delta;
          if (from === -1 || to < 0 || to >= state.widgetOrder.length) return state;
          const next = [...state.widgetOrder];
          [next[from], next[to]] = [next[to], next[from]];
          return { widgetOrder: next };
        }),
      collapsedWidgets: [],
      toggleWidgetCollapsed: (key) =>
        set((state) => ({
          collapsedWidgets: state.collapsedWidgets.includes(key)
            ? state.collapsedWidgets.filter((entry) => entry !== key)
            : [...state.collapsedWidgets, key],
        })),
      widgetsOpen: true,
      setWidgetsOpen: (open) => set({ widgetsOpen: open }),
      agentOpen: true,
      setAgentOpen: (open) => set({ agentOpen: open }),
      tradingOpen: true,
      setTradingOpen: (open) => set({ tradingOpen: open }),
      automationOpen: true,
      setAutomationOpen: (open) => set({ automationOpen: open }),

      columnWidths: {},
      setColumnWidth: (id, px) =>
        set((state) => ({
          columnWidths: { ...state.columnWidths, [id]: clampColumn(id, px) },
        })),
      resetColumnWidth: (id) =>
        set((state) => {
          const next = { ...state.columnWidths };
          delete next[id];
          return { columnWidths: next };
        }),
      railExpanded: false,
      setRailExpanded: (expanded) => set({ railExpanded: expanded }),
      resizing: false,
      setResizing: (resizing) => set({ resizing }),
      focusMode: false,
      setFocusMode: (on) => set({ focusMode: on }),

      resetLayout: () =>
        set({
          widgetOrder: DEFAULT_WIDGET_ORDER,
          collapsedWidgets: [],
          widgetsOpen: true,
          agentOpen: true,
          tradingOpen: true,
          automationOpen: true,
          columnWidths: {},
          railExpanded: false,
          focusMode: false,
        }),

      agentDrawerOpen: false,
      setAgentDrawerOpen: (open) => set({ agentDrawerOpen: open }),
      navSheetOpen: false,
      setNavSheetOpen: (open) => set({ navSheetOpen: open }),
      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),
      walletSheetOpen: false,
      setWalletSheetOpen: (open) => set({ walletSheetOpen: open }),
      closeCollapsedSurfaces: () =>
        set({ agentDrawerOpen: false, navSheetOpen: false }),

      notificationsSeenAt: null,
      markNotificationsSeen: (at) => set({ notificationsSeenAt: at, notificationsReadIds: [] }),
      notificationsReadIds: [],
      markNotificationRead: (id) =>
        set((state) => ({ notificationsReadIds: rememberRead(state.notificationsReadIds, id) })),
    }),
    {
      name: "elyra-terminal",
      storage: createJSONStorage(() => localStorage),
      /* See migrateToV3 for versions 1–3 and migratePersisted after. */
      version: 5,
      migrate: (persisted: unknown, from: number) => migratePersisted(persisted, from),
      /* The watchlist and the selection are the user's, so they persist.
         Prices deliberately do not: a price restored from localStorage is a
         stale number wearing a live one's clothes. They come from Pyth on
         every load. Neither does the conversation: it is a session, not a
         preference. */
      partialize: (state) => ({
        marketType: state.marketType,
        ledgerTab: state.ledgerTab,
        interval: state.interval,
        chartStyle: state.chartStyle,
        chartIndicators: state.chartIndicators,
        chartDrawing: state.chartDrawing,
        watchlist: state.watchlist,
        favorites: state.favorites,
        selectedAssetId: state.selectedAssetId,
        balancesHidden: state.balancesHidden,
        contextSources: state.contextSources,
        contextRailCollapsed: state.contextRailCollapsed,
        widgetOrder: state.widgetOrder,
        collapsedWidgets: state.collapsedWidgets,
        widgetsOpen: state.widgetsOpen,
        agentOpen: state.agentOpen,
        tradingOpen: state.tradingOpen,
        automationOpen: state.automationOpen,
        columnWidths: state.columnWidths,
        railExpanded: state.railExpanded,
        notificationsSeenAt: state.notificationsSeenAt,
        notificationsReadIds: state.notificationsReadIds,
        decisionBriefOpen: state.decisionBriefOpen,
      }),
      /* Rehydrate after mount so the server and the first client render agree. */
      skipHydration: true,
    },
  ),
);

/* ---------------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------------- */

/** Stable id for a chat message created at runtime. */
let messageCounter = 0;
export function nextMessageId(prefix = "msg"): string {
  messageCounter += 1;
  return `${prefix}-runtime-${messageCounter}`;
}
