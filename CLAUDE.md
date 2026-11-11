@AGENTS.md

# Elyra

`docs/ELYRA_BRAND.md` is the single source of truth for colour, type, spacing
and voice. Do not introduce a value that is not in it, and do not fall back to
Tailwind's default palette.

Every token is declared once in `app/globals.css` — semantic tokens keep the
brand doc's own names, and `@theme inline` aliases them into Tailwind. No
component holds a colour value. The exceptions, and why, are `lib/brand.ts`
and `lib/tokens.ts` — the Android app's mirror of the tokens as values,
which `lib/tokens.test.ts` holds identical to `app/globals.css`.

The surfaces are the doc's dark forest (`--surface-base` is `#101710`, cards
`#182117`, borders `#33402d`), and the product is flat: elevation is surface
value plus a 1px border, the only shadow is `--shadow-pop` on floating
layers, and fills are solid. There is no
glow, bloom, rim or gradient-filled control — the luminance layer that did
those was removed in the workspace redesign. `lib/brand.ts` tracks
`--surface-base`.

The exceptions are glass, in two places only. The search palette
(`.command-glass` in `app/globals.css`) is a sheet of glass over the whole
workspace, its rim and sheen in Ivory at low alpha. The header's two menus —
notifications and the wallet — are forest glass (`.glass-pop`, through
`Popover`'s `surface="glass"`): a denser Ink-green pane with one blur, a
pistachio edge and the one `--shadow-pop`. Both are solid under
`prefers-reduced-transparency` and without backdrop-filter support. Glass does
not spread further — any other floating layer is a flat panel with
`--shadow-pop`.

Three deliberate deviations are documented in `README.md` and commented at the
point where they happen: the figures font in `app/layout.tsx`, the chart
embed in `components/panels/ChartPanel.tsx`, and the glass (the search
palette and the header menus).

The shell's geometry has one authority: `lib/layout.ts`. Every column bound,
the centre's floor and share, and the order columns give up width in are there
and nowhere else, so a width is held to the same rule whether it came from a
drag, a key or a restored workspace. Three rules bind anything new built on it.

- The chart is never the column that pays, and it is never a route. The
  workspace that holds it is mounted by `AppShell` for the life of the
  session. A route opens beside the chart in the widgets' column from 900px;
  a column takes its width from the other side columns, in `SQUEEZE_ORDER`,
  and stops at `MAIN_MIN`. A column the screen is sizing (no stored width)
  also gives, in the same order, until the centre has `MAIN_SHARE` of the
  row — that is what keeps the chart the focus on a laptop — while an
  operator's width, the rail's labels and a route give only to the floor.
  The one exception is an allowlist: a route named in
  `FULL_BLEED_ROUTES` (currently `/assets`, `/personalized`, `/referrals` and
  `/research`, each with its reason commented in `lib/layout.ts`) takes the
  workspace body, and the workspace is hidden — never unmounted — under it.
  Adding to that list is a deliberate decision, not a convenience.
- The media queries in `.shell-frame` and `.workspace-grid` decide which
  columns are on screen, and `shellLayout` returns a track string per
  breakpoint rather than resolving one itself. Never resolve the breakpoint in
  JS to build a grid — the tracks and the items would then have two
  authorities and could disagree.
- The document never scrolls. `[data-workspace-scroll]` under the fixed header
  is the one scroll container, which is what lets the agent and an open route
  stick; `lib/useStickyFill.ts` sizes them so their bottom edge — and the
  agent's composer — is always on screen. Anything sticky goes through it.
  The chart's plot is not sticky; `lib/useFirstScreenFit.ts` measures the room
  the first screen leaves it, so never size it from a fixed estimate of what
  sits above it.

Phones are a first-class screen, and three rules keep them so. A field is
16px on a touch screen (`app/globals.css`) or iOS zooms into it — a module
stylesheet that sizes its fields must keep that. A table with more columns
than a phone holds gives `DataTable` a `card`, rather than hiding its last
columns behind a sideways scroll; between a phone and its full width, its
lower-priority columns drop by container query (`hidden @[52rem]:table-cell`)
and `minWidth` is the sum of the columns that stay. And a tooltip that is the only place a
reason or definition lives is `Tip openOnTap` or an `InfoTip`: Radix's tooltip
never opens on touch, so on a phone that text would be unreachable.

Every price shown with a currency sign goes through `formatPriceUsd` in
`lib/format.ts`, whose precision follows the instrument (`lib/market/precision.ts`)
— a small token must never render as `$0.00` or in exponent notation.

The workspace shows no sample data — `lib/mock/` is gone and must not come
back. Every surface reads the signed-in account through a shared,
reference-counted store (`usePortfolio`, `useWalletActivity`, `useAlerts`,
`useOpenActions`); a new surface subscribes to one of those rather than
fetching for itself. Each resets when `accountKey` (`lib/account.ts`)
changes and drops a read that started before the reset, so one account's
data never lands under the next; the agent conversation ends the same way
(`endConversation`). Signed out, a surface asks to connect; an empty list
means the read succeeded and found nothing.

Actions awaiting review are the stored `prepared_actions` rows, through
`/api/actions`. The only thing the web finishes is a swap, signed in the
person's wallet — in `SwapDialog`, or one leg at a time in an Intelligent
Portfolio's `TradeDialog`, both through `lib/wallet/runSwap.ts`, the one
quote-sign-submit path; nothing else may build its own — and a row becomes
`confirmed` only with that signature. A symbol resolves only through the
allowlist in `lib/trade.ts`; any other token is named by mint
(`fromMint`/`toMint` on `/api/swap/build`), its decimals read from the mint
account (the Asset Passport's `readMint`), refused without
`acknowledgeUnverified`, labelled by its claimed symbol and its address, and
quoted with its live mint controls as warnings. The chat command resolves
symbols only.

Intelligent Portfolios (`/invest`) are published model portfolios, not
tokens: `lib/invest/catalog.ts` holds the weights, every holding must be on
the swap allowlist in `lib/trade.ts`, and a person buys each holding into
their own wallet. What a portfolio holds is attributed only from proven
fills — `portfolio_fills`, written by `/api/invest/fills` from the chain's own
balance change for a transaction this account's wallet signed — and is held
to the real wallet balance by `heldUnits`. No portfolio's name or copy may
imply a third party designed or endorses it.

Venue connections are read-only by design: a perp, an order or an exchange
balance links to its venue and nothing in `lib/exchange/` places, closes or
cancels one.

The one exception is trading automation (`/automation`, `lib/autotrade/`),
and it is the only code that calls Hyperliquid's `/exchange`. It trades a
person's Hyperliquid perps through an API wallet they approved from their
own wallet — a key that can place and cancel orders and cannot withdraw —
stored encrypted and decrypted only to sign. Its signing is held to the
official SDK's test vectors (`lib/autotrade/hyperliquid.test.ts`); never
change the wire format without them. Every entry carries its take-profit
and stop-loss in the same request, so the exchange holds them between
checks. Setups are read on Hyperliquid's own candles; a short rule runs
its strategy on the mirrored chart (`mirrorCandles`), never on a swapped
entry and exit. Paper fills pay `PAPER_COSTS`. Markets are `PERP_MARKETS` in
`lib/autotrade/rules.ts`: Hyperliquid's own perps (crypto, memecoins) and
trade[XYZ]'s Nasdaq stock perps (`xyz:TICKER`, a HIP-3 builder dex whose
asset ids are 100000 + dex index × 10000 + index, the index read live).
Limit orders (`trading_orders`, `lib/autotrade/orders.ts`) rest on
Hyperliquid's book with TP/SL attached when live, and are filled by the
tick when paper; a fill becomes a position (`origin: "order"`). A person
also trades by hand: a market order (`/api/automation/trade`,
`validateMarketOrder`) goes through the same `openPosition` with its TP/SL,
its row written as `opening` before it is sent, and any open position closes
by hand (`DELETE /api/automation/positions/[id]`, `closePosition`,
`exit_reason: "closed_by_hand"`, closed only while still `open`). Both hand
paths and limit orders pass `accountGate` (`lib/autotrade/accountGate.ts`) —
paused, the day's loss limit, the open count, one live position per coin.
Trade notices go through
`send` in `lib/notifications/deliver.ts` to the inbox, push and Telegram,
and are not subject to alert preferences. The limits in `lib/autotrade/rules.ts` (`LIMITS`, `decide`) bound
every rule and are not settings. Rules start on paper; live orders need
`AUTOTRADE_LIVE=1`, and go to testnet unless `HYPERLIQUID_NETWORK=mainnet`.
The pass runs on the five-minute tick, before delivery, and writes each
position row before its order is sent (`unique (rule_id, signal_at)`), so a
bar never trades twice.

World markets (`/markets`, `lib/markets/`) prices every exchange from Pyth
in its own currency, through its own symbol read (`worldCatalogue`), since
the main catalogue keeps dollar feeds only. Session hours and holidays come
from the schedule Pyth publishes for one feed per exchange
(`lib/markets/schedule.ts`), never a table kept here. A market whose local
feeds are not live is shown through funds and New York listings, labelled
as such; it fills in by itself when Pyth turns its region on. The change is
against the previous close (`changeFor`, `range=1d`) and is a dash where
Yahoo has none.

Events (`/events`, `lib/events/`) is a feed only Elyra's AI posts to; people
like, save and share. Hacks are DefiLlama's record (`api.llama.fi/hacks`),
read live, never copied; other history is the reviewed list in
`lib/events/history.ts`, each with a source. `runEvents` posts on the tick
only when there is something — a new hack, an 8% move in BTC/ETH/SOL, an
anniversary — each written from facts through `writeFromFacts`, once
(`post_key` is unique).

Outside AI agents reach Elyra through agent keys (`lib/agentApi/`,
`docs/AGENT_API.md`): MCP at `/api/mcp` (Streamable HTTP, stateless, tools
only) and a REST mirror at `/api/v1/tools`. Exposure is an allowlist in
`lib/agentApi/tools.ts`, never the whole registry, and nothing on it writes.
Market tools run with no account; account tools only for a key created with
that scope, reading the owner's addresses from their profile. A key is
stored as a SHA-256 only, shown once, revocable, and held to a per-minute
and a daily cap (`claim_agent_key_call`). These routes accept an agent key
and nothing else — never a session.

Arena (`/arena`, `lib/arena/`, `docs/ARENA.md`) is points and paper only:
nothing in it moves money, and points cannot be bought or cashed out
(real-money ideas are design only, in `docs/ARENA_REAL_MONEY.md`). Labels,
settlements and ratings are computed by code; the model only writes around
those facts through `writeFromFacts`, which discards any reply carrying a
number the facts do not. Scores reward calibration (Brier), never volume,
size or leverage. A call is append-only and its receipt is SHA-256 over the
statement and the server's time; it settles on Hyperliquid's one-minute
close for its minute, or is void. `runArena` runs on the tick after the
trading pass, capped per run (`REVIEW_CAP`, `SETTLE_CAP`, `CARD_CAP`). A
person is shown by handle or not at all, never by wallet.

Wallets are read on seven networks: Solana; the account's one EVM address on
Ethereum, Base, Arbitrum, BNB Chain and Robinhood Chain (`lib/evm/`,
`EVM_CHAIN_KEYS`, chain ids 1, 8453, 42161, 56 and 4663 — BNB Chain's gas
coin is BNB, so a gas coin is `EVM_CHAINS[chain].nativeSymbol`, never "ETH");
and the account's Sui wallet (`lib/sui/`), a Privy embedded wallet created
at sign-in. Anything Solana-specific asks `onSolanaWallet`
(`lib/portfolio/chain.ts`), Sui `onSuiWallet`, never `venue === "wallet"`,
which every chain's holdings share; a surface that lists networks uses
`WALLET_NETWORKS` and `networkName`. Intelligent Portfolios stay
Solana-only. Each chain is its own `WalletScope` (`evmScopeId`,
`suiScopeId`), and a wallet holding names its scope by `scopeId`. Counted
tokens are an allowlist, verified by construction: `lib/evm/tokens.ts` (each
address read back from its contract) and, on Robinhood Chain, Robinhood's
stock-token registry (`lib/evm/stockTokens.ts`). Anything else an indexer
finds (`lib/evm/discover.ts`) is shown unverified and never priced or
counted; on Sui the list is `lib/sui/tokens.ts`, by full coin type. A stock token is priced at Pyth's `Equity.US.<T>/USD` times its
on-chain `uiMultiplier`, never through the crypto ticker lookup; only a
ticker Pyth has no feed for falls back to Robinhood's own token quote. It
carries `marketSymbol: null` so no crypto venue is asked for its 24h change
or candles. The node's chain id is checked on every read.

Sends, approvals and swaps on those chains go through
`lib/wallet/runEvmTx.ts`, the one EVM sign-submit path; nothing else may
build its own. The server builds every transaction with every field fixed
and seals it (`lib/evm/tx.ts`); Privy's embedded EVM wallet signs it without
broadcasting; `/api/evm/submit` refuses it unless the seal is fresh, the
signer is the session's address and destination, value, calldata, chain and
nonce match what was built. External EVM wallets are read, not signed for.
Swaps are quoted by LI.FI and held to the request by `checkLifiQuote` —
output to the session's address — with exact-amount approvals only. A listed
token is named by symbol; any other by contract, read from the chain by
`readEvmAsset` and refused without `acknowledgeUnverified`.
Robinhood Stock Tokens are not swappable, by symbol or by contract: they are
securities Robinhood says may not be sold to U.S. persons, and Elyra cannot
check eligibility (`lib/evm/swap.ts`). Stocks trade as Solana's xStocks and
Ondo tokens and as trade[XYZ] perps instead. EVM history comes from an
indexer (`lib/evm/activity.ts`: Alchemy when the RPC is one, else Blockscout
on Ethereum); a chain that cannot be read is named in the activity
response's `notes`.

Sends and swaps on Sui go through `lib/wallet/runSuiTx.ts`, the one Sui
sign-submit path. The server builds the bytes (`lib/sui/tx.ts`), simulates
them and seals them; Privy's embedded Sui wallet signs only the 32-byte
Blake2b hash of the intent message (`signRawHash`); `/api/sui/submit`
refuses it unless the seal is fresh, the sender is the session's Sui
address, a public key that derives to that address is found
(`suiPublicKeyFor`) and the signature verifies, then executes. A swap is
LI.FI's, held to the request by `checkLifiSuiQuote` and then by its own
simulated balance changes (`checkSuiSwap`) before anyone signs. Sui is read
in the app but not yet signed for there.

Price alerts (`/api/alerts`) stay alerts: a price rule tells the person; it
never trades. Where a crossing goes — Telegram, muted, or nowhere — is said
where the rule is set.

The agent's conversation, its in-flight request and the composer draft live in
the store, and `lib/agentChat.ts` sends and reads streamed replies outside any
component. The panel is mounted as a column from 1280px and as a drawer below,
so nothing it needs may live in component state — staged attachments
included (`composerAttachments`, never persisted). A reply's sources come from
the tool results (`lib/agent/sources.ts`), never from the model's text.

Attachments are checked by `validateAttachments` in `lib/attachments.ts`
wherever a body carries them — type, leading bytes, count, size — and are
never written to the database. Dictation only fills the composer; nothing
spoken is sent or acted on without the person pressing send.

`formatRelativeTime` and `formatDayGroup` take `now` as a required argument —
pass the shared clock from `lib/useClock.ts`, never `Date.now()` in render.

# The Android dApp (`mobile/`)

Elyra also ships as an Android app, built with Expo and published on the
Solana dApp Store. It lives in this repo and shares its backend.

| | |
|---|---|
| App name | Elyra |
| Android package | `xyz.getelyra.app` — never changes after the first dApp Store release |
| API URL | `https://api.getelyra.xyz` (this Next app; same Vercel project as the website) |
| Website domain | `https://getelyra.xyz` — referral links and Android App Links |
| Support email | ayushkmrjha@gmail.com |
| Privacy policy | https://getelyra.xyz/privacy |
| Terms | https://getelyra.xyz/terms |

**Layout.** Build prompts may name a separate folder. In this repo:
- `apps/mobile` is `mobile/`.
- `apps/api` is this Next app's `app/api` and `lib/`.
- `packages/core` is the pure modules in `lib/`, imported by the app through
  the `@/` alias.

`mobile/` is a standalone Expo project with its own package.json, lockfile,
lint and tests. The web's tsconfig, eslint and vitest exclude it, and
`.vercelignore` keeps it out of the web upload. Metro watches the repo root
so the app can import shared code. The app may import only the modules listed
in `lib/core.ts`. `lib/core.test.ts` walks their imports, type-only ones
included, and fails on anything that touches `server-only`, `process.env`,
Supabase, Node, React or the DOM. To share another module, add it to that
list. If a module mixes the two, split it so the web and the app import the
same pure half (as `lib/backtest/intervals.ts` and
`lib/market/tickerLogoData.ts` are).

**Same backend, same accounts.** The app uses this repo's API, so it uses the
same Supabase database and the same Privy app as the website. A person has
the same login, embedded wallet, alerts, conversations, referrals and
connections on both. A migration for the app is additive and must not break
the web. The app talks only to the API — never to Supabase, an RPC, Pyth,
Jupiter, an exchange or a model provider directly.

**No Telegram in the app.** The website keeps its Telegram surface. The app
has none: no Telegram code, copy, link or setting under `mobile/`, and
`grep -ri telegram mobile` returns nothing. Everything Telegram does happens
in the app instead:
- questions → Ask Elyra;
- commands → screens;
- notifications → push plus an in-app inbox;
- Mini App views → native screens;
- "Review in Elyra" → an in-app review card.

Server code shared by both keeps one source of truth for each rule. For
example, delivery claims each event once and then fans out per channel
(Telegram for a linked chat, push and the inbox for an app device), and
notification preferences apply to every channel.

**Vercel is on the free (Hobby) plan.**
- A Vercel cron may run at most once a day; a more frequent schedule fails
  the deploy. The five-minute delivery tick runs from Supabase pg_cron +
  pg_net instead (`supabase/migrations/0013_delivery_schedule.sql`,
  `supabase/SCHEDULER.md`). A new scheduled job goes there, never in
  `vercel.json`.
- Function duration is capped by the plan, so a long job checkpoints or
  splits rather than assuming more time.
- Hobby is for non-commercial use. Moving to Pro changes only the scheduler
  note above.

**App rules.** Every rule above applies to the app. These are specific to it:
- **Signing.** The server builds every transaction, the wallet signs, the
  server submits and confirms. The app never builds or edits transaction
  bytes. The signing address must equal the address the server built for.
  There are two signers behind one interface: the Privy embedded wallet, and
  an external wallet through Mobile Wallet Adapter.
- **Shared stores.** Built on one reference-counted store helper with the
  generation guard and the `accountKey` reset. They refresh on AppState
  "active" and stop polling in the background.
- **Design.** Brand tokens come from `lib/tokens.ts`; no app component holds
  a colour.
  Surfaces are flat: no glass or blur on mobile. Use the brand's type roles
  and tabular figures.
- **Touch.** 48dp touch targets. Any explanation opens on tap. Drawers become
  bottom sheets. Tables become cards on phones and drop columns on tablets.
  On an asset screen the chart is the focus.
- **Secrets.** No secret in the bundle: only public `EXPO_PUBLIC_` values (the
  Privy app ID and client ID, the API URL). Session data lives in
  expo-secure-store.
- **Device boundaries.** WebViews load only allowlisted origins (TradingView's
  widget). Each permission is asked in context.
- **Store policy.** In-app account deletion, and the privacy policy and terms
  linked in the app. Never imply endorsement by Solana Mobile or any venue.
- **Versions.** Read the docs for the installed Expo, Privy and Mobile Wallet
  Adapter versions before using their APIs.
- **Verification.** Verify on an Android emulator, and on a device for
  signing, MWA and push.
- **Type.** Fustat for display, headings and large numerics, never below 14.
  General Sans for body, UI and data, never above 20. Sentence case
  everywhere except eyebrows.
- **Lists and scaling.** Long lists are virtualised. Font scaling is
  respected, but capped on dense data rows.
- **Read the installed docs first.** Expo: `docs.expo.dev/llms.txt`. Privy:
  `docs.privy.io/llms.txt`. Solana Mobile: `docs.solanamobile.com/llms.txt`.
  Next.js: `node_modules/next/dist/docs`. Never code these APIs from memory.
- **Checks.** Keep both projects green: the web's `pnpm typecheck`,
  `pnpm lint` and `pnpm test`, and the same scripts in `mobile/`. Port a
  web test along with the code it tests.
- **Screenshots.** UI is verified with adb screenshots at 360dp and 412dp
  widths and at a tablet width.
- **Porting map.** `docs/PORTING_MAP.md` is the checklist for parity with the
  website. Tick rows off as they ship.
