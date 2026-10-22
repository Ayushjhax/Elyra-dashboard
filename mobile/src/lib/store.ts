import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentTab, ChartIndicators, ChartStyle, ChatMessage, Interval, MarketFilter } from "@/lib/types";
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

export interface AppState {
  /* ---- markets (persisted) ---- */
  selectedAssetId: number;
  setSelectedAssetId: (id: number) => void;
  marketType: MarketFilter;
  setMarketType: (market: MarketFilter) => void;

  /* ---- chart (persisted) ---- */
  interval: Interval;
  setInterval: (interval: Interval) => void;
  chartStyle: ChartStyle;
  setChartStyle: (style: ChartStyle) => void;
  chartIndicators: ChartIndicators;
  setChartIndicators: (indicators: ChartIndicators) => void;

  /* ---- privacy (persisted) ---- */
  balancesHidden: boolean;
  setBalancesHidden: (hidden: boolean) => void;

  /* ---- the agent (only the tab is persisted) ---- */
  agentTab: AgentTab;
  setAgentTab: (tab: AgentTab) => void;
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

      interval: "1H",
      setInterval: (interval) => set({ interval }),
      chartStyle: "candles",
      setChartStyle: (chartStyle) => set({ chartStyle }),
      chartIndicators: { ema: true, volume: true, levels: true },
      setChartIndicators: (chartIndicators) => set({ chartIndicators }),

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
        interval: state.interval,
        chartStyle: state.chartStyle,
        chartIndicators: state.chartIndicators,
        balancesHidden: state.balancesHidden,
        agentTab: state.agentTab,
        notificationsSeenAt: state.notificationsSeenAt,
        requireAuthToSign: state.requireAuthToSign,
      }),
      skipHydration: true,
    },
  ),
);

/** Whether figures are masked — read by every money primitive. */
export function useBalancesHidden(): boolean {
  return useAppStore((state) => state.balancesHidden);
}
