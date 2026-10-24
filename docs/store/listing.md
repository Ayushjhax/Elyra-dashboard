# Elyra — Solana dApp Store listing

Paste-ready copy for the Publisher Portal. Limits are from Solana Mobile's
Listing Page Guidelines (read 2026-10-24): app name ≤ 25 characters, short
description ≤ 50; no stated limit on the long description or What's New.

Voice (docs/ELYRA_BRAND.md §6): precise, quiet, never enthusiastic about
money. Every claim below is something the 1.0.0 build does; check
`CHANGELOG.md` before changing any of it.

Left out on purpose: smart-money wallet tracking and Elyra's signal engine.
Both need services (`SMART_MONEY_TRACKER_URL`, `ELYRA_ENGINE_URL`) that are
not configured, so those screens say "not configured". Add them back only
once they answer in production.

---

## App name

```
Elyra
```

5 characters.

## Short description

```
Your portfolio, markets and a sourced AI analyst
```

48 characters.

## Long description

```
Elyra brings your Solana wallet, your venues and the markets into one place, with an analyst that shows where every answer came from.

Portfolio
- Your Solana wallet, Hyperliquid account, Binance balances and Polymarket positions in one view: total value, 24-hour change, holdings, open positions, orders and fills.
- Exchange connections are read-only. Elyra can read balances and positions; it cannot place, change or cancel a trade, or move funds on any venue.

Markets
- Live prices from Pyth, a watchlist, and a TradingView chart with pivot levels for each market.
- Funding, open interest and the day's movers on Hyperliquid.

Ask Elyra
- Ask about your positions or any market in plain language. Answers are written from live data, and each one lists the sources it used.
- Attach an image, a PDF or a CSV, or dictate the question.

Alerts
- Price alerts on any market, delivered as a push notification and kept in your inbox.
- Optional warnings for liquidation risk, large moves on markets you watch, prediction-market changes and a daily summary.

Research
- Company reports built from SEC filings, with a PDF to share.
- Strategy backtests, a daily market recap, research signals, Kamino yields and upcoming token unlocks.

Prediction markets
- Read-only analytics for Polymarket: order books, implied probabilities, exit liquidity and signals with their track record. Link your Polymarket address to see your exposure.

Swaps and transfers
- Swap through Jupiter and send tokens, signed in your own wallet: the embedded wallet created at sign-in, or Seed Vault, Phantom or Solflare through Mobile Wallet Adapter.
- Elyra never holds your keys. You review every transaction before you sign it, and the app can ask for your fingerprint first.

One account
- Sign in with email, Google, a passkey or your Solana wallet. It is the same account as getelyra.xyz, with the same alerts, conversations and connections.

Before you rely on Elyra
- Elyra shows data and analysis, not financial advice. Markets can move against any view, and you are responsible for your decisions.
- AI answers can be wrong. Check the sources shown with each answer.
- Prices, balances and third-party data can be delayed or incomplete.
- Names of other companies and products belong to their owners. Elyra is not affiliated with or endorsed by Solana Mobile, Jupiter, Pyth, Polymarket, Hyperliquid, Binance, Kamino or TradingView.

Support: ayushkmrjha@gmail.com
Privacy: https://getelyra.xyz/privacy
Terms: https://getelyra.xyz/terms
```

## What's New (1.0.0)

```
Elyra 1.0.0

The first release on the dApp Store.
- Your Solana wallet, Hyperliquid, Binance and Polymarket in one portfolio.
- Ask Elyra, with the sources behind every answer.
- Price alerts as push notifications, with an inbox.
- Research, prediction-market analytics, and swaps and transfers signed in your own wallet.
```

## Category

**Finance** (or the portal's closest match — DeFi / Tools — if Finance is
not offered). The portal doesn't publish its category list, and Solana
Mobile assigns "an appropriate category" on approval.

## Keywords

The portal form has no keyword field in the current guide. If one appears:

```
portfolio, solana, wallet, markets, alerts, research, prediction markets, hyperliquid, jupiter, ai analyst
```

Product names here describe what Elyra works with; they never imply
partnership.

## App info

| Field | Value |
|---|---|
| Package name | `xyz.getelyra.app` (case-sensitive; cannot change after the first save) |
| Website | https://getelyra.xyz |
| Support email | ayushkmrjha@gmail.com |
| Contact email | ayushkmrjha@gmail.com |
| Terms of use | https://getelyra.xyz/terms |
| Privacy policy | https://getelyra.xyz/privacy |

## Assets

| Asset | Requirement | File |
|---|---|---|
| Icon | 512×512, background colour, no transparency | `docs/store/assets/icon-512.png` (from `public/elyra-public-avatar.png`) |
| Banner | 1200×600 | `docs/store/assets/banner-1200x600.png` (from `output/imagegen/elyra-dapp-banner-1200x600.png`; the wordless `elyra-dapp-background-v2-1200x600.png` is the alternative) |
| Screenshots | 4–8, JPG/PNG/GIF/WebP ≤ 3 MB each, all the same shape as the first (portrait 9:16), ≥ 1080 px | **not captured yet** — see `docs/store/screenshots.md` |
| Video (optional) | `.mp4`, ≤ 30 MB, 1080p recommended | none |

## Notes for the reviewer

The portal has no reviewer-notes field in the current guide. If asked (or in
an App Review Inquiry), send:

```
Sign in with Email on the first screen using the reviewer account:
  email: <reviewer email>
  code:  <fixed one-time code>
It holds a small real balance so the portfolio, alerts and research screens
show live data. Swaps and transfers ask for a wallet signature; please keep
them to cents if you try them. Account deletion is in Account → Settings →
Delete account (it deletes the account on getelyra.xyz too).
```
