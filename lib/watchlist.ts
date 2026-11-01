import "server-only";

import { normaliseSymbol } from "@/lib/agent/tools/args";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   The server-side watchlist — the Android app's list, the one the agent's
   get_watchlist reads, and the one large-move notifications watch.

   Symbols are normalised the way the agent normalises them ("sol-perp" and
   "SOLUSDT" are both SOL), so a symbol added in the app and one asked about
   in chat are the same row. Capped, so a client loop cannot grow a list the
   delivery pass then has to price every five minutes.
--------------------------------------------------------------------------- */

export const WATCHLIST_MAX = 50;

/** What a new account's list starts with: Solana, Jupiter and Hyperliquid. */
export const DEFAULT_WATCHLIST_SYMBOLS = ["SOL", "JUP", "HYPE"] as const;
const SYMBOL = /^[A-Z0-9]{1,12}$/;

/** The symbol as stored, or null when it cannot be one. */
export function watchlistSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = normaliseSymbol(raw);
  return SYMBOL.test(symbol) ? symbol : null;
}

interface Row {
  symbol: string;
  position: number | null;
  added_at: string;
}

/** In the person's order; rows from before ordering existed sort by when they were added. */
function ordered(rows: Row[]): string[] {
  return [...rows]
    .sort((a, b) =>
      a.position !== null && b.position !== null
        ? a.position - b.position
        : a.position !== null
          ? -1
          : b.position !== null
            ? 1
            : a.added_at.localeCompare(b.added_at),
    )
    .map((row) => row.symbol);
}

export async function readWatchlist(userId: string): Promise<string[] | null> {
  const { data, error } = await serviceClient()
    .from("watchlist")
    .select("symbol, position, added_at")
    .eq("user_id", userId)
    .limit(WATCHLIST_MAX * 2);
  if (error) return null;
  return ordered((data ?? []) as Row[]);
}

/**
 * Starts a new account's list with DEFAULT_WATCHLIST_SYMBOLS. Called once,
 * when the account's profile is created — never on a read — so a person who
 * empties their list keeps it empty. Never throws: a list that could not be
 * seeded is only an empty one, which the person can fill.
 */
export async function seedWatchlist(userId: string): Promise<void> {
  try {
    await serviceClient()
      .from("watchlist")
      .upsert(
        DEFAULT_WATCHLIST_SYMBOLS.map((symbol, position) => ({ user_id: userId, symbol, position })),
        { onConflict: "user_id,symbol", ignoreDuplicates: true },
      );
  } catch {
    /* Nothing to undo; see above. */
  }
}

export type WatchlistResult = { symbols: string[] } | { error: string; status: number };

const UNAVAILABLE: WatchlistResult = { error: "The watchlist could not be read.", status: 503 };

export async function addToWatchlist(userId: string, symbol: string): Promise<WatchlistResult> {
  const current = await readWatchlist(userId);
  if (current === null) return UNAVAILABLE;
  if (current.includes(symbol)) return { symbols: current };
  if (current.length >= WATCHLIST_MAX) {
    return { error: `A watchlist holds up to ${WATCHLIST_MAX} symbols. Remove one first.`, status: 400 };
  }

  const { error } = await serviceClient()
    .from("watchlist")
    .upsert({ user_id: userId, symbol, position: current.length }, { onConflict: "user_id,symbol", ignoreDuplicates: true });
  if (error) return { error: "Could not add that. Nothing was changed.", status: 503 };
  return { symbols: [...current, symbol] };
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<WatchlistResult> {
  const { error } = await serviceClient().from("watchlist").delete().eq("user_id", userId).eq("symbol", symbol);
  if (error) return { error: "Could not remove that. Nothing was changed.", status: 503 };
  const current = await readWatchlist(userId);
  return current === null ? UNAVAILABLE : { symbols: current };
}

/**
 * Puts the list in the order given. The order must name exactly the symbols
 * already on the list — a reorder never adds or drops one, so a stale screen
 * cannot resurrect a symbol removed elsewhere.
 */
export async function reorderWatchlist(userId: string, order: string[]): Promise<WatchlistResult> {
  const current = await readWatchlist(userId);
  if (current === null) return UNAVAILABLE;
  const same =
    order.length === current.length &&
    new Set(order).size === order.length &&
    order.every((symbol) => current.includes(symbol));
  if (!same) {
    return { error: "That order does not match the watchlist. Refresh and try again.", status: 409 };
  }

  for (const [position, symbol] of order.entries()) {
    const { error } = await serviceClient()
      .from("watchlist")
      .update({ position })
      .eq("user_id", userId)
      .eq("symbol", symbol);
    if (error) return { error: "Could not save that order.", status: 503 };
  }
  return { symbols: order };
}
