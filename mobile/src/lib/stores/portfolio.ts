import { useMemo } from "react";
import type { PortfolioResponse, PortfolioSnapshot } from "@/lib/portfolio/types";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The account's portfolio across every venue — the app's usePortfolio
   (lib/portfolio/usePortfolio.ts on the website), from /api/portfolio.

   For now it feeds "Your exposure" on an asset screen; the Portfolio
   screens read it when they are built. A failed read keeps the last good
   snapshot, labelled stale — never an empty portfolio.
--------------------------------------------------------------------------- */

const portfolioStore = createAccountStore<PortfolioSnapshot>({
  pollMs: 60_000,
  retryMs: 120_000,
  async load(signal) {
    const body = await api.get<PortfolioResponse>("/api/portfolio", { signal, timeoutMs: 30_000 });
    if (body.portfolio === null) throw new ApiError(body.error ?? "The portfolio could not be read.", 200, body.unconfigured, body);
    return body.portfolio;
  },
});

export interface PortfolioFeed extends Omit<AccountFeed<PortfolioSnapshot>, "data"> {
  snapshot: PortfolioSnapshot | null;
}

export function usePortfolio(): PortfolioFeed {
  const feed = portfolioStore.useFeed();
  return useMemo(() => ({ ...feed, snapshot: feed.data }), [feed]);
}

/** Reads the portfolio again now — a connection has just changed what it covers. */
export function refreshPortfolio(): Promise<void> {
  return portfolioStore.refresh();
}
