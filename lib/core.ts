/* ---------------------------------------------------------------------------
   The shared core: the modules in lib/ the Android app (mobile/) imports
   directly, through the `@/` alias.

   One copy, used by the website and the app alike, so a rule — how a price is
   rounded, when a balance is stale, what a referral link looks like — has one
   source of truth rather than two that drift.

   Every module listed here, and everything it imports, must be pure: no
   React, React Native, Next, `server-only`, Node built-ins, Supabase or env,
   and no `process`, `window`, `document`, `localStorage` or `fetch`.
   `lib/core.test.ts` walks the import graph and enforces it, type-only
   imports included — a type pulled from a server module still drags that
   module into the app's type check.

   Adding a module here is how the app gets access to it. If a module mixes
   pure and impure code, split it so both apps import the same pure half.
--------------------------------------------------------------------------- */

export const CORE_MODULES = [
  /* formatting and precision */
  "lib/format.ts",
  "lib/market/precision.ts",
  "lib/markdown.ts",
  "lib/qr.ts",
  "lib/identicon.ts",
  "lib/monogram.ts",

  /* shared types */
  "lib/types.ts",
  "lib/market/types.ts",
  "lib/signals/types.ts",
  "lib/tracker/types.ts",
  "lib/smartmoney/types.ts",
  "lib/alerts/types.ts",
  "lib/alerts/rules.ts",
  "lib/actions/types.ts",
  "lib/actions/prefill.ts",

  /* market */
  "lib/market/defaults.ts",
  "lib/market/levels.ts",
  "lib/market/indicators.ts",
  "lib/market/pulse.ts",
  "lib/market/tickerLogoData.ts",
  "lib/market/chartWidget.ts",
  "lib/market/pyth/types.ts",
  "lib/market/brief.ts",

  /* portfolio, assets, wallet, activity */
  "lib/portfolio/types.ts",
  "lib/portfolio/derive.ts",
  "lib/portfolio/ledger.ts",
  "lib/portfolio/ledgerEmpty.ts",
  "lib/portfolio/drawer.ts",
  "lib/portfolio/views.ts",
  "lib/portfolio/chain.ts",
  "lib/evm/chains.ts",
  "lib/evm/tokens.ts",
  "lib/evm/derive.ts",
  "lib/evm/swap.ts",
  "lib/evm/wire.ts",
  "lib/evm/history.ts",
  "lib/assets/types.ts",
  "lib/assets/derive.ts",
  "lib/invest/types.ts",
  "lib/invest/catalog.ts",
  "lib/invest/plan.ts",
  "lib/passport/types.ts",
  "lib/passport/derive.ts",
  "lib/wallet/types.ts",
  "lib/wallet/fold.ts",
  "lib/wallet/summarise.ts",
  "lib/wallet/health.ts",
  "lib/wallet/status.ts",
  "lib/wallet/flows.ts",
  "lib/wallet/runEvmTx.ts",
  "lib/solana/address.ts",
  "lib/solana/amount.ts",
  "lib/activity/events.ts",
  "lib/activity/filter.ts",
  "lib/activity/notifications.ts",
  "lib/notifications/types.ts",
  "lib/notifications/routes.ts",
  "lib/notifications/time.ts",

  /* account, referrals, attachments */
  "lib/account.ts",
  "lib/appVersion.ts",
  "lib/referrals/display.ts",
  "lib/referrals/config.ts",
  "lib/referrals/types.ts",
  "lib/referrals/applinks.ts",
  "lib/connections/state.ts",
  "lib/connections/types.ts",
  "lib/attachments.ts",

  /* the assistant */
  "lib/agent/events.ts",
  "lib/agent/reply.ts",
  "lib/agent/shortcuts.ts",
  "lib/agent/suggestions.ts",
  "lib/personalized/types.ts",
  "lib/personalized/calculations.ts",
  "lib/personalized/intent.ts",
  "lib/personalized/insights.ts",
  "lib/personalized/sources.ts",

  /* prediction markets, research, backtests */
  "lib/prediction/analytics.ts",
  "lib/prediction/signal-types.ts",
  "lib/prediction/api.ts",
  "lib/prediction/appViews.ts",
  "lib/prediction/alertTypes.ts",
  "lib/prediction/book.ts",
  "lib/prediction/book-analytics.ts",
  "lib/prediction/basket.ts",
  "lib/providers/types.ts",
  "lib/research/calculations.ts",
  "lib/research/signalTypes.ts",
  "lib/research/reportTypes.ts",
  "lib/research/report.ts",
  "lib/research/intent.ts",
  "lib/research/types.ts",
  "lib/research/signalCriteria.ts",
  "lib/research/sec/types.ts",
  "lib/research/sec/forms.ts",
  "lib/research/sec/alpha-build.ts",
  "lib/backtest/types.ts",
  "lib/backtest/parse.ts",
  "lib/backtest/metrics.ts",

  /* Arena: trade reviews, calls, the daily puzzle */
  "lib/autotrade/rules.ts",
  "lib/arena/review.ts",
  "lib/arena/calls.ts",
  "lib/arena/puzzle.ts",
  "lib/arena/types.ts",

  /* brand */
  "lib/tokens.ts",
] as const;
