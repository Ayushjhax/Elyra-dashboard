@AGENTS.md

# Elyra

`docs/ELYRA_BRAND.md` is the single source of truth for colour, type, spacing
and voice. Do not introduce a value that is not in it, and do not fall back to
Tailwind's default palette.

Every token is declared once in `app/globals.css` — semantic tokens keep the
brand doc's own names, and `@theme inline` aliases them into Tailwind. No
component holds a colour value. The one exception, and why, is `lib/brand.ts`.

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
columns behind a sideways scroll. And a tooltip that is the only place a
reason or definition lives is `Tip openOnTap` or an `InfoTip`: Radix's tooltip
never opens on touch, so on a phone that text would be unreachable.

Every price shown with a currency sign goes through `formatPriceUsd` in
`lib/format.ts`, whose precision follows the instrument (`lib/market/precision.ts`)
— a small token must never render as `$0.00` or in exponent notation.

The workspace shows no sample data — `lib/mock/` is gone and must not come
back. Every surface reads the signed-in account through a shared,
reference-counted store (`usePortfolio`, `useWalletActivity`, `useAlerts`,
`useOpenActions`); a new surface subscribes to one of those rather than
fetching for itself. Signed out, a surface asks to connect; an empty list
means the read succeeded and found nothing.

Actions awaiting review are the stored `prepared_actions` rows, through
`/api/actions`. The only thing the web finishes is a swap, in `SwapDialog`,
signed in the person's wallet — and a row becomes `confirmed` only with that
signature. Venue connections are read-only by design: a perp, an order or an
exchange balance links to its venue and nothing here places, closes or
cancels one. Keep it that way unless execution is genuinely built.

Automation rules are price alerts (`/api/alerts`). A rule tells the person;
it never trades. Where a crossing goes — Telegram, muted, or nowhere — is
said where the rule is set.

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
