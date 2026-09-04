import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The luminance layer, as components.

   Section 1.6 of the token sheet gives the terminal a light source. This file
   is the only place that light is positioned. Three rules hold it together:

     - A bloom is always aria-hidden and always pointer-events-none. It is
       atmosphere; it can never intercept a click or reach a screen reader.
     - A bloom sits on its own layer behind content, never on the plane the
       text is on, so the brand's "never behind text" rule survives.
     - Tone carries the meaning the brand already assigned: forest is ambient,
       agent is Elyra Lime and appears only where the machine produced
       something, clay is loss and alert.

   Nothing here holds a colour. The bloom-* utilities in globals.css do.
--------------------------------------------------------------------------- */

export type GlowTone = "forest" | "agent" | "clay";

const TONE: Record<GlowTone, string> = {
  forest: "bloom-forest",
  agent: "bloom-agent",
  clay: "bloom-clay",
};

/**
 * One soft field of light behind a surface.
 *
 * Size and position come from the caller, because where the light falls is a
 * layout decision and belongs with the layout. The caller's element needs a
 * positioning context and, if it also paints a background, `isolate`.
 */
export function AmbientGlow({
  tone = "forest",
  breathe = false,
  className,
}: {
  tone?: GlowTone;
  /** Slow 12s pulse. Off by default; on for large surfaces that would
      otherwise read as a printed gradient. */
  breathe?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -z-10 rounded-pill",
        TONE[tone],
        breathe && "bloom-breathe",
        className,
      )}
    />
  );
}

/**
 * The room the terminal sits in.
 *
 * Fixed to the viewport behind the whole grid, so --surface-base stops being a
 * flat sheet and starts being a lit space. It is the only thing that uses the
 * ambient-strength fields, and it can: --surface-base carries no text, and
 * every panel over it is opaque, so nothing here is ever read through. The
 * light you see is what falls in the 12px gaps between panels and around the
 * edges of the shell.
 *
 * Three lights, none of whose cores are on screen — the falloff is the whole
 * effect, and a visible core would read as a lamp rather than a room.
 */
export function ShellAtmosphere() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Key light, top-left, roughly behind the nav rail and column 2. */}
      <span
        className={cn(
          "absolute -left-[22vw] -top-[30vh] size-[max(520px,70vw)] rounded-pill",
          "bloom-forest-ambient bloom-breathe",
        )}
      />
      {/* Fill, bottom-right, under the ledger and the assistant column. */}
      <span
        className={cn(
          "absolute -bottom-[36vh] -right-[18vw] size-[max(480px,64vw)] rounded-pill",
          "bloom-forest-ambient bloom-breathe-slow",
        )}
      />
      {/* Bounce, bottom-left, so the ground under column two is not dead. */}
      <span
        className={cn(
          "absolute -bottom-[34vh] -left-[10vw] size-[max(360px,42vw)] rounded-pill",
          "bloom-forest-ambient bloom-breathe-slow",
        )}
      />
      {/* The machine, on the assistant side. This is the only lime in the
          atmosphere and it stays well inside 1.2's 8%. */}
      <span
        className={cn(
          "absolute -top-[20vh] right-[2vw] size-[max(320px,38vw)] rounded-pill",
          "bloom-agent-ambient bloom-breathe",
        )}
      />
    </div>
  );
}
