# Elyra

An agentic crypto trading terminal. Frontend only — there is no backend, no
wallet connection and no order execution. Every number comes from the typed
mock layer in `lib/mock/`, behind the interfaces in `lib/types.ts`, so a real
API can replace it without touching a component.

`docs/ELYRA_BRAND.md` is the source of truth for colour, type, spacing and
voice. No component holds a colour value; everything resolves through the
tokens declared once in `app/globals.css`.

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm lint
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
