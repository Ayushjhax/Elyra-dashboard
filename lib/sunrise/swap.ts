import "server-only";

import { readMint } from "@/lib/passport/server";
import { sunriseQuotes } from "@/lib/providers/sunrise";
import { toBaseUnits } from "@/lib/solana/amount";
import { BACKPACK_FREEZE_AUTHORITY, bestQuote, encodeRef, isOrderRoute, routeLabel, sunriseTokenId, unavailableReason, type SunriseToken } from "@/lib/sunrise/api";
import { stockListing, type StockSource } from "@/lib/sunrise/listing";
import type { SwapPreview } from "@/lib/trade";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   A swap into or out of a tokenized stock Sunrise lists, through the same
   path as every Solana swap in Elyra (lib/wallet/runSwap.ts): this builds
   the quote for /api/swap/build, the route holds its transaction to the
   swap guard exactly as it does Jupiter's, the person signs in their own
   wallet, and /api/swap/submit hands the signed bytes to Sunrise unchanged.

   A token is Sunrise-listed only by its mint, read from Sunrise's own list
   for the issuer (`backpack_securities`) — never matched by a name — and
   its decimals are read back from the mint account on the chain before any
   amount is converted. A token whose chain decimals disagree with Sunrise's
   is refused: one of the two is wrong, and an amount is not guessed.

   Not on the symbol allowlist in lib/trade.ts, deliberately: the chat
   command, Telegram and Intelligent Portfolios resolve through that list
   and none of them can ask the eligibility question these tokens need
   (lib/sunrise/eligibility.ts). They are traded only where it is asked.

   Without Sunrise's key the list is the same issuer's tokens from Jupiter's
   index (lib/sunrise/listing.ts), and the route quotes them through Jupiter
   (`previewSwap`) under the same eligibility question; the mint account is
   then also held to the issuer's freeze authority, since the list is
   Jupiter's claim rather than the issuer's.
--------------------------------------------------------------------------- */

export interface SunriseSide {
  token: SunriseToken;
  source: StockSource;
}

/** The listed stock token a mint or a symbol names, if it names one. */
export async function sunriseSide(mint: string | null, symbol: string | null): Promise<SunriseSide | null> {
  const listed = await stockListing();
  if (!listed.ok) return null;
  if (mint !== null) {
    const token = listed.data.find((entry) => entry.address === mint);
    return token === undefined ? null : { token, source: listed.source };
  }
  if (symbol === null) return null;
  const wanted = symbol.trim().toUpperCase();
  const matches = listed.data.filter((entry) => entry.symbol.toUpperCase() === wanted);
  /* A symbol two tokens share names neither: it is refused, not picked between. */
  return matches.length === 1 ? { token: matches[0], source: listed.source } : null;
}

/** The list's decimals, held to the mint account's own — and, for Jupiter's list, the issuer's freeze authority too. */
export async function checkedDecimals(token: SunriseToken, source: StockSource = "sunrise"): Promise<number | { error: string }> {
  const account = await readMint(token.address).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "The mint could not be read." }));
  if ("error" in account) return { error: `${token.symbol}: ${account.error}` };
  const lister = source === "sunrise" ? "Sunrise" : "Jupiter's index";
  if (source === "jupiter" && account.freezeAuthority !== BACKPACK_FREEZE_AUTHORITY) {
    return { error: `${token.symbol} could not be quoted: its mint on Solana is not frozen by Backpack Securities' authority, so it is not taken to be the issuer's token.` };
  }
  if (account.decimals !== token.decimals) {
    return { error: `${token.symbol} could not be quoted: ${lister} lists ${token.decimals} decimals and the mint on Solana has ${account.decimals}.` };
  }
  return account.decimals;
}

export interface Leg {
  mint: string;
  decimals: number;
  symbol: string;
}

const fmt = (value: number, digits = 6): string => value.toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * A live quote across Sunrise's routes, as a prepared action with the
 * unsigned transaction of the route that delivers most. `notices` are the
 * eligibility and issuer facts the person reads before signing.
 */
export async function previewSunriseSwap(input: {
  from: Leg;
  to: Leg;
  amountText: string;
  amount: number;
  owner: string;
  notices: string[];
}): Promise<SwapPreview | { error: string }> {
  const { from, to } = input;
  if (from.mint === to.mint) return { error: "Those are the same token." };
  const baseUnits = toBaseUnits(input.amountText, from.decimals);
  if (baseUnits === null) return { error: "That amount is not something I can quote." };

  const quoted = await sunriseQuotes({ fromToken: sunriseTokenId(from.mint), toToken: sunriseTokenId(to.mint), fromAmount: baseUnits, wallet: input.owner });
  if (!quoted.ok) return { error: quoted.failure.message };
  const quote = bestQuote(quoted.data.quotes);
  if (quote === null) return { error: unavailableReason(quoted.data.unavailable) };
  if (quote.fromAmount !== baseUnits) {
    return { error: "Sunrise quoted a different amount from the one asked, so it was not offered to sign." };
  }

  const out = Number(quote.toAmount) / 10 ** to.decimals;
  const order = isOrderRoute(quote.routeName);
  const fields: PreparedAction["fields"] = [
    { label: "Sell", value: `${fmt(input.amount)} ${from.symbol}`, derived: false },
    { label: order ? "Receive (when filled)" : "Receive (estimated)", value: `${fmt(out)} ${to.symbol}`, derived: true },
    { label: "Rate", value: `1 ${from.symbol} = ${fmt(out / input.amount)} ${to.symbol}`, derived: true },
  ];
  if (quote.fromAmountUSD !== null && quote.toAmountUSD !== null) {
    fields.push({ label: "Value", value: `$${fmt(quote.fromAmountUSD, 2)} → $${fmt(quote.toAmountUSD, 2)}`, derived: true });
  }
  if (quote.slippageBps !== null) fields.push({ label: "Slippage allowed", value: `${(quote.slippageBps / 100).toFixed(2)}%`, derived: true });
  fields.push({ label: "Route", value: `${routeLabel(quote.routeName)} · via Sunrise`, derived: true });

  const warnings = [...input.notices];
  if (order) {
    warnings.push(
      "This route places an order rather than swapping at once: what you sell is held in an on-chain order until a market maker fills it. Unfilled after about 30 minutes, it can be cancelled and the funds return to your wallet.",
    );
  }
  if (quote.expiresAt !== null) warnings.push("This quote is good for seconds, not minutes.");

  const alternatives = quoted.data.quotes.filter((entry) => entry !== quote && entry.unsignedTransaction !== null).length;
  return {
    action: {
      id: quote.quoteId,
      kind: "swap",
      summary: `Swap ${fmt(input.amount)} ${from.symbol} to ${fmt(out)} ${to.symbol}`,
      fields,
      readiness: "ready",
      reason: null,
      warnings,
      preparedAt: new Date().toISOString(),
    },
    note:
      alternatives > 0
        ? `Nothing has been sent — confirm in Elyra to sign it. The best of ${alternatives + 1} routes Sunrise quoted.`
        : "Nothing has been sent — confirm in Elyra to sign it.",
    unsignedTransaction: quote.unsignedTransaction ?? undefined,
    /* What /v1/execute needs back; /api/swap/submit tells it from Jupiter's by its prefix. */
    quoteRef: encodeRef(quote),
    sell: { mint: from.mint, amount: baseUnits },
  };
}
