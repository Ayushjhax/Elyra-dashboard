import { Easing, interpolate, random, type EasingFunction } from "remotion";

/* ---------------------------------------------------------------------------
   Frame-driven motion helpers. Everything is a pure function of the frame,
   so the Studio preview and the render agree, and velocity (for motion
   blur) is just the difference between two frames.
--------------------------------------------------------------------------- */

export const EASE = {
  /** Fast attack, long settle — the film's default arrival. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** The product's own curve (docs/ELYRA_BRAND.md §4). */
  brand: Easing.bezier(0.2, 0, 0, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Departures: slow start, fast exit. */
  in: Easing.bezier(0.6, 0, 0.9, 0.4),
  linear: Easing.linear,
} as const;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0→1 progress between two frames, eased and clamped. */
export function prog(frame: number, start: number, end: number, ease: EasingFunction = EASE.out): number {
  if (end <= start) return frame >= end ? 1 : 0;
  return interpolate(frame, [start, end], [0, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** A keyframe: [frame, value, easing into the NEXT key]. */
export type Key = readonly [number, number, EasingFunction?];

/** Piecewise keyframe track with per-segment easing; holds outside its range. */
export function track(frame: number, keys: readonly Key[]): number {
  if (keys.length === 0) return 0;
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0, e] = keys[i];
    const [f1, v1] = keys[i + 1];
    if (frame <= f1) {
      if (f1 === f0) return v1;
      const t = (e ?? EASE.inOut)(clamp01((frame - f0) / (f1 - f0)));
      return v0 + (v1 - v0) * t;
    }
  }
  return keys[keys.length - 1][1];
}

/** Per-frame change of a frame function — the input to motion blur. */
export function velocity(fn: (f: number) => number, frame: number): number {
  return fn(frame) - fn(frame - 1);
}

/** Deterministic random in [0,1) for a seed. */
export const rnd = (seed: string | number) => random(seed);

/** Is the frame inside [from, to] (inclusive)? */
export const within = (frame: number, from: number, to: number) => frame >= from && frame <= to;
