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

  /* shared types */
  "lib/types.ts",
  "lib/market/types.ts",
  "lib/signals/types.ts",
  "lib/tracker/types.ts",
  "lib/smartmoney/types.ts",
  "lib/alerts/types.ts",
  "lib/actions/types.ts",

  /* market */
  "lib/market/levels.ts",
  "lib/market/indicators.ts",
  "lib/market/pulse.ts",
  "lib/market/tickerLogoData.ts",

  /* portfolio, assets, wallet, activity */
  "lib/portfolio/types.ts",
  "lib/portfolio/derive.ts",
  "lib/portfolio/ledger.ts",
  "lib/portfolio/ledgerEmpty.ts",
  "lib/portfolio/drawer.ts",
  "lib/assets/types.ts",
  "lib/assets/derive.ts",
  "lib/wallet/types.ts",
  "lib/wallet/fold.ts",
  "lib/wallet/summarise.ts",
  "lib/wallet/health.ts",
  "lib/wallet/status.ts",
  "lib/activity/events.ts",
  "lib/activity/filter.ts",
  "lib/activity/notifications.ts",

  /* account, referrals, attachments */
  "lib/account.ts",
  "lib/referrals/display.ts",
  "lib/referrals/config.ts",
  "lib/attachments.ts",

  /* the assistant */
  "lib/personalized/types.ts",
  "lib/personalized/calculations.ts",
  "lib/personalized/intent.ts",

  /* prediction markets, research, backtests */
  "lib/prediction/analytics.ts",
  "lib/prediction/signal-types.ts",
  "lib/research/calculations.ts",
  "lib/backtest/metrics.ts",

  /* brand */
  "lib/tokens.ts",
] as const;
