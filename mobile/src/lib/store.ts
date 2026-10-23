import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChartIndicators, ChartStyle, ChatMessage, Interval, MarketFilter } from "@/lib/types";
import type { ComposerAttachment } from "@/lib/attachments";
import { DEFAULT_ASSET_ID } from "@/lib/market/defaults";

/* ---------------------------------------------------------------------------
   The app's own state — ported from the website's lib/store.ts, with only
   what the app needs.

   Persisted (AsyncStorage): preferences a person would be annoyed to lose —
   the selected market, the chart's settings, whether balances are hidden,
   which agent tab was open, when notifications were last seen.

   Never persisted: tokens (Privy keeps its own session in secure storage),
   the agent conversation, the draft's attachments. A conversation is that
   session's; a file's bytes do not belong on disk.

   Rehydrated after the first render (skipHydration), as on the website, so
   the first frame and the restored state cannot disagree mid-render.
--------------------------------------------------------------------------- */

/** The Elyra tab's header tabs: the chat, Elyra's signals, and the actions
    awaiting review. */
export type ElyraTab = "ask" | "signals" | "actions";

const ELYRA_TABS: readonly ElyraTab[] = ["ask", "signals", "actions"];

export interface AppState {
  /* ---- markets (persisted) ---- */
  selectedAssetId: number;
  setSelectedAssetId: (id: number) => void;
  marketType: MarketFilter;
  setMarketType: (market: MarketFilter) => void;
  /** Starred markets, by symbol. On this phone only: the watchlist itself is
      the account's (/api/watchlist), but the server keeps no favourites. */
  favorites: string[];
  toggleFavorite: (symbol: string) => void;
  /** The last few markets opened from search, newest first. */
  recentSearches: { id: number; symbol: string }[];
  addRecentSearch: (entry: { id: number; symbol: string }) => void;
  clearRecentSearches: () => void;
  /** Whether the asset screen's decision brief is open. */
  decisionBriefOpen: boolean;
  setDecisionBriefOpen: (open: boolean) => void;

  /* ---- chart (persisted) ---- */
  interval: Interval;
  setInterval: (interval: Interval) => void;
  chartStyle: ChartStyle;
  setChartStyle: (style: ChartStyle) => void;
  chartIndicators: ChartIndicators;
  setChartIndicators: (indicators: ChartIndicators) => void;
  /** TradingView's own drawing tools, shown in the chart. */
  chartDrawing: boolean;
  setChartDrawing: (on: boolean) => void;

  /* ---- privacy (persisted) ---- */
  balancesHidden: boolean;
  setBalancesHidden: (hidden: boolean) => void;

  /* ---- the agent (only the tab is persisted) ---- */
  agentTab: ElyraTab;
  setAgentTab: (tab: ElyraTab) => void;
  messages: ChatMessage[];
  appendMessage: (message: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  agentPending: boolean;
  setAgentPending: (pending: boolean) => void;
  streamingId: string | null;
  setStreamingId: (id: string | null) => void;
  composerDraft: string;
  setComposerDraft: (value: string) => void;
  composerAttachments: ComposerAttachment[];
  addComposerAttachments: (files: ComposerAttachment[]) => void;
  removeComposerAttachment: (id: string) => void;
  clearComposerAttachments: () => void;
  /** Ends the conversation: the account it belonged to has gone. */
  clearConversation: () => void;

  /* ---- signing (persisted) ---- */
  /** Ask for fingerprint or face before every signature. On by default. */
  requireAuthToSign: boolean;
  setRequireAuthToSign: (on: boolean) => void;

  /* ---- notifications (persisted) ---- */
  notificationsSeenAt: string | null;
  setNotificationsSeenAt: (at: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedAssetId: DEFAULT_ASSET_ID,
      setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
      marketType: "all",
      setMarketType: (marketType) => set({ marketType }),
      favorites: [],
      toggleFavorite: (symbol) =>
        set((state) => ({
          favorites: state.favorites.includes(symbol)
            ? state.favorites.filter((entry) => entry !== symbol)
            : [...state.favorites, symbol],
        })),
      recentSearches: [],
      addRecentSearch: (entry) =>
        set((state) => ({
          recentSearches: [entry, ...state.recentSearches.filter((item) => item.id !== entry.id)].slice(0, 8),
        })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      decisionBriefOpen: true,
      setDecisionBriefOpen: (decisionBriefOpen) => set({ decisionBriefOpen }),

      interval: "1H",
      setInterval: (interval) => set({ interval }),
      chartStyle: "candles",
      setChartStyle: (chartStyle) => set({ chartStyle }),
      chartIndicators: { ema: true, volume: true, levels: true },
      setChartIndicators: (chartIndicators) => set({ chartIndicators }),
      chartDrawing: false,
      setChartDrawing: (chartDrawing) => set({ chartDrawing }),

      balancesHidden: false,
      setBalancesHidden: (balancesHidden) => set({ balancesHidden }),

      agentTab: "ask",
      setAgentTab: (agentTab) => set({ agentTab }),
      messages: [],
      appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      patchMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)),
        })),
      agentPending: false,
      setAgentPending: (agentPending) => set({ agentPending }),
      streamingId: null,
      setStreamingId: (streamingId) => set({ streamingId }),
      composerDraft: "",
      setComposerDraft: (composerDraft) => set({ composerDraft }),
      composerAttachments: [],
      addComposerAttachments: (files) =>
        set((state) => ({ composerAttachments: [...state.composerAttachments, ...files] })),
      removeComposerAttachment: (id) =>
        set((state) => ({ composerAttachments: state.composerAttachments.filter((file) => file.id !== id) })),
      clearComposerAttachments: () => set({ composerAttachments: [] }),
      clearConversation: () =>
        set({ messages: [], agentPending: false, streamingId: null, composerDraft: "", composerAttachments: [] }),

      requireAuthToSign: true,
      setRequireAuthToSign: (requireAuthToSign) => set({ requireAuthToSign }),

      notificationsSeenAt: null,
      setNotificationsSeenAt: (notificationsSeenAt) => set({ notificationsSeenAt }),
    }),
    {
      name: "elyra-app",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedAssetId: state.selectedAssetId,
        marketType: state.marketType,
        favorites: state.favorites,
        recentSearches: state.recentSearches,
        decisionBriefOpen: state.decisionBriefOpen,
        chartDrawing: state.chartDrawing,
        interval: state.interval,
        chartStyle: state.chartStyle,
        chartIndicators: state.chartIndicators,
        balancesHidden: state.balancesHidden,
        agentTab: state.agentTab,
        notificationsSeenAt: state.notificationsSeenAt,
        requireAuthToSign: state.requireAuthToSign,
      }),
      skipHydration: true,
      /* A tab this build no longer has opens the chat. */
      merge: (persisted, current) => {
        const restored = { ...current, ...(persisted as Partial<AppState>) };
        return ELYRA_TABS.includes(restored.agentTab) ? restored : { ...restored, agentTab: "ask" };
      },
    },
  ),
);

/** Whether figures are masked — read by every money primitive. */
export function useBalancesHidden(): boolean {
  return useAppStore((state) => state.balancesHidden);
}
