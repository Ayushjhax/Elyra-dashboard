# Elyra

An agentic crypto trading terminal, on the web and on Android.

Elyra is one product with two clients and one backend:

- **The website** (`getelyra.xyz`) — a Next.js trading workspace: a live
  chart, the account's own ledger, price alerts, research, and **Ask Elyra**,
  the agent, in a column beside the chart. It also runs the Telegram bot.
- **The Android app** (`mobile/`) — an Expo app published on the Solana dApp
  Store as **Elyra** (`xyz.getelyra.app`). It talks only to the website's API
  (`https://api.getelyra.xyz`), so a person has the same login, embedded
  wallet, alerts, conversations, referrals and connections on both.

Both share the same Supabase database, the same Privy app, the same agent and
the same pure modules in `lib/` — one source of truth for every rule.

## What Elyra will and will not do

**There is no order execution.** The agent reads market data and account state
and writes analysis. No tool, route or code path places, modifies or cancels
an order — that is enforced structurally, not by convention: `lib/exchange/`
exposes only signed GETs and address-keyed reads, and adding execution would
mean changing those files rather than calling them differently. Venue
connections are read-only: a perp, an order or an exchange balance links to
its venue.

The one thing Elyra finishes is a **swap or a transfer the person signs**. The
server builds the transaction, the person's own wallet signs it, the server
submits and confirms it — and a prepared action becomes `confirmed` only with
that signature.

Nothing on either client is sample data:

- **The agent is live.** `runAgent` in `lib/agent/` reads real prices, funding,
  open interest and — where an exchange is connected — real positions and
  equity. It is reached from the web's chat panel and the app's Elyra tab,
  where the reply streams, and from Telegram.
- **The ledger is the account's own.** Holdings, venue perps and DeFi
  deposits come from `/api/portfolio`, marked to the live Pyth price, and
  History reads the wallet's transactions. Signed out, a surface asks you to
  connect; an empty list means the read succeeded and found nothing.
- **Automation is price alerts.** Set on the chart, in Telegram or in the app,
  checked every five minutes by the delivery worker, and sent to a linked
  Telegram chat and to the app as a push and an inbox entry. A rule tells you;
  it never trades.

`docs/ELYRA_BRAND.md` is the source of truth for colour, type, spacing and
voice, on both clients. Every token is declared once in `app/globals.css`;
`lib/tokens.ts` is the app's mirror of them as values, and
`lib/tokens.test.ts` holds the two identical. No component on either client
holds a colour value.

## The repository

```
app/             the Next.js app: pages, and app/api — the one API both clients use
components/      the website's components
lib/             shared logic; the pure half (listed in lib/core.ts) is imported by the app
supabase/        migrations, the schema notes and the delivery scheduler
scripts/         Telegram webhook, Supabase setup and migration bundling
docs/            brand, providers, Telegram, porting map, push setup, legal drafts
mobile/          the Android app — a standalone Expo project
  src/app/         Expo Router screens (tabs: Markets, Portfolio, Elyra, Research, Account)
  src/components/  the app's components
  src/lib/         API client, stores, signing, push, auth
  src/theme/       fonts and <Text variant>, from lib/tokens.ts
```

`mobile/` has its own `package.json`, lockfile, lint and tests. The web's
tsconfig, eslint and vitest exclude it, and `.vercelignore` keeps it out of
the website's upload — EAS builds the app, never Vercel.

## Running the website and the API

```bash
pnpm install
cp .env.example .env.local   # then fill it in; see below
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm start
```

Markets, the chart and signals run with no configuration at all; everything
that belongs to an account needs sign-in and the database. The server needs,
in `.env.local`: `ANTHROPIC_API_KEY`, the three Supabase values, a Privy app
id and secret, and a 32-byte `CREDENTIALS_ENC_KEY`
(`openssl rand -base64 32`). It refuses to boot without them and names every
one that is missing. `.env.example` documents every other variable — Pyth,
the Solana RPCs, Jupiter, Birdeye, Gemini, SEC EDGAR, the feature flags and
the app's version gate — and what happens without each.

### The database

One Supabase project serves the website and the app. Authentication is Privy,
so `auth.uid()` is never set: every table has RLS enabled with no policies,
only the server's service-role client reads or writes, and every query
filters by `user_id`.

Apply the files in `supabase/migrations/` in order — each is idempotent — or,
on a fresh database, paste `supabase/migrations/_apply_all.sql` into the SQL
editor (rebuild it with `pnpm supabase:bundle`). `supabase/README.md` lists
every table.

### Notifications every five minutes

Vercel's free plan allows a cron once a day, so the five-minute delivery tick
runs from the database: pg_cron and pg_net call `/api/notifications/deliver`
with `CRON_SECRET` (`0013_delivery_schedule.sql`). `vercel.json` keeps one
daily run as a fallback; calling the route twice is safe, because every event
is claimed once before it is sent. The one-time setup is in
`supabase/SCHEDULER.md`. A new scheduled job goes there, never in
`vercel.json`.

One delivery pass claims each event and fans it out per channel: Telegram for
a linked chat, a push and the inbox for an app device. Notification
preferences apply to every channel.

### Telegram (website only)

Optional. With `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and
`TELEGRAM_WEBHOOK_SECRET` set, register the webhook with:

```bash
pnpm telegram:webhook           # uses APP_URL, which must be https
pnpm telegram:webhook -- --info
pnpm telegram:dev               # a local bot against a tunnel
```

`docs/TELEGRAM.md` has BotFather setup and the security boundaries.

## Running the Android app

The app needs a development build, not Expo Go: Mobile Wallet Adapter, Privy
and the other native modules are not in Expo Go. You need the Android SDK and
an emulator or a phone with USB debugging on.

```bash
cd mobile
pnpm install
cp .env.example .env         # EXPO_PUBLIC_API_URL and the Privy app and client IDs
pnpm android                 # builds and installs a development build on the emulator
pnpm start                   # Metro, for a development build already installed
```

Run the API alongside it with `pnpm dev` in the repo root. Point
`EXPO_PUBLIC_API_URL` at it:

| Where the app runs | `EXPO_PUBLIC_API_URL` |
|---|---|
| Android emulator | `http://10.0.2.2:3000` |
| A phone on USB | `http://localhost:3000`, with `pnpm phone` |
| A phone on the same Wi-Fi | `http://<your Mac's IP>:3000` |
| Production | `https://api.getelyra.xyz` |

`pnpm phone` forwards ports 8081 (Metro) and 3000 (the API) over the cable
with `adb reverse`, then starts Metro, so the phone's `localhost` reaches the
Mac. The forwarding is lost when the cable is unplugged; run it again after
reconnecting.

Only `EXPO_PUBLIC_` values go in `mobile/.env`, and every one of them is
inlined into the bundle: the API URL and Privy's public app and client IDs.
No secret ever goes there. Push needs `google-services.json`, supplied as the
`GOOGLE_SERVICES_JSON` file variable — see `docs/mobile/notifications-setup.md`.

## Checks

Keep both projects green:

```bash
pnpm typecheck && pnpm lint && pnpm test                     # the website (vitest)
cd mobile && pnpm typecheck && pnpm lint && pnpm test        # the app (jest-expo)
```

A web test is ported along with the code it tests. Several web tests guard
the boundary between the two: `lib/core.test.ts` (the app imports only pure
modules) and `lib/tokens.test.ts` (the app's tokens equal the website's).

# The website

## Layout

A trading workspace: a slim rail, a fixed header, and a page that scrolls
under it.

```
64px   header: wordmark · Trading workspace · search (⌘K) · status · alerts · account
rail   account strip: value + 24h P&L · available · positions · 7-day line
                      · pending-action badge · column toggles · Focus chart
       256px          1fr                                 364px
       Watchlist      Chart: market · price · high/low/vol Elyra intelligence
       Live signals   Trading activity (All/Spot/Perps/…)  Ask Elyra · Signals
       Activity       Automation                           · Research (sticky)
```

Those are opening widths, not fixed ones, and they are a wide screen's. On a
laptop a column you have not resized opens narrower, so the chart keeps 60%
of the row: a 13-inch MacBook Air (1470px) opens at 230 | 784 | 320, where a
1920px screen opens exactly as drawn above. Below 1280px the agent becomes a
drawer; below 900px the workspace is one column with the widgets stacked
under the centre; below 640px the rail becomes a sheet behind the header's
menu button.

On a phone, beyond the columns:

- Trading activity's positions, orders and history are cards in a container
  under 40rem (`DataTable`'s `card`), so a P&L and its action are never behind
  a sideways scroll.
- Every field is 16px on a touch screen, so iOS does not zoom into it, and
  the keyboard resizes the page on Android (`interactiveWidget`), so the
  agent's composer stays above it.
- A popover keeps itself inside the viewport, and the workspace never
  scrolls sideways.
- The chart says to tap it; once tapped it holds the gestures, and a
  **Release chart** button hands them back. The full-screen button is
  dropped where the browser cannot do it (Safari on an iPhone), and on a
  phone on its side the plot is held to the room under the header.
- A tooltip that is the only place a reason or a definition lives opens on a
  tap (`Tip openOnTap`, `InfoTip`); Radix's tooltip alone never does on touch.

The agent's **Ask Elyra** view leads with a **decision brief** — where the
price sits in today's range, against its EMA and between yesterday's pivot
levels; your actual exposure to the market from `/api/portfolio`; and the
nearest alert you have armed, or the nearest level — and with any **action
awaiting review**. Those are real prepared actions: Elyra prepares a swap or a
perp move in Telegram, "Review in Elyra" stores it in `prepared_actions` for
ten minutes, and `/api/actions` lists it here. A ready swap opens the swap
dialog prefilled; it is re-quoted through Jupiter, signed in your wallet, and
only then recorded as confirmed, with the signature as evidence. A perp close
or a transfer says why it cannot be done here. The strip's badge counts them.

The chart's **Alerts** sets price alerts through `/api/alerts` and says where
a crossing goes: a linked Telegram chat, a chat with price alerts switched
off, or nowhere. The **Draw** toggle brings back TradingView's drawing tools,
and **Pivot levels** lists the prior day's floor pivots (`lib/market/levels.ts`)
under the toolbar.

### The chart is not a route

The workspace — overview, widgets, chart, trading activity, automation and
agent — is mounted by `AppShell` for the life of the session. `app/page.tsx`
returns `null`: Home *is* the workspace.

- From 900px a route (Dashboard, Portfolio, Agent) opens beside the chart in
  the widgets' column, and closes from the **✕** in its header. The widgets
  come back when it closes; their preference was never written.
- A route in `FULL_BLEED_ROUTES` (Assets, Personalized, Referrals, Research),
  and any route below 900px, takes the workspace body. The workspace is hidden
  underneath rather than unmounted, so the TradingView widget is still there
  on the way back.
- `AppShell` decides where a route's panel goes in JS, because it must be
  mounted in exactly one place — rendering it twice and hiding one would run
  its effects and fetches twice.

### The centre never pays

One rule holds the geometry together, and `lib/layout.ts` is where it lives.

- `COLUMN_BOUNDS` gives the widgets, route and agent columns a minimum, a
  maximum and an opening width; `MAIN_MIN` is the floor under the centre.
- When the row does not fit, the rail drops its labels first, then the side
  columns give width in `SQUEEZE_ORDER` — widgets, agent, route — down to their
  minimums. The centre takes whatever is left.
- The floor keeps the chart working; `MAIN_SHARE` keeps it the point of the
  screen. A widgets or agent column the operator has not sized — never
  dragged, nudged or widened — gives width in the same order until the centre
  has 60% of the row. A width the operator chose, the rail's labels and an open
  route are choices, and give only to the floor. Double-clicking a handle hands
  its column back to the screen.
- `shellLayout` returns one track string per breakpoint for the frame (rail |
  everything) and for the workspace grid. `AppShell` publishes them as custom
  properties and `.shell-frame` / `.workspace-grid` in `app/globals.css` pick
  between them, so the media queries stay the single authority on which
  columns are on screen.

It is pure arithmetic, which is why `lib/layout.test.ts` can sweep every
viewport from 900 to 2560px against every combination of open columns.

Side columns resize from their inner edge (drag, arrow keys, double-click to
reset). The agent and an open route are sticky: they start level with the
chart, scroll up with the page, then stay while the centre keeps going —
`lib/useStickyFill.ts` measures them so their bottom edge, and the agent's
composer, is always on screen. The chart card opens one screen tall:
`lib/useFirstScreenFit.ts` measures what sits above the plot, so the card's
foot lands level with the agent's on any screen height, and in focus mode the
whole card fits.

### What persists

Widget order and folds, which side columns are open and how wide, the rail's
labels, the Trading activity and Automation folds, the trading tab and venue
filter, the chart's interval, style and indicators, the watchlist and
favourites, and the selected market. Focus mode does not: it suppresses the
side columns while it is on and finds them exactly as they were when it ends
(Esc leaves it).

## How it is wired

- `lib/store.ts` — zustand. `selectedAssetId` is the spine: the watchlist and
  search set it, and the chart, the trading table's ordering and the agent's
  suggestions all read from it. Layout preferences persist (see above) and
  rehydrate after mount so the server and client render identically; version 2
  of the persisted state migrates the old composed column's order.
- **The account and the wallet.** The rail's avatar opens the account menu
  (`components/shell/RailAccount.tsx`; inline in the navigation sheet on a
  phone) and the menu opens the wallet drawer (`components/wallet/`). Both
  read `useWalletDashboard`, the one wallet store, and `lib/wallet/status.ts`
  names its state for every surface, so the avatar, the address, the network
  and "Wallet connected" always describe the same wallet. The avatar is an
  identicon drawn from the network and the full, case-sensitive address
  (`lib/identicon.ts`) — the same face on every reload. Sign out (the menu)
  and Disconnect (the drawer) both end the Privy session: the app has no
  wallet-only disconnect, and the drawer says so. The store drops any read
  that lands after the account changed.
- `lib/agentChat.ts` — sends to the agent and reads the streamed reply,
  outside any component, so the panel can close mid-answer and lose nothing.
  `/api/agent/chat` with `stream: true` answers in newline-delimited JSON:
  text as the model writes it, a `tools` event when it goes to read something
  (the bubble says what), and a `done` carrying the reply and its **sources** —
  collected from what the tools returned (`lib/agent/sources.ts`), never from
  what the model wrote.
- **Attachments.** The composer takes images, PDFs and text files (CSV, TXT,
  Markdown, JSON) — picked, dropped or pasted, up to four and 3MB together.
  Images are scaled to the 1568px the model reads before they are sent.
  `lib/attachments.ts` holds the limits and validates every body by type,
  leading bytes and size; the model reads images and PDFs natively and a text
  file as a plain-text document. Files are never stored: the transcript keeps
  "[Attached: chart.png (image)]", and the prompt tells the model that text
  inside a file is material to analyse, not an instruction.
- **Voice.** The microphone dictates into the composer — never sends. Chrome,
  Edge and Safari recognise speech in the browser (`lib/voice/useDictation.ts`);
  Firefox and Brave record a clip of up to a minute, which
  `/api/agent/transcribe` writes out with Gemini (`GEMINI_TRANSCRIBE_MODEL`,
  default `gemini-3.5-flash`), signed-in only and capped at 60 an hour.
- Shared, reference-counted client stores, one request however many surfaces
  read them: `usePortfolio`, `useWalletActivity`, `useAlerts`,
  `useOpenActions`. The Activity widget and the bell are one derivation over
  them (`lib/activity/events.ts`).
- Signals that need no external service or database, so they work whatever
  else is down:
  - **Smart money** — `/api/tracker/signals` asks the tracker service first
    and, when it is not running, falls back to Elyra's own read of
    Hyperliquid (`lib/smartmoney/hyperliquid.ts`): open positions of the 40
    most profitable traders over 30 days on the public leaderboard, called as
    consensus at 3+ wallets with two thirds on one side. Labelled as such.
  - **Elyra signals** — `/api/market/signals`, the agent panel's Signals view:
    `lib/research/signals.ts` on the selected market and the watchlist.
  - **Filings** — `/api/filings` reads the latest SEC filings of the
    crypto-exposed filers straight from EDGAR, shown while the findings scan's
    database is unreachable.
- The chart is guarded: a scroll over it moves the page, and a click hands it
  zoom, pan and the crosshair until the pointer leaves. The TradingView iframe
  otherwise swallows every wheel gesture that crosses it.
- `lib/format.ts` — every number is formatted here. `formatRelativeTime`
  takes `now` as a required argument: callers pass the shared clock from
  `lib/useClock.ts`, which is null until hydration, so the server and the
  first client render agree.

# The agent

One function is the whole system, shared by the website, the Android app and
Telegram. Every surface calls it and nothing else:

```ts
runAgent({ userId, conversationId, message, surface, onEvent? }): Promise<{ reply, runId, sources }>
```

No surface holds prompt text, tool definitions or provider logic.

- `lib/agent/` — the loop, the prompt, the tool registry, the provider
  adapters and the router. Anthropic first, Gemini on 429/5xx/network/timeout
  only; never on a 400 or a refusal, and never once streamed text has reached
  the person. Three consecutive failures open a 60-second circuit. A tool turn
  is sent back to its provider exactly as it came — Anthropic's thinking
  blocks and Gemini 3's thought signatures included (`providerContent`);
  Gemini 3 refuses a tool continuation without them. The fallback defaults to
  `gemini-3.5-flash`: `gemini-2.5-pro` is no longer served to new keys, and
  free-tier keys have no quota on the Pro models.
- `lib/market/` — Binance, Hyperliquid and OKX behind one interface, with a
  cache and server-side indicators. Candle series are summarised rather than
  returned: 500 candles of JSON is roughly 20k tokens and the model does
  arithmetic on them badly.
- `lib/exchange/` — read-only portfolio clients. Credentials are AES-256-GCM
  at rest and never leave the server.
- `app/api/agent/chat` — the website and the app, streamed as
  newline-delimited JSON. `app/api/telegram/*` — the bot.

Identity is Privy; Supabase is the database only. `auth.uid()` is therefore
always null, so RLS is a backstop and not the mechanism — every server query
filters by `user_id` explicitly. The comment above `lib/supabase/server.ts`
says so at more length.

# The Android app

Elyra for Android is built with Expo (SDK 58, React Native 0.88, Expo
Router) and published on the Solana dApp Store. It is the website's product
on a phone, not a second product: the same API, the same accounts, the same
rules. Everything the website's Telegram bot does happens natively instead.

| | |
|---|---|
| App name | Elyra |
| Android package | `xyz.getelyra.app` — never changes after the first dApp Store release |
| API | `https://api.getelyra.xyz` |
| Website and App Links | `https://getelyra.xyz` |
| Privacy policy | https://getelyra.xyz/privacy |
| Terms | https://getelyra.xyz/terms |
| Support | ayushkmrjha@gmail.com |

## Screens

Five tabs, each with the website's surface behind it:

- **Markets** — the watchlist, search, and an asset screen per symbol
  (`asset/[symbol]`) where the TradingView chart is the focus, with pivot
  levels and the asset's alerts.
- **Portfolio** — the account's value and P&L, Holdings, Risk, DeFi, Orders
  and Fills, read from `/api/portfolio` and `/api/app/views`.
- **Elyra** — Ask Elyra with streamed replies, sources, attachments and
  dictation; Signals; and Actions, the prepared swaps awaiting review.
- **Research** — reports with their PDFs, company filings
  (`company/[query]`), prediction markets (`prediction/[id]`), recap, yield,
  unlocks and backtests.
- **Account** — the wallet, connections, referrals, alerts and automation,
  notification settings, Settings → About (version, build, API host and
  health), Help & legal, open-source licences and account deletion.

The wallet's own flows — Receive (QR), Transfer and withdraw (with a QR
scanner), Swap and Fund — are screens opened from the wallet sheet.

## How the app shares the backend

- **Only the API.** The app never talks to Supabase, an RPC, Pyth, Jupiter,
  an exchange or a model provider directly. Routes built for it live beside
  the website's: `/api/app/config` (the version gate), `/api/app/views` (the
  portfolio views Telegram's Mini App used to show), `/api/devices` (push
  registration) and `/api/notifications/*` (the inbox, preferences and read
  state).
- **Only pure shared code.** The app imports from `../lib` through the `@/`
  alias, and only the modules listed in `lib/core.ts`. `lib/core.test.ts`
  walks their imports, type-only ones included, and fails on anything that
  touches `server-only`, `process.env`, Supabase, Node, React or the DOM. To
  share another module, add it to the list; if a module mixes the two, split
  it so both clients import the same pure half (as
  `lib/backtest/intervals.ts` and `lib/market/tickerLogoData.ts` are). Metro
  watches `../lib` only, and resolves packages from the app's own
  `node_modules`.
- **Additive migrations.** A migration for the app must not break the
  website (`0014_android_app.sql`, `0015_push_receipts.sql`,
  `0016_app_notification_accounts.sql`).
- **The version gate.** `/api/app/config` serves `APP_MIN_SUPPORTED_VERSION`
  and `APP_LATEST_VERSION`. A build below the minimum shows a blocking
  "Update Elyra" screen; an older but supported build mentions the update.

## Accounts and stores

Sign-in is Privy's Expo SDK — email, Google, passkeys, or a wallet through
Sign In With Solana over Mobile Wallet Adapter (the Seeker's own wallet,
Phantom, Solflare). An account without a wallet gets a Privy embedded Solana
wallet. Session data lives in `expo-secure-store`; Android backup is off.

Account data goes through one reference-counted store helper
(`mobile/src/lib/stores/createAccountStore.ts`) with the website's generation
guard: every store resets when `accountKey` changes and drops a read that
started before the reset, and the agent conversation ends. Starred markets,
recent searches and the inbox's seen-time reset for a different account on
the same phone (`phoneOwner.test.ts`). Stores refresh when the app becomes
active and stop polling in the background.

The agent's conversation and draft live in the app store
(`mobile/src/lib/store.ts`, zustand over AsyncStorage);
`mobile/src/lib/agentChat.ts` streams replies with `expo/fetch`, outside any
component.

## Signing

The server builds every transaction, the wallet signs, the server submits and
confirms. The app never builds or edits transaction bytes.

`mobile/src/lib/wallet/signer.ts` is one interface over two signers: the
Privy embedded wallet and an external wallet through Mobile Wallet Adapter
(`mwa.ts`). Both sign without sending. The signing address must equal the
`signer` the server built for — if the account holds no such wallet, or the
wallet app is connected with a different address, it refuses and says so.
Every signature is behind the device's own authentication (fingerprint, face
or screen lock) while "Require fingerprint/face to sign" is on, which it is
by default.

## No Telegram in the app

The website keeps its Telegram surface. The app has none — no Telegram code,
copy, link or setting under `mobile/`, and `grep -ri telegram mobile` returns
nothing. Each part of Telegram has a native replacement:

| Telegram | In the app |
|---|---|
| Questions and `/ask` | Ask Elyra; the chat's shortcuts (`/swap 1.5 SOL to USDC`, `/alert SOL > 120`, `/report NVDA`, …) work in the composer and open the matching screen prefilled |
| Commands | screens |
| Notifications | push plus an in-app inbox |
| Mini App views | native Portfolio and Research screens |
| "Review in Elyra" | an in-app review card |
| Linking a chat | not needed — sign-in is the identity, and the device registers itself |

## Push and the inbox

Push is Firebase Cloud Messaging through Expo's push service. The device
registers with `/api/devices` after sign-in, when its token rotates and when
the app updates; a token another account had moves to the caller and is
never shared, and sign-out unregisters it. Every notification kind has its
own Android channel and a validated route into the app
(`lib/notifications/routes.ts`), and the same event lands in the inbox
whether or not the push arrived. The permission is asked in context, not at
launch. Setting up Firebase and the FCM key is in
`docs/mobile/notifications-setup.md`.

## Design on a phone

The brand doc applies unchanged. On top of it:

- Brand tokens come from `lib/tokens.ts`; no app component holds a colour.
  `mobile/app.config.ts` writes out `--surface-base` and the accent once,
  because Expo's config loader cannot import them, and
  `src/theme/tokens.test.ts` holds them equal.
- Surfaces are flat — no glass or blur on mobile.
- Fustat for display, headings and large numerics, never below 14; General
  Sans for body, UI and data, never above 20; tabular figures on numbers;
  sentence case everywhere except eyebrows.
- 48dp touch targets. Every explanation opens on tap. Drawers become bottom
  sheets. Tables become cards on phones and drop columns on tablets
  (`DataList`). Long lists are virtualised. Font scaling is respected, but
  capped on dense data rows.
- WebViews load only allowlisted origins (TradingView's widget). Each
  permission — camera for a QR scan, microphone for dictation,
  notifications — is asked when it is first needed.

UI is verified with adb screenshots at 360dp and 412dp widths and at a tablet
width; signing, Mobile Wallet Adapter and push on a real device.

## Building and releasing

Native folders (`android/`, `ios/`) are generated from `mobile/app.config.ts`
and are not committed — configure native behaviour there or in a config
plugin, never by hand. EAS builds in the cloud (`npx eas-cli@latest build`),
with three profiles in `mobile/eas.json`:

| Profile | What it builds |
|---|---|
| `development` | a development-client APK, for Metro |
| `preview` | an internal APK against the preview environment |
| `dapp-store` | the release APK, auto-incremented, signed with its own dApp Store key |

Before a release:

- `GOOGLE_SERVICES_JSON` and the FCM V1 service-account key are set in EAS
  for the production environment.
- `ANDROID_CERT_SHA256` is set in Vercel to the release key's fingerprint, so
  `https://getelyra.xyz/.well-known/assetlinks.json`
  (`app/.well-known/assetlinks.json/route.ts`) verifies the App Links that
  open referral links (`/r/…`) in the app.
- `APP_LATEST_VERSION`, and `APP_MIN_SUPPORTED_VERSION` only if an old build
  would break, are raised on the API.
- The open-source licences are regenerated (`pnpm licenses:generate`).
- The privacy policy and terms (drafts in `docs/legal/`) are published, and
  the listing never implies endorsement by Solana Mobile or any venue.

The build is submitted through the Solana Mobile Publisher Portal
(publish.solanamobile.com).

`docs/PORTING_MAP.md` is the parity checklist between the website and the
app: every website feature has a row naming where it lives in the app and its
status, and rows are ticked off as they ship. Nothing ships while a row says
`todo`.

# Deployment

The website and the API are one Next.js project on Vercel, on the free
(Hobby) plan:

- A Vercel cron may run at most once a day; the five-minute delivery tick
  runs from Supabase (see above).
- Function duration is capped by the plan, so a long job checkpoints or
  splits rather than assuming more time.
- Hobby is for non-commercial use. Moving to Pro changes only the scheduler.

`getelyra.xyz` and `api.getelyra.xyz` are the same deployment. A `Dockerfile`
is included for a long-lived process (`next start`), which is also what the
optional Polymarket websocket needs; pass the `NEXT_PUBLIC_` values as build
arguments and every secret as runtime environment.

The signal engine (`ELYRA_ENGINE_URL`) and the smart-money tracker
(`SMART_MONEY_TRACKER_URL`) are separate services. Their panels say they are
unreachable when they are not running; nothing falls back to sample data.

# Where to read more

- `docs/ELYRA_BRAND.md` — colour, type, spacing and voice. The single source
  of truth; do not introduce a value that is not in it.
- `docs/PROVIDERS.md` — the upstream data layer: what each provider answers,
  the normalisation trap each one carries, and why DFlow is declared but not
  connected.
- `docs/TELEGRAM.md` — BotFather setup, the link flow, and the security
  boundaries: why a tap is not a signature, why `callback_data` carries an
  opaque handle, and why `initDataUnsafe` is never trusted.
- `docs/PORTING_MAP.md` — website → app parity, row by row.
- `docs/mobile/notifications-setup.md` — Firebase, `google-services.json` and
  the FCM key for push.
- `supabase/README.md` and `supabase/SCHEDULER.md` — the tables, applying
  migrations, and the five-minute delivery schedule.
- `docs/THIRD_PARTY.md` — the fonts and other third-party assets, and their
  licences.
- `docs/legal/` — drafts of the privacy policy and terms.
- `CLAUDE.md` and `mobile/AGENTS.md` — the rules every change on either
  client is held to.

# Three deliberate deviations from the brand doc

These are the website's. The app's surfaces are flat, with no glass anywhere.
Each is noted where it happens, in the file that makes the choice.

1. **Figures.** The doc asks for General Sans on data *and* for tabular figures
   on every changing number. General Sans ships no `tnum` feature in any build,
   so its digits are proportional and columns drift on every tick. Fustat's
   figures are genuinely tabular, so a `unicode-range` face in `app/layout.tsx`
   serves Fustat for the digits alone; General Sans still draws every letter and
   every mark. Large prices use the same stack: Fustat's own tabular period is a
   full digit wide and opened gaps around the decimal point.
2. **Chart embed.** `embed-widget-advanced-chart.js` silently drops `overrides`,
   which leaves TradingView's default teal/red candles — a direct contradiction
   of the brand's market semantics. `ChartPanel` uses the `tv.js` widget, which
   honours the required colours: background, grid, Sage up, Clay down, and the
   EMA in `--accent-quiet` through its `ema.ma.color` override.
3. **Glass: the search palette and the header menus.** Section 3 makes the
   product flat. The ⌘K palette is a sheet of glass (`.command-glass` in
   `app/globals.css`): a barely tinted pane over a light blur, a 1px Ivory rim brightest at the top-left,
   and a sheen across the top, over a workspace softened by a 6px blur so the
   palette holds the eye. Light only — every highlight is Ivory at low
   alpha — and a solid panel under `prefers-reduced-transparency`.
   The header's notifications and wallet menus share a denser version
   (`.glass-pop`): they sit directly over a live chart, so the pane is
   Ink-green at 84% under a single 16px blur, with a pistachio edge, one top
   highlight and `--shadow-pop`. Rows and inset cards inside are tints, never
   a second blur. Opaque without backdrop-filter or under reduced
   transparency.

The black surfaces and the luminance layer (blooms, rims, frosted planes,
gradient-filled controls) that used to be a third deviation are gone: the
workspace redesign returned the surfaces to 1.3's shades of Ink and the
product to section 3's flat elevation.
