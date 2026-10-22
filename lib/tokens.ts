/* ---------------------------------------------------------------------------
   The brand tokens, as values — for the Android app, which cannot read a CSS
   custom property.

   This is a mirror, not a second source: app/globals.css stays the single
   declaration of every token, transcribed from docs/ELYRA_BRAND.md, and
   lib/tokens.test.ts fails the moment a value here drifts from it. Where
   globals.css redefines a token later in the file (text-secondary and
   text-muted), the final value is the one held here, because that is what
   the website renders.

   Keys keep the brand doc's own names so they stay greppable against it.

   Left out on purpose: the gradients, the agent glow and the metallic
   interaction finish. The app is flat — elevation is surface value plus a
   1px border, and the one shadow is `shadowPop`.
--------------------------------------------------------------------------- */

/** 1.1 — the raw palette. Components use `color`, not these. */
export const palette = {
  "elyra-green": "#2e5129",
  "deep-forest": "#1b3118",
  moss: "#45703d",
  sage: "#7a9e70",
  "mist-sage": "#c3d6bc",
  "elyra-lime": "#e4eb9d",
  "cream-lime": "#f2f5d3",
  citron: "#d2dc76",
  olive: "#a8b44e",
  khaki: "#7c8535",
  ivory: "#f7f8ea",
  stone: "#b8baa8",
  slate: "#5c5f52",
  ink: "#15170f",
  clay: "#c4633a",
} as const;

/** 1.3 — the semantic tokens every component uses. */
export const color = {
  "surface-base": "#101710",
  "surface-panel": "#182117",
  "surface-raised": "#1e281c",
  "surface-hover": "#243022",
  "surface-active": "#2e5129",

  "border-subtle": "#33402d",
  "border-strong": "#44543c",
  "border-accent": "#7c8535",

  "text-primary": "#f7f8ea",
  "text-secondary": "#c3c9ba",
  "text-muted": "#a2ad99",
  "text-on-accent": "#15170f",

  accent: "#d2dc76",
  "accent-hover": "#e4eb9d",
  "accent-quiet": "#7c8535",
  "focus-ring": "#e4eb9d",

  positive: "#91ae86",
  "positive-bg": "rgba(122, 158, 112, 0.14)",
  negative: "#d3906f",
  "negative-bg": "rgba(196, 99, 58, 0.14)",
  "neutral-flat": "#b8baa8",
  caution: "#e9ac64",
  "caution-bg": "rgba(233, 172, 100, 0.14)",

  "agent-accent": "#e4eb9d",
  "agent-rail": "rgba(228, 235, 157, 0.6)",
} as const;

export type ColorToken = keyof typeof color;

/** 3 — radii, in px. */
export const radius = {
  sheet: 16,
  panel: 12,
  card: 10,
  control: 8,
  chip: 6,
  pill: 999,
} as const;

/** 3 — the spacing the brand names, in px. Everything else is a 4px step. */
export const space = {
  "gap-shell": 12,
  "pad-panel": 16,
  "pad-panel-sm": 12,
  "row-h": 36,
  "row-h-sm": 32,
  "control-h": 34,
  "header-h": 64,
  "gap-workspace": 16,
  "pad-workspace": 20,
} as const;

/** 4 — motion. `ease` is the cubic-bezier control points. */
export const motion = {
  "dur-fast": 120,
  "dur-base": 180,
  "dur-slow": 280,
  ease: [0.2, 0, 0, 1] as const,
} as const;

/** The one shadow, for floating layers only: `0 8px 24px rgba(0,0,0,0.45)`. */
export const shadowPop = {
  offsetX: 0,
  offsetY: 8,
  blur: 24,
  color: "rgba(0, 0, 0, 0.45)",
} as const;

/** Which face a type role uses: Fustat (display), General Sans (sans), or the platform monospace. */
export type TypeFace = "display" | "sans" | "mono";

export interface TypeRole {
  face: TypeFace;
  size: number;
  lineHeight: number;
  weight: 400 | 500 | 600 | 700;
  /** In px — the brand doc's em values times the size. */
  letterSpacing: number;
  tabular: boolean;
  uppercase: boolean;
}

function role(
  face: TypeFace,
  size: number,
  lineHeight: number,
  weight: TypeRole["weight"],
  trackingEm: number,
  options: { tabular?: boolean; uppercase?: boolean } = {},
): TypeRole {
  return {
    face,
    size,
    lineHeight,
    weight,
    letterSpacing: Math.round(trackingEm * size * 1000) / 1000,
    tabular: options.tabular ?? false,
    uppercase: options.uppercase ?? false,
  };
}

/** 2.1 — the type scale. These roles are the only text styles. */
export const type = {
  display: role("display", 32, 36, 600, -0.02),
  price: role("display", 26, 30, 600, -0.015, { tabular: true }),
  h1: role("display", 20, 26, 600, -0.01),
  h2: role("display", 16, 22, 600, -0.01),
  "panel-title": role("display", 14, 18, 600, 0),
  body: role("sans", 14, 20, 400, 0),
  "body-sm": role("sans", 13, 18, 400, 0),
  label: role("sans", 12, 16, 500, 0.01),
  eyebrow: role("sans", 11, 14, 500, 0.1, { uppercase: true }),
  data: role("sans", 13, 18, 500, 0, { tabular: true }),
  "data-sm": role("sans", 12, 16, 500, 0, { tabular: true }),
  "mono-addr": role("mono", 12, 16, 400, 0, { tabular: true }),
} as const;

export type TypeVariant = keyof typeof type;
