import "server-only";

import { erc20Abi, getAddress, parseAbi, type Address } from "viem";
import { EVM_CHAINS, evmScopeId, type EvmChainKey } from "@/lib/evm/chains";
import {
  evmWalletRows,
  multiplierFromChain,
  stockTokenPrice,
  type TokenBalanceRead,
} from "@/lib/evm/derive";
import { evmClient, RPC_ENV } from "@/lib/evm/rpc";
import { discoverUnlisted } from "@/lib/evm/discover";
import { robinhoodStockTokens, robinhoodTokenPrices } from "@/lib/evm/stockTokens";
import { EVM_TOKENS } from "@/lib/evm/tokens";
import { assetsBySymbols, pythConfigured, usEquityAssets } from "@/lib/market/pyth/catalog";
import { pricesForIds } from "@/lib/market/pyth/client";
import type { PythAsset } from "@/lib/market/pyth/types";
import type { SourceNote, SpotHolding, WalletScope } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   One EVM chain's read of the account's EVM wallet.

   The same contract as the Solana wallet read in lib/portfolio/compose.ts:
   holdings, the scope they belong to, and a note for anything that could not
   be read — so a total assembled without this chain says it is partial
   instead of passing for the whole.

   Read-only. Nothing here builds, signs or sends a transaction.

   What it reads, in as few round trips as the chain allows:

     1. the node's chain id, checked against the expected one — a URL
        pointed at a testnet or another L2 must not have its balances shown
        as these (the Solana side checks the genesis hash for the same
        reason);
     2. the native ETH balance;
     3. every listed token's `balanceOf`, in one Multicall3 `eth_call`
        (deployed at the canonical address on both chains);
     4. for stock tokens actually held, `uiMultiplier()` — shares per token,
        which reinvested dividends and splits move (ERC-8056).

   Prices are Pyth's, as everywhere else in the product: a crypto token at
   its crypto feed, a stock token at the US equity feed for its ticker times
   its multiplier. A token Pyth does not price is shown and not counted.
--------------------------------------------------------------------------- */

const UI_MULTIPLIER_ABI = parseAbi(["function uiMultiplier() view returns (uint256)"]);

export interface EvmWalletRead {
  holdings: SpotHolding[];
  scope: WalletScope | null;
  notes: SourceNote[];
}

/** A token this read asks the chain about. */
interface Listed {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  stable: boolean;
  /** Pyth crypto ticker; null for a stock token. */
  priceSymbol: string | null;
  marketSymbol?: string | null;
  logo: string | null;
  /** Set for a Robinhood Stock Token: the registry's multiplier, a fallback. */
  stock: { multiplier: number } | null;
}

function note(scope: string, reason: string, kind: SourceNote["kind"] = "failed"): SourceNote {
  return { scope, reason, kind };
}

function message(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    /* viem's errors carry a multi-line "Request body / Details / Version"
       block after a first line that already says what went wrong. */
    return error.message.split("\n")[0].slice(0, 200);
  }
  return fallback;
}

export async function readEvmWallet(chainKey: EvmChainKey, address: string): Promise<EvmWalletRead> {
  const chain = EVM_CHAINS[chainKey];
  const scopeName = chain.name.toLowerCase();
  const owner = getAddress(address);
  const scopeId = evmScopeId(chainKey, owner);
  const client = evmClient(chainKey);
  const notes: SourceNote[] = [];

  const listed: Listed[] = EVM_TOKENS[chainKey].map((token) => ({
    address: getAddress(token.address),
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    stable: token.stable,
    priceSymbol: token.priceSymbol,
    ...(token.marketSymbol !== undefined ? { marketSymbol: token.marketSymbol } : {}),
    logo: null,
    stock: null,
  }));

  if (chainKey === "robinhood") {
    try {
      for (const token of await robinhoodStockTokens()) {
        listed.push({
          address: getAddress(token.address),
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          stable: false,
          priceSymbol: null,
          /* A crypto venue may list an unrelated token under the same ticker. */
          marketSymbol: null,
          logo: token.logo,
          stock: { multiplier: token.multiplier },
        });
      }
    } catch (error: unknown) {
      notes.push(
        note(
          scopeName,
          `Stock tokens could not be listed (${message(error, "registry unavailable")}); other ${chain.name} balances are current.`,
        ),
      );
    }
  }

  const [chainId, native, balances] = await Promise.allSettled([
    client.getChainId(),
    client.getBalance({ address: owner }),
    client.multicall({
      allowFailure: true,
      /* One eth_call for the whole list rather than viem's default 1KB
         chunks: the public endpoints are rate-limited per request, and two
         hundred balanceOf reads fit comfortably in one call's gas. */
      batchSize: 0,
      contracts: listed.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [owner] as const,
      })),
    }),
  ]);

  if (chainId.status === "fulfilled" && chainId.value !== chain.id) {
    return {
      holdings: [],
      scope: null,
      notes: [
        ...notes,
        note(
          scopeName,
          `${RPC_ENV[chainKey]} answers for chain ${chainId.value}, not ${chain.name} (${chain.id}), so its balances are not shown.`,
        ),
      ],
    };
  }

  if (native.status === "rejected") {
    return {
      holdings: [],
      scope: null,
      notes: [...notes, note(scopeName, `${chain.name} could not be read: ${message(native.reason, "the RPC did not answer")}.`)],
    };
  }

  /* Held: a successful read of a non-zero balance. A token whose call
     failed is not "zero" — but one failing among many is a contract quirk,
     not an outage, so only a failure of the whole batch is reported. */
  const held: Array<{ token: Listed; raw: bigint }> = [];
  if (balances.status === "fulfilled") {
    balances.value.forEach((result, index) => {
      if (result.status === "success" && typeof result.result === "bigint" && result.result > BigInt(0)) {
        held.push({ token: listed[index], raw: result.result });
      }
    });
  } else {
    notes.push(note(scopeName, `${chain.name} token balances could not be read; ETH is current.`));
  }

  /* Tokens on no list, found by an indexer — started now so the lookup runs
     beside the pricing below rather than after it (lib/evm/discover.ts). */
  const unlisted = discoverUnlisted(chainKey, owner, new Set(listed.map((token) => token.address.toLowerCase())));

  /* The live multiplier for every stock token held. The registry's copy is
     up to an hour old and is used only when the chain's cannot be read. */
  const stocks = held.filter((entry) => entry.token.stock !== null);
  const multipliers = new Map<string, number>();
  if (stocks.length > 0) {
    const reads = await client
      .multicall({
        allowFailure: true,
        batchSize: 0,
        contracts: stocks.map((entry) => ({
          address: entry.token.address,
          abi: UI_MULTIPLIER_ABI,
          functionName: "uiMultiplier" as const,
        })),
      })
      .catch(() => null);
    stocks.forEach((entry, index) => {
      const read = reads?.[index];
      const live = read?.status === "success" ? multiplierFromChain(read.result as bigint) : null;
      multipliers.set(entry.token.address, live ?? entry.token.stock?.multiplier ?? 1);
    });
  }

  /* ---- Prices ---- */

  const nativeSymbol = chain.nativeSymbol;
  const cryptoSymbols = [...new Set([nativeSymbol, ...held.flatMap((entry) => (entry.token.priceSymbol === null ? [] : [entry.token.priceSymbol]))])];
  const tickers = [...new Set(stocks.map((entry) => entry.token.symbol))];

  const cryptoAsset = new Map<string, PythAsset>();
  let equityAsset = new Map<string, PythAsset>();
  const priceById = new Map<number, number>();

  if (!pythConfigured()) {
    notes.push(note("pyth", `PYTH_API_KEY is not set, so ${chain.name} balances are listed unpriced.`));
  } else {
    try {
      const [crypto, equities] = await Promise.all([assetsBySymbols(cryptoSymbols), usEquityAssets(tickers)]);
      /* Crypto only: `assetsBySymbols` resolves a ticker to whichever feed
         wins it, and a token must never be priced as a stock. */
      for (const asset of crypto) {
        if (asset.assetType === "crypto") cryptoAsset.set(asset.symbol.toUpperCase(), asset);
      }
      equityAsset = equities;
      const ids = [...cryptoAsset.values(), ...equityAsset.values()].map((asset) => asset.id);
      for (const row of await pricesForIds(ids)) {
        if (Number.isFinite(row.price) && row.price > 0) priceById.set(row.id, row.price);
      }
    } catch (error: unknown) {
      notes.push(note("pyth", `Prices for ${chain.name} could not be read (${message(error, "Pyth unavailable")}); balances are listed unpriced.`));
    }
  }

  const priceOf = (asset: PythAsset | undefined): number | null =>
    asset === undefined ? null : (priceById.get(asset.id) ?? null);

  const ethAsset = cryptoAsset.get(nativeSymbol);
  const ethUsd = priceOf(ethAsset);
  if (ethUsd === null && native.value > BigInt(0) && pythConfigured()) {
    notes.push(note("pyth", `${nativeSymbol} price unavailable; ${chain.name} ${nativeSymbol} is listed uncounted.`));
  }

  const tokens: TokenBalanceRead[] = held.map(({ token, raw }) => {
    if (token.stock !== null) {
      const multiplier = multipliers.get(token.address) ?? token.stock.multiplier;
      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        raw,
        logo: token.logo,
        stable: false,
        priceUsd: stockTokenPrice(priceOf(equityAsset.get(token.symbol)), multiplier),
        marketSymbol: null,
        stockToken: { ticker: token.symbol, multiplier },
      };
    }
    const asset = token.priceSymbol === null ? undefined : cryptoAsset.get(token.priceSymbol.toUpperCase());
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      raw,
      logo: asset?.logo ?? null,
      stable: token.stable,
      priceUsd: priceOf(asset),
      ...(token.marketSymbol !== undefined ? { marketSymbol: token.marketSymbol } : {}),
    };
  });

  /* A stock token Pyth has no equity feed for is priced at Robinhood's own
     token quote, rather than left unpriced (lib/evm/stockTokens.ts). */
  const unpricedStocks = tokens.filter((token) => token.stockToken !== undefined && token.priceUsd === null);
  if (unpricedStocks.length > 0) {
    const quoted = await robinhoodTokenPrices(unpricedStocks.map((token) => token.symbol)).catch(() => new Map<string, number>());
    for (const token of unpricedStocks) token.priceUsd = quoted.get(token.symbol.toUpperCase()) ?? null;
  }

  for (const found of await unlisted) {
    tokens.push({
      address: found.address,
      symbol: found.symbol,
      name: found.name,
      decimals: found.decimals,
      raw: found.raw,
      logo: null,
      stable: false,
      priceUsd: null,
      marketSymbol: null,
      verified: false,
    });
  }

  const rows = evmWalletRows({
    chain: chainKey,
    address: owner,
    scopeId,
    nativeRaw: native.value,
    ethUsd,
    ethLogo: ethAsset?.logo ?? null,
    tokens,
  });

  return {
    holdings: rows.holdings,
    scope: {
      id: scopeId,
      label: `${chain.name} wallet`,
      address: owner,
      chain: chain.name,
      venue: "wallet",
      valueUsd: rows.valueUsd,
      /* A wallet balance backs nothing, so all of it is available. */
      availableUsd: rows.valueUsd,
      unrealizedPnlUsd: null,
    },
    notes,
  };
}
