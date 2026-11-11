import "server-only";

import { jupiterSwapQuote } from "@/lib/providers/jupiter";
import { routePrices } from "@/lib/providers/router";
import { toBaseUnits } from "@/lib/solana/amount";
import { resolveTokens } from "@/lib/solana/tokens";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Swap previews for the chat surface.

   ── What this can and cannot do, stated once ───────────────────────────

   It fetches a REAL, live, executable Jupiter quote: the actual route, the
   actual output amount, the actual price impact, the actual worst case after
   slippage. Nothing here is illustrative.

   It cannot execute. Signing a Solana transaction needs the user's key, and
   this repository has no signing path — `signTransaction`, `sendTransaction`
   and `signAndSendTransaction` appear nowhere in it. Rather than hide that
   behind a button that fails, the preview says so in the message, and the
   button leads to the surface that will do it when one exists.

   ── Why the quote is fetched with the user's own address ───────────────

   Jupiter's `/swap/v2/order` builds a transaction, so it needs a taker, and
   it returns 400 for a wallet that cannot afford the trade. That is a
   feature: a quote that came back is a quote that was executable at the
   moment it was read, for this wallet, with this balance. A speculative
   quote for a wallet with nothing in it would be a number with no meaning.

   ── Symbols to mints ───────────────────────────────────────────────────

   Users type "SOL", not a base58 mint. The mapping below covers the majors
   explicitly rather than searching: a fuzzy symbol search that resolves
   "USDC" to a lookalike mint is how someone swaps their balance into a
   worthless token with a familiar name. Anything not on this list is
   refused by name.
--------------------------------------------------------------------------- */

export type AssetClass =
  | "crypto"
  | "meme"
  | "stablecoin"
  | "yield"
  | "metal"
  | "equity"
  | "index"
  | "bond";

/**
 * Who issues a tokenised security, where that is a fact worth checking.
 *
 * Each issuer mints from a recognisable address: Backed's xStocks all begin
 * "Xs" and Ondo's tokens all end "ondo". The tests hold every entry to its
 * issuer's pattern, which catches a pasted lookalike — it is not a
 * substitute for verifying each mint by hand.
 */
export type Issuer = "backed" | "ondo";

export interface TradableAsset {
  mint: string;
  decimals: number;
  name: string;
  class: AssetClass;
  issuer?: Issuer;
}

/**
 * Mints resolvable by symbol, each one verified by hand against Jupiter.
 *
 * ── Why this is an allowlist and not a search ──────────────────────────
 *
 * Every asset here has a lookalike. Searching Jupiter for "GLDX" returns the
 * real Gold xStock AND a pump.fun token with the identical symbol; the same
 * is true for XAUT, TSLAX and most of the rest. A fuzzy symbol match is how
 * someone swaps their balance into a worthless token with a familiar name,
 * and the resolution would look completely ordinary in the logs.
 *
 * So each entry was resolved once, checked against the issuer's own mint, and
 * written down. Adding one is a deliberate edit, because every entry is a
 * symbol the product will confidently trade INTO on a user's word.
 *
 * ── Liquidity was checked, not assumed ─────────────────────────────────
 *
 * Every mint below was priced live through Jupiter with its routable
 * liquidity. SILVER IS DELIBERATELY ABSENT: SLVx exists and prices fine, but
 * carries about one dollar of routable liquidity, so a swap into it would be
 * destroyed by slippage. Listing it because the ticker resolves would be
 * offering a trade that cannot be made.
 *
 * xStocks are issued by Backed Finance; their mints all begin "Xs", which is
 * a useful sanity check but not a substitute for verifying each one.
 *
 * ── Ondo tokens trade by request for quote, in their window ────────────
 *
 * The "on" symbols are Ondo Global Markets' tokenised stocks and ETFs. They
 * have almost no pool liquidity; Jupiter routes them through JupiterZ, where
 * Ondo's market maker quotes each order. Verified live on 9 November 2026:
 * every one below is on Jupiter's verified list, carries a price, and filled
 * a $250 USDC quote through JupiterZ at well under 0.1% impact — when the
 * maker is quoting. Outside its window Jupiter answers "Trading is not
 * available outside of market hours", and that sentence reaches the person
 * as it is, because it is the true reason and it says when to come back.
 *
 * Verified but absent: HYGon, BILon, SHYon and IEIon have mints and no price,
 * so a holding of one could not be valued — and a fund held at an unknown
 * value cannot be rebalanced.
 *
 * Ondo's tokens, like xStocks, are not offered to US persons. That is a
 * condition of the asset, not of this list, and the surfaces that offer
 * them say so.
 */
const MINTS: Record<string, TradableAsset> = {
  /* --- crypto --- */
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9, name: "Solana", class: "crypto" },
  JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, name: "Jupiter", class: "crypto" },
  JITOSOL: { mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", decimals: 9, name: "Jito Staked SOL", class: "crypto" },
  JLP: { mint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", decimals: 6, name: "Jupiter Perps LP", class: "crypto" },
  /* Coinbase's wrapped bitcoin: the deepest BTC on Solana, routed by both
     pools and JupiterZ. */
  CBBTC: { mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", decimals: 8, name: "Coinbase Wrapped BTC", class: "crypto" },

  /* --- memecoins ---
     Verified on 10 November 2026 like everything above: each is on Jupiter's
     verified list (WIF is listed there as "$WIF" — the mint is what was
     checked), holds over $1M of routable liquidity, and quoted $250 of USDC
     at well under 1% impact. Every one of them has dozens of same-named
     copies; only these mints trade. GIGA is absent: it priced fine but had
     under $1M of liquidity. Memecoins can lose most of their value in hours;
     the swap does not say otherwise. */
  BONK: { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, name: "Bonk", class: "meme" },
  WIF: { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6, name: "dogwifhat", class: "meme" },
  POPCAT: { mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", decimals: 9, name: "Popcat", class: "meme" },
  PENGU: { mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv", decimals: 6, name: "Pudgy Penguins", class: "meme" },
  FARTCOIN: { mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump", decimals: 6, name: "Fartcoin", class: "meme" },
  TRUMP: { mint: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN", decimals: 6, name: "OFFICIAL TRUMP", class: "meme" },
  MEW: { mint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", decimals: 5, name: "cat in a dogs world", class: "meme" },
  BOME: { mint: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", decimals: 6, name: "BOOK OF MEME", class: "meme" },
  MOODENG: { mint: "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY", decimals: 6, name: "Moo Deng", class: "meme" },
  GOAT: { mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump", decimals: 6, name: "Goatseus Maximus", class: "meme" },
  PNUT: { mint: "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump", decimals: 6, name: "Peanut the Squirrel", class: "meme" },
  USELESS: { mint: "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk", decimals: 6, name: "USELESS COIN", class: "meme" },

  /* --- stablecoins --- */
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, name: "USD Coin", class: "stablecoin" },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, name: "Tether", class: "stablecoin" },

  /* --- yield-bearing dollars ---
     Not stablecoins: each is priced above a dollar and rises as it earns, so
     the yield is in the price rather than paid out. USDY is Ondo's claim on
     short Treasuries and bank deposits (not offered to US persons); syrupUSDC
     is Maple's overcollateralised lending pool. */
  USDY: { mint: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6", decimals: 6, name: "Ondo US Dollar Yield", class: "yield" },
  SYRUPUSDC: { mint: "AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj", decimals: 6, name: "Syrup USDC (Maple)", class: "yield" },

  /* --- metals ---
     Gold three ways. XAUT and PAXG are redeemable claims on allocated bullion;
     GLDx is a tokenised share of the SPDR Gold Trust, so it tracks the ETF
     rather than spot and carries the fund's fee. They are not the same asset
     and the names say which is which. */
  XAUT: { mint: "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P", decimals: 6, name: "Tether Gold (1oz bullion)", class: "metal" },
  PAXG: { mint: "5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW", decimals: 8, name: "PAX Gold (1oz bullion)", class: "metal" },
  GLDX: { mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", decimals: 8, name: "Gold xStock (SPDR GLD ETF)", class: "metal", issuer: "backed" },
  GLDON: { mint: "hWfiw4mcxT8rnNFkk6fsCQSxoxgZ9yVhB6tyeVcondo", decimals: 9, name: "SPDR Gold Shares (Ondo)", class: "metal", issuer: "ondo" },
  IAUON: { mint: "M77ZvkZ8zW5udRbuJCbuwSwavRa7bGAZYMTwru8ondo", decimals: 9, name: "iShares Gold Trust (Ondo)", class: "metal", issuer: "ondo" },

  /* --- tokenised equities --- */
  TSLAX: { mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", decimals: 8, name: "Tesla xStock", class: "equity", issuer: "backed" },
  NVDAX: { mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8, name: "NVIDIA xStock", class: "equity", issuer: "backed" },
  AAPLX: { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, name: "Apple xStock", class: "equity", issuer: "backed" },
  MSFTX: { mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8, name: "Microsoft xStock", class: "equity", issuer: "backed" },
  GOOGLX: { mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8, name: "Alphabet xStock", class: "equity", issuer: "backed" },
  AMZNX: { mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8, name: "Amazon xStock", class: "equity", issuer: "backed" },
  METAX: { mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8, name: "Meta xStock", class: "equity", issuer: "backed" },
  COINX: { mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", decimals: 8, name: "Coinbase xStock", class: "equity", issuer: "backed" },
  MSTRX: { mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", decimals: 8, name: "MicroStrategy xStock", class: "equity", issuer: "backed" },

  NVDAON: { mint: "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo", decimals: 9, name: "NVIDIA (Ondo)", class: "equity", issuer: "ondo" },
  MSFTON: { mint: "FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo", decimals: 9, name: "Microsoft (Ondo)", class: "equity", issuer: "ondo" },
  GOOGLON: { mint: "bbahNA5vT9WJeYft8tALrH1LXWffjwqVoUbqYa1ondo", decimals: 9, name: "Alphabet Class A (Ondo)", class: "equity", issuer: "ondo" },
  METAON: { mint: "fDxs5y12E7x7jBwCKBXGqt71uJmCWsAQ3Srkte6ondo", decimals: 9, name: "Meta Platforms (Ondo)", class: "equity", issuer: "ondo" },
  AMZNON: { mint: "14Tqdo8V1FhzKsE3W2pFsZCzYPQxxupXRcqw9jv6ondo", decimals: 9, name: "Amazon (Ondo)", class: "equity", issuer: "ondo" },
  AAPLON: { mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo", decimals: 9, name: "Apple (Ondo)", class: "equity", issuer: "ondo" },
  TSLAON: { mint: "KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo", decimals: 9, name: "Tesla (Ondo)", class: "equity", issuer: "ondo" },
  AVGOON: { mint: "1FWZtdWN7y38BSXGzbs8D6Shk88oL9atDNgbVz9ondo", decimals: 9, name: "Broadcom (Ondo)", class: "equity", issuer: "ondo" },
  TSMON: { mint: "keybg184d4vyXeQdFqs4o99YsMg7xBthxTJ6Ky3ondo", decimals: 9, name: "Taiwan Semiconductor (Ondo)", class: "equity", issuer: "ondo" },
  AMDON: { mint: "14diAn5z8kjrKwSC8WLqvBqqe5YmihJhjxRxd8Z6ondo", decimals: 9, name: "AMD (Ondo)", class: "equity", issuer: "ondo" },
  PLTRON: { mint: "HfsnTS5qtdStwec9DfBrunRqnAMYMMz1kjv9Hu9ondo", decimals: 9, name: "Palantir (Ondo)", class: "equity", issuer: "ondo" },
  KOON: { mint: "e6G4pfFcrdKxJuZ4YXixRFfMbpMvgXG2Mjcus71ondo", decimals: 9, name: "Coca-Cola (Ondo)", class: "equity", issuer: "ondo" },
  PGON: { mint: "GZ8v4NdSG7CTRZqHMgNsTPRULeVi8CpdWd9wZY8ondo", decimals: 9, name: "Procter & Gamble (Ondo)", class: "equity", issuer: "ondo" },
  JNJON: { mint: "KUXt7LzHWSQXp5eyqMZRxWjAP6yM8BUh4LRHwiwondo", decimals: 9, name: "Johnson & Johnson (Ondo)", class: "equity", issuer: "ondo" },
  XOMON: { mint: "qCYD74QnXzd9pzv6pGHQKJVwoibL6sNcPQDnpDiondo", decimals: 9, name: "Exxon Mobil (Ondo)", class: "equity", issuer: "ondo" },
  VZON: { mint: "igu1coP6n3GPaWmbd8J9Z7UAyLpV254uQFFNfydondo", decimals: 9, name: "Verizon (Ondo)", class: "equity", issuer: "ondo" },

  /* --- indices --- */
  SPYX: { mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", decimals: 8, name: "S&P 500 xStock", class: "index", issuer: "backed" },
  QQQX: { mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", decimals: 8, name: "Nasdaq 100 xStock", class: "index", issuer: "backed" },
  QQQON: { mint: "HrYNm6jTQ71LoFphjVKBTdAE4uja7WsmLG8VxB8ondo", decimals: 9, name: "Invesco QQQ (Ondo)", class: "index", issuer: "ondo" },
  IVVON: { mint: "CqW2pd6dCPG9xKZfAsTovzDsMmAGKJSDBNcwM96ondo", decimals: 9, name: "iShares Core S&P 500 ETF (Ondo)", class: "index", issuer: "ondo" },
  VTION: { mint: "jCCU4GwukjNxAXJowG2S4KCrr5g6YyUB61WHYvGondo", decimals: 9, name: "Vanguard Total Stock Market ETF (Ondo)", class: "index", issuer: "ondo" },
  EFAON: { mint: "AbvryMGnaba9oADMZk8Vp2Av6MtczsncGyfWaC4ondo", decimals: 9, name: "iShares MSCI EAFE ETF (Ondo)", class: "index", issuer: "ondo" },
  IEMGON: { mint: "cdVNL7wK8mf1UCDqM6zdrziRv4hmvqWhXeTcck2ondo", decimals: 9, name: "iShares Core MSCI Emerging Markets ETF (Ondo)", class: "index", issuer: "ondo" },

  /* --- bond funds --- */
  SGOVON: { mint: "HjrN6ChZK2QRL6hMXayjGPLFvxhgjwKEy135VRjondo", decimals: 9, name: "iShares 0-3 Month Treasury Bond ETF (Ondo)", class: "bond", issuer: "ondo" },
  IEFON: { mint: "D4uWxzR5StYC6sTRhVts8Eboy3pmVtHeNC62dnQondo", decimals: 9, name: "iShares 7-10 Year Treasury Bond ETF (Ondo)", class: "bond", issuer: "ondo" },
  TLTON: { mint: "KaSLSWByKy6b9FrCYXPEJoHmLpuFZtTCJk1F1Z9ondo", decimals: 9, name: "iShares 20+ Year Treasury Bond ETF (Ondo)", class: "bond", issuer: "ondo" },
  TIPON: { mint: "k6BPp2Xmf2TYgrZiUyWfUoZBKeqaDbvPoAVgSx2ondo", decimals: 9, name: "iShares TIPS Bond ETF (Ondo)", class: "bond", issuer: "ondo" },
  AGGON: { mint: "13qTjKx53y6LKGGStiKeieGbnVx3fx1bbwopKFb3ondo", decimals: 9, name: "iShares Core US Aggregate Bond ETF (Ondo)", class: "bond", issuer: "ondo" },
};

/**
 * Symbols that resolve but are deliberately refused, and why.
 *
 * A refusal that names the reason is worth far more than silence: "I cannot
 * find SLVX" reads as a gap in the product, where the truth is that the
 * market for it is too thin to trade.
 */
const REFUSED: Record<string, string> = {
  SLVX: "SLVx exists but has almost no routable liquidity on Solana — a swap into it would lose most of its value to slippage.",
  XAGX: "There is no silver token with usable liquidity on Solana yet.",
  SILVER: "There is no silver token with usable liquidity on Solana yet.",
};

export interface SwapRequest {
  fromSymbol: string;
  toSymbol: string;
  /**
   * Human units, EXACTLY as typed, as a string.
   *
   * A string rather than a number because the conversion to base units has to
   * be exact. `1234.567891` stored as a double is `1234.56789099999991…`, and
   * converting that gives 1234.567890 — the user's last unit, silently gone.
   * The digits they typed are the digits that get converted.
   */
  amountText: string;
  /** The same figure as a number. For display and comparison only. */
  amount: number;
}

/** Parses `/swap 1.5 SOL to USDC`, and the shapes people actually type. */
export function parseSwapCommand(argument: string): SwapRequest | null {
  const cleaned = argument.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return null;

  /* "1.5 SOL to USDC", "1.5 SOL USDC", "1.5 SOL -> USDC", "1.5 sol for usdc" */
  const match = /^([\d.,]+)\s+([A-Za-z][A-Za-z0-9]{0,11})(?:\s+(?:to|for|into|->|>))?\s+([A-Za-z][A-Za-z0-9]{0,11})$/.exec(
    cleaned,
  );
  if (match === null) return null;

  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    amountText: match[1].replace(/,/g, ""),
    amount,
    fromSymbol: match[2].toUpperCase(),
    toSymbol: match[3].toUpperCase(),
  };
}

export function knownSymbols(): string[] {
  return Object.keys(MINTS);
}

/** What can be traded, grouped, for a help message that is worth reading. */
export function catalogue(): Array<{ label: string; symbols: string[] }> {
  const groups: Array<[AssetClass, string]> = [
    ["crypto", "Crypto"],
    ["meme", "Memecoins"],
    ["stablecoin", "Stablecoins"],
    ["yield", "Yield-bearing dollars"],
    ["metal", "Gold"],
    ["equity", "Stocks"],
    ["index", "Index funds"],
    ["bond", "Bond funds"],
  ];

  return groups.map(([key, label]) => ({
    label,
    symbols: Object.entries(MINTS)
      .filter(([, asset]) => asset.class === key)
      .map(([symbol]) => symbol),
  }));
}

/** The stated reason a resolvable symbol is refused, if there is one. */
export function refusalFor(symbol: string): string | null {
  return REFUSED[symbol.trim().toUpperCase()] ?? null;
}

/* Exact decimal ↔ base-unit conversion lives in a pure module so the
   website, the app and the portfolio planner share one definition of a valid
   amount. Re-exported here for the callers that already import it from this
   file. */
export { toBaseUnits } from "@/lib/solana/amount";

/** A token outside the allowlist, as the swap route resolved it from the chain. */
export interface UnlistedMint {
  mint: string;
  decimals: number;
  /** What the person is told, before they sign, about this token. */
  warnings: string[];
}

export interface SwapPreview {
  action: PreparedAction;
  /** Rendered separately so the caller can decide where the caveat goes. */
  note: string;
  /**
   * The unsigned transaction Jupiter built, base64.
   *
   * Absent when the route came back without one, which is the case that
   * keeps `readiness` at `unsupported`: there is a price to show but nothing
   * to sign, and offering a confirm for it would be a button that cannot work.
   */
  unsignedTransaction?: string;
  /** Jupiter's handle for this order, required to submit the signed bytes. */
  quoteRef?: string;
}

const fmt = (value: number, digits = 6): string =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * A live quote, as a prepared action.
 *
 * Returns `readiness: "unsupported"` on success, with the reason naming the
 * missing piece. The numbers are real; the execution is not available. Those
 * are two different facts and the preview states both.
 */
export async function previewSwap(input: {
  request: SwapRequest;
  solanaAddress: string | null;
  /**
   * A side named by a mint that is not on the allowlist, resolved by the
   * caller from the chain (decimals from the mint account, never the
   * request) after the person acknowledged it. Only the website's swap
   * route passes this; the chat command resolves symbols alone.
   */
  unlisted?: { from?: UnlistedMint; to?: UnlistedMint };
}): Promise<SwapPreview | { error: string }> {
  const { fromSymbol, toSymbol, amount } = input.request;

  if (fromSymbol === toSymbol) {
    return { error: "Those are the same token." };
  }

  const from: { mint: string; decimals: number } | undefined = input.unlisted?.from ?? MINTS[fromSymbol];
  const to: { mint: string; decimals: number } | undefined = input.unlisted?.to ?? MINTS[toSymbol];
  if (from !== undefined && to !== undefined && from.mint === to.mint) {
    return { error: "Those are the same token." };
  }

  if (from === undefined || to === undefined) {
    const unknown = from === undefined ? fromSymbol : toSymbol;

    /* A symbol that is refused for a REASON says the reason. "I cannot find
       SLVX" reads as a gap in the product; "silver has no liquidity here" is
       the actual state of the market. */
    const refusal = refusalFor(unknown);
    if (refusal !== null) return { error: refusal };

    /* Named, not silently substituted. A fuzzy match that resolves "GLDX" to
       the pump.fun token of the same name is how a balance becomes worthless. */
    return {
      error:
        `I do not have a verified mint for ${unknown}. I can quote:\n` +
        catalogue()
          .map((group) => `${group.label}: ${group.symbols.join(", ")}`)
          .join("\n"),
    };
  }

  if (input.solanaAddress === null) {
    return {
      error:
        "No Solana wallet is connected to your account, and a swap quote is " +
        "built for a specific wallet — Jupiter needs to know who would sign " +
        "it. Connect one in Elyra first.",
    };
  }

  const baseUnits = toBaseUnits(input.request.amountText, from.decimals);
  if (baseUnits === null) {
    return { error: "That amount is not something I can quote." };
  }

  const quote = await jupiterSwapQuote({
    inputMint: from.mint,
    outputMint: to.mint,
    amount: baseUnits,
    taker: input.solanaAddress,
  });

  if (!quote.ok || quote.data === undefined) {
    return {
      error:
        quote.error?.message ??
        "Jupiter could not quote that route right now.",
    };
  }

  const out = Number(quote.data.outAmount) / 10 ** to.decimals;
  const minOut =
    quote.data.minOutAmount === undefined
      ? null
      : Number(quote.data.minOutAmount) / 10 ** to.decimals;

  /* The USD figure is priced separately rather than taken from the route, so
     a route with unusual pricing cannot quietly restate what the trade is
     worth. An unavailable price is omitted, not guessed. */
  const prices = await routePrices([from.mint, to.mint]);
  const priceOf = (mint: string): number | null =>
    prices.data?.find((quoteRow) => quoteRow.id === mint)?.usdPrice ?? null;

  const fromUsd = priceOf(from.mint);
  const toUsd = priceOf(to.mint);

  const fields: PreparedAction["fields"] = [
    { label: "Sell", value: `${fmt(amount)} ${fromSymbol}`, derived: false },
    { label: "Receive (estimated)", value: `${fmt(out)} ${toSymbol}`, derived: true },
  ];

  if (minOut !== null) {
    fields.push({
      label: "Guaranteed minimum",
      value: `${fmt(minOut)} ${toSymbol}`,
      derived: true,
    });
  }

  fields.push({
    label: "Rate",
    value: `1 ${fromSymbol} = ${fmt(out / amount)} ${toSymbol}`,
    derived: true,
  });

  if (fromUsd !== null && toUsd !== null) {
    fields.push({
      label: "Value",
      value: `$${fmt(amount * fromUsd, 2)} → $${fmt(out * toUsd, 2)}`,
      derived: true,
    });
  }

  if (quote.data.priceImpactPct !== undefined) {
    /* Already a percentage — the Jupiter adapter converts the fraction the
       API returns. Multiplying again here would print 150% for a 1.5% impact
       and make the threshold below fire on every trade. */
    fields.push({
      label: "Price impact",
      value: `${quote.data.priceImpactPct.toFixed(3)}%`,
      derived: true,
    });
  }

  if (quote.data.routeLabels !== undefined && quote.data.routeLabels.length > 0) {
    fields.push({
      label: "Route",
      value: quote.data.routeLabels.join(" → "),
      derived: true,
    });
  }

  const warnings: string[] = [
    ...(input.unlisted?.from?.warnings ?? []),
    ...(input.unlisted?.to?.warnings ?? []),
  ];

  /* Above roughly one percent the quoted output is materially worse than the
     mid price, and someone reading a rate on a phone will not work that out
     from the impact figure alone. Compared against 1, not 0.01: the value is
     a percentage. */
  if (quote.data.priceImpactPct !== undefined && quote.data.priceImpactPct > 1) {
    warnings.push(
      `Price impact is ${quote.data.priceImpactPct.toFixed(2)}% — this size moves the market.`,
    );
  }

  if (quote.data.expiresAt !== undefined) {
    warnings.push("This quote is only good for about twenty seconds.");
  }

  /* A route without a transaction is a price, not a trade. Jupiter returns
     one for a taker it could actually build for, so its absence is the
     signal that this quote is not signable — and readiness follows the
     bytes rather than the happy path. */
  const unsignedTransaction = quote.data.unsignedTransaction;
  const signable =
    typeof unsignedTransaction === "string" &&
    unsignedTransaction.length > 0 &&
    typeof quote.data.quoteRef === "string";

  return {
    action: {
      id: quote.data.quoteRef ?? `${from.mint}:${to.mint}:${baseUnits}`,
      kind: "swap",
      summary: `Swap ${fmt(amount)} ${fromSymbol} to ${fmt(out)} ${toSymbol}`,
      fields,
      readiness: signable ? "ready" : "unsupported",
      /* Jupiter's own words when it has them. It priced this route and knows
         precisely why it could not build it — "Insufficient funds" is the
         common one, and it tells the operator what to do next in a way no
         generic sentence about missing bytes ever would. */
      reason: signable
        ? null
        : quote.data.unexecutableReason !== undefined
          ? `Jupiter could not build this swap: ${quote.data.unexecutableReason}. The price above is live.`
          : "Jupiter quoted this route but did not return a transaction for it, " +
            "so there is nothing to sign. The price above is live; the trade is not available.",
      warnings,
      preparedAt: quote.asOf,
    },
    /* Still says nothing has been sent, because nothing has: signing happens
       in the browser, against this same quote, only once the operator
       confirms it there. */
    note: signable
      ? "Nothing has been sent — confirm in Elyra to sign it."
      : "Nothing has been sent.",
    unsignedTransaction: signable ? unsignedTransaction : undefined,
    quoteRef: signable ? quote.data.quoteRef : undefined,
  };
}

/** Resolves a symbol to a verified mint, for callers outside the swap path. */
export function mintFor(symbol: string): string | null {
  return MINTS[symbol.trim().toUpperCase()]?.mint ?? null;
}

export function assetFor(symbol: string): TradableAsset | null {
  return MINTS[symbol.trim().toUpperCase()] ?? null;
}

/**
 * The verified entry for a MINT, with its symbol — the reverse of `assetFor`.
 * Matched by address only: a token that merely shares a verified symbol is
 * not the verified asset, and this is how the Asset Passport tells them apart.
 */
export function assetByMint(mint: string): (TradableAsset & { symbol: string }) | null {
  for (const [symbol, asset] of Object.entries(MINTS)) {
    if (asset.mint === mint) return { ...asset, symbol };
  }
  return null;
}

/** The token metadata service, for symbols not on the allowlist. */
export async function describeMint(mint: string): Promise<string | null> {
  const resolved = await resolveTokens([mint]);
  return resolved.get(mint)?.symbol ?? null;
}
