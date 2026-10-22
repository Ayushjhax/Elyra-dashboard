import { initials, toneFor } from "@/lib/monogram";

export { initials, toneFor };

/* ---------------------------------------------------------------------------
   A mark for something with no logo anywhere.

   Two initials on one of ten tones from the brand's raw palette (1.1), each
   paired with Ink or a light tone for contrast. The tone is a hash of the
   name, so a company keeps the same mark everywhere and two companies side
   by side rarely share one. Tokens only — referenced as variables, never
   as values.
--------------------------------------------------------------------------- */

export function Monogram({ name, size }: { name: string; size: number }) {
  const [background, foreground] = toneFor(name);
  const text = initials(name);
  return (
    <span
      aria-hidden
      className="inline-flex size-full items-center justify-center font-semibold leading-none tracking-tight"
      style={{
        background: `var(--${background})`,
        color: `var(--${foreground})`,
        fontSize: Math.max(8, Math.round(size * (text.length > 1 ? 0.36 : 0.44))),
      }}
    >
      {text}
    </span>
  );
}
