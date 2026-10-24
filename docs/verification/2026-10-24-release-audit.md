# Release audit — 2026-10-24

Parity with the website, no Telegram in the app, data rules, secrets,
security and accessibility. Phone: Solana Seeker, signed in with its own
wallet, dev client on Metro against a local API. Screenshots are in
`2026-10-24-release-audit/`.

Legend: ✅ holds · 🔧 fixed in this audit · ⏳ open

## 1. Porting map

- ✅ Every row of `docs/PORTING_MAP.md` re-walked and its status corrected
  (the Research rows still said `todo` after Prompts 14–15 built them).
- ✅ No feature row is `todo`. Five release rows are: app icon, signed
  `dapp-store` APK, store listing, Publisher Portal submission — and push
  is now `in progress` (a test push reached this phone on 2026-10-23).
- ⏳ `in progress` rows waiting only on a signed-in device pass: Research
  tabs other than Yield, prediction markets, Connections, Referrals,
  sign-out, notification preferences, swap/transfer on chain.

## 2. Telegram

- ✅ `grep -ri telegram mobile` (excluding `node_modules`, `android`): 0.
- ✅ Scope: the app only. The website keeps Telegram (CLAUDE.md, confirmed
  by the owner); the repo-wide count is 841 lines in 114 files, all web,
  server, migrations and docs.
- 🔧 The one Telegram phrase a shared module put in the app bundle —
  "alert sent to Telegram" in `lib/activity/events.ts` — now comes from the
  website's own caller (`lib/activity/useAccountEvents.ts`).
- ✅ Remaining "Telegram" strings in the APK bundle are surface-gated web
  wording in shared modules (`lib/market/brief.ts:132`, `lib/account.ts:52`
  Privy login label) and third-party code (react-native-keyboard-controller's
  `TELEGRAM_ANDROID_TIMING_CONFIG`, a chain registry's URLs). None renders
  in the app.
- Every former command and notification, and where it works in the app:

| Telegram | In the app |
|---|---|
| `/link` `/start` `/unlink` | not needed — sign-in is the identity; the phone registers for push itself |
| free text, `/ask` | Elyra → Ask |
| `/portfolio` `/wallet` `/positions` `/defi` | Portfolio, Wallet, Risk, DeFi |
| `/orders` `/activity` | Portfolio → Orders, Fills |
| `/markets` `/price SOL` | Markets tab, the asset screen |
| `/watch add SOL` | Markets watchlist |
| `/swap 1.5 SOL to USDC`, "Review in Elyra" | Swap prefilled; review cards inline and in Elyra → Actions |
| `/alert SOL > 120`, `/alerts` | the asset's alert editor; 🔧 Alerts & automation |
| `/report NVDA`, `/research` | a report followed in the chat; 🔧 Research → Reports |
| `/recap` `/yield` `/unlocks` | 🔧 Research → Recap, Yield, Unlocks (`/yield` verified, `research-yield.png`) |
| `/signals` | Elyra → Signals |
| `/backtest` | 🔧 Research → Backtests (with a strategy in words: asked) |
| `/predictions` `/book` `/basket` | 🔧 Research → Prediction markets |
| `/settings` `/help` | Account; `/` lists every shortcut |
| price alert, liquidation, large move, prediction move / order / resolution / signal, daily summary | push on its Android channel + inbox; one delivery pass (`lib/notifications/deliver.ts`) |
| a notification's link | `lib/notifications/routes.ts`; 🔧 `/alerts` → Alerts & automation, a prediction signal → Research → Prediction markets (was Reports) |
| Mini App views | Portfolio detail screens, Research tabs |

## 3. Data rules

- ✅ Every account store resets on `accountKey` and drops reads from before
  the switch (`createAccountStore`); the conversation, retry map, composer
  draft and attachments end with `endConversation` (`mobile/src/lib/agentChat.ts:45`).
- 🔧 Starred markets, recent searches and the inbox's seen time were
  persisted per phone, so account B would have seen A's. They now belong to
  the account that signed in (`claimPhoneFor`, `mobile/src/lib/store.ts`;
  test `phoneOwner.test.ts`).
- ⏳ A → sign out → B on the device: needs a second account.
- ✅ No `$0.00` for a failed read: `Money` renders an explained absence for
  `null` (`components/ui/values.tsx`). 🔧 `Signals.tsx` `metricText` showed a
  missing figure as `$0`/`0%`; it now shows "—".
- 🔧 Hermes ignores `Intl`'s compact notation: deposits read
  "$53,084,444.6". `dollars()` and `Money compact` now use
  `formatCompactUsd` ("$53.1M", `research-yield.png`).
- ✅ Every price with a `$` goes through `formatPriceUsd`; table prices
  without a sign use `formatPrice` at the instrument's precision.
- ✅ `Date.now()` appears only in effects and handlers (`transfer.tsx:117`,
  `swap.tsx:184,205,237`), never in render.
- ✅ No colour literal outside `src/theme`.

## 4. Secrets

- ✅ Release APK built (`assembleRelease`), unzipped, Hermes bundle
  (11.8 MB) searched.
- ✅ Every server secret in `.env.local` (14 values) searched as three
  10-character slices (start, middle, end): no secret middle or end found.
  The only matches were public prefixes (`privy_app_secret_`, `https://`).
- ✅ Secret shapes: `sk-ant` 0, `service_role` 0, JWTs 0, Google keys 0,
  `api-key=` 0. "PRIVATE KEY" appears only as PEM markers in a crypto
  library's parser; "APP_URL" only inside a Privy error code.
- ✅ The three public `EXPO_PUBLIC_` values are present, as expected.

## 5. Security

- ✅ WebView: TradingView origins only (`lib/market/chartWidget.ts:121-137`,
  tested), `onShouldStartLoadWithRequest`, no file access, no multiple
  windows, `mixedContentMode="never"` (`ChartView.tsx:142-160`).
- ✅ Deep links: allowlist with validated parts (`mobile/src/lib/links.ts`,
  tested). Signed in on the Seeker: `elyra://asset/SOL`
  (`link-asset-sol.png`), `wallet`, `notifications`, `research/report/<id>`
  open their screens; `elyra://swap?amount=999`, `elyra://asset/%3Cscript%3E`,
  `elyra://dev` land on Markets.
- ✅ Exchange keys are never on the device: component state only, cleared
  before the request (`components/connections/Exchanges.tsx:263-265`), no
  storage call in the flow.
- ✅ Logs: the app's only log is a sign-out clean-up warning; no server log
  prints a token, a key-bearing URL or a full address (the one identifier
  logged is a Privy DID, `lib/auth/session.ts`).
- ✅ Signer = build address: the app signs only with the wallet whose
  address equals the server's `signer` (`lib/wallet/signer.ts:172-181`) and
  re-checks the connected MWA account (`:141`, `:157`); the server builds
  for the session's own address (`app/api/transfer/build/route.ts:78`).
- 🔧 `android.allowBackup` was on (Expo's default): Android backup could
  copy the session and preferences off the phone. Now `false`
  (`mobile/app.config.ts`); applies from the next prebuild.

## 6. Accessibility

- ✅ Every clickable on the five tabs has a spoken name (uiautomator tree:
  Markets 22, Portfolio 17, Elyra 20, Research 27, Account 18 clickables,
  0 unlabelled); every `Pressable` in `src` declares a role.
- 🔧 Targets under 48dp with no hit slop: segmented control (40),
  Ask suggestions (36), jump to latest (40), alpha-board tabs (36), signals
  toggle (44). Each now reaches 48dp.
- 🔧 Font scale 1.3: tab labels truncated ("Portfol…"); capped at 1.15 as a
  dense row (`(tabs)/_layout.tsx`). Usable at 1.3: `font-1.3-portfolio.png`.
- ✅ 412dp and tablet: `w412-markets.png`, `tablet-markets.png`.
- ⏳ A hands-on TalkBack pass (gestures) on the main flows — adb can't drive
  TalkBack's gestures; the tree above is what it reads.
- ⏳ Dev only: after the activity is recreated (density or font change),
  Expo Router logs "configured linking in multiple places". Not seen after
  a cold start; LogBox doesn't exist in a release build.

## Checks

Website: typecheck, lint, 1329 tests. App: typecheck, lint, 175 tests.
