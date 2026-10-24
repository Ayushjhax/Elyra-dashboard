# Porting map — website → Android dApp

This is the checklist for parity between the website and the Android dApp.
Every user-facing feature of the website has a row. Each row names the web
files that implement it, where it lives in the app (`mobile/`), and its
status.

A row is closed only when it is **done** (with where) or **dropped** (with
why). Nothing ships while a row says `todo`.

Status values: `todo` · `in progress` · `done` · `dropped — reason`.

The API column says `same` when the app calls the existing route unchanged.

## Foundation

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Brand tokens and type scale as values | `app/globals.css` | `lib/tokens.ts` (drift test: `lib/tokens.test.ts`) | — | done |
| Shared pure modules | `lib/*` | `lib/core.ts` list, purity test `lib/core.test.ts` | — | done |
| Fonts, `<Text variant>` | `app/layout.tsx`, `app/fonts/*` | `mobile/src/theme` (static Fustat + General Sans) | — | done |
| Primitives (Button, Panel, Section, EmptyState, Skeleton) | `components/ui/*` | `mobile/src/components/ui` | — | done |
| Money / Quantity / DeltaText, hidden balances | `components/portfolio/primitives.tsx` | `mobile/src/components/ui/values.tsx` | — | done |
| Coin, company and monogram marks | `components/ui/CoinMark.tsx`, `CompanyMark.tsx`, `Monogram.tsx` | `mobile/src/components/ui/marks.tsx`, `lib/monogram.ts` | — | done |
| Identicon | `lib/identicon.ts`, `components/ui/Identicon.tsx` | react-native-svg port | — | done |
| QR code | `lib/qr.ts`, `components/ui/QrCode.tsx` | react-native-svg port | — | done |
| Markdown | `lib/markdown.ts`, `components/ui/Markdown.tsx` | native renderer | — | done |
| Tooltips and InfoTip (tap) | `components/shell/RouteDrawer.tsx` (`Tip`, `InfoTip`) | `InfoTip` tap popover | — | done |
| Tables → cards, column priority | `components/ui/DataTable.tsx` | `DataList` | — | done |
| Shared clock | `lib/useClock.ts` | `mobile/src/lib/useClock.ts` | — | done |
| Reference-counted account stores | `lib/portfolio/usePortfolio.ts`, `lib/wallet/useWalletDashboard.ts` | `mobile/src/lib/stores/createAccountStore.ts` | — | done |
| App store (UI state, agent conversation) | `lib/store.ts` | `mobile/src/lib/store.ts` (zustand + AsyncStorage) | — | done |
| Authed fetch, streaming | `lib/useAuthedFetch.ts`, `lib/agentChat.ts` | `mobile/src/lib/api.ts` + `expo/fetch` streaming | — | done |
| Version gate | — | blocking update screen | `GET /api/app/config`, `lib/appVersion.ts` | done |
| Health | — | Settings → About (version, build, API host, status and anything not set up) | `GET /api/health` (done) | done — verified on a Seeker 2026-10-24 (Settings → About) |

## Sign-in and account

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Privy sign-in (email, Google, wallets) | `components/providers/PrivyClientProvider.tsx` | `mobile/src/app/welcome.tsx`, `mobile/src/lib/auth/AuthProvider.tsx` | same | in progress — wallet sign-in verified on a Seeker; email, Google and passkey not yet checked on a device |
| Wallet sign-in (Seeker / Phantom / Solflare) | — | MWA + `useLoginWithSiws` (`mobile/src/lib/wallet/mwa.ts`) | same | done — verified on a Seeker with its own wallet |
| Embedded Solana wallet | `PrivyClientProvider.tsx` (createOnLogin) | Privy Expo embedded wallet | same | in progress — built (`createOnLogin: "users-without-wallets"`, `AuthProvider.tsx`); not yet signed in with email/Google on a device |
| Account identicon and menu | `components/shell/RailAccount.tsx`, `lib/account.ts` | header identicon → account sheet; Account tab header (`components/account/Identity.tsx`, shared) | — | done — verified on a Seeker 2026-10-24 |
| Account card (user id, linked accounts) | `components/dashboard/DashboardDrawer.tsx` | `mobile/src/app/dashboard.tsx` (Account tab → Dashboard) | — | done — verified on a Seeker |
| Store reset on account change | `lib/account.ts` (`accountKey`), all stores, `lib/agentChat.ts` (`endConversation`) | same rule | — | in progress — built: every account store resets on `accountKey` (`createAccountStore`), conversation ends (`endConversation`), and starred markets, recent searches and inbox seen-time reset for another account (`claimPhoneFor`, `phoneOwner.test.ts`); A→B on a device pending a second account |
| Sign out | `RailAccount.tsx`, `components/wallet/WalletActions.tsx` | Account tab, account sheet; clears cached PDFs | — | in progress — built; sign-out on a device pending (it ends the only signed-in session on the test phone) |
| Account and data deletion | — (store policy requirement) | Account → Settings → Delete account (`mobile/src/app/delete-account.tsx`): two steps, type DELETE; signs out and clears the phone (`lib/localData.ts`) | `DELETE /api/account` (`lib/auth/deletion.ts`): PDFs, profile (cascades), Privy user; idempotent | in progress — built; signed-in device check pending |
| Privacy policy, terms, disclosures | — | Account → Help & legal (`legal.tsx`), Open-source licences (`licenses.tsx`, generated by `scripts/licenses.mjs`), support mailto | drafts in `docs/legal/` (need a lawyer) | done — verified on a Seeker 2026-10-24; the documents themselves need a lawyer before publishing |

## Wallet and money

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Wallet drawer (identity, total, assets, sync) | `components/wallet/*` | `mobile/src/app/wallet.tsx`, `mobile/src/components/wallet/WalletSections.tsx`; states previewable from `/dev` | `/api/wallet` same | in progress — built; device screenshots pending |
| Wallet health and status | `lib/wallet/status.ts`, `health.ts`, `components/shell/status/*` | status line in the account identity (Account tab, account sheet) and the wallet sheet; no persistent status bar on a phone | — | done — verified on a Seeker 2026-10-24 |
| Receive (QR) | `components/portfolio/ReceiveDialog.tsx` | `mobile/src/app/receive.tsx` (QR, copy, Share, mainnet-only warning) | — | in progress — built; device check pending |
| Fund wallet | `WalletActions.tsx` (Privy funding) | wallet sheet, `useFundSolanaWallet` from `@privy-io/expo/ui` (0.77 supports it; `PrivyElements` mounted in `AuthProvider`) | — | in progress — built; needs funding enabled in the Privy dashboard to test |
| Export wallet | `WalletActions.tsx` (Privy export) | — | — | dropped — `@privy-io/expo` 0.77 has no export flow, and the app never renders a key; the wallet sheet says to export from getelyra.xyz. Revisit when Privy's Expo SDK adds one |
| Transfer / withdraw | `components/assets/TransferDialog.tsx` | `mobile/src/app/transfer.tsx` (`?intent=withdraw`), QR scan in `ScanAddress.tsx`; shared rules in `lib/wallet/flows.ts` | `/api/transfer/*` same; status now says `expired` | in progress — built; on-chain test pending |
| Swap | `components/assets/SwapDialog.tsx` | `mobile/src/app/swap.tsx` | `/api/swap/*` same | in progress — built; on-chain test pending |
| Action dialogs | `components/assets/ActionDialogs.tsx` | Portfolio action bar (Receive, Swap, Transfer, Withdraw) | — | done |
| Wallet activity | `components/workspace/ActivityWidget.tsx`, `lib/wallet/useWalletActivity.ts`, `lib/activity/*` | `mobile/src/app/activity.tsx` (Portfolio → Wallet activity), `mobile/src/lib/stores/activity.ts`; fired alerts and venue activity join with their stores | `/api/wallet/activity` same | in progress — verified on a Seeker with real history; moved to its own screen |
| Actions awaiting review | `components/agent/PendingActions.tsx`, `lib/actions/useOpenActions.ts` | `mobile/src/components/actions/ReviewCards.tsx` (Portfolio and Elyra tabs), `mobile/src/lib/stores/actions.ts` | `/api/actions` same | in progress — built and unit-tested; device check pending |
| On-chain proof of a confirmed action | `lib/actions/proof.ts` | — | same | done (server) |

## Markets

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Watchlist (market types, favorites, order) | `components/workspace/WatchlistWidget.tsx`, `lib/store.ts` | Markets → Watchlist (`mobile/src/components/market/Watchlist.tsx`, `WatchRow.tsx`, `mobile/src/lib/stores/watchlist.ts`); favourites are kept on the phone — the server stores none | `/api/watchlist` (done, `lib/watchlist.ts`) | in progress — add and live prices verified on a Seeker; reorder pending |
| Asset search | `components/panels/AssetSelectDialog.tsx`, `lib/market/useAssetSearch.ts` | `mobile/src/app/search.tsx`, `useAssetSearch` in `mobile/src/lib/stores/market.ts` | `/api/market/assets` same | done — verified on a Seeker |
| Command palette | `components/shell/CommandPalette.tsx` | `mobile/src/app/search.tsx` (markets, screens and actions, recent) | — | done — verified on a Seeker |
| Prices (Pyth) | `lib/market/usePrices.ts` | `usePrices` in `mobile/src/lib/stores/market.ts` (batched, stops in the background) | `/api/market/prices` same | done — live on a Seeker |
| Price header (24h, high, low, volume) | `components/panels/ChartPanel.tsx` | `mobile/src/app/asset/[symbol].tsx` | same | done — verified on a Seeker |
| Chart (TradingView embed) | `components/panels/ChartPanel.tsx`, `lib/useFirstScreenFit.ts` | `mobile/src/components/market/ChartView.tsx`; one widget config for both in `lib/market/chartWidget.ts`; origins allowlisted there | — | done — verified on a Seeker |
| Pivot levels | `lib/market/levels.ts`, `useLevels.ts` | Asset screen | `/api/market/levels` same | done — verified on a Seeker |
| Chart alerts | `components/panels/ChartAlerts.tsx`, `lib/alerts/useAlerts.ts` | `mobile/src/components/market/AlertsSheet.tsx`, `mobile/src/lib/stores/alerts.ts`; shared rules in `lib/alerts/rules.ts` | `/api/alerts` same, plus `appDelivery` | done — verified on a Seeker |
| Decision brief | `components/agent/DecisionBrief.tsx` | `mobile/src/components/market/DecisionBrief.tsx`; shared lines in `lib/market/brief.ts` | same | in progress — built; phone check pending |
| Market pulse | `components/agent/MarketPulse.tsx` | Markets → Pulse | `/api/market/pulse` same | done — verified on a Seeker |
| Live signals (market) | `components/workspace/SignalsWidget.tsx` | Markets → Signals → Market | `/api/market/prices` same | done — verified on a Seeker |
| Smart money | `components/panels/SmartMoneyPanel.tsx` (SEC filing findings), `SignalsWidget.tsx` (wallet consensus) | wallet consensus: Markets → Signals → Smart money; the SEC findings panel goes with Research | `/api/tracker/signals` same; `/api/smart-money` with Research | in progress — consensus built; SEC findings todo |
| Tracker stream (SSE) | `components/agent/ElyraSignals.tsx`, `SignalsWidget.tsx` | `useSmartMoney` in `mobile/src/lib/stores/signals.ts` (reconnect backoff, stops in the background) | `/api/tracker/*` same | done — verified on a Seeker |

## Portfolio

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Overview strip (value, 24h, available, positions, 7-day) | `components/workspace/OverviewStrip.tsx`, `lib/portfolio/useHistory.ts` | `mobile/src/components/portfolio/Overview.tsx` (also open PnL, counts and per-venue values, from the chat and Mini App) | `/api/portfolio`, `/history` same | done — verified on a Seeker |
| Trading activity (positions, orders, history, filters) | `components/workspace/TradingActivity.tsx`, `lib/portfolio/ledger.ts` | `mobile/src/components/portfolio/TradingActivity.tsx` (cards on phones, column-priority tables on tablets) | same | done — verified on a Seeker |
| Portfolio drawer (holdings, risk, DeFi) | `components/portfolio/PortfolioDrawer.tsx`, `lib/portfolio/drawer.ts` | `mobile/src/app/holdings.tsx`, `risk.tsx`, `defi.tsx`, `orders.tsx`, `fills.tsx` | `/api/app/views` (new: the agent's own tools, as the Mini App used) | done — verified on a Seeker |
| Capital accounts (equity, allocation, venues, balances) | `components/assets/CapitalAccounts.tsx`, `tables.tsx`, `lib/assets/*` | `mobile/src/app/capital.tsx` | same | done — verified on a Seeker |
| Dashboard (holdings, network, account) | `components/dashboard/DashboardDrawer.tsx` | `mobile/src/app/dashboard.tsx` | same | done — verified on a Seeker |

## Elyra (AI)

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Ask Elyra chat, streaming, sources | `components/agent/AgentPanel.tsx`, `lib/agentChat.ts`, `lib/agent/sources.ts` | Elyra → Ask: `mobile/src/lib/agentChat.ts` (shared fold `lib/agent/reply.ts`), `mobile/src/components/agent/*` | `/api/agent/chat` same; `prepared_action` event (`lib/agent/events.ts`) | done — verified on a Seeker: streamed a long answer, backgrounded mid-stream, came back to the finished answer and its sources; forced error + retry in place |
| Attachments | `lib/attachments.ts`, `AgentPanel.tsx` | `mobile/src/lib/attachments.ts` (photo + document pickers, shared `stagingError`) | same | done — verified on a Seeker: an image (scaled to WebP) and a CSV, answered from both |
| Dictation | `lib/voice/useDictation.ts` | `mobile/src/lib/voice.ts` (expo-audio → transcribe → draft only; reason shown before the system prompt; clip deleted after) | `/api/agent/transcribe` same | done — verified on a Seeker |
| Suggestion chips | `lib/agent/suggestions.ts` | Elyra → Ask composer | — | done |
| Elyra signals tab | `components/agent/ElyraSignals.tsx` | Elyra → Signals (`mobile/src/components/agent/ElyraSignals.tsx`) | same | done — verified on a Seeker |
| Capital Intelligence (context, answers, history, memory) | `components/personalized/*`, `lib/personalized/client.ts` | Elyra → Capital | `/api/personalized/*` same; existing account stores supply context | done — funded Seeker verified; see `verification/2026-10-23-capital-intelligence.md` |
| Prepared actions from answers | `lib/personalized/actions.ts`, `/api/personalized/actions/*` | inline review card → Swap | stored as `agent`, `preparedActionId` returned; fresh confirm check before quote/sign | done — funded Seeker pre-sign review verified; no transaction signed |

## Research

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Research tabs | `components/research/ResearchWorkspace.tsx` | Research tab | — | in progress — built (Prompts 14–15); signed-in device check pending |
| Reports + PDF | `components/research/ReportsTab.tsx`, `lib/research/*` | Research → Reports, share PDF | `/api/research/reports*` same | in progress — built (Prompts 14–15); signed-in device check pending |
| Backtests + PDF, compare | `components/research/BacktestsTab.tsx`, `lib/backtest/*` | Research → Backtests | `/api/backtest/*` same | in progress — built (Prompts 14–15); signed-in device check pending |
| Market recap | `components/research/RecapTab.tsx` | Research → Recap | `/api/research/recap` same | in progress — built (Prompts 14–15); signed-in device check pending |
| Research signals | `components/research/SignalsTab.tsx` | Research → Signals | `/api/research/signals` same | in progress — built (Prompts 14–15); signed-in device check pending |
| Yield (Kamino) | `components/research/YieldTab.tsx` | Research → Yield | `/api/research/yield` same | done — verified on a Seeker 2026-10-24 (live Kamino rates; compact amounts fixed) |
| Unlocks | `components/research/UnlocksTab.tsx` | Research → Unlocks | `/api/research/unlocks` same | in progress — built (Prompts 14–15); signed-in device check pending |
| SEC research, alpha board, insiders, filings | `components/agent/SecResearch.tsx`, `AlphaBoard.tsx`, `InsiderActivity.tsx`, `LiveFilings.tsx` | Research → SEC | `/api/sec/*`, `/api/filings` same | in progress — built (Prompts 14–15); signed-in device check pending |
| Prediction markets (list, detail, book, basket, signals) | `components/research/PredictionMarketsTab.tsx`, `lib/prediction/*` | Research → Prediction markets | `/api/prediction/*` same | in progress — built (Prompts 14–15); signed-in device check pending |
| Prediction alert rules | `lib/prediction/alerts.ts` | Prediction markets → Alerts | `/api/prediction/alerts` same | in progress — built (Prompts 14–15); signed-in device check pending |

## Connections, referrals, alerts

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Exchange connections (read-only) | `components/connections/ExchangeCards.tsx`, `ConnectionsDrawer.tsx`, `lib/connections/state.ts` | Account → Connections (`mobile/src/app/connections.tsx`): Hyperliquid by address, Binance read-only key (masked fields, cleared after submit, never stored on the phone) | `/api/exchanges` same | in progress — built; signed-in device check pending |
| Polymarket account link | `components/connections/PolymarketCard.tsx` | Account → Connections, Research → Prediction markets (`PolymarketLink`) | `/api/prediction/account` same | in progress — built; signed-in device check pending |
| Referrals (metrics, invite, pool, steps, list) | `components/referrals/ReferralsView.tsx`, `lib/referrals/*` | Account → Referrals (`mobile/src/app/referrals.tsx`): share sheet, copy, QR | `/api/referrals` same | in progress — built; signed-in device check pending |
| Referral link `/r/CODE` | `app/r/[code]/route.ts`, `lib/referrals/attribution.ts` | Android App Link → stored code (`mobile/src/lib/referral.ts`, `+native-intent.tsx`; first touch, 30 days) → `x-elyra-referral` until a signed-in request succeeds | `x-elyra-referral` read at profile creation (done); `/.well-known/assetlinks.json` from `ANDROID_CERT_SHA256` | in progress — link → app → "Invited by a friend" and first touch verified on a Seeker; sign-up attribution pending |
| Automation (alert rules list) | `components/workspace/AutomationSection.tsx` | Account → Alerts & automation (`mobile/src/app/automation.tsx`): status, re-arm, remove, details, new-rule sheet | `/api/alerts` same | done — verified on a Seeker 2026-10-24 |
| Notifications menu | `components/shell/status/*`, `lib/activity/notifications.ts` | bell → inbox | `/api/notifications`, `/read` (done) | done — bell with unread count → inbox, verified on a Seeker 2026-10-24 |

## Telegram → in-app

The website keeps Telegram. The app replaces every part of it.

| Telegram | In the app | Server work | Status |
|---|---|---|---|
| Linking a chat (`/link`, `/start CODE`, `/unlink`, link codes) | not needed — sign-in is the identity; the push device registers itself | `/api/devices` (done) | dropped — sign-in is the identity and the push device registers itself (`/api/devices`) |
| Free text and `/ask` | Elyra → Ask; any line that is not a shortcut is asked as typed (`lib/agent/shortcuts.ts`) | same | done — verified on a Seeker |
| `/portfolio` `/wallet` `/positions` `/defi` | Portfolio overview, Holdings, Risk, DeFi | `/api/app/views` (done) | in progress — built; phone check pending |
| `/orders` `/activity` (`/fills`) | Portfolio → Orders, Fills | `/api/app/views` (done) | in progress — built; phone check pending |
| `/markets` `/price` | Markets tab, asset screen | same | in progress — built |
| `/watch` (`/watchlist`) | Markets watchlist | `/api/watchlist` (done) | done — the same table the chat's /watch writes |
| `/swap` preview + "Review in Elyra" | `/swap 1.5 SOL to USDC` opens Swap prefilled; a plain-language swap answer carries its review card inline and in Elyra → Actions | ready previews stored as `agent` actions; Ask Elyra prepares them too (`lib/personalized/plan.ts`) | done — verified on a Seeker (no swap signed) |
| `/alert` `/alerts` | `/alert SOL > 120` opens the asset's alert editor prefilled; `/alert` and `/alerts` open Alerts & automation | same | done — shortcut verified on a Seeker; `/alerts` routing tested (`shortcuts.test.ts`) |
| `/research` `/report` | `/report NVDA` starts a report followed in the chat; `/research` opens Research → Reports (with words, it is asked) | same | in progress — report verified on a Seeker; PDF needs the `research-reports` bucket |
| `/recap` `/signals` `/yield` `/unlocks` | Research → Recap, Elyra → Signals, Research → Yield, Research → Unlocks | same | done — `/yield` verified on a Seeker 2026-10-24; parser tested |
| `/backtest` | bare: Research → Backtests; with a strategy in words: asked, and the agent runs it | same | done — parser tested |
| `/predictions` `/book` (`/orderbook`) `/basket` (`/fair`) | Research → Prediction markets (book and basket on each market's screen) | same | done — parser tested; tab built |
| `/settings` `/help` | Account; `/` lists every shortcut in the composer | — | done — verified on a Seeker |
| Notification: price alert crossed | push + inbox | one pass, every channel (done, `lib/notifications/deliver.ts`) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: liquidation warning | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: large move on a watched symbol | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: prediction probability move | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: prediction order update | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: prediction resolution | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: prediction signal alert | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification: daily summary | push + inbox | one pass, every channel (done) | done (server and inbox) — one delivery pass fans out to push + inbox; each kind has an Android channel and a validated route (`lib/notifications/routes.ts`); inbox verified on a Seeker; a live crossing of each kind not yet observed |
| Notification preferences | Account → Notifications | `/api/notifications/preferences` (done), shared validation | in progress — built (Account → Notifications, `notification-settings.tsx`); device check pending |
| Mini App: Overview, Holdings, Risk, DeFi | Portfolio overview, Holdings, Risk, DeFi | `/api/app/views` (done) | in progress — built; phone check pending |
| Mini App: Prediction, Trending, Signals, Alerts | Research → Prediction markets | same | in progress — built (Research → Prediction markets); signed-in device check pending |
| Mini App: Backtests | Research → Backtests | same | in progress — built (Research → Backtests); signed-in device check pending |
| Header Telegram link, Telegram connection card | dropped — no Telegram in the app | — | dropped — not part of the app |

## Release

| Item | Where | Status |
|---|---|---|
| Delivery every 5 minutes on Vercel Hobby | `supabase/migrations/0013_delivery_schedule.sql`, `supabase/SCHEDULER.md` | done (needs the Vault secrets) |
| Push notifications (FCM via Expo) | `mobile/`, EAS credentials | in progress — a test push reached the Seeker on 2026-10-23 (inbox shows it); production FCM credentials for the `dapp-store` build pending |
| App icon, splash, notification icon | `mobile/assets` (source: `public/images/dApp_Store_Icon.svg`) | todo |
| Signed APK (its own dApp Store key) | EAS `dapp-store` profile | todo |
| `assetlinks.json` on getelyra.xyz | website `/.well-known/` | in progress — served from `ANDROID_CERT_SHA256` (`app/.well-known/assetlinks.json/route.ts`); needs the release fingerprint set in Vercel |
| Store listing copy and screenshots | `docs/store/` | todo |
| Publisher Portal submission | publish.solanamobile.com | todo |
