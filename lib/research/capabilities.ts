import "server-only";

import { secConfigured } from "@/lib/research/sec/client";
import { providersFor } from "@/lib/providers/router";

/* ---------------------------------------------------------------------------
   What this deployment can currently do.

   ── Why a registry rather than try-and-see ─────────────────────────────

   A research pipeline that discovers halfway through that it has no equity
   price provider has already spent a minute of SEC calls and two model turns.
   Worse, the natural recovery is to carry on and leave a gap — and a gap in a
   report reads as "nothing happened", not as "we could not look".

   So capability is checked BEFORE planning. A task declares what it requires
   and what would merely improve it; anything required and missing fails fast
   with a reason; anything optional and missing becomes a stated omission in
   the finished report.

   ── The rule this enforces ─────────────────────────────────────────────

   A missing capability produces an ABSENCE that says so. It never produces a
   plausible number. An earnings report with no equity provider still
   generates from SEC data and prints "price-reaction analysis was omitted
   because no equity market-data provider is configured" — which is true, and
   which the reader can act on.
--------------------------------------------------------------------------- */

export type CapabilityId =
  | "sec.resolve_company"
  | "sec.fetch_submissions"
  | "sec.fetch_xbrl"
  | "sec.fetch_filing"
  | "sec.parse_filing"
  | "sec.fetch_earnings_materials"
  | "company_ir.fetch"
  | "market.crypto_price"
  | "market.equity_price"
  | "market.candles"
  | "market.orderbook"
  | "perps.data"
  | "prediction.data"
  | "prediction.realtime"
  | "prediction.orderbook"
  | "prediction.orderbook_analytics"
  | "prediction.probability_basket"
  | "prediction.signals"
  | "prediction.signal_backtest"
  | "prediction.alerts"
  | "yield.kamino"
  | "unlocks.calendar"
  | "report.web"
  | "report.pdf"
  | "report.storage"
  | "analysis.claude"
  | "analysis.gemini"
  | "telegram.send";

export interface CapabilityStatus {
  available: boolean;
  /** Works, but with reduced coverage. */
  degraded?: boolean;
  provider?: string;
  /** Why unavailable or degraded. Written for a person. */
  reason?: string;
}

function env(name: string): boolean {
  const value = process.env[name]?.trim();
  return value !== undefined && value.length > 0;
}

/**
 * The live capability map.
 *
 * Computed on each call rather than cached at module load: a key added to the
 * environment should take effect without a redeploy, and an operator checking
 * why a report omitted a section wants the current answer.
 */
export function capabilities(): Record<CapabilityId, CapabilityStatus> {
  const sec = secConfigured();
  const secStatus: CapabilityStatus = sec
    ? { available: true, provider: "sec" }
    : {
        available: false,
        reason:
          "SEC_USER_AGENT is not set. The SEC requires automated clients to " +
          'identify themselves as "Company Name contact@domain".',
      };

  const cryptoPrice = providersFor("solana_price");
  const perps = providersFor("perp_positions");
  const prediction = providersFor("prediction_markets");

  return {
    "sec.resolve_company": secStatus,
    "sec.fetch_submissions": secStatus,
    "sec.fetch_xbrl": secStatus,
    "sec.fetch_filing": secStatus,
    "sec.parse_filing": secStatus,
    "sec.fetch_earnings_materials": secStatus,

    /* Investor-relations pages are per-company, unauthenticated and have no
       common shape. Fetching them reliably is a scraping problem this
       deployment has not solved, and guessing a URL from a company name would
       cite whatever answered. */
    "company_ir.fetch": {
      available: false,
      reason:
        "Company investor-relations pages are not connected. Filing and XBRL " +
        "data cover the same figures with a citable source.",
    },

    "market.crypto_price": cryptoPrice.length
      ? { available: true, provider: cryptoPrice.join(", ") }
      : { available: false, reason: "No crypto price provider is configured." },

    /* The SEC is not a price feed. It publishes what companies file, not what
       their shares trade at, and no equity provider is connected here. */
    "market.equity_price": {
      available: false,
      reason:
        "No equity market-data provider is configured, so share prices and " +
        "price-reaction analysis are unavailable.",
    },

    "market.candles": providersFor("candles").length
      ? { available: true, provider: providersFor("candles").join(", ") }
      : { available: false, reason: "No candle provider is configured." },

    "market.orderbook": prediction.length
      ? { available: true, provider: "polymarket", degraded: true, reason: "Prediction markets only." }
      : { available: false, reason: "No order-book provider is configured." },

    "perps.data": perps.length
      ? { available: true, provider: perps.join(", ") }
      : { available: false, reason: "No perpetuals provider is configured." },

    "prediction.data": prediction.length
      ? { available: true, provider: prediction.join(", ") }
      : { available: false, reason: "No prediction-market provider is configured." },

    /* ---- Microstructure -------------------------------------------------

       `prediction.realtime` is the one capability here that is genuinely
       optional at runtime. A WebSocket needs a process that outlives a
       request, which a serverless invocation does not provide, so it is opted
       into explicitly rather than guessed from the runtime.

       Its absence is DEGRADED, not unavailable: REST snapshots still produce
       a correct book, so the order book, analytics and basket all work. What
       stops working is anything needing update-to-update persistence, because
       a snapshot is one frame and one frame cannot demonstrate that a level
       persisted. That distinction is the whole reason this is a separate
       capability rather than a flag on `prediction.data`. */
    "prediction.realtime": !prediction.length
      ? { available: false, reason: "No prediction-market provider is configured." }
      : process.env.ENABLE_PREDICTION_REALTIME === "true"
        ? { available: true, provider: "polymarket" }
        : {
            available: false,
            degraded: true,
            provider: "polymarket",
            reason:
              "The live feed is not enabled for this process, so order books come from REST " +
              "snapshots. A snapshot is correct at its timestamp but carries no update stream, " +
              "so strategies requiring order-book persistence cannot run.",
          },

    "prediction.orderbook": prediction.length
      ? { available: true, provider: "polymarket" }
      : { available: false, reason: "No prediction-market provider is configured." },

    "prediction.orderbook_analytics": prediction.length
      ? { available: true, provider: "elyra" }
      : { available: false, reason: "Order-book analytics need a prediction provider." },

    "prediction.probability_basket": prediction.length
      ? { available: true, provider: "elyra" }
      : { available: false, reason: "The basket needs a prediction provider." },

    "prediction.signals": prediction.length
      ? { available: true, provider: "elyra" }
      : { available: false, reason: "Signals need a prediction provider." },

    /* Degraded by construction, and permanently so for part of the registry.
       Polymarket publishes probability history but not historical depth, so
       price strategies carry a measured win rate and order-book strategies
       carry none at all. Reporting this as fully available would imply a
       figure exists for every strategy. */
    "prediction.signal_backtest": prediction.length
      ? {
          available: true,
          degraded: true,
          provider: "polymarket",
          reason:
            "Price-based strategies can be backtested against published probability history. " +
            "Order-book strategies cannot — Polymarket does not publish historical depth — so " +
            "they report no win rate rather than a reconstructed one.",
        }
      : { available: false, reason: "Backtests need a prediction provider." },

    "prediction.alerts": prediction.length
      ? { available: true, provider: "elyra" }
      : { available: false, reason: "Alerts need a prediction provider." },

    "yield.kamino": providersFor("defi_positions").includes("kamino")
      ? { available: true, provider: "kamino" }
      : { available: false, reason: "Kamino is disabled." },

    /* Deliberately unconfigured rather than scraped. Unlock schedules live
       behind licensed APIs; taking them from a site that has not authorised
       it would be both a terms breach and unciteable. */
    "unlocks.calendar":
      env("TOKENOMIST_API_KEY") || env("COINMARKETCAL_API_KEY")
        ? { available: true, provider: env("TOKENOMIST_API_KEY") ? "tokenomist" : "coinmarketcal" }
        : {
            available: false,
            reason:
              "No token-unlock provider is configured. Set TOKENOMIST_API_KEY " +
              "or COINMARKETCAL_API_KEY to enable unlock intelligence.",
          },

    "report.web": { available: true, provider: "elyra" },
    "report.pdf": { available: true, provider: "react-pdf" },
    "report.storage": env("SUPABASE_SERVICE_ROLE_KEY")
      ? { available: true, provider: "supabase" }
      : { available: false, reason: "No storage backend is configured." },

    "analysis.claude": env("ANTHROPIC_API_KEY")
      ? { available: true, provider: "anthropic" }
      : { available: false, reason: "ANTHROPIC_API_KEY is not set." },
    "analysis.gemini": env("GEMINI_API_KEY")
      ? { available: true, provider: "google" }
      : { available: false, reason: "GEMINI_API_KEY is not set." },

    "telegram.send": env("TELEGRAM_BOT_TOKEN")
      ? { available: true, provider: "telegram" }
      : { available: false, reason: "TELEGRAM_BOT_TOKEN is not set." },
  };
}

export interface CapabilityCheck {
  ok: boolean;
  /** Required capabilities that are missing. Non-empty means do not run. */
  missing: Array<{ id: CapabilityId; reason: string }>;
  /** Optional capabilities that are missing. These become stated omissions. */
  omitted: Array<{ id: CapabilityId; reason: string }>;
}

/**
 * Whether a task can run, and what it will have to leave out.
 *
 * Both lists are returned even when `ok` is false, so an operator sees the
 * whole picture rather than fixing one key and discovering the next.
 */
export function checkCapabilities(
  required: readonly string[],
  optional: readonly string[] = [],
): CapabilityCheck {
  const map = capabilities();

  const resolve = (ids: readonly string[]) =>
    ids
      .map((id) => ({ id: id as CapabilityId, status: map[id as CapabilityId] }))
      .filter((row) => row.status === undefined || !row.status.available)
      .map((row) => ({
        id: row.id,
        reason: row.status?.reason ?? `${row.id} is not available.`,
      }));

  const missing = resolve(required);

  return { ok: missing.length === 0, missing, omitted: resolve(optional) };
}
