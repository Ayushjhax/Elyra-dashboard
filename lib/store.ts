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
import type {
  ChatMessage,
  Interval,
  LedgerTab,
  MarketType,
} from "@/lib/types";

/** The panels the stacked layout reaches through its bottom bar. */
export type MobilePanel = "activity" | "watchlist" | "signals" | "chat" | null;

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
