"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ASSETS,
  ASSETS_BY_SYMBOL,
  DEFAULT_FAVORITES,
  DEFAULT_WATCHLIST,
} from "@/lib/mock/assets";
import { CHAT_SEED } from "@/lib/mock/chat";
import { MOCK_NOW } from "@/lib/format";
import type {
  Asset,
  ChatMessage,
  Interval,
  LedgerTab,
  MarketType,
} from "@/lib/types";

/** The panels the stacked layout reaches through its bottom bar. */
export type MobilePanel = "activity" | "watchlist" | "signals" | "chat" | null;

/** Everything about a price that the feed moves. */
export interface LivePrice {
  price: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  markPrice: number;
  /** Direction of the last tick — drives the 400ms flash. */
  direction: "up" | "down" | "flat";
  /** Increments every tick so a repeated direction still re-triggers the flash. */
  seq: number;
}

function seedPrices(): Record<string, LivePrice> {
  return Object.fromEntries(
    ASSETS.map((asset) => [
      asset.symbol,
      {
        price: asset.price,
        change24hPct: asset.change24hPct,
        high24h: asset.high24h,
        low24h: asset.low24h,
        markPrice: asset.markPrice,
        direction: "flat" as const,
        seq: 0,
      },
    ]),
  );
}

/** Price 24h ago, held fixed so the delta stays coherent as price walks. */
const BASE_24H: Record<string, number> = Object.fromEntries(
  ASSETS.map((asset) => [asset.symbol, asset.price / (1 + asset.change24hPct / 100)]),
);

interface ElyraState {
  /* ---- the spine ---- */
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  /* ---- ledger controls (persisted) ---- */
  marketType: MarketType;
  setMarketType: (market: MarketType) => void;
  ledgerTab: LedgerTab;
  setLedgerTab: (tab: LedgerTab) => void;

  /* ---- chart ---- */
  interval: Interval;
  setInterval: (interval: Interval) => void;

  /* ---- watchlist ---- */
  watchlist: string[];
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  favorites: string[];
  toggleFavorite: (symbol: string) => void;

  /* ---- live prices ---- */
  prices: Record<string, LivePrice>;
  tick: () => void;

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
      selectedSymbol: "SOL",
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

      marketType: "perps",
      setMarketType: (market) => set({ marketType: market }),
      ledgerTab: "positions",
      setLedgerTab: (tab) => set({ ledgerTab: tab }),

      interval: "1H",
      setInterval: (interval) => set({ interval }),

      watchlist: DEFAULT_WATCHLIST,
      addToWatchlist: (symbol) =>
        set((state) =>
          state.watchlist.includes(symbol)
            ? state
            : { watchlist: [...state.watchlist, symbol] },
        ),
      removeFromWatchlist: (symbol) =>
        set((state) => ({
          watchlist: state.watchlist.filter((entry) => entry !== symbol),
        })),
      favorites: DEFAULT_FAVORITES,
      toggleFavorite: (symbol) =>
        set((state) => ({
          favorites: state.favorites.includes(symbol)
            ? state.favorites.filter((entry) => entry !== symbol)
            : [...state.favorites, symbol],
        })),

      prices: seedPrices(),
      tick: () =>
        set((state) => {
          const next: Record<string, LivePrice> = {};
          for (const symbol of Object.keys(state.prices)) {
            const current = state.prices[symbol];
            const asset = ASSETS_BY_SYMBOL[symbol];
            if (!asset) {
              next[symbol] = current;
              continue;
            }
            const drift = (Math.random() * 2 - 1) * asset.volatility;
            const price = current.price * (1 + drift);
            const base = BASE_24H[symbol] ?? current.price;
            next[symbol] = {
              price,
              change24hPct: (price / base - 1) * 100,
              high24h: Math.max(current.high24h, price),
              low24h: Math.min(current.low24h, price),
              markPrice: price * (1 + asset.volatility * 0.08),
              direction:
                price > current.price ? "up" : price < current.price ? "down" : "flat",
              seq: current.seq + 1,
            };
          }
          return { prices: next };
        }),

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
      /* Only these two persist. Everything else is session state. */
      partialize: (state) => ({
        marketType: state.marketType,
        ledgerTab: state.ledgerTab,
      }),
      /* Rehydrate after mount so the server and the first client render agree. */
      skipHydration: true,
    },
  ),
);

/* ---------------------------------------------------------------------------
   The single price feed. One interval for the whole app, reference counted so
   remounting a panel never starts a second one.
--------------------------------------------------------------------------- */

const TICK_MS = 3_000;
let feedTimer: ReturnType<typeof setInterval> | null = null;
let feedSubscribers = 0;

export function startPriceFeed(): () => void {
  if (typeof window === "undefined") return () => {};
  feedSubscribers += 1;
  if (!feedTimer) {
    feedTimer = setInterval(() => useElyraStore.getState().tick(), TICK_MS);
  }
  return () => {
    feedSubscribers -= 1;
    if (feedSubscribers <= 0 && feedTimer) {
      clearInterval(feedTimer);
      feedTimer = null;
      feedSubscribers = 0;
    }
  };
}

/* ---------------------------------------------------------------------------
   Selectors
--------------------------------------------------------------------------- */

/** Static asset facts merged with whatever the feed has done to the price. */
export function useLiveAsset(symbol: string): Asset {
  const live = useElyraStore((state) => state.prices[symbol]);
  const asset = ASSETS_BY_SYMBOL[symbol];
  if (!asset) {
    throw new Error(`Unknown asset: ${symbol}`);
  }
  if (!live) return asset;
  return {
    ...asset,
    price: live.price,
    change24hPct: live.change24hPct,
    high24h: live.high24h,
    low24h: live.low24h,
    markPrice: live.markPrice,
  };
}

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
