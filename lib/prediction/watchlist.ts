import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import type { WatchedMarket } from "@/lib/prediction/api";

/* ---------------------------------------------------------------------------
   The prediction markets a person keeps an eye on (`prediction_watchlist`).

   The table was laid down with the prediction signals (migration 0011); this
   is its first reader and writer. A market is stored with its question and
   first outcome's token so the list can be shown without re-reading the
   venue for each row.

   Tenancy: `serviceClient()` bypasses RLS, so `.eq("user_id", …)` is the
   boundary. A read that fails returns null — "could not be read" is never
   passed off as an empty list.
--------------------------------------------------------------------------- */

const LIMIT = 100;

export async function listWatchedMarkets(userId: string): Promise<WatchedMarket[] | null> {
  const { data, error } = await serviceClient()
    .from("prediction_watchlist")
    .select("market_id, token_id, market_question, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .limit(LIMIT);
  if (error !== null || data === null) return null;
  return data.map((row) => ({
    marketId: row.market_id,
    tokenId: row.token_id,
    question: row.market_question,
    addedAt: row.added_at,
  }));
}

/** Adds a market, or refreshes its question if it is already watched. */
export async function watchMarket(input: {
  userId: string;
  marketId: string;
  tokenId: string | null;
  question: string | null;
}): Promise<boolean> {
  const { error } = await serviceClient()
    .from("prediction_watchlist")
    .upsert(
      { user_id: input.userId, market_id: input.marketId, token_id: input.tokenId, market_question: input.question },
      { onConflict: "user_id,market_id" },
    );
  return error === null;
}

export async function unwatchMarket(userId: string, marketId: string): Promise<boolean> {
  const { error } = await serviceClient().from("prediction_watchlist").delete().eq("user_id", userId).eq("market_id", marketId);
  return error === null;
}
