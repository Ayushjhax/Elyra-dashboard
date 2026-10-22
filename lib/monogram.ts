import type { palette } from "@/lib/tokens";

/* ---------------------------------------------------------------------------
   A mark for something with no logo anywhere: two initials on one of ten
   tones from the brand's raw palette (1.1), each paired with Ink or a light
   tone for contrast. The tone is a hash of the name, so a company keeps the
   same mark everywhere and two companies side by side rarely share one.

   Tones are palette token NAMES, not values — the website reads them as CSS
   variables, the Android app looks them up in lib/tokens.ts. Shared by both.
--------------------------------------------------------------------------- */

export type PaletteName = keyof typeof palette;

const TONES: Array<[PaletteName, PaletteName]> = [
  ["elyra-green", "mist-sage"],
  ["deep-forest", "elyra-lime"],
  ["moss", "cream-lime"],
  ["khaki", "cream-lime"],
  ["slate", "ivory"],
  ["sage", "ink"],
  ["olive", "ink"],
  ["stone", "ink"],
  ["citron", "ink"],
  ["mist-sage", "deep-forest"],
];

/** Words that say what a company is, not which one. */
const FILLER = new Set([
  "THE", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC", "LLC", "LP",
  "L.P.", "HOLDINGS", "GROUP", "TRUST", "FUND", "AND", "&", "OF", "SA", "NV", "AG", "SE",
]);

export function initials(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9&.\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word.length > 0 && !FILLER.has(word.replace(/[.,]+$/, "")));
  if (words.length === 0) return (name.trim()[0] ?? "?").toUpperCase();
  /* A ticker or a one-word name reads best as its first two letters. */
  if (words.length === 1) return words[0].replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";
  return `${words[0][0]}${words[1][0]}`;
}

export function toneFor(name: string): [PaletteName, PaletteName] {
  let hash = 0;
  for (const char of name.toUpperCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}
