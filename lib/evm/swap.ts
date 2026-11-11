import { EVM_CHAINS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { EVM_TOKENS } from "@/lib/evm/tokens";

/* ---------------------------------------------------------------------------
   What may be swapped on Ethereum and Robinhood Chain, and how a router's
   quote is checked before anything is built from it.

   Pure, and shared with the app through lib/core.ts.

   ── What may be swapped ────────────────────────────────────────────────

   Native ETH and the listed crypto tokens (lib/evm/tokens.ts), each named
   by symbol and resolved here to its canonical contract — the same rule as
   the Solana swap allowlist in lib/trade.ts: a swap resolves a symbol on the
   person's word, and resolving it to anything but the canonical contract is
   how a balance gets traded into a lookalike.

   Robinhood Stock Tokens are NOT swappable here. They are tokenized
   securities that Robinhood's own documentation says "may not be offered,
   sold, or delivered, directly or indirectly, in the United States or to,
   or for the account or benefit of, U.S. persons", with further
   restrictions elsewhere — and Elyra has no way to know who or where a
   person is. They stay readable and sendable (they are the person's own
   holdings), but buying or selling them is left to venues that check
   eligibility.
--------------------------------------------------------------------------- */

export interface SwapToken {
  symbol: string;
  name: string;
  /** "native" for ETH; the contract otherwise. */
  address: string;
  decimals: number;
}

/** The tokens a swap may name on a chain, its gas coin (ETH, or BNB on BNB Chain) first. */
export function swapTokens(chain: EvmChainKey): SwapToken[] {
  return [
    { symbol: EVM_CHAINS[chain].nativeSymbol, address: "native", decimals: 18, name: EVM_CHAINS[chain].nativeName },
    ...EVM_TOKENS[chain].map((token) => ({
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      decimals: token.decimals,
    })),
  ];
}

/** A symbol resolved to its canonical token on a chain, or null. Case-insensitive. */
export function swapTokenFor(chain: EvmChainKey, symbol: string): SwapToken | null {
  const wanted = symbol.trim().toUpperCase();
  return swapTokens(chain).find((token) => token.symbol.toUpperCase() === wanted) ?? null;
}

/** The address a router names native ETH by. */
export const ROUTER_NATIVE = "0x0000000000000000000000000000000000000000";

export function routerAddress(token: SwapToken): string {
  return token.address === "native" ? ROUTER_NATIVE : token.address;
}

/** The slippage every EVM swap is quoted with: 0.5%. */
export const EVM_SWAP_SLIPPAGE = 0.005;

/* ---------------------------------------------------------------------------
   A router's quote, checked
--------------------------------------------------------------------------- */

export interface LifiQuote {
  /** The router contract the swap transaction calls, and the spender to approve. */
  to: string;
  data: string;
  /** Wei, decimal. Non-zero only when ETH is sold. */
  value: string;
  approvalAddress: string;
  /** Base units of the bought token. */
  toAmount: string;
  /** The least the swap may deliver before it reverts. */
  toAmountMin: string;
  /** The venue LI.FI routed through: "uniswap", "nordstern"… */
  tool: string;
  /** Fees the route charges on top of gas, in USD where reported. */
  feeUsd: number | null;
  /** LI.FI's own gas estimate in USD, for display only — gas is re-estimated. */
  gasUsd: number | null;
}

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function same(a: unknown, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

function hexOrDecimal(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = BigInt(value);
    return parsed >= BigInt(0) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function usd(entries: unknown, onlyIncluded: boolean): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let total = 0;
  let seen = false;
  for (const entry of entries) {
    const row = obj(entry);
    if (row === null) continue;
    /* `included: true` is a fee taken out of the swap itself; anything else
       is paid separately and is not part of what the person loses to the route. */
    if (onlyIncluded && row.included === false) continue;
    const amount = Number(row.amountUSD);
    if (Number.isFinite(amount)) {
      total += amount;
      seen = true;
    }
  }
  return seen ? total : null;
}

/**
 * A quote from LI.FI's `/quote`, held to the swap that was asked for.
 *
 * Refused unless it is on the asked-for chain, sells exactly the asked-for
 * amount of the asked-for token, buys the asked-for token, and pays it to the
 * asking address. The last check matters most: a route that delivered to any
 * other address would be a transfer to a stranger dressed as a swap.
 */
export function checkLifiQuote(
  body: unknown,
  want: { chainId: number; fromToken: string; toToken: string; fromAmount: string; address: string },
): { ok: true; quote: LifiQuote } | { ok: false; error: string } {
  const quote = obj(body);
  const action = obj(quote?.action);
  const estimate = obj(quote?.estimate);
  const request = obj(quote?.transactionRequest);
  const fromToken = obj(action?.fromToken);
  const toToken = obj(action?.toToken);
  if (quote === null || action === null || estimate === null || request === null || fromToken === null || toToken === null) {
    return { ok: false, error: "The swap router returned a quote that could not be read." };
  }

  const refuse = (what: string) => ({
    ok: false as const,
    error: `The swap router's quote did not match the swap you asked for (${what}), so it was not used.`,
  });

  if (action.fromChainId !== want.chainId || action.toChainId !== want.chainId || request.chainId !== want.chainId) {
    return refuse("network");
  }
  if (!same(fromToken.address, want.fromToken)) return refuse("token sold");
  if (!same(toToken.address, want.toToken)) return refuse("token bought");
  if (hexOrDecimal(action.fromAmount) !== want.fromAmount) return refuse("amount");
  if (!same(action.fromAddress, want.address) || !same(request.from, want.address)) return refuse("sender");
  if (!same(action.toAddress, want.address)) return refuse("recipient");

  const to = request.to;
  const approvalAddress = estimate.approvalAddress ?? to;
  if (!isEvmAddress(to) || !isEvmAddress(approvalAddress)) return refuse("router address");
  if (typeof request.data !== "string" || !/^0x([0-9a-fA-F]{2})+$/.test(request.data)) return refuse("instructions");

  const value = hexOrDecimal(request.value ?? "0x0");
  if (value === null) return refuse("value");
  /* Selling a token sends no ETH; selling ETH sends exactly the amount sold. */
  const sellsNative = same(want.fromToken, ROUTER_NATIVE);
  if (sellsNative ? value !== want.fromAmount : value !== "0") return refuse("value");

  const toAmount = hexOrDecimal(estimate.toAmount);
  const toAmountMin = hexOrDecimal(estimate.toAmountMin);
  if (toAmount === null || toAmountMin === null || BigInt(toAmount) <= BigInt(0) || BigInt(toAmountMin) > BigInt(toAmount)) {
    return refuse("amount bought");
  }

  return {
    ok: true,
    quote: {
      to,
      data: request.data,
      value,
      approvalAddress,
      toAmount,
      toAmountMin,
      tool: typeof quote.tool === "string" ? quote.tool : "router",
      feeUsd: usd(estimate.feeCosts, true),
      gasUsd: usd(estimate.gasCosts, false),
    },
  };
}
