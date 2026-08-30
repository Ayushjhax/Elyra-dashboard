@AGENTS.md

# Elyra

`docs/ELYRA_BRAND.md` is the single source of truth for colour, type, spacing
and voice. Do not introduce a value that is not in it, and do not fall back to
Tailwind's default palette.

Every token is declared once in `app/globals.css` — semantic tokens keep the
brand doc's own names, and `@theme inline` aliases them into Tailwind. No
component holds a colour value. The one exception, and why, is `lib/brand.ts`.

Two deliberate deviations are documented in `README.md` and commented at the
point where they happen: the figures font in `app/layout.tsx`, and the chart
embed in `components/panels/ChartPanel.tsx`.
