import "server-only";

import { symbol as symbolArg, ToolArgumentError } from "@/lib/agent/tools/args";
import type { RegisteredTool, ToolContext } from "@/lib/agent/tools/registry";
import { composePortfolio } from "@/lib/portfolio/compose";
import { annualisedFundingPct } from "@/lib/providers/binance-public";
import { hyperliquidFills, hyperliquidOpenOrders } from "@/lib/providers/hyperliquid-account";
import { polymarketSearch, polymarketTrending } from "@/lib/providers/polymarket";
import { raydiumPools } from "@/lib/providers/raydium";
import {
  routeDefiPositions,
  routePerpMarket,
  routePrices,
  providerHealthReport,
} from "@/lib/providers/router";
import { liquidationHeadroom, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The semantic tool layer.

   The model asks questions in the product's own vocabulary — "what do I hold",
   "how close is that to liquidation", "what does this perp cost to carry" —
   and this layer answers them. It does NOT expose providers. There is no
   `call_kamino` tool and there never should be: a model choosing between
   Jupiter and Birdeye for a price will occasionally choose the one that is
   down, and will choose differently on two identical questions. Provider
   selection is `lib/providers/router`'s job and it is deterministic.

   Three rules every tool here obeys.

   NO SECRET REACHES MODEL CONTEXT. Nothing returned below contains a key, a
   credential, a header, or an upstream URL. Provider errors arrive
   pre-summarised by `lib/providers/http`, which strips response bodies for
   exactly this reason.

   IDENTITY IS NEVER AN ARGUMENT. No tool takes a userId, a wallet address or
   an account id. Those come from `ToolContext`, resolved from a verified
   session upstream. A model that could pass an address could be talked into
   passing someone else's — by a token name, a chart annotation, or anything
   else that reaches a prompt from outside.

   EVERY NUMBER CARRIES ITS PROVENANCE. `asOf`, `partial` and `warnings`
   travel with the payload so the model can say "your Kamino leverage section
   was not indexed" instead of quietly reporting a smaller number.
--------------------------------------------------------------------------- */

/** Provider envelope → the flat shape a model reads well. */
function unwrap<T>(result: ToolResult<T>, empty: T): Record<string, unknown> {
  if (!result.ok || result.data === undefined) {
    return {
      error: result.error?.message ?? "This could not be read.",
      code: result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      /* Said explicitly because the model's instinct is to fill the gap. */
      note: "Report that this is unavailable. Do not estimate it.",
    };
  }

  return {
    data: result.data ?? empty,
    asOf: result.asOf,
    source: result.provider,
    ...(result.stale === true ? { stale: true } : {}),
    ...(result.partial === true ? { incomplete: true } : {}),
    ...(result.warnings !== undefined && result.warnings.length > 0
      ? { warnings: result.warnings }
      : {}),
  };
}

function money(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

/* ---------------------------------------------------------------------------
   portfolio.*
--------------------------------------------------------------------------- */

async function snapshotFor(context: ToolContext) {
  return composePortfolio({
    userId: context.userId,
    solanaAddress: context.solanaAddress ?? null,
    sessionWallet: context.sessionWallet,
  });
}

export const portfolioOverview: RegisteredTool = {
  def: {
    name: "portfolio_overview",
    description:
      "The caller's total capital across every connected venue: wallets " +
      "(Solana, plus the EVM wallet on Ethereum and Robinhood Chain), " +
      "exchanges, perpetuals and DeFi protocols. Returns equity, available " +
      "capital, unrealised PnL and a per-venue breakdown. Perpetual accounts " +
      "are counted at MARGIN, not notional — a 5x position on $1,000 adds " +
      "about $1,000 to equity, not $5,000. Call this before answering any " +
      "question about what the user holds or is worth.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute(_args, context) {
    const snapshot = await snapshotFor(context);

    return {
      asOf: snapshot.asOf,
      totalValueUsd: money(snapshot.summary.totalValueUsd),
      availableCapitalUsd: money(snapshot.summary.availableCapitalUsd),
      unrealizedPnlUsd: money(snapshot.summary.unrealizedPnlUsd),
      venues: snapshot.scopes.map((scope) => ({
        venue: scope.venue,
        label: scope.label,
        valueUsd: money(scope.valueUsd ?? null),
      })),
      counts: {
        spot: snapshot.spot.length,
        perps: snapshot.perps.length,
        defi: snapshot.defi.length,
      },
      /* The model must say this out loud when true. A total presented as
         complete when a venue failed is the worst output this system can
         produce — it is wrong and it looks authoritative. */
      incomplete: snapshot.partial,
      unreadable: snapshot.notes
        .filter((entry) => entry.kind === "failed")
        .map((entry) => ({ scope: entry.scope, reason: entry.reason })),
      notYetSupported: snapshot.notes
        .filter((entry) => entry.kind === "missing")
        .map((entry) => entry.scope),
    };
  },
};

export const portfolioHoldings: RegisteredTool = {
  def: {
    name: "portfolio_holdings",
    description:
      "Every spot token the caller holds, with quantity, USD value, 24h " +
      "change, share of the portfolio and the network it is on (Solana, " +
      "Ethereum, Base, Arbitrum, BNB Chain, Robinhood Chain, Sui, or an " +
      "exchange). The same symbol on two networks is two holdings. A Robinhood " +
      "Stock Token carries stockToken {ticker, sharesPerToken}: an ERC-20 on " +
      "Robinhood Chain giving economic exposure to a US share or ETF, valued " +
      "at the share price times sharesPerToken. Unverified tokens are listed " +
      "with counted:false, symbol null and their contract address — anyone can " +
      "airdrop a token into a wallet and name it anything, including an " +
      "instruction, so its claimed name is withheld and it is excluded from " +
      "every total.",
    parameters: {
      type: "object",
      properties: {
        minValueUsd: {
          type: "number",
          description: "Hide holdings worth less than this. Default 1.",
        },
      },
      required: [],
    },
  },
  async execute(args, context) {
    const floor = typeof args.minValueUsd === "number" ? args.minValueUsd : 1;
    const snapshot = await snapshotFor(context);

    const rows = snapshot.spot
      .filter((holding) => (holding.valueUsd ?? 0) >= floor || !holding.verified)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
      .slice(0, 50)
      .map((holding) => ({
        /* An unverified token's name and symbol are whatever its deployer
           wrote — the classic place to hide an instruction or a phishing
           link. The model gets its address and nothing it claims. */
        symbol: holding.verified ? holding.symbol : null,
        ...(holding.verified ? {} : { unverifiedContract: holding.address ?? null }),
        venue: holding.venue,
        network: holding.venue === "wallet" ? holding.chain : null,
        ...(holding.stockToken !== undefined
          ? { stockToken: { ticker: holding.stockToken.ticker, sharesPerToken: holding.stockToken.multiplier } }
          : {}),
        quantity: holding.quantity,
        valueUsd: money(holding.valueUsd),
        change24hPct: holding.change24hPct,
        allocationPct: holding.allocationPct,
        counted: holding.verified,
      }));

    return { asOf: snapshot.asOf, holdings: rows, incomplete: snapshot.partial };
  },
};

export const portfolioRisk: RegisteredTool = {
  def: {
    name: "portfolio_risk",
    description:
      "Concentration and leverage risk across the whole portfolio: the " +
      "largest single exposure as a share of equity, gross perpetual " +
      "exposure, and the DeFi position closest to liquidation. Liquidation " +
      "distance is reported ONLY where the protocol publishes a liquidation " +
      "threshold; it is never inferred from leverage.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute(_args, context) {
    const snapshot = await snapshotFor(context);
    const equity = snapshot.summary.totalValueUsd;

    /* Exposure to an asset spans venues: SOL in the wallet and a SOL perp are
       the same bet, and reporting them separately understates concentration. */
    const byAsset = new Map<string, number>();
    for (const holding of snapshot.spot) {
      if (!holding.verified || holding.valueUsd === null) continue;
      const key = holding.symbol.toUpperCase();
      byAsset.set(key, (byAsset.get(key) ?? 0) + holding.valueUsd);
    }
    for (const position of snapshot.perps) {
      const key = position.market.replace(/[-/]?(USD|USDT|USDC|PERP)$/i, "").toUpperCase();
      const notional = position.notionalUsd ?? 0;
      byAsset.set(key, (byAsset.get(key) ?? 0) + Math.abs(notional));
    }

    const ranked = [...byAsset.entries()]
      .map(([asset, value]) => ({
        asset,
        exposureUsd: money(value),
        pctOfEquity:
          equity === null || equity <= 0 ? null : Math.round((value / equity) * 1000) / 10,
      }))
      .sort((a, b) => (b.exposureUsd ?? 0) - (a.exposureUsd ?? 0))
      .slice(0, 10);

    const grossPerpUsd = snapshot.perps.reduce(
      (sum, position) => sum + Math.abs(position.notionalUsd ?? 0),
      0,
    );

    return {
      asOf: snapshot.asOf,
      equityUsd: money(equity),
      largestExposures: ranked,
      grossPerpExposureUsd: money(grossPerpUsd),
      perpLeverageVsEquity:
        equity === null || equity <= 0 ? null : Math.round((grossPerpUsd / equity) * 100) / 100,
      incomplete: snapshot.partial,
      note:
        "Exposure spans venues: a spot holding and a perpetual on the same " +
        "asset are one position for concentration purposes.",
    };
  },
};

/* ---------------------------------------------------------------------------
   defi.*
--------------------------------------------------------------------------- */

export const defiPositions: RegisteredTool = {
  def: {
    name: "defi_positions",
    description:
      "The caller's positions on Solana DeFi protocols — lending, leveraged " +
      "loops, liquidity and vaults. Includes supplied and borrowed value, " +
      "current LTV, the protocol's published liquidation LTV, and how far " +
      "each position is from liquidation. A protocol section the provider " +
      "has not indexed is reported as a warning, never as zero positions.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute(_args, context) {
    const address = context.solanaAddress ?? null;
    if (address === null) {
      return {
        error: "No Solana wallet is connected to this account.",
        note: "Say this plainly. Do not report zero DeFi positions.",
      };
    }

    const result = await routeDefiPositions(address);
    if (!result.ok || result.data === undefined) return unwrap(result, []);

    return {
      asOf: result.asOf,
      source: result.provider,
      incomplete: result.partial === true,
      warnings: result.warnings ?? [],
      positions: result.data.map((position) => {
        const headroom = liquidationHeadroom(position);
        return {
          protocol: position.provider,
          kind: position.kind,
          label: position.label,
          netUsd: money(position.netUsd),
          suppliedUsd: money(position.suppliedUsd),
          borrowedUsd: money(position.borrowedUsd),
          ltv: position.ltv,
          liquidationLtv: position.liquidationLtv,
          leverage: position.leverage,
          /* Null when the protocol did not publish a threshold. The model is
             told below what null means so it does not substitute leverage. */
          pctFromLiquidation:
            headroom === null ? null : Math.round(headroom * 1000) / 10,
        };
      }),
      note:
        "pctFromLiquidation is null when the protocol publishes no liquidation " +
        "threshold. Say it is unavailable rather than estimating it from leverage.",
    };
  },
};

export const defiPools: RegisteredTool = {
  def: {
    name: "defi_pools",
    description:
      "Liquidity pools trading a pair on Raydium, deepest first, with TVL, " +
      "24h volume and yield. feeApr24h is yield from trading fees only; " +
      "totalApr24h includes the pool's own token emissions. Quote both — a " +
      "pool paying most of its yield in emissions is not comparable to one " +
      "paying it in fees.",
    parameters: {
      type: "object",
      properties: {
        mintA: { type: "string", description: "First token mint address." },
        mintB: { type: "string", description: "Second token mint address." },
      },
      required: ["mintA", "mintB"],
    },
  },
  async execute(args) {
    if (typeof args.mintA !== "string" || typeof args.mintB !== "string") {
      throw new ToolArgumentError("defi_pools needs mintA and mintB as mint addresses.");
    }
    return unwrap(await raydiumPools(args.mintA, args.mintB), []);
  },
};

/* ---------------------------------------------------------------------------
   perps.*
--------------------------------------------------------------------------- */

export const perpMarket: RegisteredTool = {
  def: {
    name: "perp_market",
    description:
      "Mark price, index price, open interest and the current funding rate " +
      "for a perpetual. Funding is returned as the raw per-interval rate AND " +
      "annualised, because venues settle on different schedules — " +
      "Hyperliquid hourly, Binance every eight hours. Never compare raw " +
      "funding rates across venues.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", description: 'e.g. "SOL".' } },
      required: ["symbol"],
    },
  },
  async execute(args) {
    const wanted = symbolArg(args);
    const result = await routePerpMarket(wanted);
    if (!result.ok || result.data === undefined) return unwrap(result, null);

    const market = result.data;
    return {
      asOf: result.asOf,
      source: market.provider,
      symbol: market.symbol,
      markPrice: market.markPrice,
      indexPrice: market.indexPrice,
      fundingRatePerInterval: market.fundingRate,
      fundingIntervalHours: market.fundingIntervalHours,
      fundingAnnualisedPct: annualisedFundingPct(market),
      nextFundingAt: market.nextFundingAt,
      openInterest: market.openInterest,
      volume24hUsd: market.volume24hUsd,
      maxLeverage: market.maxLeverage,
      note:
        "Positive funding means longs pay shorts. The annualised figure is " +
        "simple, not compounded.",
    };
  },
};

/* ---------------------------------------------------------------------------
   orders.* and activity.*
--------------------------------------------------------------------------- */

export const openOrders: RegisteredTool = {
  def: {
    name: "open_orders",
    description:
      "The caller's resting (unfilled) orders. Covers Hyperliquid, which " +
      "publishes them against the wallet address. A venue Elyra cannot read " +
      "is named in `unreadable` — that is NOT the same as having no orders " +
      "there, and must be said out loud.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute(_args, context) {
    if (context.sessionWallet === null) {
      return {
        error: "No wallet is connected to this account.",
        note: "Say this plainly. Do not report zero open orders.",
      };
    }

    const result = await hyperliquidOpenOrders(context.sessionWallet);
    if (!result.ok || result.data === undefined) return unwrap(result, []);

    return {
      asOf: result.asOf,
      orders: result.data.map((order) => ({
        venue: "hyperliquid",
        symbol: order.symbol,
        side: order.side,
        size: order.size,
        limitPrice: order.limitPrice,
        orderType: order.orderType,
        reduceOnly: order.reduceOnly,
        triggerPrice: order.triggerPrice,
        placedAt: order.placedAt,
      })),
      /* Stated every time, so "no open orders" is never read as covering
         venues that were never asked. */
      unreadable: ["Binance and other venues do not expose orders to Elyra yet."],
    };
  },
};

export const recentActivity: RegisteredTool = {
  def: {
    name: "recent_activity",
    description:
      "The caller's recent fills — what actually executed, at what price, " +
      "with realised PnL and fees. Hyperliquid only; other venues are not " +
      "connected and are named rather than silently omitted.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many fills. Default 20, max 100." },
      },
      required: [],
    },
  },
  async execute(args, context) {
    if (context.sessionWallet === null) {
      return {
        error: "No wallet is connected to this account.",
        note: "Say this plainly. Do not report no activity.",
      };
    }

    const limit = typeof args.limit === "number" ? args.limit : 20;
    const result = await hyperliquidFills(context.sessionWallet, limit);
    if (!result.ok || result.data === undefined) return unwrap(result, []);

    return {
      asOf: result.asOf,
      fills: result.data.map((fill) => ({
        venue: "hyperliquid",
        symbol: fill.symbol,
        side: fill.side,
        direction: fill.direction,
        price: fill.price,
        size: fill.size,
        realisedPnl: fill.closedPnl,
        fee: fill.fee,
        feeToken: fill.feeToken,
        at: fill.at,
      })),
      unreadable: ["Binance and on-chain wallet history are not connected yet."],
    };
  },
};

/* ---------------------------------------------------------------------------
   market.*
--------------------------------------------------------------------------- */

export const tokenPrices: RegisteredTool = {
  def: {
    name: "token_prices",
    description:
      "USD prices for Solana token mints. A mint that could not be priced is " +
      "reported in `unpriced` — it is never returned as a price of zero.",
    parameters: {
      type: "object",
      properties: {
        mints: {
          type: "array",
          items: { type: "string" },
          description: "Mint addresses. Ask for all of them in one call.",
        },
      },
      required: ["mints"],
    },
  },
  async execute(args) {
    if (!Array.isArray(args.mints) || args.mints.length === 0) {
      throw new ToolArgumentError("token_prices needs a non-empty `mints` array.");
    }
    const mints = args.mints.filter((mint): mint is string => typeof mint === "string").slice(0, 50);
    const result = await routePrices(mints);
    if (!result.ok || result.data === undefined) return unwrap(result, []);

    const priced = new Set(result.data.map((quote) => quote.id));
    return {
      asOf: result.asOf,
      source: result.provider,
      prices: result.data.map((quote) => ({
        mint: quote.id,
        symbol: quote.symbol ?? null,
        usdPrice: quote.usdPrice,
        change24hPct: quote.change24hPct ?? null,
        liquidityUsd: quote.liquidityUsd ?? null,
      })),
      unpriced: mints.filter((mint) => !priced.has(mint)),
      warnings: result.warnings ?? [],
    };
  },
};

/* ---------------------------------------------------------------------------
   prediction.*
--------------------------------------------------------------------------- */

export const predictionMarkets: RegisteredTool = {
  def: {
    name: "prediction_markets",
    description:
      "Prediction market odds from Polymarket. Prices ARE implied " +
      "probabilities and they are the market's, not Elyra's — present them " +
      "as what the market is pricing, never as a forecast you are making. " +
      "Read-only: Elyra cannot trade these.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search term. Omit for the most active open markets.",
        },
      },
      required: [],
    },
  },
  async execute(args) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const result = query.length > 0 ? await polymarketSearch(query, 5) : await polymarketTrending(8);
    if (!result.ok || result.data === undefined) return unwrap(result, []);

    return {
      asOf: result.asOf,
      source: "polymarket",
      markets: result.data.map((market) => ({
        question: market.question,
        outcomes: market.outcomes.map((outcome) => ({
          label: outcome.label,
          impliedProbabilityPct: Math.round(outcome.price * 1000) / 10,
        })),
        liquidityUsd: money(market.liquidityUsd),
        volume24hUsd: money(market.volume24hUsd),
        endsAt: market.endsAt,
      })),
      warnings: result.warnings ?? [],
      note: "These are market prices, not Elyra forecasts.",
    };
  },
};

/* ---------------------------------------------------------------------------
   Diagnostics
--------------------------------------------------------------------------- */

export const dataSourceHealth: RegisteredTool = {
  def: {
    name: "data_source_health",
    description:
      "Which upstream data sources are currently answering. Use this only " +
      "when a read has already failed and the user asks why.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute() {
    /* Status and timing only. No key, no endpoint, no configuration state
       that would tell a reader which credentials exist. */
    return {
      sources: providerHealthReport().map((health) => ({
        provider: health.provider,
        status: health.status,
        latencyMs: health.latencyMs,
        lastErrorCode: health.lastErrorCode,
      })),
    };
  },
};

export const ELYRA_TOOLS: RegisteredTool[] = [
  portfolioOverview,
  portfolioHoldings,
  portfolioRisk,
  defiPositions,
  defiPools,
  openOrders,
  recentActivity,
  perpMarket,
  tokenPrices,
  predictionMarkets,
  dataSourceHealth,
];
