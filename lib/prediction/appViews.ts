/* ---------------------------------------------------------------------------
   Which agent tool an app prediction view runs, and with what — checked
   here, before any tool sees the request (app/api/app/prediction).

   An allowlist: `view` and every argument come from the client. A market
   id, an outcome token, a category and a size are each validated, and a
   view this does not know is refused rather than passed through to the
   tool registry, which could run any registered tool. Pure, so it is tested
   directly.
--------------------------------------------------------------------------- */

const MARKET = /^[A-Za-z0-9_-]{1,160}$/;
const TOKEN = /^[0-9]{1,100}$/;
const CATEGORY = /^[a-z][a-z-]{1,29}$/;
const INTERVALS = new Set(["1h", "6h", "1d", "1w", "max"]);

export type Built = { name: string; args: Record<string, unknown> } | { error: string };

function outcomeArg(params: URLSearchParams): Record<string, unknown> {
  const outcome = params.get("outcome")?.trim() ?? "";
  return outcome.length > 0 && outcome.length <= 80 ? { outcome } : {};
}

export function predictionViewTool(view: string, params: URLSearchParams): Built {
  switch (view) {
    case "trending":
      return { name: "prediction_get_trending", args: { limit: 30 } };
    case "events": {
      const category = params.get("category") ?? "";
      if (category !== "" && !CATEGORY.test(category)) return { error: "That is not a category." };
      return { name: "prediction_search_events", args: { limit: 20, ...(category ? { category } : {}) } };
    }
    case "summary":
      return { name: "prediction_get_portfolio_summary", args: {} };
    case "positions":
      return { name: "prediction_get_positions", args: {} };
    case "expiring":
      return { name: "prediction_get_expiring_positions", args: { withinHours: 168 } };
    case "activity":
      return { name: "prediction_get_activity", args: { limit: 50 } };
    case "orders":
      return { name: "prediction_get_open_orders", args: {} };
    case "execution": {
      const market = params.get("market") ?? "";
      const notional = Number(params.get("notionalUsd"));
      if (!MARKET.test(market)) return { error: "Name a market." };
      if (!Number.isFinite(notional) || notional < 1 || notional > 1_000_000) {
        return { error: "Size the order between $1 and $1,000,000." };
      }
      const side = params.get("side") === "sell" ? "sell" : "buy";
      return { name: "prediction_estimate_execution", args: { market, side, notionalUsd: notional, ...outcomeArg(params) } };
    }
    case "exit": {
      const market = params.get("market") ?? "";
      const shares = Number(params.get("shares"));
      if (!MARKET.test(market)) return { error: "Name a market." };
      if (!Number.isFinite(shares) || shares <= 0 || shares > 1e9) return { error: "State how many shares are held." };
      return { name: "prediction_get_exit_liquidity", args: { market, shares, ...outcomeArg(params) } };
    }
    case "history": {
      const tokenId = params.get("tokenId") ?? "";
      const interval = params.get("interval") ?? "1d";
      if (!TOKEN.test(tokenId)) return { error: "Name an outcome." };
      return { name: "prediction_get_market_history", args: { outcomeTokenId: tokenId, interval: INTERVALS.has(interval) ? interval : "1d" } };
    }
    default:
      return { error: "Unknown view." };
  }
}
