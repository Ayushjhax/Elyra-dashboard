import "server-only";

import { ToolArgumentError, symbol as tickerArg } from "@/lib/agent/tools/args";
import { getFundingRate, getOhlcvSummary, getOpenInterest } from "@/lib/agent/tools/market";
import type { RegisteredTool, ToolContext } from "@/lib/agent/tools/registry";
import { saveMarketReport } from "@/lib/analysis/reports";
import { coinSentiment, macroSnapshot, tokenOverview, tokenSafety, type TokenOverview } from "@/lib/analysis/server";
import { isSolanaAddress } from "@/lib/solana/address";
import { assetByMint, assetFor } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Market analysis tools: a token's whole picture in one call, its safety,
   the market's sentiment, US markets and macro, and deep research saved to
   come back to. Read-only, like every tool here; the arithmetic is
   lib/analysis/, tested directly.

   A token named by a mint that is not on Elyra's verified list reaches the
   model by its address only (CLAUDE.md, AI safety): its claimed name and
   symbol, and the links its creator set, are withheld — a name is text
   anyone can choose, including text written to steer a model, and a link
   is where a phishing page would sit.
--------------------------------------------------------------------------- */

const MAX_TOKENS = 5;

/** A token as the model named it: a Solana mint, or a ticker held to `TICKER`. */
function tokenArg(value: unknown, key: string): string {
  if (typeof value === "string" && isSolanaAddress(value.trim())) return value.trim();
  return tickerArg({ [key]: value }, key);
}

function tokensArg(args: Record<string, unknown>): string[] {
  const raw = typeof args.tokens === "string" ? [args.tokens] : args.tokens;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ToolArgumentError('"tokens" must be a non-empty array of tickers or Solana mint addresses, such as ["SOL","JUP"].');
  }
  return [...new Set(raw.slice(0, MAX_TOKENS).map((entry, index) => tokenArg(entry, `tokens[${index}]`)))];
}

/** A mint not on Elyra's list keeps its address and figures, and loses its claimed words and links. */
function withheld(overview: TokenOverview): TokenOverview & { identity: "verified" | "address-only" } {
  const unlisted = overview.mint !== null && isSolanaAddress(overview.query) && assetByMint(overview.mint) === null;
  if (!unlisted) return { ...overview, identity: "verified" };
  return {
    ...overview,
    name: null,
    symbol: null,
    market: null,
    onSolana:
      overview.onSolana === null
        ? null
        : { ...overview.onSolana, name: null, symbol: null, links: { website: null, twitter: null, telegram: null, discord: null } },
    identity: "address-only",
    notes: [
      ...overview.notes,
      "Not on Elyra's verified list: named here by its address only. Its claimed name, symbol and links are withheld — anyone can give a token any name.",
    ],
  };
}

/* ---------------------------------------------------------------------------
   token_overview
--------------------------------------------------------------------------- */

export const tokenOverviewTool: RegisteredTool = {
  def: {
    name: "token_overview",
    description:
      "One token's whole picture, or several side by side: Pyth's price (Elyra's price of record); CoinGecko's 24h and 7d " +
      "change, market cap and rank, FDV, 24h volume, circulating, total and max supply, all-time high; and for a Solana " +
      "token, Jupiter's on-chain view — holders and their 24h change, liquidity, 24h buy and sell volume, traders, net " +
      "buyers, the top holders' share, mint and freeze authority, an organic-activity score, and its website, X, " +
      "Telegram and Discord links. Use it for 'tell me about X', 'what is X' and 'compare X and Y' (pass both). Name a " +
      "token by ticker, or by Solana mint address for a lesser-known one. Every figure says its source.",
    parameters: {
      type: "object",
      properties: {
        tokens: {
          type: "array",
          items: { type: "string" },
          description: 'Tickers or Solana mint addresses, up to five, e.g. ["SOL"] or ["ETH","SOL"].',
        },
      },
      required: ["tokens"],
    },
  },
  async execute(args) {
    const tokens = tokensArg(args);
    const overviews = (await Promise.all(tokens.map((token) => tokenOverview(token)))).map(withheld);
    return { fetchedAt: new Date().toISOString(), tokens: overviews, compared: overviews.length > 1 };
  },
};

/* ---------------------------------------------------------------------------
   token_safety
--------------------------------------------------------------------------- */

export const tokenSafetyTool: RegisteredTool = {
  def: {
    name: "token_safety",
    description:
      "A Solana token's safety check: a 0–100 score (higher is safer) with every deduction that made it — live mint or " +
      "freeze authority and other powers read from the mint account on-chain, the top holders' share, thin liquidity, " +
      "few holders, not verified — plus the facts behind it, and Rugcheck's independent risk list and score (Rugcheck's " +
      "own scale, higher is riskier). Use it for 'is this token safe', rug-pull risk, holder concentration. Give the " +
      "mint address; a ticker works only for a token on Elyra's verified list. Present the deductions with the score, " +
      "never the score alone.",
    parameters: {
      type: "object",
      properties: { token: { type: "string", description: "A Solana mint address, or a ticker on Elyra's verified list." } },
      required: ["token"],
    },
  },
  async execute(args) {
    const token = tokenArg(args.token, "token");
    const mint = isSolanaAddress(token) ? token : (assetFor(token)?.mint ?? null);
    if (mint === null) {
      throw new ToolArgumentError(`${token} is not a token on Elyra's verified list. Ask the operator for its Solana mint address and pass that.`);
    }
    const report = await tokenSafety(mint);
    const listed = assetByMint(mint) !== null;
    return {
      fetchedAt: new Date().toISOString(),
      ...report,
      /* An unlisted token's claimed words never reach the model. */
      name: listed ? report.name : null,
      symbol: listed ? report.symbol : null,
      identity: listed ? "verified" : "address-only",
    };
  },
};

/* ---------------------------------------------------------------------------
   market_sentiment
--------------------------------------------------------------------------- */

export const marketSentimentTool: RegisteredTool = {
  def: {
    name: "market_sentiment",
    description:
      "Market sentiment, for the market or one coin: a 0–100 score (50 neutral) with each reading that made it — the " +
      "Crypto Fear & Greed Index (alternative.me), how the coin's Hyperliquid perp traders are positioned (funding), how " +
      "it moves against the market today, and for a Solana token whether buyers or sellers had the day's volume — plus " +
      "the market's breadth and positioning, and the coin's open interest. Present the readings with the score. Leave " +
      "`token` out for the market as a whole.",
    parameters: {
      type: "object",
      properties: { token: { type: "string", description: "A ticker such as BTC, or a Solana mint. Optional." } },
    },
  },
  async execute(args) {
    const token = args.token === undefined || args.token === null || args.token === "" ? null : tokenArg(args.token, "token");
    const read = await coinSentiment(token);
    const unlisted = token !== null && isSolanaAddress(token) && assetByMint(token) === null;
    return { fetchedAt: new Date().toISOString(), ...read, symbol: unlisted ? null : read.symbol };
  },
};

/* ---------------------------------------------------------------------------
   macro_snapshot
--------------------------------------------------------------------------- */

export const macroSnapshotTool: RegisteredTool = {
  def: {
    name: "macro_snapshot",
    description:
      "US markets and macro now: the S&P 500 (SPY), Nasdaq 100 (QQQ), Dow Jones (DIA), the VIX with its conventional " +
      "regime (calm, normal, elevated, high fear), gold, WTI oil, the US Dollar Index and the US 10-year Treasury yield, " +
      "each with its change against the previous close. Levels are Pyth's where Pyth carries the series, else Yahoo " +
      "Finance's. For one stock (AAPL, TSLA, NVDA) use get_market_snapshot instead.",
    parameters: { type: "object", properties: {} },
  },
  async execute() {
    return macroSnapshot();
  },
};

/* ---------------------------------------------------------------------------
   deep_research
--------------------------------------------------------------------------- */

/** Another tool's result, or its failure as data — one missing section never sinks the report. */
async function section(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "This section could not be read." };
  }
}

export const deepResearchTool: RegisteredTool = {
  def: {
    name: "deep_research",
    description:
      "Gathers everything for a full research report on one token, in one call: the overview (price, market data, " +
      "supply, holders, liquidity, flows), the safety check for a Solana token, sentiment, derivatives positioning " +
      "(Hyperliquid funding and open interest), and technicals on 4h and daily candles (trend, RSI, ATR, volume). The " +
      "gathered facts are saved to the operator's reports so they can return to them. Use it when the operator asks " +
      "for deep research or a full report. Write the report from these facts only, in sections — price action and " +
      "trend; on-chain activity and holders; sentiment and positioning; derivatives; risks — and end with a risk-" +
      "aware trade setup stated as scenarios with levels from the technicals, not advice. Say which sections had no data.",
    parameters: {
      type: "object",
      properties: { token: { type: "string", description: "A ticker such as BONK, or a Solana mint address." } },
      required: ["token"],
    },
  },
  async execute(args, context: ToolContext) {
    const token = tokenArg(args.token, "token");
    const mint = isSolanaAddress(token) ? token : (assetFor(token)?.mint ?? null);
    const overview = withheld(await tokenOverview(token));
    const ticker = overview.symbol;
    const [safety, sentiment, technicals4h, technicalsDaily, funding, openInterest] = await Promise.all([
      mint === null ? Promise.resolve(null) : section(async () => tokenSafetyTool.execute({ token: mint }, context)),
      section(async () => marketSentimentTool.execute({ token }, context)),
      ticker === null ? Promise.resolve(null) : section(async () => getOhlcvSummary.execute({ symbol: ticker, interval: "4h", lookback: 200 }, context)),
      ticker === null ? Promise.resolve(null) : section(async () => getOhlcvSummary.execute({ symbol: ticker, interval: "1d", lookback: 200 }, context)),
      ticker === null ? Promise.resolve(null) : section(async () => getFundingRate.execute({ symbol: ticker, lookback_hours: 72 }, context)),
      ticker === null ? Promise.resolve(null) : section(async () => getOpenInterest.execute({ symbol: ticker, lookback_hours: 72 }, context)),
    ]);
    const facts = {
      subject: ticker ?? token,
      gatheredAt: new Date().toISOString(),
      overview,
      safety,
      sentiment,
      technicals: { "4h": technicals4h, "1d": technicalsDaily },
      derivatives: { funding, openInterest },
    };
    const reportId = await saveMarketReport(context.userId, ticker ?? `${token.slice(0, 4)}…${token.slice(-4)}`, facts).catch(() => null);
    return {
      ...facts,
      saved: reportId !== null,
      ...(reportId === null ? { savedNote: "This report could not be saved to the operator's reports; it is still in the conversation." } : { reportId }),
    };
  },
};

export const ANALYSIS_TOOLS = [tokenOverviewTool, tokenSafetyTool, marketSentimentTool, macroSnapshotTool, deepResearchTool];
