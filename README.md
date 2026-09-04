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

Those are opening widths, not fixed ones — see below.

It collapses three times: below 1280px the right column becomes a drawer,
below 900px column 2 becomes a sheet and the nav becomes an icon rail, and
below 640px the layout stacks with a bottom tab bar.

### The chart is not a route

The market column — header, chart, ledger — is mounted by the shell, not by a
page. `app/layout.tsx` wraps every route in `AppShell`, and `app/page.tsx`
returns `null`: Home *is* the chart, so it has no panel of its own.

Every other route renders in a column of its own beside the chart, closed by
the **✕** in its header. Navigating to Portfolio no longer takes the market off
screen, and the TradingView widget is no longer torn down and rebuilt on every
trip out and back — it mounts once for the session.

- `components/shell/MarketColumn.tsx` is the middle column, and the only thing
  that ever occupies it above 900px.
- The route column is `route` in `COLUMN_BOUNDS`, so it sizes, squeezes and
  persists exactly like the others. It is last in `SQUEEZE_ORDER`, being the
  thing the operator just asked for by name.
- Below 900px there is no room for both, so the route takes the middle column
  instead. `AppShell` decides that in JS rather than with a media query,
  because the panel has to be mounted in exactly one place — rendering it twice
  and hiding one would run its effects and its fetches twice over.
- Adding a route means adding a page and a `RouteClose` in its panel header.
  Nothing else in the shell needs to know.

The nav rail reads Home, then **Components**, then Portfolio, Personalized,
Assets, Agent, Referrals. Home sits above the palette because it is the one
route that is always the way back; the palette is a tool rather than a
destination, so it stands apart from the routes under it.

### Every boundary moves, and the chart never pays

The 12px gap between any two panels is a handle. Drag it, or focus it and use
the arrow keys; double-click puts that one boundary back. Vertically it moves
flex weight from one row to the other — the panels in column two, and the chart
against the ledger — so a split survives the window being resized. Horizontally
it sets a column width.

The nav rail, the components palette, the panel column, the route column and
the assistant are all sizeable. The panel column and the assistant can be
closed outright from the two switches at the foot of the rail, the rail itself
collapses to icons from the **‹** beside the mark, and a route column closes
from the **✕** in its header. **Reset layout** in the palette puts all of it
back.

One rule holds the whole thing together, and `lib/layout.ts` is where it lives.

- `COLUMN_BOUNDS` gives every column a minimum, a maximum and an opening width,
  and `MAIN_MIN` is the floor under the chart.
- `fitColumns` takes the width a newly opened column needs out of the *other*
  side columns, in a fixed order — rail, palette, panels, assistant — and stops
  at `MAIN_MIN`. Opening the palette narrows the rail, not the chart. The chart
  is always open, whatever else is.
- `shellLayout` returns one `grid-template-columns` per breakpoint. AppShell
  publishes all three as custom properties and `.shell-grid` in
  `app/globals.css` picks between them, so the media queries stay the single
  authority on which columns are on screen and the tracks can never disagree
  with the items. A closed column is not rendered at all, so it costs neither a
  track nor a gap.
- The rail drops to icons once it is fitted below `RAIL_LABEL_MIN` — by the
  palette opening, or by being dragged in.

It is pure arithmetic with no DOM in it, which is why `lib/layout.test.ts` can
assert the chart's floor across every breakpoint and every combination of open
columns. Widths, splits and which columns are open all persist.

`components/shell/Resizer.tsx` draws both handles. They paint nothing at rest —
a hairline appears under the pointer — and neither of them decides how far a
boundary may move: every bound is in `lib/layout.ts`, so a width is held to the
same rule whether it came from a drag, a key or a restored workspace.

### Column two is composed, not fixed

Activity / Watchlist / Automation is only the default. The **Components**
button under Home in the nav rail opens a palette beside the rail, and from it
a panel can be dragged into any gap in column two, clicked to drop on the end,
reordered, or removed. The arrangement persists.

- `lib/types.ts` holds `PanelKey`; the store holds an array of those keys, so a
  saved layout is plain JSON with no component references in it.
- `components/shell/panelRegistry.tsx` maps a key to its label, icon, group,
  relative height and what it renders. Adding a component to the palette is one
  entry here and one key in `PanelKey`.
- `components/shell/PanelStack.tsx` draws the column and its drop targets.
  Drop targets only exist while a drag is running, so nothing shifts under the
  pointer in normal use.
- Every drag has a keyboard equivalent — the move and remove buttons in each
  panel's edit bar — because HTML drag-and-drop is pointer-only.

The palette is a grid column rather than an overlay, because you drag out of it
into the column immediately beside it and a floating layer would be sitting on
the target. Its 232px comes out of the nav rail first and its neighbours after
— never out of the chart; the fitter above is what guarantees that. Below 900px
the palette is unreachable, since column two is a sheet there and there is
nothing to arrange.

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

## Three deliberate deviations from the brand doc

All are noted where they happen, in the file that makes the choice.

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
3. **Black surfaces, gradient elements, and the luminance layer.** Section 3 of
   the doc says flat by default, elevation from surface value and a 1px border,
   and `--shadow-pop` as the only shadow; 1.3 fixes the surfaces at shades of
   Ink; 1.4 keeps gradients to large empty surfaces; 4 rules out decorative
   loops. The product now has a light source, a black ground and gradient fills
   — `1.6` and `1.7` in `app/globals.css`, plus `components/ui/Glow.tsx`,
   `GlowMark.tsx`, `GlassPill.tsx` and `IridescentOrb.tsx`.

   **The ground is black.** `--surface-base` `#15170f` → `#000000`,
   `--surface-panel` `#1a1d14` → `#070807`, `--surface-raised` `#212518` →
   `#101210`, `--surface-hover` `#272b1d` → `#181a17`. Two reasons. Light is
   only as vibrant as the dark it falls on, and nothing is darker than black.
   And 1.3's surfaces are olive — `#1a1d14` runs its green nine points above its
   blue — which meant green light on a green surface: a flat wash rather than
   light. `--ink` itself is untouched; it is still the palette's colour and
   still what `--text-on-accent` puts on a lime fill. `lib/brand.ts` tracks
   `--surface-base`, so `THEME_COLOR_INK` moved with it.

   **Colour did not leave, it moved.** It used to be spread thinly across every
   surface. It now sits on the elements that mean something — `1.7`'s
   `--grad-accent`, `--grad-active` and `--grad-agent`, on buttons, active
   pills, the selected route and row, and the agent's confidence meter — with
   black between them. On a black ground a flat fill reads as a sticker; a fill
   that shades reads as an object with a light on it.

   Dropping the surfaces while the text tokens hold still *raises* contrast —
   `--text-muted` on `--surface-panel` goes 5.02:1 → 5.90:1, on
   `--surface-raised` 4.60:1 → 5.52:1, on `--surface-hover` 4.26:1 → 5.15:1.
   What holds all of it inside the brand:

   - **No new colour.** Every bloom, rim and frosted plane is a raw palette
     value at low alpha. Tone carries the meaning the brand already assigned:
     forest is ambient, Elyra Lime marks machine output and nothing else, Clay
     stays reserved for loss.
   - **No new elevation.** `--lift-*` has no offset and no black; it is light
     spilling off a lit element, not a drop shadow. `--shadow-pop` is still the
     only thing that says "this floats".
   - **Every stop is a palette value.** `--grad-accent` is Elyra Lime → Citron →
     Olive, `--grad-active` is Elyra Green → Deep Forest, `--grad-agent` is
     Khaki → Elyra Lime. No hue exists that 1.1 does not already name, and the
     meanings are 1.3's: lime is interactive, forest is selected, lime marks the
     machine.
   - **Contrast was the constraint, not taste.** A bloom lightens the surface
     under it, which eats into 1.5's floor; a gradient fill is only as legible
     as its darkest stop. Both are measured off the rendered pixels rather than
     argued about. Every background a glyph sits on lands between 5.53:1 and
     5.90:1 for `--text-muted`, against the 5.02:1 the flat `--surface-panel`
     gave before any of this; `--text-on-accent` on `--grad-accent` runs 13.9:1
     at the top of the fill to 9.3:1 at the bottom, and `--text-primary` on
     `--grad-active` never drops below 12.5:1.
   - **Two bloom strengths, for two different surfaces.** A bloom crossing a
     panel answers to 1.5, because `--text-muted` sits on that panel. A bloom on
     `--surface-base` answers to nothing — the shell writes no text there and
     every panel over it is opaque — so `--bloom-*-ambient` may run stronger.
     `ShellAtmosphere` is the only thing allowed to use it.
   - **The surfaces stay black.** Both strengths are set low enough that a panel
     still reads as black rather than as a green wash; the only surface bloom
     left with any presence is the lime one on the agent panels, which is 1.3's
     signature rule and the one thing it is allowed to mark.

   **The thinking orb** (`components/ui/IridescentOrb.tsx`) is the one place the
   luminance layer draws a moving object rather than a field of light. It is a
   thin film — dark and near-transparent in the middle, brilliant at the rim,
   with interference bands crawling over it — and it appears only in the agent's
   own bubble, only while a request is in flight.

   - The shell carries the form and the bands are separate: arcs struck from
     points outside the middle, screened over it. Drawing the interference as
     concentric rings is the obvious approach and the displacement shreds them
     into something that reads as marble.
   - The turbulence field is fixed and the layers turn underneath it, each at
     its own rate. That is what makes the bands crawl, and it costs one SVG
     filter and three CSS rotations — no per-frame JavaScript.
   - Interference sweeps a spectrum and Elyra has a palette, so the sweep runs
     the palette's ramp: Ink and Deep Forest through Moss and Olive to Citron
     and Cream Lime. Lime dominates because 1.3 says this is the machine.
   - It is decorative — `aria-hidden`, no pointer events. The line beside it is
     what reports the state, under `aria-live="polite"`. Under
     prefers-reduced-motion it holds still: it is a status, not a spinner, so a
     frozen film costs nothing.
   - **Motion is decorative only and stops on request.** The bloom breathes at
     12s and the mark draws itself once; no number, label or control moves.
     Under `prefers-reduced-motion` the light holds still at full strength and
     the mark stays fully drawn.
   - **The mark is not beside data.** `GlowMark` appears only on surfaces that
     are otherwise empty — an empty column, an empty ledger, a route that is
     not built yet — which is what 1.4 reserves gradients for.
