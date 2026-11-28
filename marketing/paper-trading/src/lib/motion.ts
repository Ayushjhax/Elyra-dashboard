/* ---------------------------------------------------------------------------
   Frame-driven motion. Everything is a pure function of the frame number, so
   every render is identical (no springs integrated over time, no randomness
   without a seed).

   Motion grammar: accelerate, then stop decisively. Most moves use `land`
   (a quintic ease-out after a short acceleration) so they arrive hard and
   hold; `whip` is for directional moves that should feel thrown.
--------------------------------------------------------------------------- */

export type Ease = "lin" | "io" | "land" | "out" | "in" | "whip" | "hold";

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function ease(name: Ease, t: number): number {
  t = clamp01(t);
  switch (name) {
    case "lin":
      return t;
    case "io": // cubic in-out
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "out": // cubic out
      return 1 - Math.pow(1 - t, 3);
    case "in":
      return t * t * t;
    case "land": // the brand's own motion curve, cubic-bezier(0.2, 0, 0, 1)
      return bezier(0.2, 0, 0, 1, t);
    case "whip": // expo in-out — thrown
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    case "hold":
      return t < 1 ? 0 : 1;
  }
}

/** CSS-style cubic-bezier(x1, y1, x2, y2) evaluated at progress t. */
export function bezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = sx(u) - t;
    const d = dx(u);
    if (Math.abs(x) < 1e-6 || Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  if (u < 0 || u > 1) {
    let lo = 0, hi = 1;
    u = t;
    for (let i = 0; i < 30; i++) {
      const x = sx(u);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
  }
  return sy(u);
}

/** Linear map of frame range [a,b] to 0..1 with an ease. */
export function prog(f: number, a: number, b: number, e: Ease = "lin"): number {
  if (b <= a) return f >= b ? 1 : 0;
  return ease(e, (f - a) / (b - a));
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* ---- Camera over a portrait source ----------------------------------------
   A key says: at frame f, source point (x, y) sits at the centre of the
   viewport and one source pixel is s output pixels. Scale is interpolated
   in log space so zooms feel constant-rate. A key with `cut: true` jumps
   (a hard cut inside the same source). */

export type CamKey = { f: number; x: number; y: number; s: number; e?: Ease; cut?: boolean };
export type Cam = { x: number; y: number; s: number };

export function camAt(keys: CamKey[], f: number): Cam {
  if (keys.length === 0) return { x: 600, y: 1260, s: 1 };
  if (f <= keys[0].f) return { x: keys[0].x, y: keys[0].y, s: keys[0].s };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (f < b.f) {
      const a = keys[i - 1];
      if (b.cut) return { x: a.x, y: a.y, s: a.s };
      const t = ease(b.e ?? "io", (f - a.f) / (b.f - a.f));
      return {
        x: mix(a.x, b.x, t),
        y: mix(a.y, b.y, t),
        s: Math.exp(mix(Math.log(a.s), Math.log(b.s), t)),
      };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last.x, y: last.y, s: last.s };
}

/** Shorthand for writing key tables: k(f, x, y, s, ease?) */
export const k = (f: number, x: number, y: number, s: number, e?: Ease): CamKey => ({ f, x, y, s, e });
/** A hard cut to a new framing at frame f. */
export const cut = (f: number, x: number, y: number, s: number): CamKey => ({ f, x, y, s, cut: true });

/* ---- Generic keyframed scalar ------------------------------------------- */
export type NumKey = [number, number, Ease?];
export function track(keys: NumKey[], f: number): number {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (f < keys[i][0]) {
      const [fa, va] = keys[i - 1];
      const [fb, vb, e] = keys[i];
      return mix(va, vb, ease(e ?? "io", (f - fa) / (fb - fa)));
    }
  }
  return keys[keys.length - 1][1];
}

/** Deterministic hash noise in [0,1). */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
