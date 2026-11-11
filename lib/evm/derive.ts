import { EVM_CHAINS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import type { SpotHolding } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   An EVM wallet's balances, as portfolio rows.

   Pure: the server reads raw balances, prices and multipliers
   (lib/evm/wallet.ts) and this turns them into the same `SpotHolding` shape
   the Solana wallet produces, under the same rules —

     - a figure that could not be known is null, never zero;
     - every holding here is verified by construction (it was read at a
       listed contract), so `verified` is true and spoofing is not possible;
     - holdings priced below a cent are dropped as dust; unpriced ones are
       kept and shown, but not counted.
--------------------------------------------------------------------------- */

/** Holdings below this are noise in a capital view — the Solana side's floor. */
const DUST_USD = 0.01;

/** Robinhood Chain's id, which the stock-token registry keys deployments by. */
const ROBINHOOD_CHAIN_ID = EVM_CHAINS.robinhood.id;

/* `BigInt(0)` rather than a `0n` literal: the project targets ES2017, below
   the ES2020 that literals need (as lib/solana/transfer.ts notes). */
const ZERO = BigInt(0);
const TEN = BigInt(10);

/**
 * A raw integer balance scaled by its decimals, as a number.
 *
 * Split at the decimal point in integer arithmetic first: `Number(raw)` on an
 * 18-decimal balance loses precision long before the scaling does, and a
 * whale's balance would come back rounded in its integer part.
 */
export function unitsToNumber(raw: bigint, decimals: number): number {
  if (raw === ZERO) return 0;
  const negative = raw < ZERO;
  const magnitude = negative ? -raw : raw;
  const scale = TEN ** BigInt(decimals);
  const whole = Number(magnitude / scale);
  const fraction = Number(magnitude % scale) / 10 ** decimals;
  const value = whole + fraction;
  return negative ? -value : value;
}

/* ---------------------------------------------------------------------------
   Robinhood's stock-token registry
--------------------------------------------------------------------------- */

export interface StockToken {
  address: string;
  /** The underlying's ticker, e.g. "AAPL". */
  symbol: string;
  name: string;
  decimals: number;
  /** Shares per token, from the registry. The on-chain value wins when readable. */
  multiplier: number;
  logo: string | null;
}

/**
 * The active stock tokens on Robinhood Chain, from the body of
 * `GET https://api.robinhood.com/rhj/assets` (docs.robinhood.com/chain/stock-token-apis).
 *
 * Read defensively — it is someone else's contract. An entry missing a
 * usable address, symbol or decimals is dropped rather than guessed at, and
 * a multiplier that is not a positive number falls back to 1, the value
 * every token launches with.
 */
export function parseStockRegistry(body: unknown): StockToken[] {
  if (body === null || typeof body !== "object") return [];
  const assets = (body as { assets?: unknown }).assets;
  if (!Array.isArray(assets)) return [];

  const tokens: StockToken[] = [];
  const seen = new Set<string>();

  for (const raw of assets) {
    if (raw === null || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (entry.status !== "ASSET_STATUS_ACTIVE") continue;

    const symbol = typeof entry.tokenSymbol === "string" ? entry.tokenSymbol.trim().toUpperCase() : "";
    if (!/^[A-Z0-9.]{1,12}$/.test(symbol)) continue;

    const deployments = Array.isArray(entry.deployments) ? entry.deployments : [];
    const deployment = deployments.find(
      (item): item is { contractAddress: string } =>
        item !== null &&
        typeof item === "object" &&
        (item as { chainId?: unknown }).chainId === ROBINHOOD_CHAIN_ID &&
        isEvmAddress((item as { contractAddress?: unknown }).contractAddress),
    );
    if (deployment === undefined) continue;

    const key = deployment.contractAddress.toLowerCase();
    if (seen.has(key)) continue;

    /* The docs fix stock tokens at 18 decimals; the registry's own figure is
       read anyway, and a missing one falls back to the documented value. */
    const decimals =
      typeof entry.tokenDecimals === "number" && Number.isInteger(entry.tokenDecimals) && entry.tokenDecimals >= 0 && entry.tokenDecimals <= 36
        ? entry.tokenDecimals
        : 18;

    const multiplier = Number(entry.currentMultiplier);

    seen.add(key);
    tokens.push({
      address: deployment.contractAddress,
      symbol,
      name: typeof entry.tokenName === "string" && entry.tokenName.trim().length > 0 ? entry.tokenName.trim() : symbol,
      decimals,
      multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
      logo: typeof entry.logoUrl === "string" && entry.logoUrl.startsWith("https://") ? entry.logoUrl : null,
    });
  }

  return tokens;
}

/**
 * A `uiMultiplier()` result as shares per token. It is 18-decimal fixed point
 * (1e18 = 1.0); anything that is not a positive number is no reading.
 */
export function multiplierFromChain(raw: bigint | null | undefined): number | null {
  if (raw === null || raw === undefined || raw <= ZERO) return null;
  const value = unitsToNumber(raw, 18);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/* ---------------------------------------------------------------------------
   Holdings
--------------------------------------------------------------------------- */

/** One token whose balance was read, with what is needed to value it. */
export interface TokenBalanceRead {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  raw: bigint;
  logo: string | null;
  stable: boolean;
  /** USD per token, or null when nothing prices it. */
  priceUsd: number | null;
  /** See `SpotHolding.marketSymbol`. */
  marketSymbol?: string | null;
  stockToken?: { ticker: string; multiplier: number };
  /**
   * Read at a listed contract. False for a token found by an indexer and on
   * no list Elyra trusts: shown with the symbol it claims, never priced and
   * never counted. Absent means listed.
   */
  verified?: boolean;
}

export interface EvmWalletInput {
  chain: EvmChainKey;
  /** The wallet address, as it should be displayed. */
  address: string;
  scopeId: string;
  nativeRaw: bigint;
  /** ETH/USD, or null when unavailable. */
  ethUsd: number | null;
  ethLogo: string | null;
  tokens: TokenBalanceRead[];
}

export interface EvmWalletRows {
  holdings: SpotHolding[];
  /** Sum of every priced holding. Every one is verified, so every priced one counts. */
  valueUsd: number;
  /** Of that, what is in stablecoins — spendable at face value. */
  stableUsd: number;
  /** Held with no price, so shown and not counted. */
  unpriced: number;
  /** Held on no trusted list, so shown and not counted. */
  unverified: number;
}

/**
 * The share price a stock token's own price is built from, times its
 * multiplier. Pyth's equity feed quotes the underlying share; one token
 * represents `multiplier` shares (docs.robinhood.com/chain/oracles-and-price-feeds:
 * "Token value … underlying share price × multiplier").
 */
export function stockTokenPrice(sharePriceUsd: number | null, multiplier: number): number | null {
  if (sharePriceUsd === null || !Number.isFinite(sharePriceUsd) || sharePriceUsd <= 0) return null;
  return sharePriceUsd * multiplier;
}

export function evmWalletRows(input: EvmWalletInput): EvmWalletRows {
  const chain = EVM_CHAINS[input.chain];
  const holdings: SpotHolding[] = [];
  let valueUsd = 0;
  let stableUsd = 0;
  let unpriced = 0;
  let unverified = 0;

  const push = (
    row: Omit<SpotHolding, "venue" | "chain" | "scopeId" | "change24hPct" | "allocationPct" | "avgCostUsd" | "pnlUsd" | "pnlPct" | "verified">,
    verified = true,
  ) => {
    holdings.push({
      ...row,
      venue: "wallet",
      chain: chain.name,
      scopeId: input.scopeId,
      change24hPct: null,
      allocationPct: null,
      avgCostUsd: null,
      pnlUsd: null,
      pnlPct: null,
      verified,
    });
  };

  const eth = unitsToNumber(input.nativeRaw, 18);
  if (eth > 0) {
    const value = input.ethUsd === null ? null : eth * input.ethUsd;
    if (value === null || value >= DUST_USD) {
      push({
        id: `${input.scopeId}:${chain.nativeSymbol}`,
        address: null,
        symbol: chain.nativeSymbol,
        name: chain.nativeName,
        logo: input.ethLogo,
        quantity: eth,
        decimals: 18,
        priceUsd: input.ethUsd,
        valueUsd: value,
        liquid: false,
      });
      if (value === null) unpriced += 1;
      else valueUsd += value;
    }
  }

  for (const token of input.tokens) {
    const quantity = unitsToNumber(token.raw, token.decimals);
    if (quantity <= 0) continue;

    if (token.verified === false) {
      /* Shown because it is in the wallet; never priced, never counted —
         anyone can deploy a contract that calls itself USDC. */
      push(
        {
          id: `${input.scopeId}:${token.address.toLowerCase()}`,
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          logo: null,
          quantity,
          decimals: token.decimals,
          priceUsd: null,
          valueUsd: null,
          liquid: false,
          marketSymbol: null,
        },
        false,
      );
      unverified += 1;
      continue;
    }

    const value = token.priceUsd === null ? null : quantity * token.priceUsd;
    if (value !== null && value < DUST_USD) continue;

    push({
      id: `${input.scopeId}:${token.address.toLowerCase()}`,
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      quantity,
      decimals: token.decimals,
      priceUsd: token.priceUsd,
      valueUsd: value,
      liquid: token.stable,
      ...(token.marketSymbol !== undefined ? { marketSymbol: token.marketSymbol } : {}),
      ...(token.stockToken !== undefined ? { stockToken: token.stockToken } : {}),
    });

    if (value === null) unpriced += 1;
    else {
      valueUsd += value;
      if (token.stable) stableUsd += value;
    }
  }

  return { holdings, valueUsd, stableUsd, unpriced, unverified };
}
