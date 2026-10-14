# Elyra

An agentic crypto trading terminal.

**There is no order execution.** The agent reads market data and account state
and writes analysis. No tool, route or code path places, modifies or cancels
an order — that is enforced structurally, not by convention: `lib/exchange/`
exposes only signed GETs and address-keyed reads, and adding execution would
mean changing those files rather than calling them differently.

Nothing in the workspace is sample data:

- **The agent is live.** `runAgent` in `lib/agent/` reads real prices, funding,
  open interest and — where an exchange is connected — real positions and
  equity. It is reached from the chat panel, where the reply streams, and from
  Telegram.
- **The ledger is the account's own.** The trading table reads wallet
  holdings, venue perps and DeFi deposits from `/api/portfolio`, marked to the
  live Pyth price, and History reads the wallet's transactions. Signed out, it
  asks you to connect; an empty tab means the read succeeded and found
  nothing. Open orders are not read from any venue yet, and the Orders tab says
  so.
- **Automation is price alerts.** The same alerts Telegram's `/alert` and the
  chart's Alerts set, checked every five minutes by the delivery worker and
  sent to the linked chat. A rule tells you; it never trades.

`docs/ELYRA_BRAND.md` is the source of truth for colour, type, spacing and
voice. No component holds a colour value; everything resolves through the
tokens declared once in `app/globals.css`.

## Running it

```bash
pnpm install
cp .env.example .env.local   # then fill it in; see below
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm lint
pnpm typecheck
pnpm test
```

Markets, the chart and signals run with no configuration at all; everything
that belongs to an account needs sign-in and the database. The agent needs
`.env.local`: `ANTHROPIC_API_KEY`, the three Supabase values, a Privy
app id and secret, and a 32-byte `CREDENTIALS_ENC_KEY`
(`openssl rand -base64 32`). The server refuses to boot without them and names
every one that is missing.

Apply `supabase/migrations/0001_init.sql` before first run.

Telegram is optional. With `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and
`TELEGRAM_WEBHOOK_SECRET` set, register the webhook with:

```bash
pnpm telegram:webhook           # uses APP_URL, which must be https
pnpm telegram:webhook -- --info
```

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

Those are opening widths, not fixed ones. Below 1280px the agent becomes a
drawer; below 900px the workspace is one column with the widgets stacked
under the centre; below 640px the rail becomes a sheet behind the header's
menu button.

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
composer, is always on screen.

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

## The agent

One function is the whole system. Both surfaces call it and nothing else:

```ts
runAgent({ userId, conversationId, message, surface, onEvent? }): Promise<{ reply, runId, sources }>
```

Neither surface holds prompt text, tool definitions or provider logic.

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
- `app/api/agent/chat` — the web surface. `app/api/telegram/*` — the bot.

Identity is Privy; Supabase is the database only. `auth.uid()` is therefore
always null, so RLS is a backstop and not the mechanism — every server query
filters by `user_id` explicitly. The comment above `lib/supabase/server.ts`
says so at more length.

## Where to read more

- `docs/ELYRA_BRAND.md` — colour, type, spacing and voice. The single source
  of truth; do not introduce a value that is not in it.
- `docs/PROVIDERS.md` — the upstream data layer: what each provider answers,
  the normalisation trap each one carries, and why DFlow is declared but not
  connected.
- `docs/TELEGRAM.md` — BotFather setup, the link flow, and the security
  boundaries: why a tap is not a signature, why `callback_data` carries an
  opaque handle, and why `initDataUnsafe` is never trusted.

## Two deliberate deviations from the brand doc

Both are noted where they happen, in the file that makes the choice.

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

The black surfaces and the luminance layer (blooms, rims, frosted planes,
gradient-filled controls) that used to be a third deviation are gone: the
workspace redesign returned the surfaces to 1.3's shades of Ink and the
product to section 3's flat elevation.
