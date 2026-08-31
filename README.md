# Elyra

An agentic crypto trading terminal.

**There is no order execution.** The agent reads market data and account state
and writes analysis. No tool, route or code path places, modifies or cancels
an order — that is enforced structurally, not by convention: `lib/exchange/`
exposes only signed GETs and address-keyed reads, and adding execution would
mean changing those files rather than calling them differently.

The repo is currently in two halves, and the seam is worth knowing about:

- **The agent is live.** `runAgent` in `lib/agent/` reads real prices, funding,
  open interest and — where an exchange is connected — real positions and
  equity. It is reached from the chat panel and from Telegram.
- **The dashboard panels are still mock.** Every number in the ledger, chart,
  watchlist and activity panels comes from `lib/mock/`, behind the interfaces
  in `lib/types.ts`. So the agent may cite a real Binance position while the
  ledger beside it shows a mock one.

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

The dashboard runs with no configuration at all — it is mock data. The agent
needs `.env.local`: `ANTHROPIC_API_KEY`, the three Supabase values, a Privy
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

One fixed-height screen. The page itself never scrolls — every panel scrolls
internally.

```
216px      288px        1fr                     352px
NavRail    Activity     MarketHeader            Signal suggestion
           Watchlist    ChartPanel              Agentic chat
           Automation   LedgerPanel
```

Column 2 splits 1fr / 1.2fr / 0.8fr, column 4 splits 1fr / 1.4fr.

It collapses three times: below 1280px the right column becomes a drawer,
below 900px column 2 becomes a sheet and the nav becomes an icon rail, and
below 640px the layout stacks with a bottom tab bar.

## How it is wired

- `lib/store.ts` — zustand. `selectedSymbol` is the spine: the watchlist sets
  it, and the market header, chart, ledger ordering and chat suggestion chips
  all read from it. One interval for the whole app random-walks every tracked
  price every 3 seconds. Only `marketType` and `ledgerTab` persist, and they
  rehydrate after mount so the server and client render identically.
- `lib/mock/` — assets, positions, orders, history, signals, automations,
  activity, chat, and the twelve ledger empty states.
- `lib/format.ts` — every number is formatted here. Relative times are measured
  against `MOCK_NOW`, a fixed constant, so there is no hydration mismatch.

## The agent

One function is the whole system. Both surfaces call it and nothing else:

```ts
runAgent({ userId, conversationId, message, surface }): Promise<{ reply, runId }>
```

Neither surface holds prompt text, tool definitions or provider logic.

- `lib/agent/` — the loop, the prompt, the tool registry, the provider
  adapters and the router. Anthropic first, Gemini on 429/5xx/network/timeout
  only; never on a 400 or a refusal. Three consecutive failures open a
  60-second circuit.
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

## Two deliberate deviations from the brand doc

Both are noted where they happen, in the file that makes the choice.

1. **Figures.** The doc asks for General Sans on data *and* for tabular figures
   on every changing number. General Sans ships no `tnum` feature in any build,
   so its digits are proportional and columns drift on every tick. Fustat's
   figures are genuinely tabular, so a `unicode-range` face in `app/layout.tsx`
   serves Fustat for the digits alone; General Sans still draws every letter and
   every mark.
2. **Chart embed.** `embed-widget-advanced-chart.js` silently drops `overrides`,
   which leaves TradingView's default teal/red candles — a direct contradiction
   of the brand's market semantics. `ChartPanel` uses the `tv.js` widget, which
   honours all four required colours: background, grid, Sage up, Clay down.
