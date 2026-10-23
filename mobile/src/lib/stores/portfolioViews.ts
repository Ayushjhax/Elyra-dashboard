import { useMemo } from "react";
import type { HistoryRange, HistoryResponse } from "@/lib/portfolio/types";
import { isViewFailure, type AppViewName, type AppViewResponse, type DefiView, type FillsView, type OrdersView, type RiskView } from "@/lib/portfolio/views";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, type AccountFeed, type AccountStore } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The portfolio's other reads, on the shared account store helper — one
   store per history range and per detail view, created the first time a
   screen asks, so each is one request however many screens read it and
   nothing polls once no screen does.

   HISTORY is /api/portfolio/history: the series and which source produced
   it (recorded snapshots, or rebuilt from candles). A chart that redrew
   every few seconds under a finger would be worse than one a few minutes
   stale; the overview's own figure is live.

   VIEWS are /api/app/views — the agent's own tools, so Risk, DeFi, Orders
   and Fills mean what they mean to the assistant and the chat. A tool that
   could not read answers with `error`; that is a failure with its reason,
   never an empty list.
--------------------------------------------------------------------------- */

const historyStores = new Map<HistoryRange, AccountStore<HistoryResponse>>();

function historyStore(range: HistoryRange): AccountStore<HistoryResponse> {
  let store = historyStores.get(range);
  if (store === undefined) {
    store = createAccountStore<HistoryResponse>({
      pollMs: 5 * 60_000,
      retryMs: 5 * 60_000,
      async load(signal) {
        const body = await api.get<HistoryResponse>(`/api/portfolio/history?range=${range}`, { signal, timeoutMs: 30_000 });
        if (body.error !== null && body.points.length === 0) throw new ApiError(body.error, 200, false, body);
        return body;
      },
    });
    historyStores.set(range, store);
  }
  return store;
}

export interface HistoryFeed extends Omit<AccountFeed<HistoryResponse>, "data"> {
  history: HistoryResponse | null;
  /** The finite values, oldest first. */
  values: number[];
}

export function usePortfolioHistory(range: HistoryRange): HistoryFeed {
  const feed = historyStore(range).useFeed();
  return useMemo(() => {
    const history = feed.data;
    const values = (history?.points ?? []).map((point) => point.totalValueUsd).filter(Number.isFinite);
    return { ...feed, history, values };
  }, [feed]);
}

/* ---- the detail views ---- */

interface ViewTypes {
  risk: RiskView;
  defi: DefiView;
  orders: OrdersView;
  fills: FillsView;
}

const viewStores = new Map<AppViewName, AccountStore<unknown>>();

function viewStore<V extends AppViewName>(view: V): AccountStore<ViewTypes[V]> {
  let store = viewStores.get(view);
  if (store === undefined) {
    store = createAccountStore<ViewTypes[V]>({
      pollMs: 60_000,
      retryMs: 120_000,
      async load(signal) {
        const body = await api.get<AppViewResponse<ViewTypes[V]>>(`/api/app/views?view=${view}`, { signal, timeoutMs: 30_000 });
        if (isViewFailure(body.data)) throw new ApiError(body.data.error, 200, false, body);
        return body.data;
      },
    }) as AccountStore<unknown>;
    viewStores.set(view, store);
  }
  return store as AccountStore<ViewTypes[V]>;
}

export function useAppView<V extends AppViewName>(view: V): AccountFeed<ViewTypes[V]> {
  return viewStore(view).useFeed();
}
