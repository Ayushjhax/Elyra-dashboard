import { color, palette } from "../../../lib/tokens";

/* ---------------------------------------------------------------------------
   The film's colours come from the product: lib/tokens.ts is the Android
   app's mirror of app/globals.css, which transcribes docs/ELYRA_BRAND.md.
   Nothing here restates a brand value.

   The only values the film owns are light and the pointer — neither is
   product UI.
--------------------------------------------------------------------------- */

export const C = {
  base: color["surface-base"], // #101710 — the app's dark forest
  panel: color["surface-panel"], // #182117
  raised: color["surface-raised"], // #1E281C
  active: color["surface-active"], // #2E5129 — Elyra Green, the paper band
  border: color["border-subtle"], // #33402D
  borderStrong: color["border-strong"],
  borderAccent: color["border-accent"],
  ivory: color["text-primary"], // #F7F8EA
  stone: palette.stone, // #B8BAA8
  secondary: color["text-secondary"],
  muted: color["text-muted"],
  citron: color.accent, // #D2DC76
  onAccent: color["text-on-accent"],
  positive: color.positive,
  negative: color.negative,
  moss: palette.moss,
  olive: palette.olive,
  ink: palette.ink,
} as const;

/** Film-only values: light and the pointer, never UI. */
export const FILM = {
  scrim: "rgba(10, 14, 10, 0.72)",
  pointer: "#FFFFFF",
  pointerEdge: "#0B0F0B",
} as const;

export const F = {
  display: "Fustat",
  sans: "General Sans",
  serif: "DM Serif Display",
} as const;

/* Authored at 1280 × 720 and rendered at --scale 1.5, so the master is
   1920 × 1080 with every vector edge drawn at full resolution. */
export const W = 1280;
export const H = 720;
export const FPS = 60;
export const FRAMES = 2000;

/** Safe area for critical content. */
export const SAFE = { x: 64, y: 44 } as const;

/** Chinese falls to the system's CJK face, as on the website (--font-cjk). */
export const CJK = `"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;

/* 144 BPM, 4/4: one beat = 25 frames, one bar = 100 frames at 60 fps. */
export const BEAT = 25;
export const BAR = 100;
