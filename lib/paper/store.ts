import "server-only";

import { midsFor } from "@/lib/autotrade/hyperliquid";
import { num, tablesMissing } from "@/lib/autotrade/store";
import { PAPER_STARTING_USD, paperFunds, paperRefusal, type PaperFunds } from "@/lib/paper/funds";
import type { PaperAccountView } from "@/lib/paper/types";
import { serviceClient } from "@/lib/supabase/server";
import type { PaperAccountRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The paper account, stored (migration 0032). Every read and write is
   scoped by user_id.

   Its balance is computed here from the account's own paper positions and
   resting paper orders since it started (lib/paper/funds.ts), marked to
   Hyperliquid's mainnet mids — the prices every paper fill uses. An AI
   fund's paper positions are the fund's (0025), so they are left out.
--------------------------------------------------------------------------- */

export const PAPER_MIGRATION_NOTE = "The paper account needs database migration 0032, which has not been applied.";

export async function readPaperRow(userId: string): Promise<PaperAccountRow | null> {
  const { data, error } = await serviceClient().from("paper_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error !== null) {
    if (tablesMissing(error) || /paper_accounts/.test(error.message ?? "")) return null;
    throw new Error(error.message);
  }
  return data ?? null;
}

/**
 * The account, made with $100,000 if it does not exist yet. A paper trade
 * placed before anyone claimed one — a paper rule that has been running —
 * makes it, so every paper trade from now on belongs to an account.
 */
export async function ensurePaperAccount(userId: string): Promise<PaperAccountRow | null> {
  const existing = await readPaperRow(userId);
  if (existing !== null) return existing;
  const { error } = await serviceClient()
    .from("paper_accounts")
    .upsert({ user_id: userId, starting_usd: PAPER_STARTING_USD, active: false }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error !== null) return null;
  return readPaperRow(userId);
}

type Marks = (coins: readonly string[]) => Promise<ReadonlyMap<string, number>>;
const mainnetMarks: Marks = (coins) => (coins.length === 0 ? Promise.resolve(new Map()) : midsFor("mainnet", coins));

/** The account's money now: balance, equity, margin in use and what is available. */
export async function paperFundsFor(row: PaperAccountRow, marks: Marks = mainnetMarks): Promise<PaperFunds> {
  const db = serviceClient();
  const [positionsRead, ordersRead] = await Promise.all([
    db
      .from("trading_positions")
      .select("coin, side, size, entry_price, leverage, status, realised_pnl_usd, realised_partial_usd")
      .eq("user_id", row.user_id)
      .eq("mode", "paper")
      .is("fund_id", null)
      .in("status", ["open", "closed"])
      .gte("opened_at", row.started_at)
      .limit(10_000),
    db.from("trading_orders").select("size_usd, leverage").eq("user_id", row.user_id).eq("mode", "paper").eq("status", "open").gte("created_at", row.started_at),
  ]);
  if (positionsRead.error !== null) throw new Error("Paper positions could not be read.");
  const rows = positionsRead.data ?? [];
  const open = rows
    .filter((entry) => entry.status === "open")
    .map((entry) => ({
      coin: entry.coin,
      side: entry.side === "short" ? ("short" as const) : ("long" as const),
      size: num(entry.size),
      entryPrice: num(entry.entry_price),
      leverage: entry.leverage,
      realisedPartialUsd: Number(entry.realised_partial_usd ?? 0) || 0,
    }));
  return paperFunds({
    startingUsd: num(row.starting_usd),
    closed: rows.filter((entry) => entry.status === "closed").map((entry) => num(entry.realised_pnl_usd)),
    open,
    /* Before migration 0020 there are no limit orders to hold margin. */
    orders: ordersRead.error === null ? (ordersRead.data ?? []).map((entry) => ({ sizeUsd: num(entry.size_usd), leverage: entry.leverage })) : [],
    marks: await marks([...new Set(open.map((position) => position.coin))]).catch(() => new Map()),
  });
}

/**
 * Null when the paper account can put up `marginUsd` for one more order;
 * otherwise why not, in words. Makes the account if there is none, so a
 * paper order always lands in one. Without migration 0032 it lets the order
 * through, as paper trading worked before there was an account.
 */
export async function paperGate(userId: string, marginUsd: number, marks?: Marks): Promise<string | null> {
  const row = await ensurePaperAccount(userId);
  if (row === null) return null;
  return paperRefusal(await paperFundsFor(row, marks), marginUsd);
}

export async function paperView(userId: string): Promise<PaperAccountView | null> {
  const row = await readPaperRow(userId);
  if (row === null) return null;
  return {
    startingUsd: num(row.starting_usd),
    startedAt: row.started_at,
    active: row.active,
    resets: row.resets,
    funds: await paperFundsFor(row),
  };
}
