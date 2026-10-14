/* ---------------------------------------------------------------------------
   A mark for something with no logo anywhere.

   Two initials on one of ten tones from the brand's raw palette (1.1), each
   paired with Ink or a light tone for contrast. The tone is a hash of the
   name, so a company keeps the same mark everywhere and two companies side
   by side rarely share one. Tokens only — referenced as variables, never
   as values.
--------------------------------------------------------------------------- */

const TONES: Array<[string, string]> = [
  ["--elyra-green", "--mist-sage"],
  ["--deep-forest", "--elyra-lime"],
  ["--moss", "--cream-lime"],
  ["--khaki", "--cream-lime"],
  ["--slate", "--ivory"],
  ["--sage", "--ink"],
  ["--olive", "--ink"],
  ["--stone", "--ink"],
  ["--citron", "--ink"],
  ["--mist-sage", "--deep-forest"],
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

export function toneFor(name: string): [string, string] {
  let hash = 0;
  for (const char of name.toUpperCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Monogram({ name, size }: { name: string; size: number }) {
  const [background, foreground] = toneFor(name);
  const text = initials(name);
  return (
    <span
      aria-hidden
      className="inline-flex size-full items-center justify-center font-semibold leading-none tracking-tight"
      style={{
        background: `var(${background})`,
        color: `var(${foreground})`,
        fontSize: Math.max(8, Math.round(size * (text.length > 1 ? 0.36 : 0.44))),
      }}
    >
      {text}
    </span>
  );
}
