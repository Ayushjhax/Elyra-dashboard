"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The thinking orb — a thin film, in Elyra's colours.

   A soap bubble is one physical effect: light reflecting off both faces of a
   film a few hundred nanometres thick, the two paths interfering, and the
   colour landing wherever the film happens to be thinnest. That is why a
   bubble is dark and near-transparent in the middle, brilliant at its rim
   where you see through the most film, and why the bands crawl — the film is
   always draining.

   This reproduces that, not a rainbow. Five layers carry it:

     halo      a blurred field of the same colours, on the black behind it
     shell     the form — Ink in the middle, brightening to the rim
     caustics  three sets of arcs, screened over the shell
     core      Ink over the middle, so the film reads as thin there
     rim       the bright edge, where the grazing angle is steepest

   Form and bands are separated on purpose. Drawing the interference as
   concentric rings in the shell is the obvious approach and it does not work:
   the displacement below shreds tight rings into something that reads as
   marble. So the shell carries only the falloff, and the bands are arcs struck
   from points outside the middle, which curve around the form the way light
   pools in a film — and which the same displacement then breaks into ribbons.

   The motion is the second half of that trick. The turbulence field is fixed
   and it is the *content* that turns underneath it, each layer at its own
   rate. A static displacement map with the surface rotating through it makes
   the interference travel across the film exactly the way draining does, for
   the cost of one filter and three CSS rotations — no per-frame JavaScript,
   nothing to schedule, and it stops dead under prefers-reduced-motion.

   Interference sweeps a spectrum; Elyra has a palette, so the sweep runs the
   palette's own ramp — Ink and Deep Forest through Moss and Olive to Citron
   and Cream Lime — rather than a hue circle. Lime dominates because 1.3 says
   this is the machine, and this only ever appears while the machine is
   working.

   Like every other bloom in 1.6 it is decorative: aria-hidden, no pointer
   events, and it holds no colour of its own — every stop below is a raw
   palette token. Whatever is beside it is what reports the state.
--------------------------------------------------------------------------- */

/**
 * The shell: dark and near-transparent in the middle, brilliant at the rim.
 *
 * The *form* only, and deliberately few stops — see the note above for why the
 * bands are not drawn here.
 */
const SHELL: Array<{ at: string; color: string }> = [
  { at: "0%", color: "var(--ink)" },
  { at: "38%", color: "var(--deep-forest)" },
  { at: "62%", color: "var(--elyra-green)" },
  { at: "80%", color: "var(--moss)" },
  { at: "91%", color: "var(--olive)" },
  { at: "97%", color: "var(--citron)" },
  { at: "100%", color: "var(--cream-lime)" },
];

/**
 * The interference bands, as three sets of ribbons crossing the film.
 *
 * Each is a set of narrow bright arcs with nothing between them, screened over
 * the shell, and each turns at its own rate through the fixed turbulence field.
 * Three centres that share no axis is what stops the surface ever reading as
 * one rotating object.
 *
 * Radial and off-centre, not linear. A linear ramp draws straight bars across
 * a sphere and the result reads as a woven mesh laid over a ball; arcs struck
 * from a point outside the middle curve around the form the way light actually
 * pools in a film, and the displacement below then breaks them into ribbons.
 *
 * The arcs are narrow on purpose. A wide one screens most of the film toward
 * white and the whole thing goes chalky; a narrow one reads as a caustic and
 * leaves the shell's green either side of it to be seen.
 *
 * `bands` are `[offset, token, peak alpha]`, and `HALF_BAND` is how far each
 * falls off to nothing on both sides.
 */
const HALF_BAND = 6;

const CAUSTICS: Array<{
  turn: string;
  /** Where the arcs are struck from, and how far the set reaches. */
  at: [number, number, number];
  bands: Array<[number, string, number]>;
}> = [
  {
    turn: "orb-turn",
    at: [0.24, 0.18, 1.15],
    bands: [
      [30, "var(--citron)", 0.62],
      [52, "var(--elyra-lime)", 0.58],
      [71, "var(--cream-lime)", 0.62],
      [88, "var(--citron)", 0.5],
    ],
  },
  {
    turn: "orb-counter",
    at: [0.82, 0.74, 1.05],
    bands: [
      [26, "var(--olive)", 0.5],
      [49, "var(--cream-lime)", 0.54],
      [74, "var(--sage)", 0.46],
    ],
  },
  {
    turn: "orb-turn-slow",
    at: [0.52, 0.94, 0.95],
    bands: [
      [38, "var(--sage)", 0.4],
      [67, "var(--citron)", 0.4],
    ],
  },
];

/** One band as the three stops that draw it: up from nothing, peak, back down. */
function bandStops(
  bands: Array<[number, string, number]>,
): Array<[string, string, number]> {
  const stops: Array<[string, string, number]> = [["0%", "var(--deep-forest)", 0]];
  for (const [centre, color, alpha] of bands) {
    stops.push([`${centre - HALF_BAND}%`, color, 0]);
    stops.push([`${centre}%`, color, alpha]);
    stops.push([`${centre + HALF_BAND}%`, color, 0]);
  }
  stops.push(["100%", "var(--deep-forest)", 0]);
  return stops;
}

export function IridescentOrb({ className }: { className?: string }) {
  /* One id per instance: two orbs on a page must not share filters. */
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sheen = `orb-sheen-${raw}`;
  const core = `orb-core-${raw}`;
  const rim = `orb-rim-${raw}`;
  const band = `orb-band-${raw}`;
  const warp = `orb-warp-${raw}`;
  const halo = `orb-halo-${raw}`;

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 100 100"
      fill="none"
      className={cn("pointer-events-none size-10", className)}
    >
      <defs>
        {/* Off-centre, because the light is above and to the left — the same
            direction 1.6's rim assumes everywhere else. */}
        <radialGradient id={sheen} cx="0.38" cy="0.32" r="0.8">
          {SHELL.map(({ at, color }) => (
            <stop key={at} offset={at} stopColor={color} />
          ))}
        </radialGradient>

        {/* The middle of a bubble is its thinnest part and reflects almost
            nothing. Without this it reads as a marble. */}
        <radialGradient id={core} cx="0.5" cy="0.52" r="0.52">
          <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.86" />
          <stop offset="34%" stopColor="var(--ink)" stopOpacity="0.56" />
          <stop offset="66%" stopColor="var(--ink)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
        </radialGradient>

        {/* The rim is where you look through the most film, so it is bright the
            whole way round — only its hue changes, because the film is never
            the same thickness twice. No dark stops: a rim that goes dark reads
            as a gap in the bubble rather than as a turn in the surface. */}
        <linearGradient id={rim} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="var(--citron)" />
          <stop offset="20%" stopColor="var(--cream-lime)" />
          <stop offset="42%" stopColor="var(--citron)" />
          <stop offset="60%" stopColor="var(--cream-lime)" />
          <stop offset="78%" stopColor="var(--olive)" />
          <stop offset="100%" stopColor="var(--elyra-lime)" />
        </linearGradient>

        {CAUSTICS.map(({ at, bands }, index) => (
          <radialGradient
            key={index}
            id={`${band}-${index}`}
            cx={at[0]}
            cy={at[1]}
            r={at[2]}
          >
            {bandStops(bands).map(([offset, color, alpha], stop) => (
              <stop
                key={`${offset}-${stop}`}
                offset={offset}
                stopColor={color}
                stopOpacity={alpha}
              />
            ))}
          </radialGradient>
        ))}

        {/* The film's own irregularity, and what shears the ribbons above into
            the streaks a draining film shows. The scale is a balance: too
            little and the bands stay parallel bars, too much and the silhouette
            tears apart. userSpaceOnUse so the warp is in viewBox units and does
            not change with the rendered size. */}
        <filter
          id={warp}
          filterUnits="userSpaceOnUse"
          x="-25"
          y="-25"
          width="150"
          height="150"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.021 0.027"
            numOctaves={2}
            seed={11}
            result="film"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="film"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter
          id={halo}
          filterUnits="userSpaceOnUse"
          x="-40"
          y="-40"
          width="180"
          height="180"
        >
          <feGaussianBlur stdDeviation="9" />
        </filter>

        {/* Tighter than the halo: this one is the light coming off the rim
            itself rather than the field the whole bubble casts. */}
        <filter
          id={`${halo}-rim`}
          filterUnits="userSpaceOnUse"
          x="-25"
          y="-25"
          width="150"
          height="150"
        >
          <feGaussianBlur stdDeviation="2.6" />
        </filter>

        {/* Just enough to take the edge off an arc. A caustic has no outline —
            it is light pooling in the film — and a hard-edged one reads as a
            wire laid over the surface rather than as part of it. */}
        <filter
          id={`${halo}-band`}
          filterUnits="userSpaceOnUse"
          x="-25"
          y="-25"
          width="150"
          height="150"
        >
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      {/* The light the bubble throws on the black behind it. */}
      <circle
        className="orb-halo"
        cx="50"
        cy="50"
        r="28"
        fill={`url(#${sheen})`}
        filter={`url(#${halo})`}
        opacity="0.78"
      />

      <g className="orb-wobble" style={{ transformOrigin: "50px 50px" }}>
        <g filter={`url(#${warp})`}>
          <circle cx="50" cy="50" r="30" fill={`url(#${sheen})`} />

          {/* Screened, so a ribbon can only ever add light — one that darkened
              the film would read as a smudge on it. Each turns at its own rate
              through the one fixed displacement field, and that is what makes
              the interference crawl. */}
          {CAUSTICS.map(({ turn }, index) => (
            <g key={index} className={turn} style={{ transformOrigin: "50px 50px" }}>
              <circle
                cx="50"
                cy="50"
                r="30"
                fill={`url(#${band}-${index})`}
                filter={`url(#${halo}-band)`}
                style={{ mixBlendMode: "screen" }}
              />
            </g>
          ))}

          <circle cx="50" cy="50" r="30" fill={`url(#${core})`} />

          {/* Twice: a blurred pass for the light coming off the edge, and a
              hairline over it for the edge itself. */}
          <g className="orb-turn-slow" style={{ transformOrigin: "50px 50px" }}>
            <circle
              cx="50"
              cy="50"
              r="29.2"
              fill="none"
              stroke={`url(#${rim})`}
              strokeWidth="3.4"
              filter={`url(#${halo}-rim)`}
              opacity="0.7"
            />
            <circle
              cx="50"
              cy="50"
              r="29.2"
              fill="none"
              stroke={`url(#${rim})`}
              strokeWidth="1.3"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
