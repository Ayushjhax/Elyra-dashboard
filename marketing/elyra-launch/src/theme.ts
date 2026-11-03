import { color, palette } from "../../../lib/tokens";

/* ---------------------------------------------------------------------------
   The film's colours come from the product: lib/tokens.ts is the Android
   app's mirror of app/globals.css, which transcribes docs/ELYRA_BRAND.md.
   Nothing here restates a brand value.

   The only values the film owns are its hardware (the handset's graphite
   body) and light — neither is product UI.
--------------------------------------------------------------------------- */

export const C = {
  base: color["surface-base"], // #101710 — the app's dark forest
  panel: color["surface-panel"], // #182117
  raised: color["surface-raised"], // #1E281C
  border: color["border-subtle"], // #33402D
  borderStrong: color["border-strong"],
  ivory: color["text-primary"], // #F7F8EA
  stone: palette.stone, // #B8BAA8
  secondary: color["text-secondary"],
  muted: color["text-muted"],
  citron: color.accent, // #D2DC76
  lime: color["agent-accent"], // #E4EB9D — agent output / interaction only
  positive: color.positive,
  negative: color.negative,
  moss: palette.moss,
  olive: palette.olive,
  ink: palette.ink,
} as const;

/** Film-only values: hardware and light, never UI. */
export const FILM = {
  graphite: "#1a1c1a",
  graphiteEdge: "#3a3e39",
  graphiteDeep: "#0a0b0a",
  glow: "rgba(122, 158, 112, 0.10)", // sage light behind the hardware
  scrim: "rgba(10, 14, 10, 0.72)",
} as const;

export const F = {
  display: "Fustat",
  sans: "General Sans",
  serif: "DM Serif Display",
} as const;

export const W = 1920;
export const H = 1080;
export const FPS = 60;
export const FRAMES = 2700;

/** Safe area for critical content (brief: 80–96 px horizontal, 60–64 px vertical). */
export const SAFE = { x: 96, y: 64 } as const;
