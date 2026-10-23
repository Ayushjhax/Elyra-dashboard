import { useMemo } from "react";
import type { ActivityResponse, WalletActivity } from "@/lib/wallet/types";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The wallet's recent transactions — the app's useWalletActivity
   (lib/wallet/useWalletActivity.ts on the website). One read, sized for the
   longest list any screen shows; each caller takes its own slice.

   Slower than balances: a transaction list changes only when you transact.
   A failed read keeps the last good list, as the website does.
--------------------------------------------------------------------------- */

const FETCH_LIMIT = 25;

const activityStore = createAccountStore<WalletActivity[]>({
  pollMs: 60_000,
  retryMs: 120_000,
  async load(signal) {
    const body = await api.get<ActivityResponse>(`/api/wallet/activity?limit=${FETCH_LIMIT}`, { signal });
    if (body.error !== null) throw new ApiError(body.error, 200, body.unconfigured, body);
    return body.items;
  },
});

export interface ActivityFeed extends Omit<AccountFeed<WalletActivity[]>, "data"> {
  items: WalletActivity[];
}

export function useWalletActivity(limit = 20): ActivityFeed {
  const feed = activityStore.useFeed();
  return useMemo(() => ({ ...feed, items: (feed.data ?? []).slice(0, limit) }), [feed, limit]);
}

export const refetchActivity = activityStore.refetch;
