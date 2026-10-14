# Elyra — Brand Guidelines (Product / UI)

Drop this in your repo at `docs/ELYRA_BRAND.md` and reference it from `CLAUDE.md`.
It is the single source of truth for color, type, spacing, and voice. Nothing in the UI
should use a value that isn't defined here.

---

## 1. Color

### 1.1 Raw palette

| Token | Name | Hex |
|---|---|---|
| `--elyra-green` | Elyra Green | `#2E5129` |
| `--deep-forest` | Deep Forest | `#1B3118` |
| `--moss` | Moss | `#45703D` |
| `--sage` | Sage | `#7A9E70` |
| `--mist-sage` | Mist Sage | `#C3D6BC` |
| `--elyra-lime` | Elyra Lime | `#E4EB9D` |
| `--cream-lime` | Cream Lime | `#F2F5D3` |
| `--citron` | Citron | `#D2DC76` |
| `--olive` | Olive | `#A8B44E` |
| `--khaki` | Khaki | `#7C8535` |
| `--ivory` | Ivory | `#F7F8EA` |
| `--stone` | Stone | `#B8BAA8` |
| `--slate` | Slate | `#5C5F52` |
| `--ink` | Ink | `#15170F` |
| `--clay` | Clay | `#C4633A` |

### 1.2 Distribution

The product is dark-first. Allocation across a full screen should land near:

- **Forest / Ink — 70%.** Every surface, panel, and background.
- **Neutral (Ivory / Stone / Slate) — 20%.** All text, dividers, icons.
- **Lime (Elyra Lime / Citron / Olive) — 8%.** Interactive and agent-generated only.
- **Clay — 2%.** Loss, short, destructive, alert. Never decorative.

If a screen looks lime-heavy, it is wrong. Lime is a highlighter, not a background.

### 1.3 Semantic tokens (use these in code, not the raw palette)

**Surfaces**
```
--surface-base    #101710   app background (dark forest)
--surface-panel   #182117   cards, panels, column surfaces
--surface-raised  #1E281C   rows, input fields, inset blocks
--surface-hover   #243022   row + control hover
--surface-active  #2E5129   selected nav / selected watchlist row (Elyra Green)
```

Base, panel and the subtle border are the trading-workspace redesign's own
values (October 2026). Raised and hover are the steps between the panel and
the border, chosen so every text token still clears 1.5's floor on them.

**Borders**
```
--border-subtle   #33402D   panel edges, table dividers
--border-strong   #44543C   input outlines, focus containers
--border-accent   #7C8535   active tab underline, agent rail (Khaki)
```

**Text**
```
--text-primary    #F7F8EA   headings, prices, primary values (Ivory)
--text-secondary  #B8BAA8   labels, column headers, secondary values (Stone)
--text-muted      #959884   timestamps, hints, disabled
--text-on-accent  #15170F   text sitting on a lime/citron fill (Ink)
```

**Interactive**
```
--accent          #D2DC76   primary buttons, active states (Citron)
--accent-hover    #E4EB9D   hover (Elyra Lime)
--accent-quiet    #7C8535   inactive accent, borders (Khaki)
--focus-ring      #E4EB9D   2px, always visible on keyboard focus
```

**Market semantics — do not improvise these**
```
--positive        #91AE86   price up, long, filled buy — text  (Sage, lifted)
--positive-bg     rgba(122,158,112,0.14)
--negative        #D3906F   price down, short, loss — text     (Clay, lifted)
--negative-bg     rgba(196,99,58,0.14)
--neutral-flat    #B8BAA8   unchanged / pending              (Stone)
```

The text tokens are Sage and Clay lifted toward Ivory (18% and 30%) — the
smallest lift at which each clears 4.5:1 on every forest surface and inside
its own `-bg` badge. Raw Sage (#7A9E70) and Clay (#C4633A) remain the colours
of fills that carry no text: chart candles, status dots, sparklines.

**Agent layer — the signature rule**

Anything the machine produced is marked with Elyra Lime; anything a human or the
market produced is not. This is the one visual idea the product is built on.

```
--agent-accent    #E4EB9D   signal cards, agent chat bubbles, automation rules
--agent-rail      2px left border in --agent-accent at 60% opacity
--agent-glow      0 0 0 1px rgba(228,235,157,0.18)
```

So: a Signal Suggestion card gets a lime rail. A user chat bubble does not. A price
that went up is Sage, never lime — lime never means "up".

### 1.4 Gradients

Four families, used only for large empty surfaces (hero panel, sparkline fills,
empty states). Never behind text.

```
--grad-lime     linear-gradient(180deg, #A8B44E 0%, #7A9E70 100%)
--grad-forest   linear-gradient(180deg, #2E5129 0%, #15170F 100%)
--grad-neutral  linear-gradient(180deg, #0C1810 0%, #45805C 100%)
--grad-clay     linear-gradient(180deg, #2A1008 0%, #E0A24B 100%)
```

### 1.5 Contrast floor

Body text ≥ 4.5:1, large text and non-text UI ≥ 3:1. `--text-muted` on
`--surface-hover` is the lowest text pairing in the product (4.67:1); do not go
below it. `--text-muted` moved from #8A8D7B to #959884 with the forest surfaces,
because the old value fell to 3.9:1 on the new hover step.

Raw Clay measured 4.09:1 on `--surface-panel`, which is why market text uses
the lifted `--negative` (≥ 4.56:1 everywhere, badges included) and raw Clay is
kept for fills.

---

## 2. Typography

**Primary — Fustat.** Display, headings, nav labels, large numerics. Google Fonts.
**Secondary — General Sans.** Body, UI, tables, inputs, captions. Fontshare.

```html
<link href="https://fonts.googleapis.com/css2?family=Fustat:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet">
```

### 2.1 Scale

| Role | Face | Size / Line | Weight | Tracking |
|---|---|---|---|---|
| `display` | Fustat | 32 / 36 | 600 | -0.02em |
| `price` | Fustat | 26 / 30 | 600 | -0.015em, tabular |
| `h1` | Fustat | 20 / 26 | 600 | -0.01em |
| `h2` | Fustat | 16 / 22 | 600 | -0.01em |
| `panel-title` | Fustat | 14 / 18 | 600 | 0 |
| `body` | General Sans | 14 / 20 | 400 | 0 |
| `body-sm` | General Sans | 13 / 18 | 400 | 0 |
| `label` | General Sans | 12 / 16 | 500 | +0.01em |
| `eyebrow` | General Sans | 11 / 14 | 500 | +0.10em, UPPERCASE |
| `data` | General Sans | 13 / 18 | 500 | tabular |
| `data-sm` | General Sans | 12 / 16 | 500 | tabular |
| `mono-addr` | ui-monospace | 12 / 16 | 400 | wallet / tx hashes only |

### 2.2 Rules

- Every number that can change — price, size, PnL, %, time — gets
  `font-variant-numeric: tabular-nums`. No exceptions. Columns must not jitter.
- Section labels use the `eyebrow` style, matching the deck's `02 Color | Color Palette`
  treatment: uppercase, letterspaced, `--text-muted`.
- Never use Fustat below 14px, and never use General Sans above 20px.
- Sentence case everywhere except eyebrows. No Title Case buttons.

---

## 3. Space, shape, depth

**Base unit 4px.** Allowed steps: 4, 8, 12, 16, 20, 24, 32, 40, 48.

```
--gap-shell     12px   between top-level columns
--pad-panel     16px   panel inner padding
--pad-panel-sm  12px   dense panels (watchlist, activity)
--row-h         36px   table + list row height
--row-h-sm      32px   dense list row
--control-h     34px   buttons, inputs, tabs
```

**Radii**
```
--radius-panel    12px
--radius-card     10px
--radius-control   8px
--radius-chip      6px
--radius-pill     999px
```

**Depth.** Flat by default. Elevation is expressed with surface value and a 1px
border, not shadow. The only shadow permitted is on floating layers:
```
--shadow-pop  0 8px 24px rgba(0,0,0,0.45)
```

**Borders.** 1px `--border-subtle`. Hairline dividers inside tables, full borders on
panels. Never double-border adjacent panels — use the shell gap instead.

**Glass — the search palette only.** The ⌘K palette floats over the whole
workspace and is drawn as glass rather than a card: a pane at 30% Ink over an
18px blur, a 1px rim and a top sheen in Ivory (`#F7F8EA`) at 6–75% alpha, a
28px radius, over a workspace dimmed 26% and softly blurred (6px) so the
palette holds the eye. Nothing else is glass, and it falls back to `--surface-panel`
when the reader asks for reduced transparency.

---

## 4. Motion

```
--dur-fast    120ms   hover, focus, chip toggle
--dur-base    180ms   tab change, panel swap, row expand
--dur-slow    280ms   drawer, modal
--ease        cubic-bezier(0.2, 0, 0, 1)
```

- Price cells flash `--positive-bg` / `--negative-bg` for 400ms on tick, then decay.
  That flash is the only animated color in the data layer.
- Agent output streams in; it does not fade in as a block.
- Everything respects `prefers-reduced-motion: reduce` — flashes become a static
  color change, streaming becomes an instant paint.
- No parallax, no decorative loops, no shimmering skeletons that outlast 600ms.

---

## 5. Iconography

`lucide-react`, 16px in dense UI, 18px in the nav rail, 1.5px stroke,
`currentColor`. Icons inherit text color; they are never lime unless the element
they sit in is agent output. Coin marks are circular, 20px, from a local
`/public/coins/*.svg` set with a lettered fallback chip.

---

## 6. Voice

Elyra is an operator's terminal with an agent in it. It is precise, quiet, and never
enthusiastic about money.

- Say what happened: "Order filled — 12.4 SOL at $184.20." Not "Great news!"
- Controls name their outcome: **Place order** → toast reads **Order placed**.
- Agent suggestions are framed as reasoning, not instruction: "Funding flipped
  negative on HYPE perps 40m ago." Then the action, separately.
- Never predict with confidence language. "Setup forming," not "will pump."
- Empty states are invitations: "No positions yet. Pick a market to get started."
- Errors state the cause and the fix: "Not enough USDC to cover margin. Reduce size
  or deposit." No apologies, no "oops".
- Never use emoji in product surfaces.

---

## 7. Logo

`/public/logo.png`, top-left of the nav rail, 28px height, 16px padding around it.
Clear space equal to the logo's cap height on all sides. Do not recolor, rotate,
add effects, or place it on any surface other than `--surface-base` or
`--surface-panel`.