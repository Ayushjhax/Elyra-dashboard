import React from "react";
import { AbsoluteFill } from "remotion";
import { C, F } from "../theme";
import { EASE, mix, prog } from "../lib/anim";
import { DirBlur, depthBlur } from "../components/DirBlur";
import { Disclosure, Headline } from "../components/Type";
import { dpToFilm } from "../components/Device";
import { MATCH_X, phoneAt } from "../camera";
import { ANSWER_TOP, RAIL_X } from "../screens/AskScreen";
import { CAP_MARK, BAR, VENUE_ROW_Y, VENUE_ROW_H, VenueRow } from "../screens/PortfolioScreen";
import { Emblem } from "../screens/ui";
import timeline from "../config/timeline.json";

const S = timeline.scenes;
const cue = timeline.cues;

/* ------------------------------ headlines -------------------------------- */

const TWO = (size: number) => 540 - Math.round(size * 1.02);

export const SceneHeadlines: React.FC<{ frame: number }> = ({ frame }) => (
  <>
    <Headline frame={frame} lines={["Ask Elyra."]} x={96} y={540 - 78} size={152} enter={S.ask.from} exit={388} exitDur={9} />
    <Headline frame={frame} lines={["All your", "capital."]} x={96} y={TWO(140)} size={140} enter={S.capital.from} exit={588} />
    <Headline frame={frame} lines={["See what", "matters."]} x={96} y={TWO(140) - 40} size={140} enter={S.matters.from} exit={788} />
    <Headline frame={frame} lines={["Your next", "move."]} x={96} y={TWO(140) - 40} size={140} enter={S.nextMove.from} exit={975} exitDur={10} />
  </>
);

/* --------------------- disclosures and concept label --------------------- */

export const Labels: React.FC<{ frame: number }> = ({ frame }) => {
  const visionO = Math.min(prog(frame, 900, 908, EASE.brand), 1 - prog(frame, 975, 984, EASE.brand));
  return (
    <>
      <Disclosure frame={frame} from={262} to={392} text="Illustrative account data" x={96} y={982} />
      <Disclosure frame={frame} from={404} to={596} text="Illustrative account data" x={96} y={982} />
      <Disclosure frame={frame} from={604} to={796} text="Illustrative data" x={96} y={982} />
      <Disclosure frame={frame} from={806} to={896} text="Illustrative · no transaction was made" x={96} y={982} />
      {visionO > 0 && (
        <div style={{ position: "absolute", left: 96, top: 712, opacity: visionO }}>
          <Disclosure frame={100} from={0} to={10_000} text="Product vision" x={0} y={0} accent size={32} />
          <div style={{ position: "absolute", left: 0, top: 70, fontFamily: F.sans, fontWeight: 400, fontSize: 28, color: C.stone, whiteSpace: "nowrap" }}>
            A concept, not a released feature
          </div>
        </div>
      )}
    </>
  );
};

/* ---------------------- scene 5: one label per shot ---------------------- */

const SHOTS = ["Signals", "Smart money", "Research", "Alerts"];

export const MontageLabels: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 600 || frame > 800) return null;
  const o = Math.min(prog(frame, 602, 610, EASE.brand), 1 - prog(frame, 786, 794, EASE.brand));
  const idx = Math.min(3, Math.max(0, Math.floor((frame - 600) / 50)));
  const local = frame - (600 + idx * 50);
  const inT = prog(local, idx === 0 ? 2 : 0, idx === 0 ? 12 : 8, EASE.out);
  const outT = idx < 3 ? prog(local, 44, 50, EASE.in) : 0;
  const top = 540 + 140 * 1.02 - 40 + 46;
  return (
    <div style={{ position: "absolute", left: 96, top, opacity: o }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {SHOTS.map((s, i) => (
          <div key={s} style={{ width: 54, height: 4, borderRadius: 2, background: i === idx ? C.citron : i < idx ? C.stone : C.border, opacity: i < idx ? 0.6 : 1 }} />
        ))}
      </div>
      <div style={{ height: 60, overflow: "hidden" }}>
        <div
          style={{
            transform: `translateY(${(1 - inT) * 56 - outT * 56}px)`,
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            fontFamily: F.sans,
            fontWeight: 500,
            fontSize: 44,
            lineHeight: "56px",
            color: C.ivory,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 32, color: C.stone }}>0{idx + 1}</span>
          {SHOTS[idx]}
        </div>
      </div>
    </div>
  );
};

/* ---------------- scene 3 → 4: the agent rail becomes the cap ------------ */

export const RailMatch: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 388 || frame > 412) return null;
  let x: number;
  let top: number;
  let bot: number;
  let w: number;
  let col: string = C.rail;
  if (frame < 400) {
    // Leaving scene 3: the rail lifts off the brief and stretches to the frame.
    const p = phoneAt(388);
    const a = dpToFilm(p, RAIL_X, ANSWER_TOP);
    const b = dpToFilm(p, RAIL_X, ANSWER_TOP + 309);
    const t = prog(frame, 388, 399, EASE.inOut);
    x = mix(a.x + 1.5 * p.s, MATCH_X, t);
    top = mix(a.y, -20, t);
    bot = mix(b.y, 1100, t);
    w = mix(3 * p.s, 4, t);
    col = t > 0.5 ? C.lime : C.rail;
  } else {
    // Landing in scene 4: the full-height line becomes the 25% cap marker.
    const p = phoneAt(frame);
    const a = dpToFilm(p, CAP_MARK.x, BAR.y - 7);
    const b = dpToFilm(p, CAP_MARK.x, BAR.y + BAR.h + 7);
    const t = prog(frame, 400, 411, EASE.out);
    x = MATCH_X;
    top = mix(-20, a.y, t);
    bot = mix(1100, b.y, t);
    w = mix(4, 2.5 * p.s, t);
    col = C.lime;
  }
  return <div style={{ position: "absolute", left: x - w / 2, top, width: w, height: bot - top, background: col, borderRadius: w }} />;
};

/* ------------- scene 4: venue planes converge into one view -------------- */

const PLANE_START = [
  { x: 1520, y: 110, k: 1.5 },
  { x: 1660, y: 1010, k: 1.6 },
  { x: 1790, y: 290, k: 1.45 },
  { x: 1170, y: 960, k: 1.55 },
];
export const PLANE_LOCK = [412, ...cue.planeLocks];
const TRAVEL = 12;

export const VenuePlanes: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 402 || frame > 452) return null;
  return (
    <AbsoluteFill>
      {PLANE_START.map((st, i) => {
        const lock = PLANE_LOCK[i];
        if (frame >= lock) return null;
        const pose = (f: number) => {
          const p = phoneAt(f);
          const end = dpToFilm(p, 21 + 185, VENUE_ROW_Y[i] + VENUE_ROW_H / 2);
          const t = prog(f, lock - TRAVEL, lock, EASE.out);
          const drift = (f - 402) * 0.8;
          return {
            x: mix(st.x - drift, end.x, t),
            y: mix(st.y, end.y, t),
            s: p.s * mix(st.k, 1, t),
            t,
          };
        };
        const now = pose(frame);
        const prev = pose(frame - 1);
        const o = prog(frame, 402 + i * 2, 410 + i * 2, EASE.brand);
        const blur = (1 - now.t) * 5;
        return (
          <DirBlur key={i} dx={now.x - prev.x} dy={now.y - prev.y}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transformOrigin: "0 0",
                transform: `translate(${now.x}px, ${now.y}px) scale(${now.s}) translate(-185px, -29px)`,
                opacity: o * mix(0.75, 1, now.t),
                ...depthBlur(blur),
              }}
            >
              <VenueRow index={i} style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }} />
            </div>
          </DirBlur>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------ scene 6 → 7: the emblem becomes the lockup ------------ */

export const LOCKUP = {
  emblem: { x: 96, y: 262, size: 196 },
  word: { x: 96 + 196 + 34, size: 158 },
};

/** Header emblem & wordmark positions in the app (AppHeader, dp). */
const HDR = { ex: 12, ey: 44, es: 38, wx: 61, wy: 44, ws: 29 };

export const Lockup: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < 988) return null;
  const p = phoneAt(Math.min(frame, 999));
  const t = prog(frame, 988, 1000, Easing2);
  const eFrom = dpToFilm(p, HDR.ex, HDR.ey);
  const eSize = mix(HDR.es * p.s, LOCKUP.emblem.size, t);
  const ex = mix(eFrom.x, LOCKUP.emblem.x, t);
  const ey = mix(eFrom.y, LOCKUP.emblem.y, t);
  const wFrom = dpToFilm(p, HDR.wx, HDR.wy);
  const wordSize = mix(HDR.ws * p.s, LOCKUP.word.size, t);
  const wordTopFinal = LOCKUP.emblem.y + LOCKUP.emblem.size / 2 - LOCKUP.word.size * 0.66;
  const wx = mix(wFrom.x, LOCKUP.word.x, t);
  const wy = mix(wFrom.y + HDR.ws * p.s * 0.02, wordTopFinal, t);
  const tagT = (d: number) => prog(frame, 993 + d, 1004 + d, EASE.out);
  const drift = frame >= 1000 ? (frame - 1000) / 199 : 0;
  const lift = drift * 4;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: ex, top: ey - lift, width: eSize, height: eSize }}>
        <Emblem size={eSize} />
      </div>
      <div
        style={{
          position: "absolute",
          left: wx,
          top: wy - lift,
          fontFamily: F.serif,
          fontSize: wordSize,
          lineHeight: `${wordSize * 1.12}px`,
          color: C.ivory,
          whiteSpace: "nowrap",
        }}
      >
        Elyra
      </div>
      <div style={{ position: "absolute", left: 96, top: 520 - lift, height: 96, overflow: "hidden" }}>
        <div
          style={{
            transform: `translateY(${(1 - tagT(0)) * 90}px)`,
            fontFamily: F.display,
            fontWeight: 600,
            fontSize: 80,
            lineHeight: "92px",
            letterSpacing: "-0.025em",
            color: C.ivory,
            whiteSpace: "nowrap",
          }}
        >
          Move with clarity.
        </div>
      </div>
      <div style={{ position: "absolute", left: 96, top: 650 - lift, height: 60, overflow: "hidden" }}>
        <div
          style={{
            transform: `translateY(${(1 - tagT(2)) * 56}px)`,
            fontFamily: F.sans,
            fontWeight: 500,
            fontSize: 42,
            lineHeight: "54px",
            color: C.stone,
            whiteSpace: "nowrap",
          }}
        >
          Explore <span style={{ color: C.citron }}>getelyra.xyz</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 96, top: 736 - lift, width: 96, height: 3, borderRadius: 2, background: C.citron, transformOrigin: "0 50%", transform: `scaleX(${tagT(4)})` }} />
    </AbsoluteFill>
  );
};

const Easing2 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

