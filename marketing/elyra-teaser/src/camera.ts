import { Easing } from "remotion";
import { EASE, type Key, track } from "./lib/anim";
import { placeScreenPoint, type Placement } from "./components/Device";
import { CAP_MARK } from "./screens/PortfolioScreen";
import { SECTION_CENTER } from "./screens/FeedScreen";
import { RISK_CARD } from "./screens/PortfolioScreen";

/* ---------------------------------------------------------------------------
   One handset, one camera. From frame 100 to the last frame the phone is a
   single object whose placement is this keyframed track; scenes change what
   is on its screen and what surrounds it. Placements are written as "put
   this point of the screen at this point of the frame", so a match cut is
   arithmetic rather than eyeballing.
--------------------------------------------------------------------------- */

const WHIP = Easing.bezier(0.75, 0, 0.15, 1);

/** Where the agent rail lands as the 25% cap marker (scene 3 → 4). */
export const MATCH_X = 1298.6;
const MATCH_Y = 299;

const P = {
  s2in: { x: 1530, y: 620, s: 1.28 },
  s2: { x: 1400, y: 540, s: 0.96 },
  s2end: { x: 1392, y: 540, s: 0.975 },
  s3a: placeScreenPoint(206, 540, 1450, 540, 1.45),
  s3a2: placeScreenPoint(206, 536, 1450, 540, 1.47),
  s3b: placeScreenPoint(206, 318, 1450, 540, 1.7),
  s3c: placeScreenPoint(206, 318, 1450, 540, 1.74),
  s3x: placeScreenPoint(17, 420, MATCH_X, 540, 2.5),
  s4in: placeScreenPoint(CAP_MARK.x, CAP_MARK.y, MATCH_X, MATCH_Y, 1.34),
  s4: placeScreenPoint(CAP_MARK.x, CAP_MARK.y, MATCH_X, MATCH_Y, 1.2),
  s4b: placeScreenPoint(CAP_MARK.x, CAP_MARK.y, MATCH_X - 4, MATCH_Y + 6, 1.215),
  s4m: placeScreenPoint(206, RISK_CARD.y + RISK_CARD.h / 2, 1300, 560, 2.3),
  s4m2: placeScreenPoint(206, RISK_CARD.y + RISK_CARD.h / 2, 1300, 560, 2.36),
  s4full: { x: 1400, y: 540, s: 0.98 },
  s4full2: { x: 1396, y: 540, s: 0.99 },
  s5: { x: 1400, y: 541, s: 2.2 },
  s6a: placeScreenPoint(206, 440, 1400, 540, 1.45),
  s6a2: placeScreenPoint(206, 440, 1396, 540, 1.47),
  s6b: placeScreenPoint(206, 404, 1400, 540, 1.4),
  s6b2: placeScreenPoint(206, 404, 1396, 540, 1.42),
  s6pull: { x: 1330, y: 540, s: 1.22 },
  s7: { x: 1400, y: 540, s: 0.978 },
  s7end: { x: 1393, y: 538, s: 0.993 },
} satisfies Record<string, Placement>;

type PKey = readonly [number, Placement, ((t: number) => number)?];

const KEYS: PKey[] = [
  [100, P.s2in, EASE.out],
  [113, P.s2, EASE.linear],
  [186, P.s2end, Easing.bezier(0.7, 0, 0.3, 1)],
  [200, P.s3a, EASE.linear],
  [222, P.s3a2, EASE.inOut],
  [252, P.s3b, EASE.linear],
  [388, P.s3c, EASE.in],
  [399, P.s3x, EASE.linear],
  // Hard handoff at 400: the rail line carries the eye across the cut.
  [400, P.s4in, EASE.out],
  [412, P.s4, EASE.linear],
  [488, P.s4b, EASE.inOut],
  [501, P.s4m, EASE.linear],
  [547, P.s4m2, EASE.inOut],
  [561, P.s4full, EASE.linear],
  [589, P.s4full2, EASE.inOut],
  [601, P.s5, EASE.linear],
  [790, P.s5, EASE.inOut],
  [802, P.s6a, EASE.linear],
  [892, P.s6a2, EASE.inOut],
  [904, P.s6b, EASE.linear],
  [974, P.s6b2, EASE.inOut],
  [988, P.s6pull, EASE.inOut],
  [1000, P.s7, EASE.linear],
  [1199, P.s7end],
];

function at(frame: number, pick: (p: Placement) => number): number {
  const keys: Key[] = [];
  for (let i = 0; i < KEYS.length; i++) {
    const [f, p, e] = KEYS[i];
    keys.push([f, pick(p), e]);
  }
  // A hard cut between two keys one frame apart must not interpolate.
  if (frame > 399 && frame < 400) return pick(P.s4in);
  return track(frame, keys);
}

/** Scene 5 adds a small depth pulse on each beat-landing whip. */
function montagePulse(frame: number): number {
  let v = 0;
  for (const land of [650, 700, 750]) {
    const d = frame - (land - 5);
    if (d > -6 && d < 10) v += Math.sin(((d + 6) / 16) * Math.PI) * 0.045;
  }
  return v;
}

export function phoneAt(frame: number): Placement {
  const p: Placement = {
    x: at(frame, (q) => q.x),
    y: at(frame, (q) => q.y),
    s: at(frame, (q) => q.s),
  };
  if (frame >= 600 && frame < 790) {
    const k = montagePulse(frame);
    p.s *= 1 + k;
  }
  return p;
}

/** Scene 5 scroll offset (dp): whips between the four sections, landing on the beat. */
export function feedScroll(frame: number): number {
  const c = SECTION_CENTER.map((v) => v - 458);
  return track(frame, [
    [600, c[0], WHIP],
    [641, c[0], WHIP],
    [650, c[1], WHIP],
    [691, c[1], WHIP],
    [700, c[2], WHIP],
    [741, c[2], WHIP],
    [750, c[3]],
  ]);
}

/** Scene 6: the swap screen slides out left as the strategy concept slides in. */
export function visionSlide(frame: number): number {
  return track(frame, [
    [892, 0, WHIP],
    [901, 1],
  ]);
}
