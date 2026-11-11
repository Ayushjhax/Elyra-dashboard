import "server-only";

import { PORTFOLIOS, catalogSymbols, portfolioById } from "@/lib/invest/catalog";
import type { FillResponse, PositionUnits, PricedPortfolio } from "@/lib/invest/types";
import { routePrices } from "@/lib/providers/router";
import { getTransactionTokenChanges, type TransactionTokenChanges } from "@/lib/solana/rpc";
import { serviceClient } from "@/lib/supabase/server";
import { assetFor } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Intelligent Portfolios, server side: the catalog priced, a person's
   positions read from their proven fills, and a fill recorded from the chain.

   ── A position is attributed, never inferred from the wallet ───────────

   Two portfolios can hold the same token, and a person can hold that token
   outside any portfolio, so "how much NVDAon is in AI leaders" cannot be read
   from a wallet balance. It is the sum of what proven swaps added to and
   took from that portfolio — portfolio_fills (0017) — and the client then
   holds it to what the wallet actually has (lib/invest/plan.ts `heldUnits`).

   ── A fill is the chain's figure ───────────────────────────────────────

   The browser sends a signature and which portfolio it was for. Nothing
   else it says is believed: the transaction is read from the node, it must
   have succeeded, this account's wallet must have signed it, and the amount
   recorded is the wallet's actual balance change in it.
--------------------------------------------------------------------------- */

const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

/** Seen-or-not is retried this many times, this far apart — the node can lag Jupiter. */
const ATTEMPTS = 4;
const INTERVAL_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assetOrThrow(symbol: string) {
  const asset = assetFor(symbol);
  /* lib/invest/catalog.test.ts holds every catalog symbol to the allowlist,
     so this is a programming error, not a runtime condition. */
  if (asset === null) throw new Error(`Catalog symbol ${symbol} is not on the swap allowlist.`);
  return asset;
}

/** The catalog with live prices. A holding Jupiter cannot price carries null, never zero. */
export async function pricedCatalog(): Promise<{
  portfolios: PricedPortfolio[];
  pricedAt: string;
  warning: string | null;
}> {
  const mints = catalogSymbols().map((symbol) => assetOrThrow(symbol).mint);
  const prices = await routePrices(mints);
  const byMint = new Map((prices.data ?? []).map((quote) => [quote.id, quote]));

  const portfolios = PORTFOLIOS.map((portfolio) => ({
    ...portfolio,
    holdings: portfolio.holdings.map((holding) => {
      const asset = assetOrThrow(holding.symbol);
      const quote = byMint.get(asset.mint);
      const price = quote !== undefined && Number.isFinite(quote.usdPrice) && quote.usdPrice > 0 ? quote.usdPrice : null;
      const change = quote?.change24hPct;
      return {
        ...holding,
        mint: asset.mint,
        decimals: asset.decimals,
        priceUsd: price,
        change24hPct: typeof change === "number" && Number.isFinite(change) ? change : null,
      };
    }),
  }));

  const warning = !prices.ok
    ? (prices.error?.message ?? "Prices are unavailable right now.")
    : prices.partial === true
      ? "Some holdings could not be priced just now."
      : null;

  return { portfolios, pricedAt: new Date().toISOString(), warning };
}

/** A numeric column as an exact integer. PostgREST may hand it back as a number or a string. */
function toBigInt(value: string | number): bigint {
  if (typeof value === "string") return BigInt(value.split(".")[0]);
  if (!Number.isFinite(value)) return BigInt(0);
  return BigInt(Math.trunc(value).toLocaleString("en-US", { useGrouping: false }));
}

/** Whether a Supabase error is the table missing — migration 0017 not applied. */
function tableMissing(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /portfolio_fills/.test(error.message ?? "");
}

export class PositionsUnavailableError extends Error {}

/** Portfolio id → symbol → whole units, from this account's fills. `{}` when there are none. */
export async function readPositions(userId: string): Promise<Record<string, PositionUnits>> {
  const { data, error } = await serviceClient()
    .from("portfolio_fills")
    .select("portfolio_id, mint, delta_units, decimals")
    .eq("user_id", userId);

  if (error !== null) {
    throw new PositionsUnavailableError(
      tableMissing(error)
        ? "Portfolio positions need database migration 0017, which has not been applied."
        : "Your portfolio positions could not be read.",
    );
  }

  const sums = new Map<string, { portfolioId: string; mint: string; decimals: number; base: bigint }>();
  for (const row of data ?? []) {
    const key = `${row.portfolio_id}:${row.mint}`;
    const entry = sums.get(key) ?? { portfolioId: row.portfolio_id, mint: row.mint, decimals: row.decimals, base: BigInt(0) };
    entry.base += toBigInt(row.delta_units);
    sums.set(key, entry);
  }

  const positions: Record<string, PositionUnits> = {};
  for (const entry of sums.values()) {
    const portfolio = portfolioById(entry.portfolioId);
    if (portfolio === null || entry.base <= BigInt(0)) continue;
    /* Matched by mint against the portfolio's own holdings: a row for a mint
       the portfolio no longer holds (after a review) is not counted here —
       it is still in the wallet, and it is still in the ledger. */
    const holding = portfolio.holdings.find((candidate) => assetFor(candidate.symbol)?.mint === entry.mint);
    if (holding === undefined) continue;
    const units = Number(entry.base) / 10 ** entry.decimals;
    (positions[portfolio.id] ??= {})[holding.symbol] = units;
  }
  return positions;
}

/**
 * Records what one landed swap moved into or out of a portfolio.
 *
 * `pending` is not a refusal: the node this server reads can lag the one
 * Jupiter submitted to, so an unseen signature is reported as not yet
 * checkable and the browser asks again.
 */
export async function recordFill(
  input: { userId: string; wallet: string; portfolioId: string; signature: string },
  read: (signature: string) => Promise<TransactionTokenChanges | null> = getTransactionTokenChanges,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<FillResponse> {
  const portfolio = portfolioById(input.portfolioId);
  if (portfolio === null) return { outcome: "rejected", reason: "There is no portfolio by that name." };
  if (!SIGNATURE.test(input.signature)) return { outcome: "rejected", reason: "That is not a transaction signature." };

  const client = serviceClient();

  const existing = await client
    .from("portfolio_fills")
    .select("user_id, portfolio_id, mint, delta_units, decimals")
    .eq("signature", input.signature);
  if (existing.error !== null) {
    return {
      outcome: "rejected",
      reason: tableMissing(existing.error)
        ? "Portfolio positions need database migration 0017, which has not been applied."
        : "The position ledger could not be read.",
    };
  }

  const mintToSymbol = new Map(portfolio.holdings.map((holding) => [assetOrThrow(holding.symbol).mint, holding.symbol]));
  const movedFrom = (rows: Array<{ mint: string; delta: bigint; decimals: number }>) => {
    const moved: Record<string, number> = {};
    for (const row of rows) {
      const symbol = mintToSymbol.get(row.mint);
      if (symbol !== undefined) moved[symbol] = Number(row.delta) / 10 ** row.decimals;
    }
    return moved;
  };

  if ((existing.data ?? []).length > 0) {
    const rows = existing.data ?? [];
    if (rows.some((row) => row.user_id !== input.userId)) {
      return { outcome: "rejected", reason: "That swap belongs to another account." };
    }
    const elsewhere = rows.find((row) => row.portfolio_id !== portfolio.id);
    if (elsewhere !== undefined) {
      const other = portfolioById(elsewhere.portfolio_id)?.name ?? "another portfolio";
      return { outcome: "rejected", reason: `That swap is already counted toward ${other}.` };
    }
    return {
      outcome: "already-recorded",
      moved: movedFrom(rows.map((row) => ({ mint: row.mint, delta: toBigInt(row.delta_units), decimals: row.decimals }))),
    };
  }

  let transaction: TransactionTokenChanges | null = null;
  for (let attempt = 0; attempt < ATTEMPTS && transaction === null; attempt += 1) {
    if (attempt > 0) await wait(INTERVAL_MS);
    try {
      transaction = await read(input.signature);
    } catch {
      return { outcome: "pending", reason: "The Solana network could not be reached to check the swap." };
    }
  }
  if (transaction === null) return { outcome: "pending", reason: "The network has not shown this swap yet." };

  if (transaction.err !== null) {
    return { outcome: "rejected", reason: "That transaction failed on-chain, so nothing was bought or sold." };
  }
  if (!transaction.signers.includes(input.wallet)) {
    return { outcome: "rejected", reason: "That transaction was not signed by this account's wallet." };
  }

  const rows = transaction.changes
    .filter((change) => change.owner === input.wallet && mintToSymbol.has(change.mint))
    .map((change) => ({
      user_id: input.userId,
      portfolio_id: portfolio.id,
      signature: input.signature,
      mint: change.mint,
      delta_units: change.delta,
      decimals: change.decimals,
    }));

  if (rows.length === 0) {
    return { outcome: "rejected", reason: `That swap did not move any of ${portfolio.name}'s holdings in this wallet.` };
  }

  const inserted = await client
    .from("portfolio_fills")
    .upsert(rows, { onConflict: "signature,mint", ignoreDuplicates: true });
  if (inserted.error !== null) {
    return { outcome: "rejected", reason: "The swap landed, but it could not be recorded. Try recording it again." };
  }

  return {
    outcome: "recorded",
    moved: movedFrom(rows.map((row) => ({ mint: row.mint, delta: BigInt(row.delta_units), decimals: row.decimals }))),
  };
}
