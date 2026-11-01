/* ---------------------------------------------------------------------------
   The film's palette.

   Product colours are imported from the repository's own token mirror
   (lib/tokens.ts, held identical to app/globals.css by lib/tokens.test.ts),
   so the reconstructed interface cannot drift from the app. The only values
   declared here are the film wrapper's: the device hardware and the light
   around it, which are staging, not product.
--------------------------------------------------------------------------- */

import { color, palette, radius } from "../../../lib/tokens";

export { color, palette, radius };

export const C = {
  base: color["surface-base"],
  panel: color["surface-panel"],
  raised: color["surface-raised"],
  hover: color["surface-hover"],
  active: color["surface-active"],
  border: color["border-subtle"],
  borderStrong: color["border-strong"],
  borderAccent: color["border-accent"],
  ivory: color["text-primary"],
  /* The prompt's Stone for secondary type in the film's own copy. */
  stone: palette.stone,
  /* The app's actual secondary/muted text values, inside the reconstructed UI. */
  textSecondary: color["text-secondary"],
  textMuted: color["text-muted"],
  onAccent: color["text-on-accent"],
  citron: color.accent,
  lime: color["agent-accent"],
  rail: color["agent-rail"],
  positive: color.positive,
  positiveBg: color["positive-bg"],
  negative: color.negative,
  negativeBg: color["negative-bg"],
  caution: color.caution,
  sage: palette.sage,
  clay: palette.clay,
  olive: palette.olive,
  moss: palette.moss,
  khaki: palette.khaki,
  slate: palette.slate,
  ink: palette.ink,
} as const;

/** Film-only staging: the handset and the light falloff around it. */
export const FILM = {
  deviceBody: "#121412",
  deviceEdgeLight: "rgba(247, 248, 234, 0.16)",
  deviceEdgeDark: "#060706",
  cameraHole: "#030403",
  vignette: "rgba(4, 6, 4, 0.72)",
  deviceShadow: "rgba(0, 0, 0, 0.55)",
} as const;

/** Font families, as registered in fonts.ts. */
export const F = {
  display: "Fustat",
  sans: "General Sans",
  serif: "DM Serif Display",
} as const;
