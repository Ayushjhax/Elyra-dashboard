import "server-only";

import { binanceTicker } from "@/lib/providers/binance-public";
import { hyperliquidMarkets } from "@/lib/providers/hyperliquid-public";
import { polymarketTrending } from "@/lib/providers/polymarket";
import { annualisedFundingPct } from "@/lib/providers/binance-public";
import { capabilities } from "@/lib/research/capabilities";
import { kaminoYield } from "@/lib/research/yield";
import { unlocksConfigured, UNLOCKS_UNAVAILABLE } from "@/lib/research/unlocks";
import { ok, type ToolResult } from "@/lib/providers/types";
import type { MarketRecap, RecapMove, RecapScope, RecapSection } from "@/lib/research/types";

export type { MarketRecap, RecapMove, RecapScope, RecapSection };

/* ---------------------------------------------------------------------------
   The market recap.

   ── Scope is decided by capability, and absences are stated ────────────

   Equities are in the spec and there is no equity provider configured, so the
   recap says that rather than omitting the section. A recap with a silent gap
   reads as "nothing happened in equities today", which is a claim about the
   market rather than about this deployment.

   ── Nothing notable is a real answer ───────────────────────────────────

   A market where nothing moved produces a short recap that says so. Padding
   it with whichever asset moved most trains the reader to treat the whole
   thing as noise.
--------------------------------------------------------------------------- */

/** The assets a crypto recap covers. */
const WATCH = ["BTC", "ETH", "SOL"] as const;

/** Below this a 24h move is not worth a line. */
const NOTABLE_PCT = 3;

const money = (value: number): string =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 10 ? 4 : 2,
  });

async function cryptoSection(): Promise<{
  section: RecapSection;
  moves: RecapMove[];
}> {
  const tickers = await Promise.all(
    WATCH.map((symbol) => binanceTicker(symbol)),
  );

  const moves: RecapMove[] = [];
  for (const ticker of tickers) {
    if (!ticker.ok || ticker.data === undefined) continue;
    if (ticker.data.change24hPct === null) continue;
    moves.push({
      symbol: ticker.data.symbol.replace(/USDT$/, ""),
      price: ticker.data.lastPrice,
      changePct: ticker.data.change24hPct,
      asOf: ticker.asOf,
      stale: ticker.stale ?? false,
    });
  }

  if (moves.length === 0) {
    return {
      section: {
        title: "Crypto",
        lines: [],
        unavailable: "Crypto market data could not be read.",
      },
      moves: [],
    };
  }

  const sorted = [...moves].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct),
  );
  const notable = sorted.filter(
    (move) => Math.abs(move.changePct) >= NOTABLE_PCT,
  );

  const lines = sorted.map(
    (move) =>
      `${move.symbol} ${money(move.price)} · ${move.changePct >= 0 ? "▲" : "▼"} ${Math.abs(move.changePct).toFixed(1)}%`,
  );

  if (notable.length === 0) {
    /* Said explicitly. A quiet day is information. */
    lines.push(`No move exceeded ${NOTABLE_PCT}% over the window.`);
  }

  return {
    section: {
      title: "Crypto",
      lines,
      unavailable: null,
      moves: sorted,
      asOf: [...sorted].map((move) => move.asOf).sort()[0],
    },
    moves: sorted,
  };
}

async function fundingSection(): Promise<RecapSection> {
  const markets = await hyperliquidMarkets();
  if (!markets.ok || markets.data === undefined) {
    return {
      title: "Perpetual funding",
      lines: [],
      unavailable:
        markets.error?.message ?? "Perpetual data could not be read.",
    };
  }

  const extremes = markets.data
    .filter((market) => WATCH.some((symbol) => market.symbol === symbol))
    .map((market) => ({ market, annual: annualisedFundingPct(market) }))
    .filter((row) => row.annual !== null);

  if (extremes.length === 0) {
    return {
      title: "Perpetual funding",
      lines: [],
      unavailable: "No funding data.",
    };
  }

  return {
    title: "Perpetual funding",
    asOf: markets.asOf,
    stale: markets.stale ?? false,
    funding: extremes.map((row) => ({
      symbol: row.market.symbol,
      annualisedPct: row.annual!,
    })),
    lines: extremes.map(
      (row) =>
        `${row.market.symbol} ${row.annual!.toFixed(1)}% annualised · ` +
        `${row.annual! >= 0 ? "longs pay shorts" : "shorts pay longs"}`,
    ),
    unavailable: null,
  };
}

async function predictionSection(): Promise<RecapSection> {
  const markets = await polymarketTrending(3);
  if (!markets.ok || markets.data === undefined || markets.data.length === 0) {
    return {
      title: "Prediction markets",
      lines: [],
      unavailable: markets.error?.message ?? "No prediction-market data.",
    };
  }

  return {
    title: "Prediction markets",
    asOf: markets.asOf,
    stale: markets.stale ?? false,
    markets: markets.data.map((market) => ({
      id: market.id,
      question: market.question,
      outcome: market.outcomes[0]?.label ?? null,
      price: market.outcomes[0]?.price ?? null,
      status: market.status ?? (market.closed ? "closed" : "open"),
      url: market.url ?? null,
    })),
    lines: markets.data.map((market) => {
      const top = market.outcomes[0];
      return `${market.question.slice(0, 64)} — ${top === undefined ? "?" : `${Math.round(top.price * 100)}% ${top.label}`}`;
    }),
    unavailable: null,
  };
}

async function yieldSection(): Promise<RecapSection> {
  const opportunities = await kaminoYield({ limit: 3 });
  if (
    !opportunities.ok ||
    opportunities.data === undefined ||
    opportunities.data.length === 0
  ) {
    return {
      title: "Yield",
      lines: [],
      unavailable: opportunities.error?.message ?? "No yield data.",
    };
  }

  return {
    title: "Yield",
    lines: opportunities.data.map(
      (row) =>
        `${row.asset} ${row.apyPct?.toFixed(2) ?? "?"}% · ${row.name.slice(0, 32)}`,
    ),
    unavailable: null,
  };
}

/**
 * The recap.
 *
 * Every section either has content or a stated reason it does not. There is
 * no third state where a section quietly does not appear.
 */
export async function marketRecap(
  scope: RecapScope = "crypto",
  windowHours = 24,
): Promise<ToolResult<MarketRecap>> {
  const generatedAt = new Date().toISOString();
  const caps = capabilities();

  if (scope === "equities") {
    /* Named rather than omitted. The SEC publishes filings, not prices, and
       no equity feed is connected — so an equities recap is a section that
       says why it is empty. */
    return ok(
      {
        generatedAt,
        windowHours,
        sections: [
          {
            title: "Equities",
            lines: [],
            unavailable:
              caps["market.equity_price"].reason ?? "No equity provider.",
          },
        ],
        sources: [],
      },
      "binance",
    );
  }

  const [crypto, funding, prediction, yields] = await Promise.all([
    cryptoSection(),
    fundingSection(),
    predictionSection(),
    yieldSection(),
  ]);

  const sections: RecapSection[] = [
    crypto.section,
    funding,
    prediction,
    yields,
    {
      title: "Token unlocks",
      lines: [],
      unavailable: unlocksConfigured() ? null : UNLOCKS_UNAVAILABLE,
    },
  ];

  return ok(
    {
      generatedAt,
      windowHours,
      sections,
      sources: ["binance", "hyperliquid", "polymarket", "kamino"],
    },
    "binance",
    { asOf: generatedAt },
  );
}
