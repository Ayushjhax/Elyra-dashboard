/* ---------------------------------------------------------------------------
   The brand, for the app. Every value comes from lib/tokens.ts — the mirror
   of app/globals.css that lib/tokens.test.ts holds identical — so the app
   and the website cannot drift.

   This is the ONLY file under src/ allowed to name colours, and it names
   them only by importing them. src/theme/tokens.test.ts fails on a colour
   literal anywhere else.
--------------------------------------------------------------------------- */

import { color, motion, palette, radius, shadowPop, space, type } from "@/lib/tokens";

export { color, motion, palette, radius, space, type };
export type { ColorToken, TypeVariant } from "@/lib/tokens";

/**
 * The one shadow, for floating layers only (sheets, menus, dialogs, toasts).
 * Android draws shadows from elevation; iOS from the shadow props.
 */
export const popShadow = {
  shadowColor: shadowPop.color,
  shadowOffset: { width: shadowPop.offsetX, height: shadowPop.offsetY },
  shadowOpacity: 1,
  shadowRadius: shadowPop.blur / 2,
  elevation: 12,
} as const;

/** The smallest touch target, in dp. Anything pressable is at least this. */
export const TOUCH_TARGET = 48;
