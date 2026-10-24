# Changelog — Elyra for Android

Every version of the app (`mobile/`) published to the Solana dApp Store,
newest first. API changes are listed under the app version that first relies
on them, and any change to `minSupportedVersion` is called out.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/) (see
`docs/RELEASE.md`, "Decide the version").

Sections in an entry: **Added**, **Changed**, **Fixed**, **Removed**,
**Security**, and **API** (what the server must already serve) and
**Minimum version** (when `APP_MIN_SUPPORTED_VERSION` moves).

## [Unreleased]

## [1.0.0] — not yet submitted

The first release: the website's product on a phone, on the same account.

### Added

- Sign in with email, Google, a passkey, or the phone's Solana wallet
  (Seed Vault, Phantom, Solflare through Mobile Wallet Adapter). An embedded
  Solana wallet for accounts without one.
- Markets: watchlist with favourites, live Pyth prices, search, market
  signals, Hyperliquid pulse, smart-money consensus; an asset screen with the
  TradingView chart, pivots, a decision brief and price alerts.
- Portfolio: total value and 24h change, available balance, positions,
  orders and history across the wallet, Hyperliquid and Binance; holdings,
  risk, DeFi, capital accounts and wallet activity.
- Wallet: receive (QR), swap through Jupiter and transfer, both signed in the
  person's own wallet behind the fingerprint check; review of actions Elyra
  prepared.
- Ask Elyra: streamed answers with their sources, attachments, dictation,
  shortcuts (`/swap`, `/alert`, `/report` …); Capital Intelligence.
- Research: reports with PDFs, backtests, prediction markets, recap,
  signals, yield, token unlocks and SEC filings.
- Notifications: push and an in-app inbox for price alerts, liquidation
  warnings, large moves, prediction-market events and the daily summary;
  preferences shared with the website.
- Account: alerts & automation, read-only exchange connections, referrals
  with Android App Links, settings, help & legal, open-source licences, and
  in-app account deletion.

### Security

- No secret in the app: only public `EXPO_PUBLIC_` values (checked in the
  release APK's bundle). Exchange keys are never stored on the phone.
- Android app-data backup is off.
- Crash reporting is built in but off until a Sentry DSN is configured; every
  report is scrubbed of addresses, tokens and ids on the phone first.

### API

- Needs the API with `/api/app/config`, `/api/app/views`,
  `/api/app/prediction`, `/api/devices`, `/api/notifications*`,
  `/api/account` (DELETE) and `/.well-known/assetlinks.json`.

### Minimum version

- `APP_MIN_SUPPORTED_VERSION` unset (no build is blocked).
