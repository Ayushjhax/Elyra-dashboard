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
| Health | — | Settings → About | `GET /api/health` (done) | in progress — server done |

## Sign-in and account

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Privy sign-in (email, Google, wallets) | `components/providers/PrivyClientProvider.tsx` | `mobile/src/app/welcome.tsx`, `mobile/src/lib/auth/AuthProvider.tsx` | same | in progress — wallet sign-in verified on a Seeker; email, Google and passkey not yet checked on a device |
| Wallet sign-in (Seeker / Phantom / Solflare) | — | MWA + `useLoginWithSiws` (`mobile/src/lib/wallet/mwa.ts`) | same | done — verified on a Seeker with its own wallet |
| Embedded Solana wallet | `PrivyClientProvider.tsx` (createOnLogin) | Privy Expo embedded wallet | same | todo |
| Account identicon and menu | `components/shell/RailAccount.tsx`, `lib/account.ts` | header identicon → account sheet | — | todo |
| Account card (user id, linked accounts) | `components/dashboard/DashboardDrawer.tsx` | Account → Settings | — | todo |
| Store reset on account change | `lib/account.ts` (`accountKey`), all stores, `lib/agentChat.ts` (`endConversation`) | same rule | — | todo |
| Sign out | `RailAccount.tsx`, `components/wallet/WalletActions.tsx` | Account tab, wallet sheet | — | todo |
| Account and data deletion | — (store policy requirement) | Account → Delete account | new `DELETE /api/account` | todo |
| Privacy policy, terms, disclosures | — | Account → Help & legal | — | todo |

## Wallet and money

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Wallet drawer (identity, total, assets, sync) | `components/wallet/*` | `mobile/src/app/wallet.tsx`, `mobile/src/components/wallet/WalletSections.tsx`; states previewable from `/dev` | `/api/wallet` same | in progress — built; device screenshots pending |
| Wallet health and status | `lib/wallet/status.ts`, `health.ts`, `components/shell/status/*` | header status, wallet sheet | same | todo |
| Receive (QR) | `components/portfolio/ReceiveDialog.tsx` | `mobile/src/app/receive.tsx` (QR, copy, Share, mainnet-only warning) | — | in progress — built; device check pending |
| Fund wallet | `WalletActions.tsx` (Privy funding) | wallet sheet, `useFundSolanaWallet` from `@privy-io/expo/ui` (0.77 supports it; `PrivyElements` mounted in `AuthProvider`) | — | in progress — built; needs funding enabled in the Privy dashboard to test |
| Export wallet | `WalletActions.tsx` (Privy export) | — | — | dropped — `@privy-io/expo` 0.77 has no export flow, and the app never renders a key; the wallet sheet says to export from getelyra.xyz. Revisit when Privy's Expo SDK adds one |
| Transfer / withdraw | `components/assets/TransferDialog.tsx` | `mobile/src/app/transfer.tsx` (`?intent=withdraw`), QR scan in `ScanAddress.tsx`; shared rules in `lib/wallet/flows.ts` | `/api/transfer/*` same; status now says `expired` | in progress — built; on-chain test pending |
| Swap | `components/assets/SwapDialog.tsx` | `mobile/src/app/swap.tsx` | `/api/swap/*` same | in progress — built; on-chain test pending |
| Action dialogs | `components/assets/ActionDialogs.tsx` | Portfolio action bar (Receive, Swap, Transfer, Withdraw) | — | done |
| Wallet activity | `components/workspace/ActivityWidget.tsx`, `lib/wallet/useWalletActivity.ts`, `lib/activity/*` | Portfolio tab (`mobile/src/components/wallet/Activity.tsx`, `mobile/src/lib/stores/activity.ts`); fired alerts and venue activity join with their stores | `/api/wallet/activity` same | in progress — built; device check pending |
| Actions awaiting review | `components/agent/PendingActions.tsx`, `lib/actions/useOpenActions.ts` | `mobile/src/components/actions/ReviewCards.tsx` (Portfolio and Elyra tabs), `mobile/src/lib/stores/actions.ts` | `/api/actions` same | in progress — built and unit-tested; device check pending |
| On-chain proof of a confirmed action | `lib/actions/proof.ts` | — | same | done (server) |

## Markets

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Watchlist (market types, favorites, order) | `components/workspace/WatchlistWidget.tsx`, `lib/store.ts` | Markets tab | `/api/watchlist` (done, `lib/watchlist.ts`) | todo |
| Asset search | `components/panels/AssetSelectDialog.tsx`, `lib/market/useAssetSearch.ts` | Search screen | `/api/market/assets` same | todo |
| Command palette | `components/shell/CommandPalette.tsx` | Search screen (assets, screens, actions) | — | todo |
| Prices (Pyth) | `lib/market/usePrices.ts` | prices store | `/api/market/prices` same | todo |
| Price header (24h, high, low, volume) | `components/panels/ChartPanel.tsx` | Asset screen header | same | todo |
| Chart (TradingView embed) | `components/panels/ChartPanel.tsx`, `lib/useFirstScreenFit.ts` | WebView chart, allowlisted origins | — | todo |
| Pivot levels | `lib/market/levels.ts`, `useLevels.ts` | Asset screen | `/api/market/levels` same | todo |
| Chart alerts | `components/panels/ChartAlerts.tsx`, `lib/alerts/useAlerts.ts` | Asset screen → alerts | `/api/alerts` same | todo |
| Decision brief | `components/agent/DecisionBrief.tsx` | Asset screen | same | todo |
| Market pulse | `components/agent/MarketPulse.tsx` | Markets tab | `/api/market/pulse` same | todo |
| Live signals (market) | `components/workspace/SignalsWidget.tsx` | Markets → Signals | `/api/market/signals`, `/api/signals` same | todo |
| Smart money | `components/panels/SmartMoneyPanel.tsx` | Markets → Smart money | `/api/smart-money` same | todo |
| Tracker stream (SSE) | `components/agent/ElyraSignals.tsx` | streaming helper | `/api/tracker/*` same | todo |

## Portfolio

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Overview strip (value, 24h, available, positions, 7-day) | `components/workspace/OverviewStrip.tsx`, `lib/portfolio/useHistory.ts` | Portfolio tab header | `/api/portfolio`, `/history` same | todo |
| Trading activity (positions, orders, history, filters) | `components/workspace/TradingActivity.tsx`, `lib/portfolio/ledger.ts` | Portfolio → Activity | same | todo |
| Portfolio drawer (holdings, risk, DeFi) | `components/portfolio/PortfolioDrawer.tsx`, `lib/portfolio/drawer.ts` | Portfolio detail screens | same | todo |
| Capital accounts (equity, allocation, venues, balances) | `components/assets/CapitalAccounts.tsx`, `tables.tsx`, `lib/assets/*` | Portfolio → Accounts | same | todo |
| Dashboard (holdings, network, account) | `components/dashboard/DashboardDrawer.tsx` | Account → Settings | same | todo |

## Elyra (AI)

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Ask Elyra chat, streaming, sources | `components/agent/AgentPanel.tsx`, `lib/agentChat.ts`, `lib/agent/sources.ts` | Elyra → Ask | `/api/agent/chat` same | todo |
| Attachments | `lib/attachments.ts`, `AgentPanel.tsx` | document and image pickers | same | todo |
| Dictation | `lib/voice/useDictation.ts` | expo-audio → transcribe | `/api/agent/transcribe` same | todo |
| Suggestion chips | `lib/agent/suggestions.ts` | chat | — | todo |
| Elyra signals tab | `components/agent/ElyraSignals.tsx` | Elyra → Signals | same | todo |
| Capital Intelligence (context, answers, history, memory) | `components/personalized/*`, `lib/personalized/client.ts` | Elyra → Capital Intelligence | `/api/personalized/*` same | todo |
| Prepared actions from answers | `lib/personalized/actions.ts`, `/api/personalized/actions/*` | inline review card → Swap | stored as `agent`, `preparedActionId` returned (done) | todo |

## Research

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Research tabs | `components/research/ResearchWorkspace.tsx` | Research tab | — | todo |
| Reports + PDF | `components/research/ReportsTab.tsx`, `lib/research/*` | Research → Reports, share PDF | `/api/research/reports*` same | todo |
| Backtests + PDF, compare | `components/research/BacktestsTab.tsx`, `lib/backtest/*` | Research → Backtests | `/api/backtest/*` same | todo |
| Market recap | `components/research/RecapTab.tsx` | Research → Recap | `/api/research/recap` same | todo |
| Research signals | `components/research/SignalsTab.tsx` | Research → Signals | `/api/research/signals` same | todo |
| Yield (Kamino) | `components/research/YieldTab.tsx` | Research → Yield | `/api/research/yield` same | todo |
| Unlocks | `components/research/UnlocksTab.tsx` | Research → Unlocks | `/api/research/unlocks` same | todo |
| SEC research, alpha board, insiders, filings | `components/agent/SecResearch.tsx`, `AlphaBoard.tsx`, `InsiderActivity.tsx`, `LiveFilings.tsx` | Research → SEC | `/api/sec/*`, `/api/filings` same | todo |
| Prediction markets (list, detail, book, basket, signals) | `components/research/PredictionMarketsTab.tsx`, `lib/prediction/*` | Research → Prediction markets | `/api/prediction/*` same | todo |
| Prediction alert rules | `lib/prediction/alerts.ts` | Prediction markets → Alerts | `/api/prediction/alerts` same | todo |

## Connections, referrals, alerts

| Feature | Web source | In the app | API | Status |
|---|---|---|---|---|
| Exchange connections (read-only) | `components/connections/ExchangeCards.tsx`, `ConnectionsDrawer.tsx`, `lib/connections/state.ts` | Account → Connections | `/api/exchanges` same | todo |
| Polymarket account link | `components/connections/PolymarketCard.tsx` | Account → Connections | `/api/prediction/account` same | todo |
| Referrals (metrics, invite, pool, steps, list) | `components/referrals/ReferralsView.tsx`, `lib/referrals/*` | Account → Referrals | `/api/referrals` same | todo |
| Referral link `/r/CODE` | `app/r/[code]/route.ts`, `lib/referrals/attribution.ts` | Android App Link → stored code | `x-elyra-referral` read at profile creation (done, `lib/referrals/attribution.ts`) | todo |
| Automation (alert rules list) | `components/workspace/AutomationSection.tsx` | Account → Alerts & automation | `/api/alerts` same | todo |
| Notifications menu | `components/shell/status/*`, `lib/activity/notifications.ts` | bell → inbox | `/api/notifications`, `/read` (done) | todo |

## Telegram → in-app

The website keeps Telegram. The app replaces every part of it.

| Telegram | In the app | Server work | Status |
|---|---|---|---|
| Linking a chat (`/link`, `/start CODE`, `/unlink`, link codes) | not needed — sign-in is the identity; the push device registers itself | `/api/devices` (done) | todo |
| Free text and `/ask` | Elyra → Ask | same | todo |
| `/portfolio` `/wallet` `/positions` `/defi` | Portfolio screens | same | todo |
| `/orders` `/activity` (`/fills`) | Portfolio → Activity | same | todo |
| `/markets` `/price` | Markets tab, asset screen | same | todo |
| `/watch` (`/watchlist`) | Markets watchlist | `/api/watchlist` (done) | todo |
| `/swap` preview + "Review in Elyra" | Swap screen, review cards | ready previews stored as `agent` actions, id returned (done) | todo |
| `/alert` `/alerts` | alert editor, Alerts & automation | same | todo |
| `/research` `/report` | Research → Reports | same | todo |
| `/recap` `/signals` `/yield` `/unlocks` | Research tabs | same | todo |
| `/backtest` | Research → Backtests | same | todo |
| `/predictions` `/book` (`/orderbook`) `/basket` (`/fair`) | Research → Prediction markets | same | todo |
| `/settings` `/help` | Account → Settings; `/` shortcuts in the chat composer | — | todo |
| Notification: price alert crossed | push + inbox | one pass, every channel (done, `lib/notifications/deliver.ts`) | todo |
| Notification: liquidation warning | push + inbox | one pass, every channel (done) | todo |
| Notification: large move on a watched symbol | push + inbox | one pass, every channel (done) | todo |
| Notification: prediction probability move | push + inbox | one pass, every channel (done) | todo |
| Notification: prediction order update | push + inbox | one pass, every channel (done) | todo |
| Notification: prediction resolution | push + inbox | one pass, every channel (done) | todo |
| Notification: prediction signal alert | push + inbox | one pass, every channel (done) | todo |
| Notification: daily summary | push + inbox | one pass, every channel (done) | todo |
| Notification preferences | Account → Notifications | `/api/notifications/preferences` (done), shared validation | todo |
| Mini App: Overview, Holdings, Risk, DeFi | Portfolio screens | same | todo |
| Mini App: Prediction, Trending, Signals, Alerts | Research → Prediction markets | same | todo |
| Mini App: Backtests | Research → Backtests | same | todo |
| Header Telegram link, Telegram connection card | dropped — no Telegram in the app | — | dropped — not part of the app |

## Release

| Item | Where | Status |
|---|---|---|
| Delivery every 5 minutes on Vercel Hobby | `supabase/migrations/0013_delivery_schedule.sql`, `supabase/SCHEDULER.md` | done (needs the Vault secrets) |
| Push notifications (FCM via Expo) | `mobile/`, EAS credentials | todo |
| App icon, splash, notification icon | `mobile/assets` (source: `public/images/dApp_Store_Icon.svg`) | todo |
| Signed APK (its own dApp Store key) | EAS `dapp-store` profile | todo |
| `assetlinks.json` on getelyra.xyz | website `/.well-known/` | todo |
| Store listing copy and screenshots | `docs/store/` | todo |
| Publisher Portal submission | publish.solanamobile.com | todo |
