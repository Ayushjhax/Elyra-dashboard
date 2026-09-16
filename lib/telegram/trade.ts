import "server-only";

import { jupiterSwapQuote } from "@/lib/providers/jupiter";
import { routePrices } from "@/lib/providers/router";
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

export type AssetClass = "crypto" | "stablecoin" | "metal" | "equity" | "index";

export interface TradableAsset {
  mint: string;
  decimals: number;
  name: string;
  class: AssetClass;
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
 */
const MINTS: Record<string, TradableAsset> = {
  /* --- crypto --- */
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9, name: "Solana", class: "crypto" },
  JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, name: "Jupiter", class: "crypto" },
  JITOSOL: { mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", decimals: 9, name: "Jito Staked SOL", class: "crypto" },
  BONK: { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, name: "Bonk", class: "crypto" },
  JLP: { mint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", decimals: 6, name: "Jupiter Perps LP", class: "crypto" },

  /* --- stablecoins --- */
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, name: "USD Coin", class: "stablecoin" },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, name: "Tether", class: "stablecoin" },

  /* --- metals ---
     Gold three ways. XAUT and PAXG are redeemable claims on allocated bullion;
     GLDx is a tokenised share of the SPDR Gold Trust, so it tracks the ETF
     rather than spot and carries the fund's fee. They are not the same asset
     and the names say which is which. */
  XAUT: { mint: "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P", decimals: 6, name: "Tether Gold (1oz bullion)", class: "metal" },
  PAXG: { mint: "5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW", decimals: 8, name: "PAX Gold (1oz bullion)", class: "metal" },
  GLDX: { mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", decimals: 8, name: "Gold xStock (SPDR GLD ETF)", class: "metal" },

  /* --- tokenised equities --- */
  TSLAX: { mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", decimals: 8, name: "Tesla xStock", class: "equity" },
  NVDAX: { mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8, name: "NVIDIA xStock", class: "equity" },
  AAPLX: { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, name: "Apple xStock", class: "equity" },
  MSFTX: { mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8, name: "Microsoft xStock", class: "equity" },
  GOOGLX: { mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8, name: "Alphabet xStock", class: "equity" },
  AMZNX: { mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8, name: "Amazon xStock", class: "equity" },
  METAX: { mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8, name: "Meta xStock", class: "equity" },
  COINX: { mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", decimals: 8, name: "Coinbase xStock", class: "equity" },
  MSTRX: { mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", decimals: 8, name: "MicroStrategy xStock", class: "equity" },

  /* --- indices --- */
  SPYX: { mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", decimals: 8, name: "S&P 500 xStock", class: "index" },
  QQQX: { mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", decimals: 8, name: "Nasdaq 100 xStock", class: "index" },
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
    ["stablecoin", "Stablecoins"],
    ["metal", "Gold"],
    ["equity", "Stocks"],
    ["index", "Indices"],
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

/**
 * Converts a decimal amount STRING to base units, exactly.
 *
 * No floating point anywhere in here, which is the whole point. Two ways the
 * obvious implementations go wrong:
 *
 *   `1.1 * 10 ** 9`        → 1100000000.0000001 — a swap amount one lamport
 *                            off is one the venue rejects.
 *   `Number("1234.567891")` → 1234.56789099999991… — truncating THAT loses the
 *                            user's last unit, and rounding it up quotes a
 *                            swap for more than they typed.
 *
 * So the digits the user typed are shifted by hand. Precision beyond the
 * token's decimals is truncated, never rounded: rounding up would quote a
 * trade larger than the balance it was sized against.
 */
export function toBaseUnits(amount: string, decimals: number): string | null {
  const text = amount.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;

  const [whole = "", fraction = ""] = text.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${whole}${padded}`.replace(/^0+(?=\d)/, "");

  /* An amount that rounds away to nothing at this precision is not a trade. */
  return /^\d+$/.test(combined) && /[1-9]/.test(combined) ? combined : null;
}

export interface SwapPreview {
  action: PreparedAction;
  /** Rendered separately so the caller can decide where the caveat goes. */
  note: string;
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
}): Promise<SwapPreview | { error: string }> {
  const { fromSymbol, toSymbol, amount } = input.request;

  if (fromSymbol === toSymbol) {
    return { error: "Those are the same token." };
  }

  const from = MINTS[fromSymbol];
  const to = MINTS[toSymbol];

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

  const warnings: string[] = [];

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

  return {
    action: {
      id: quote.data.quoteRef ?? `${from.mint}:${to.mint}:${baseUnits}`,
      kind: "swap",
      summary: `Swap ${fmt(amount)} ${fromSymbol} to ${fmt(out)} ${toSymbol}`,
      fields,
      /* The numbers are live and correct. Execution is what is missing, and
         conflating the two would either overstate the preview or understate
         the quote. */
      readiness: "unsupported",
      reason:
        "Elyra cannot sign transactions yet, so this cannot be executed from " +
        "here. The quote above is live — it is what Jupiter would route right now.",
      warnings,
      preparedAt: quote.asOf,
    },
    note: "Nothing has been sent.",
  };
}

/** Resolves a symbol to a verified mint, for callers outside the swap path. */
export function mintFor(symbol: string): string | null {
  return MINTS[symbol.trim().toUpperCase()]?.mint ?? null;
}

export function assetFor(symbol: string): TradableAsset | null {
  return MINTS[symbol.trim().toUpperCase()] ?? null;
}

/** The token metadata service, for symbols not on the allowlist. */
export async function describeMint(mint: string): Promise<string | null> {
  const resolved = await resolveTokens([mint]);
  return resolved.get(mint)?.symbol ?? null;
}
