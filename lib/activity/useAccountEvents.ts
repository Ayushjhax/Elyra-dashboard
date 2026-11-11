"use client";

import { useMemo } from "react";
import { useOpenActions } from "@/lib/actions/useOpenActions";
import { accountEvents, type AccountEvent } from "@/lib/activity/events";
import { useAlerts } from "@/lib/alerts/useAlerts";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { txExplorerUrl } from "@/lib/solana/address";
import { useWalletActivity } from "@/lib/wallet/useWalletActivity";

/**
 * The account's activity from every shared store at once. Each store is
 * reference-counted, so the Activity widget and the bell reading this cost
 * no request beyond the ones the workspace already makes.
 */
export interface AccountFeed {
  events: AccountEvent[];
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  /** Wallet history sources that could not be read while others could. */
  notes: string[];
  /** The wallet feed's own fetch state, for refresh and "updated" labels. */
  fetchedAt: number | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

export function useAccountEvents(): AccountFeed {
  const portfolio = usePortfolio();
  const wallet = useWalletActivity(25);
  const alerts = useAlerts();
  const actions = useOpenActions();

  const events = useMemo(
    () =>
      accountEvents({
        wallet: wallet.items,
        venue: portfolio.snapshot?.activity ?? [],
        alerts: alerts.alerts,
        actions: actions.actions,
        explorer: txExplorerUrl,
        alertNote: "alert sent to Telegram",
      }),
    [wallet.items, portfolio.snapshot, alerts.alerts, actions.actions],
  );

  return {
    events,
    signedIn: portfolio.signedIn,
    loading: !portfolio.authReady || (portfolio.signedIn && wallet.isLoading && events.length === 0),
    error: wallet.error,
    notes: wallet.notes,
    fetchedAt: wallet.fetchedAt,
    refreshing: wallet.refreshing,
    refetch: wallet.refetch,
  };
}
