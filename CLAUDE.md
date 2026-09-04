@AGENTS.md

# Elyra

`docs/ELYRA_BRAND.md` is the single source of truth for colour, type, spacing
and voice. Do not introduce a value that is not in it, and do not fall back to
Tailwind's default palette.

Every token is declared once in `app/globals.css` — semantic tokens keep the
brand doc's own names, and `@theme inline` aliases them into Tailwind. No
component holds a colour value. The one exception, and why, is `lib/brand.ts`.

Three deliberate deviations are documented in `README.md` and commented at the
point where they happen: the figures font in `app/layout.tsx`, the chart embed
in `components/panels/ChartPanel.tsx`, and the luminance layer — section `1.6`
of `app/globals.css` plus `components/ui/Glow.tsx`, `GlowMark.tsx`,
`GlassPill.tsx` and `IridescentOrb.tsx`.

The luminance layer adds light, not colour: every bloom, rim and frosted plane
is a raw palette value at low alpha, and tone keeps the brand's meanings —
forest is ambient, Elyra Lime is machine output, Clay is loss. Three rules bind
anything new built on it.

- A bloom is `aria-hidden`, `pointer-events-none`, and sits on its own layer
  behind content.
- A bloom lightens the surface under it, so `1.5`'s contrast floor decides how
  strong it may be. Measure before moving one closer to text.
- `--bloom-*-ambient` is the stronger pair and belongs to `ShellAtmosphere`
  alone, because `--surface-base` carries no text. Never put it on a panel.
- Motion on that layer is CSS on a decorative element, never per-frame
  JavaScript, and every animation has an entry in the `prefers-reduced-motion`
  block. `IridescentOrb` turns its layers under a *fixed* turbulence field for
  exactly this reason — animating `baseFrequency` would need a script and could
  not be turned off from CSS.

The four `--surface-*` tokens are black rather than the doc's shades of Ink
(`--surface-base` is `#000000`), and `--ink` itself is unchanged.
`lib/brand.ts` tracks `--surface-base` and moved with it.

The shell's geometry has one authority: `lib/layout.ts`. Every column bound,
the chart's floor, the order columns give up width in and the row-split maths
are there and nowhere else, so a width is held to the same rule whether it came
from a drag, a key or a restored workspace. Two rules bind anything new built
on it.

- The chart is never the column that pays, and it is never a route. It is
  mounted by `AppShell` for the life of the session and every route opens
  beside it; a new column takes its width from the other side columns, in
  `SQUEEZE_ORDER`, and stops at `MAIN_MIN`. Nothing may put a page in the
  middle column above 900px.
- The media queries in `.shell-grid` decide which columns are on screen, and
  `shellLayout` returns a track string per breakpoint rather than resolving one
  itself. Never resolve the breakpoint in JS to build the grid — the tracks and
  the items would then have two authorities and could disagree.

Colour lives on elements now, not surfaces: `1.7`'s `--grad-accent`,
`--grad-active` and `--grad-agent` fill buttons, active pills, the selected
route and row, and the agent's meter. Every stop is a raw palette value and the
meanings are `1.3`'s. A gradient fill is only as legible as its darkest stop —
measure that, not the top of the fill, and ignore the antialiased edge where it
blends into the black behind it.
