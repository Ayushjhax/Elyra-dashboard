import { useMemo, useSyncExternalStore } from "react";
import { CLUSTER_LABEL, EXPECTED_CLUSTER, type Cluster } from "@/lib/solana/cluster";
import type { WalletResponse, WalletSnapshot } from "@/lib/wallet/types";
import type { WalletReadState } from "@/lib/wallet/status";
import { api, ApiError } from "~/lib/api";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { createAccountStore, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The signed-in account's wallet, as /api/wallet reads it — the app's
   useWalletDashboard (lib/wallet/useWalletDashboard.ts on the website). One
   read however many screens show it: the header's identicon, the account
   sheet and the wallet sheet all read this store.

   A read the API could not complete is a failure with the server's reason,
   never an empty wallet; an earlier good reading stays on screen, labelled
   stale.
--------------------------------------------------------------------------- */

const POLL_MS = 30_000;

interface WalletRead {
  snapshot: WalletSnapshot;
  latencyMs: number | null;
}

/* The RPC round trip of the last read, good or failed — the web shows the
   latest either way. Module state, reset with the account. */
let lastLatency: number | null = null;

const walletStore = createAccountStore<WalletRead>({
  pollMs: POLL_MS,
  retryMs: 60_000,
  onReset: () => {
    lastLatency = null;
  },
  async load(signal) {
    const body = await api.get<WalletResponse>("/api/wallet", { signal });
    lastLatency = body.latencyMs;
    if (body.wallet === null) {
      throw new ApiError(body.error ?? "Wallet unavailable", 200, body.unconfigured, body);
    }
    return { snapshot: body.wallet, latencyMs: body.latencyMs };
  },
});

export interface WalletDashboard extends Omit<AccountFeed<WalletRead>, "data">, WalletReadState {
  /** Native SOL. Null until a reading lands. */
  balance: number | null;
  /** SOL plus every verified, priced token. Null when not computable. */
  usdValue: number | null;
  /** "Solana mainnet" — from the node's genesis hash, or the expected one before a read. */
  chain: string;
  cluster: Cluster | null;
  snapshot: WalletSnapshot | null;
  latencyMs: number | null;
}

/* ---- development builds only: every state of the total, on demand ----

   A failed or stale read is hard to produce on purpose against a healthy
   RPC, and it is exactly the state that has to be right. The /dev screen
   switches the wallet into each one so it can be checked and screenshotted;
   a release build ignores the switch. Every figure a preview shows is the
   account's own reading or none — the preview changes the read's outcome,
   not the balances. */

export type WalletPreview = "loading" | "failed" | "stale" | "zero" | "partial" | "unpriced";

let preview: WalletPreview | null = null;
const previewListeners = new Set<() => void>();

export function setWalletPreview(next: WalletPreview | null): void {
  if (!__DEV__) return;
  preview = next;
  for (const listener of [...previewListeners]) listener();
}

function subscribePreview(listener: () => void): () => void {
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

export function useWalletPreview(): WalletPreview | null {
  return useSyncExternalStore(subscribePreview, () => preview);
}

const PREVIEW_ERROR = "Dev preview: the wallet read failed.";

function previewed(dashboard: WalletDashboard, mode: WalletPreview | null): WalletDashboard {
  if (!__DEV__ || mode === null) return dashboard;
  const snapshot = dashboard.snapshot;
  switch (mode) {
    case "loading":
      return { ...dashboard, snapshot: null, balance: null, usdValue: null, isLoading: true, loading: true, error: null, stale: false };
    case "failed":
      return { ...dashboard, snapshot: null, balance: null, usdValue: null, isLoading: false, loading: false, error: PREVIEW_ERROR, stale: false, fetchedAt: null };
    case "stale":
      if (snapshot === null) return dashboard;
      return { ...dashboard, stale: true, error: PREVIEW_ERROR, fetchedAt: Date.now() - 4 * 60_000 };
    case "zero":
      if (snapshot === null) return dashboard;
      return {
        ...dashboard,
        balance: 0,
        usdValue: 0,
        snapshot: { ...snapshot, sol: 0, lamports: 0, tokens: [], tokenCount: 0, usdValue: 0, uncounted: { unpriced: 0, unverified: 0 } },
      };
    case "partial":
      if (snapshot === null) return dashboard;
      return {
        ...dashboard,
        snapshot: {
          ...snapshot,
          tokens: snapshot.tokens.map((token, index) => (index === 0 ? { ...token, verified: false, usdValue: null } : token)),
          uncounted: { ...snapshot.uncounted, unverified: snapshot.uncounted.unverified + (snapshot.tokens.length > 0 ? 1 : 0) },
        },
      };
    case "unpriced":
      if (snapshot === null) return dashboard;
      return { ...dashboard, usdValue: null, snapshot: { ...snapshot, solUsd: null, usdValue: null } };
  }
}

export function useWalletDashboard(): WalletDashboard {
  const auth = useElyraAuth();
  const feed = walletStore.useFeed();
  const mode = useWalletPreview();
  return useMemo(() => previewed(base(feed, auth.solanaAddress), mode), [feed, auth.solanaAddress, mode]);
}

function base(feed: AccountFeed<WalletRead>, solanaAddress: string | null): WalletDashboard {
  const snapshot = feed.data?.snapshot ?? null;
  const cluster = snapshot?.cluster ?? null;
  return {
    ...feed,
    /* The session's address is known before any balance is, so a screen
       can say whose wallet it is reading while the number loads. */
    address: snapshot?.address ?? solanaAddress,
    balance: snapshot?.sol ?? null,
    usdValue: snapshot?.usdValue ?? null,
    chain: CLUSTER_LABEL[cluster ?? EXPECTED_CLUSTER],
    cluster,
    snapshot,
    latencyMs: feed.data?.latencyMs ?? lastLatency,
    isLoading: feed.loading,
    wrongChain: cluster !== null && cluster !== EXPECTED_CLUSTER,
  };
}

export const refetchWallet = walletStore.refetch;
