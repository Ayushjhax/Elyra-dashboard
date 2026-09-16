"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_ASSET_ID,
  DEFAULT_FAVORITE_IDS,
  DEFAULT_WATCHLIST_IDS,
} from "@/lib/market/defaults";
import { CHAT_SEED } from "@/lib/mock/chat";
import { MOCK_NOW } from "@/lib/format";
import { clampColumn, type ColumnWidths, type ShellColumnId } from "@/lib/layout";
import type {
  ChatMessage,
  Interval,
  LedgerTab,
  MarketType,
  PanelKey,
} from "@/lib/types";

/** The panels the stacked layout reaches through its bottom bar. */
export type MobilePanel = "activity" | "watchlist" | "signals" | "chat" | null;

/** What column two holds before the operator has moved anything. */
export const DEFAULT_STACK: PanelKey[] = [
  "activity",
  "watchlist",
  "signals",
  "automation",
];

interface ElyraState {
  /* ---- the spine ---- */
  /** Pyth feed id of the selected market. */
  selectedAssetId: number;
  setSelectedAssetId: (id: number) => void;

  /* ---- ledger controls (persisted) ---- */
  marketType: MarketType;
  setMarketType: (market: MarketType) => void;
  ledgerTab: LedgerTab;
  setLedgerTab: (tab: LedgerTab) => void;

  /* ---- chart ---- */
  interval: Interval;
  setInterval: (interval: Interval) => void;

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
   * an open office, a recording — outlives the tab it was turned on in. A
   * privacy control that forgets on reload is not one.
   *
   * Only the figures are masked. Percentages, allocation shares and health
   * tones stay visible: they disclose nothing about the size of the account
   * and they are most of why the page is worth looking at.
   */
  balancesHidden: boolean;
  setBalancesHidden: (hidden: boolean) => void;

  /* ---- automation ---- */
  disabledRules: string[];
  toggleRule: (id: string) => void;

  /* ---- chat ---- */
  messages: ChatMessage[];
  composerDraft: string;
  setComposerDraft: (value: string) => void;
  /** Bumped when another panel wants the composer focused. */
  composerFocusNonce: number;
  askElyra: (prompt: string) => void;
  appendMessage: (message: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;

  /* ---- workspace layout ---- */
  /** Column two, top to bottom. The operator composes this one. */
  stack: PanelKey[];
  /** Whether the component palette column is showing. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** The panel currently under the pointer in a drag, or null. Drop targets
      only exist while this is set, so nothing shifts during normal use. */
  draggingPanel: PanelKey | null;
  setDraggingPanel: (key: PanelKey | null) => void;
  /** Put a panel at a position in the stack, adding it if it is not there yet.
      One action covers both the drag from the palette and a reorder. */
  placePanel: (key: PanelKey, index?: number) => void;
  removePanel: (key: PanelKey) => void;
  /** Keyboard equivalent of dragging a panel one place up or down. */
  nudgePanel: (key: PanelKey, delta: -1 | 1) => void;
  resetStack: () => void;

  /* ---- adjustable columns and rows ---- */
  /** Whether the composed panel column is showing at all. */
  stackOpen: boolean;
  setStackOpen: (open: boolean) => void;
  /** Whether the assistant column is showing at all. */
  assistOpen: boolean;
  setAssistOpen: (open: boolean) => void;
  /**
   * What the operator dragged each column to. A column with no entry sits at
   * its initial width; every entry is held inside `COLUMN_BOUNDS`, and the
   * fitter in `lib/layout.ts` may still show it narrower when the chart's
   * floor demands it.
   */
  columnWidths: ColumnWidths;
  setColumnWidth: (id: ShellColumnId, px: number) => void;
  resetColumnWidth: (id: ShellColumnId) => void;
  /** The rail is pinned to its icon width by its own control. */
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => void;
  /**
   * A resize handle is being dragged right now.
   *
   * The grid animates between widths so a collapse glides, and that animation
   * has to be off while a drag is running or the columns lag the pointer.
   */
  resizing: boolean;
  setResizing: (resizing: boolean) => void;
  /**
   * Flex weight per resizable row, keyed by row id — panel keys in column two,
   * `chart` and `ledger` in the middle one. Weights rather than pixels, so a
   * split the operator set survives the window being resized.
   */
  rowGrow: Record<string, number>;
  setRowGrow: (a: string, aGrow: number, b: string, bGrow: number) => void;
  /** Every arrangement back to its default: order, widths, splits and columns. */
  resetLayout: () => void;

  /* ---- responsive surfaces ---- */
  rightDrawerOpen: boolean;
  setRightDrawerOpen: (open: boolean) => void;
  leftSheetOpen: boolean;
  setLeftSheetOpen: (open: boolean) => void;
  navSheetOpen: boolean;
  setNavSheetOpen: (open: boolean) => void;
  /** Which panel the stacked layout's bottom bar is showing. */
  mobilePanel: MobilePanel;
  setMobilePanel: (panel: MobilePanel) => void;
  /**
   * The wallet panel, opened from the balance chip in the status bar.
   *
   * Not persisted. A panel showing an address and a balance is a thing you
   * opened just now, not a preference — and restoring it on the next visit
   * would put a wallet on screen before the session had been re-established.
   */
  walletSheetOpen: boolean;
  setWalletSheetOpen: (open: boolean) => void;
  /** Close every collapsed surface — used when the viewport grows past a breakpoint. */
  closeCollapsedSurfaces: () => void;
}

export const useElyraStore = create<ElyraState>()(
  persist(
    (set) => ({
      selectedAssetId: DEFAULT_ASSET_ID,
      setSelectedAssetId: (id) => set({ selectedAssetId: id }),

      marketType: "perps",
      setMarketType: (market) => set({ marketType: market }),
      ledgerTab: "positions",
      setLedgerTab: (tab) => set({ ledgerTab: tab }),

      interval: "1H",
      setInterval: (interval) => set({ interval }),

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

      disabledRules: [],
      toggleRule: (id) =>
        set((state) => ({
          disabledRules: state.disabledRules.includes(id)
            ? state.disabledRules.filter((entry) => entry !== id)
            : [...state.disabledRules, id],
        })),

      messages: CHAT_SEED,
      composerDraft: "",
      setComposerDraft: (value) => set({ composerDraft: value }),
      composerFocusNonce: 0,
      balancesHidden: false,
      setBalancesHidden: (hidden) => set({ balancesHidden: hidden }),

      askElyra: (prompt) =>
        set((state) => ({
          composerDraft: prompt,
          composerFocusNonce: state.composerFocusNonce + 1,
          rightDrawerOpen: state.rightDrawerOpen,
        })),
      appendMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      patchMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === id ? { ...message, ...patch } : message,
          ),
        })),

      stack: DEFAULT_STACK,
      paletteOpen: false,
      setPaletteOpen: (open) =>
        /* Leaving edit mode cannot leave a half-finished drag behind. */
        set(open ? { paletteOpen: true } : { paletteOpen: false, draggingPanel: null }),
      draggingPanel: null,
      setDraggingPanel: (key) => set({ draggingPanel: key }),
      placePanel: (key, index) =>
        set((state) => {
          const from = state.stack.indexOf(key);
          const next = state.stack.filter((entry) => entry !== key);
          /* The caller's index counts slots in the list as it was drawn. Once
             the dragged panel is lifted out, every slot below where it sat
             moves up one. */
          let at = index ?? next.length;
          if (from !== -1 && from < at) at -= 1;
          next.splice(Math.max(0, Math.min(at, next.length)), 0, key);
          return { stack: next };
        }),
      removePanel: (key) =>
        set((state) => ({ stack: state.stack.filter((entry) => entry !== key) })),
      nudgePanel: (key, delta) =>
        set((state) => {
          const from = state.stack.indexOf(key);
          const to = from + delta;
          if (from === -1 || to < 0 || to >= state.stack.length) return state;
          const next = [...state.stack];
          [next[from], next[to]] = [next[to], next[from]];
          return { stack: next };
        }),
      resetStack: () => set({ stack: DEFAULT_STACK }),

      stackOpen: true,
      setStackOpen: (open) => set({ stackOpen: open }),
      assistOpen: true,
      setAssistOpen: (open) => set({ assistOpen: open }),

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
      railCollapsed: false,
      setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
      resizing: false,
      setResizing: (resizing) => set({ resizing }),

      rowGrow: {},
      setRowGrow: (a, aGrow, b, bGrow) =>
        set((state) => ({ rowGrow: { ...state.rowGrow, [a]: aGrow, [b]: bGrow } })),

      resetLayout: () =>
        set({
          stack: DEFAULT_STACK,
          stackOpen: true,
          assistOpen: true,
          columnWidths: {},
          rowGrow: {},
          railCollapsed: false,
          draggingPanel: null,
        }),

      walletSheetOpen: false,
      setWalletSheetOpen: (open) => set({ walletSheetOpen: open }),

      rightDrawerOpen: false,
      setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
      leftSheetOpen: false,
      setLeftSheetOpen: (open) => set({ leftSheetOpen: open }),
      navSheetOpen: false,
      setNavSheetOpen: (open) => set({ navSheetOpen: open }),
      mobilePanel: null,
      setMobilePanel: (panel) => set({ mobilePanel: panel }),
      closeCollapsedSurfaces: () =>
        set({
          rightDrawerOpen: false,
          leftSheetOpen: false,
          navSheetOpen: false,
          mobilePanel: null,
        }),
    }),
    {
      name: "elyra-terminal",
      storage: createJSONStorage(() => localStorage),
      /* ---------------------------------------------------------------------
         Why this has a version now.

         `stack` is persisted, so it is read from localStorage in preference to
         DEFAULT_STACK on every visit an operator has ever made. Adding a panel
         to that default therefore reaches nobody who has already used the app
         — which is everybody whose workspace is worth preserving. The signals
         panel shipped, was reachable only by dragging it out of the palette,
         and so was never seen.

         The migration below adds it once. It does not reorder, remove or
         reset anything: an arrangement is the operator's, and a new component
         appearing in it is the most this may do on their behalf. Someone who
         then drags it out keeps it out — `stack` is written back without it,
         and `version` has already advanced, so this never runs again.
      --------------------------------------------------------------------- */
      version: 1,
      migrate: (persisted: unknown, from: number) => {
        const state = persisted as { stack?: PanelKey[] } | null;
        if (state === null || from >= 1) return state;
        if (!Array.isArray(state.stack)) return state;
        if (state.stack.includes("signals")) return state;
        /* Below the watchlist if there is one, so the market column keeps its
           shape and the new panel is not the first thing that moved. */
        const after = state.stack.indexOf("watchlist");
        const stack = [...state.stack];
        stack.splice(after === -1 ? stack.length : after + 1, 0, "signals");
        return { ...state, stack };
      },
      /* The watchlist and the selection are the user's, so they persist.
         Prices deliberately do not: a price restored from localStorage is a
         stale number wearing a live one's clothes. They come from Pyth on
         every load. */
      partialize: (state) => ({
        marketType: state.marketType,
        ledgerTab: state.ledgerTab,
        watchlist: state.watchlist,
        favorites: state.favorites,
        selectedAssetId: state.selectedAssetId,
        balancesHidden: state.balancesHidden,
        /* The composed column is the operator's own arrangement, so it comes
           back on the next visit. paletteOpen does not: edit mode is a thing
           you are doing now, not a preference. */
        stack: state.stack,
        /* Same reasoning for the rest of the arrangement: which columns are
           open, how wide they were dragged, and how the rows inside them were
           split are all decisions about this workspace, not about this visit. */
        stackOpen: state.stackOpen,
        assistOpen: state.assistOpen,
        columnWidths: state.columnWidths,
        rowGrow: state.rowGrow,
        railCollapsed: state.railCollapsed,
      }),
      /* Rehydrate after mount so the server and the first client render agree. */
      skipHydration: true,
    },
  ),
);

/* ---------------------------------------------------------------------------
   Selectors
--------------------------------------------------------------------------- */

/** Stable id for a chat message created at runtime. */
let messageCounter = 0;
export function nextMessageId(prefix = "msg"): string {
  messageCounter += 1;
  return `${prefix}-runtime-${messageCounter}`;
}

/** Runtime messages carry the mock reference time, so "just now" is honest. */
export function nowIso(): string {
  return new Date(MOCK_NOW).toISOString();
}
