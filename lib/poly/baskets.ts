import "server-only";

import { randomUUID } from "node:crypto";
import { normalizeBook } from "@/lib/prediction/book";
import { estimateExecution } from "@/lib/prediction/execution";
import { polymarketBooks, polymarketOrderbook } from "@/lib/providers/polymarket";
import { serviceClient } from "@/lib/supabase/server";
import type { PolyBasketLegRow } from "@/lib/supabase/types";
import { BASKET_LIMITS, basketTotals, payoutOf, splitStake, type BasketInput } from "@/lib/poly/basketMath";
import { marketsByCondition } from "@/lib/poly/scan";
import type { BasketLegView, BasketsResponse, BasketView } from "@/lib/poly/types";

/* ---------------------------------------------------------------------------
   Poly baskets in the database, priced from Polymarket's own books.

   A leg is bought, on paper, by walking the ask side of its outcome's book
   for its share of the stake; a book that cannot absorb it refuses the
   basket rather than recording a fill that could not happen. Each read of
   the baskets values open legs by walking the bids for their shares and
   settles a leg once Gamma reports its market resolved.
--------------------------------------------------------------------------- */

const MIGRATION = "Poly baskets need their tables: run migration 0035_scout.sql.";
const missing = (code: string | undefined) => code === "42P01" || code === "PGRST205";
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

async function bookFor(tokenId: string) {
  const book = await polymarketOrderbook(tokenId);
  return book.ok && book.data !== undefined ? normalizeBook(book.data) : null;
}

export async function createBasket(userId: string, input: BasketInput): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const db = serviceClient();
  const { count, error } = await db.from("poly_baskets").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error !== null) return { ok: false, error: missing(error.code) ? MIGRATION : "Your baskets could not be read.", status: 503 };
  if ((count ?? 0) >= BASKET_LIMITS.maxBaskets) return { ok: false, error: `You can keep ${BASKET_LIMITS.maxBaskets} baskets. Delete one first.`, status: 409 };

  const markets = await marketsByCondition(input.legs.map((leg) => leg.conditionId));
  const stakes = splitStake(input.stakeUsd, input.legs.length);
  const legs: PolyBasketLegRow[] = [];
  const basketId = randomUUID();
  const now = new Date().toISOString();

  for (const [index, leg] of input.legs.entries()) {
    const market = markets.get(leg.conditionId);
    const outcomeIndex = market?.tokenIds.indexOf(leg.tokenId) ?? -1;
    if (market === undefined || outcomeIndex === -1) return { ok: false, error: `Polymarket does not list that outcome: ${leg.question || leg.outcome}.`, status: 400 };
    if (market.closed) return { ok: false, error: `That market has closed: ${market.question}.`, status: 409 };
    const book = await bookFor(leg.tokenId);
    if (book === null) return { ok: false, error: `Polymarket's order book did not answer for ${market.question}.`, status: 503 };
    const fill = estimateExecution(book, { side: "buy", notionalUsd: stakes[index] });
    if (!fill.filled || fill.averagePrice === null || fill.shares <= 0) {
      return { ok: false, error: `The book for "${market.question}" cannot fill $${stakes[index]} right now. Use a smaller stake.`, status: 409 };
    }
    legs.push({
      id: randomUUID(),
      basket_id: basketId,
      user_id: userId,
      condition_id: leg.conditionId,
      token_id: leg.tokenId,
      outcome: market.outcomes[outcomeIndex] ?? leg.outcome,
      outcome_index: outcomeIndex,
      question: market.question,
      slug: market.slug,
      event_slug: market.eventSlug ?? leg.eventSlug,
      cost_usd: round(fill.notionalUsd, 2),
      shares: round(fill.shares, 4),
      entry_price: round(fill.averagePrice, 4),
      settled: null,
      settled_at: null,
      created_at: now,
    });
  }

  const basket = await db.from("poly_baskets").insert({ id: basketId, user_id: userId, name: input.name, stake_usd: input.stakeUsd, created_at: now });
  if (basket.error !== null) return { ok: false, error: "The basket could not be saved.", status: 503 };
  const saved = await db.from("poly_basket_legs").insert(legs);
  if (saved.error !== null) {
    await db.from("poly_baskets").delete().eq("id", basketId).eq("user_id", userId);
    return { ok: false, error: "The basket could not be saved.", status: 503 };
  }
  return { ok: true, id: basketId };
}

export async function listBaskets(userId: string): Promise<BasketsResponse> {
  const db = serviceClient();
  const [baskets, legs] = await Promise.all([
    db.from("poly_baskets").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("poly_basket_legs").select("*").eq("user_id", userId),
  ]);
  const error = baskets.error ?? legs.error;
  if (error !== null) return { baskets: [], error: missing(error.code) ? MIGRATION : "Your baskets could not be loaded." };

  const legRows = (legs.data ?? []) as Array<Record<string, unknown>>;
  const open = legRows.filter((row) => row.settled === null || row.settled === undefined);
  /* Settle what has resolved, then value the rest from the bids. */
  const markets = await marketsByCondition([...new Set(open.map((row) => String(row.condition_id)))]).catch(() => new Map());
  const settledNow = new Map<string, number>();
  for (const row of open) {
    const market = markets.get(String(row.condition_id));
    const payout = market === undefined ? null : payoutOf(market.prices, Number(row.outcome_index), market.closed);
    if (payout !== null) {
      settledNow.set(String(row.id), payout);
      await db.from("poly_basket_legs").update({ settled: payout, settled_at: new Date().toISOString() }).eq("id", String(row.id)).eq("user_id", userId);
    }
  }
  /* Every open leg's book in one request (the venue takes up to 500), not one request per leg. */
  const values = new Map<string, number | null>();
  const unsettled = open.filter((row) => !settledNow.has(String(row.id)));
  const books = unsettled.length === 0 ? null : await polymarketBooks([...new Set(unsettled.map((row) => String(row.token_id)))]).catch(() => null);
  for (const row of unsettled) {
    const wire = books?.ok === true ? books.data?.get(String(row.token_id)) : undefined;
    if (wire === undefined) {
      values.set(String(row.id), null);
      continue;
    }
    const exit = estimateExecution(normalizeBook(wire), { side: "sell", shares: Number(row.shares) });
    /* A book that cannot take every share values the rest at nothing, and says less than it could. */
    values.set(String(row.id), round(exit.notionalUsd, 2));
  }

  const views: BasketView[] = ((baskets.data ?? []) as Array<Record<string, unknown>>).map((basket) => {
    const mine: BasketLegView[] = legRows
      .filter((row) => row.basket_id === basket.id)
      .map((row) => {
        const settled = settledNow.get(String(row.id)) ?? (row.settled === null || row.settled === undefined ? null : Number(row.settled));
        return {
          id: String(row.id),
          conditionId: String(row.condition_id),
          tokenId: String(row.token_id),
          outcome: String(row.outcome),
          question: String(row.question),
          slug: (row.slug as string | null) ?? null,
          eventSlug: (row.event_slug as string | null) ?? null,
          costUsd: Number(row.cost_usd),
          shares: Number(row.shares),
          entryPrice: Number(row.entry_price),
          valueUsd: settled !== null ? round(Number(row.shares) * settled, 2) : (values.get(String(row.id)) ?? null),
          settled,
        };
      });
    return {
      id: String(basket.id),
      name: String(basket.name),
      stakeUsd: Number(basket.stake_usd),
      createdAt: String(basket.created_at),
      legs: mine,
      ...basketTotals(mine.map((leg) => ({ costUsd: leg.costUsd, shares: leg.shares, valueUsd: leg.valueUsd, settled: leg.settled }))),
    };
  });
  return { baskets: views, error: null };
}

export async function deleteBasket(userId: string, id: string): Promise<boolean> {
  const db = serviceClient();
  const { data } = await db.from("poly_baskets").delete().eq("id", id).eq("user_id", userId).select("id");
  if ((data ?? []).length === 0) return false;
  await db.from("poly_basket_legs").delete().eq("basket_id", id).eq("user_id", userId);
  return true;
}
