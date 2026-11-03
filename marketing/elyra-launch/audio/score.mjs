// Elyra launch — original temporary score and sound design.
//
//   node audio/score.mjs
//
// A TEMPORARY CUE. It is composed and synthesised here, in code, because no
// music-generation service or licensed library was available to this
// production. It follows the brief's cue map exactly (144 BPM, 4/4, 26 bars,
// 2,600 frames) and is built to be replaced: the stems separate score
// (drums, bass, music) from the film's hits and UI sounds, and
// audio/CUE-SHEET.md lists every sync point by frame.
//
// Grid: one beat = 25 frames; one 16th = 6.25 frames; one bar = 100 frames.
// D minor, resolving to D major at frame 2300.
//
// Revision 4 removed one bar from the opening. Cues below are still written
// in the frames and bars of the 2,700-frame cut; fr() and at() move
// everything from old frame 200 (old bar 3) one bar earlier, so the impact
// lands on film frame 100 and the launch on 2300. The opening's own material
// (old bar 1, below 200) is written directly in film frames.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SR, rng, midi, db, stereo, pan, Biquad, Saw, Square, freeverb, pingpong, compress, limit, writeWav } from "./dsp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const OUT_DIR = path.join(root, "public", "audio");
const STEM_DIR = path.join(root, "out", "stems");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(STEM_DIR, { recursive: true });

const FPS = 60, BPM = 144, FRAMES = 2600;
const N = Math.round((FRAMES / FPS) * SR); // 2,080,000 samples = 43.333 s
const STEP = 60 / BPM / 4; // a 16th note
// seconds, bar 1-indexed in the 27-bar cut; old bar 2 is gone, so bars 3–27 play one bar earlier
const at = (bar, step = 0) => (((bar >= 3 ? bar - 1 : bar) - 1) * 16 + step) * STEP;
// seconds for a frame of the 2,700-frame cut; from old frame 200 on, one bar (100 frames) earlier
const fr = (f) => (f >= 200 ? f - 100 : f) / FPS;
const idx = (t) => Math.round(t * SR);
const rnd = rng(20261104);
const noise = () => rnd() * 2 - 1;

const STEMS = { drums: stereo(N), bass: stereo(N), music: stereo(N), hits: stereo(N), ui: stereo(N) };
// Reverb and delay sends. The launch (from 2300) has its own pair so that no
// tail from the build survives the vacuum before the announcement.
const REV_A = stereo(N), DLY_A = stereo(N);
const REV_B = stereo(N), DLY_B = stereo(N);
let REV = REV_A; // current reverb send
let DLY = DLY_A; // current delay send
const duck = new Float32Array(N).fill(1); // kick sidechain for bass and pads

function put(st, i, l, r) {
  if (i >= 0 && i < N) { st[0][i] += l; st[1][i] += r; }
}
function sendTo(bus, i, l, r, amt) {
  if (amt > 0 && i >= 0 && i < N) { bus[0][i] += l * amt; bus[1][i] += r * amt; }
}
function duckAt(t, depth) {
  const i0 = idx(t);
  const len = Math.round(0.22 * SR);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const shape = tt < 0.003 ? tt / 0.003 : Math.exp(-(tt - 0.003) / 0.07);
    const g = 1 - depth * shape;
    const i = i0 + n;
    if (i < N && g < duck[i]) duck[i] = g;
  }
}

/* ------------------------------------------------------------- drums ---- */

function kick(t, vel = 1, o = {}) {
  const i0 = idx(t), len = Math.round((o.len ?? 0.5) * SR);
  const f0 = o.f0 ?? 158, f1 = o.f1 ?? 46, pd = o.pd ?? 0.03, ad = o.ad ?? 0.26;
  const hp = new Biquad().set("hp", 1800, 0.7);
  const lpc = new Biquad().set("lp", 8000, 0.7);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const f = f1 + (f0 - f1) * Math.exp(-tt / pd);
    ph += (2 * Math.PI * f) / SR;
    const env = (tt < 0.002 ? tt / 0.002 : 1) * Math.exp(-tt / ad);
    let s = Math.sin(ph) * env;
    if (tt < 0.008) s += lpc.run(hp.run(noise())) * 0.6 * (1 - tt / 0.008) * (o.click ?? 1);
    s = Math.tanh(s * (o.drive ?? 1.9)) / Math.tanh(o.drive ?? 1.9);
    put(STEMS.drums, i0 + n, s * vel * 0.8, s * vel * 0.8);
  }
  duckAt(t, (o.duck ?? 0.7) * Math.min(1, vel));
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 2.3);
function hat(t, vel = 1, o = {}) {
  const open = o.open ?? false;
  const dec = open ? 0.13 : o.decay ?? 0.024;
  const len = Math.round((open ? 0.45 : 0.09) * SR);
  const i0 = idx(t);
  const hp = new Biquad().set("hp", 7000, 0.7);
  const bp = new Biquad().set("bp", o.tone ?? 10500, 0.9);
  const osc = HAT_F.map(() => new Square(rnd()));
  const [gl, gr] = pan(o.pan ?? 0.18);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    let s = 0;
    for (let k = 0; k < 6; k++) s += osc[k].run(HAT_F[k]);
    s = s / 6 + noise() * 0.25;
    s = bp.run(hp.run(s));
    const env = (tt < 0.0006 ? tt / 0.0006 : 1) * Math.exp(-tt / dec);
    const v = s * env * vel * 2.9;
    put(STEMS.drums, i0 + n, v * gl, v * gr);
  }
}

/** Dry metallic percussion: a short FM strike. */
function metal(t, vel = 1, o = {}) {
  const f = o.f ?? 2350, i0 = idx(t), len = Math.round(0.08 * SR);
  const [gl, gr] = pan(o.pan ?? -0.3);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const ix = 2.6 * Math.exp(-tt / 0.012);
    const s = Math.sin(2 * Math.PI * f * tt + ix * Math.sin(2 * Math.PI * f * 1.471 * tt));
    const env = (tt < 0.0005 ? tt / 0.0005 : 1) * Math.exp(-tt / (o.decay ?? 0.016));
    const v = s * env * vel * 0.58;
    put(STEMS.drums, i0 + n, v * gl, v * gr);
  }
}

function snare(t, vel = 1, o = {}) {
  const i0 = idx(t), len = Math.round(0.35 * SR);
  const bp = new Biquad().set("bp", o.tone ?? 4200, 0.6);
  const hp = new Biquad().set("hp", 900, 0.7);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const f = 168 + 60 * Math.exp(-tt / 0.012);
    ph += (2 * Math.PI * f) / SR;
    const body = Math.sin(ph) * Math.exp(-tt / 0.07) * 0.75;
    const nz = bp.run(hp.run(noise())) * Math.exp(-tt / (o.tail ?? 0.14)) * 1.6;
    let s = (body + nz) * (tt < 0.001 ? tt / 0.001 : 1);
    s = Math.tanh(s * 1.4);
    const v = s * vel * 1.05;
    put(STEMS.drums, i0 + n, v, v);
    sendTo(REV, i0 + n, v, v, o.rev ?? 0.12);
  }
}

function clap(t, vel = 1, o = {}) {
  const i0 = idx(t), len = Math.round(0.3 * SR);
  const bp = new Biquad().set("bp", 1500, 1.1);
  const [gl, gr] = pan(o.pan ?? 0.1);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    let env = 0;
    for (const d of [0, 0.011, 0.023]) if (tt >= d) env += Math.exp(-(tt - d) / 0.006);
    env += tt > 0.023 ? Math.exp(-(tt - 0.023) / 0.1) * 0.6 : 0;
    const v = bp.run(noise()) * env * vel * 0.95;
    put(STEMS.drums, i0 + n, v * gl, v * gr);
    sendTo(REV, i0 + n, v * gl, v * gr, 0.18);
  }
}

/** Soft low "heartbeat" pulse used for pressure in bar 1. */
function pulse(t, vel) {
  kick(t, vel, { f0: 92, f1: 41, pd: 0.05, ad: 0.18, click: 0, drive: 1.2, duck: 0.2 });
}

/* -------------------------------------------------------------- bass ---- */

function bassNote(t, dur, note, vel = 1, o = {}) {
  const f = midi(note);
  const i0 = idx(t), len = Math.round((dur + 0.08) * SR);
  const lp = new Biquad();
  const saw = new Saw(rnd());
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    ph += (2 * Math.PI * f) / SR;
    const sub = Math.sin(ph);
    if (n % 32 === 0) lp.set("lp", (o.cut ?? 320) + (o.peak ?? 1100) * Math.exp(-tt / (o.cutDecay ?? 0.07)), 1.1);
    const mid = lp.run(saw.run(f));
    let s = Math.tanh(sub * 1.7) * 0.6 + mid * (o.grit ?? 0.5);
    const a = tt < 0.004 ? tt / 0.004 : 1;
    const r = tt > dur ? Math.exp(-(tt - dur) / 0.025) : 1;
    const d = o.decay ? 0.55 + 0.45 * Math.exp(-tt / o.decay) : 1;
    s *= a * r * d * vel * 0.62;
    put(STEMS.bass, i0 + n, s, s);
  }
}

/** Long sub drop for the two impacts. */
function subDrop(t, vel = 1, o = {}) {
  const i0 = idx(t), len = Math.round((o.len ?? 1.8) * SR);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const f = (o.f1 ?? 31) + ((o.f0 ?? 78) - (o.f1 ?? 31)) * Math.exp(-tt / (o.glide ?? 0.32));
    ph += (2 * Math.PI * f) / SR;
    const env = (tt < 0.003 ? tt / 0.003 : 1) * Math.exp(-tt / (o.decay ?? 0.9));
    const s = Math.tanh(Math.sin(ph) * 1.6) * env * vel * 0.85;
    put(STEMS.hits, i0 + n, s, s);
  }
}

/* ------------------------------------------------------------- music ---- */

function pluck(t, dur, note, vel, cutoff, p = 0) {
  const f = midi(note);
  const i0 = idx(t), len = Math.round((dur + 0.25) * SR);
  const a = new Saw(rnd()), b = new Saw(rnd()), sq = new Square(rnd());
  const lp = new Biquad();
  const [gl, gr] = pan(p);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    if (n % 16 === 0) lp.set("lp", cutoff * (0.32 + 0.68 * Math.exp(-tt / 0.07)), 2.4);
    let s = a.run(f * 1.0035) + b.run(f * 0.9965) + sq.run(f / 2) * 0.35;
    s = lp.run(s * 0.33);
    const env = (tt < 0.002 ? tt / 0.002 : 1) * Math.exp(-tt / 0.15) * (tt > dur ? Math.exp(-(tt - dur) / 0.03) : 1);
    const v = s * env * vel * 1.15;
    put(STEMS.music, i0 + n, v * gl, v * gr);
    sendTo(DLY, i0 + n, v * gl, v * gr, 0.32);
    sendTo(REV, i0 + n, v * gl, v * gr, 0.08);
  }
}

function pad(t0, t1, notes, level, bright = 1300, o = {}) {
  const att = o.att ?? 0.45, rel = o.rel ?? 0.9;
  const i0 = idx(t0), len = Math.round((t1 - t0 + rel + 0.05) * SR);
  const voices = [];
  for (const nt of notes) {
    for (const [cents, p] of [[-9, -0.7], [0, 0], [9, 0.7]]) {
      voices.push({ osc: new Saw(rnd()), f: midi(nt) * Math.pow(2, cents / 1200), g: pan(p) });
    }
  }
  const lpL = new Biquad(), lpR = new Biquad();
  const norm = 1 / Math.sqrt(voices.length);
  const dur = t1 - t0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    if (n % 64 === 0) {
      const c = bright * (1 + 0.12 * Math.sin(2 * Math.PI * 0.21 * tt)) * (o.open ? 1 + o.open * Math.min(1, tt / dur) : 1);
      lpL.set("lp", c, 0.7); lpR.set("lp", c * 1.04, 0.7);
    }
    let l = 0, r = 0;
    for (const v of voices) { const s = v.osc.run(v.f); l += s * v.g[0]; r += s * v.g[1]; }
    const env = Math.min(1, tt / att) * (tt > dur ? Math.exp(-(tt - dur) / (rel / 3)) : 1);
    const L = lpL.run(l * norm) * env * level * 1.4, R = lpR.run(r * norm) * env * level * 1.4;
    put(STEMS.music, i0 + n, L, R);
    sendTo(REV, i0 + n, L, R, o.rev ?? 0.35);
  }
}

/** Low pressure drone for the opening bars (narrow, mono). */
function drone(t0, t1, level) {
  const i0 = idx(t0), len = Math.round((t1 - t0) * SR);
  const lp = new Biquad();
  const s1 = new Saw(0.1), s2 = new Saw(0.6);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const p = tt / (t1 - t0);
    if (n % 64 === 0) lp.set("lp", 140 + 520 * p * p, 1.6);
    // 8th-note tremolo that deepens as pressure rises
    const trem = 1 - (0.25 + 0.5 * p) * (0.5 + 0.5 * Math.cos((2 * Math.PI * tt) / (STEP * 2)));
    let s = Math.sin(2 * Math.PI * midi(26) * tt) * 0.7 + lp.run(s1.run(midi(38)) * 0.5 + s2.run(midi(38) * 1.005) * 0.5) * 0.6;
    s *= level * trem * Math.min(1, tt / 0.02) * (0.6 + 0.4 * p);
    put(STEMS.bass, i0 + n, s, s);
  }
}

/** FM bell — the insight tone and the launch signature share it. */
function bell(t, note, vel = 1, o = {}) {
  const f = midi(note);
  const i0 = idx(t), len = Math.round((o.len ?? 2.6) * SR);
  const [gl, gr] = pan(o.pan ?? 0);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const ix = 2.4 * Math.exp(-tt / 0.18) + 0.35;
    const s =
      Math.sin(2 * Math.PI * f * tt + ix * Math.sin(2 * Math.PI * f * 2.0 * tt)) * 0.8 +
      Math.sin(2 * Math.PI * f * 2 * tt) * 0.16 * Math.exp(-tt / 0.4) +
      Math.sin(2 * Math.PI * f * 3.01 * tt) * 0.06 * Math.exp(-tt / 0.2);
    const env = (tt < 0.0015 ? tt / 0.0015 : 1) * Math.exp(-tt / (o.decay ?? 1.4));
    const v = s * env * vel * 0.42;
    put(STEMS.hits, i0 + n, v * gl, v * gr);
    sendTo(REV, i0 + n, v * gl, v * gr, o.rev ?? 0.32);
    sendTo(DLY, i0 + n, v * gl, v * gr, o.dly ?? 0.18);
  }
}

/* ---------------------------------------------------------- sound fx ---- */

function noiseBurst(t, dur, vel, cut, stem = STEMS.hits, rev = 0.3) {
  const i0 = idx(t), len = Math.round(dur * SR);
  const lp = new Biquad().set("lp", cut, 0.7);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const v = lp.run(noise()) * Math.exp(-tt / (dur / 4)) * vel;
    put(stem, i0 + n, v, v * 0.96);
    sendTo(REV, i0 + n, v, v, rev);
  }
}

/** A mechanical UI click: two tight transients, the second softer. */
function click(f, vel = 0.7, o = {}) {
  const t = fr(f);
  const pitch = o.pitch ?? 1;
  const [gl, gr] = pan(o.pan ?? 0);
  for (const [d, g] of [[0, 1], [0.0065, 0.55]]) {
    const i0 = idx(t + d), len = Math.round(0.02 * SR);
    const bp = new Biquad().set("bp", 3300 * pitch, 2.2);
    for (let n = 0; n < len; n++) {
      const tt = n / SR;
      const s = bp.run(noise()) * Math.exp(-tt / 0.0028) * 1.4 +
        Math.sin(2 * Math.PI * 4300 * pitch * tt) * Math.exp(-tt / 0.0018) * 0.5 +
        Math.sin(2 * Math.PI * 950 * pitch * tt) * Math.exp(-tt / 0.005) * 0.25;
      const v = s * g * vel * 0.55;
      put(STEMS.ui, i0 + n, v * gl, v * gr);
    }
  }
}

/** A lighter pitched tick (bracket hops, tabs). */
function tick(f, vel = 0.6, pitch = 1, p = 0) {
  const i0 = idx(fr(f)), len = Math.round(0.03 * SR);
  const [gl, gr] = pan(p);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const s = Math.sin(2 * Math.PI * 1900 * pitch * tt) * Math.exp(-tt / 0.006) + noise() * Math.exp(-tt / 0.0015) * 0.4;
    const v = s * vel * 0.4;
    put(STEMS.ui, i0 + n, v * gl, v * gr);
  }
}

/** Directional sweep: filtered noise travelling in frequency and across the stereo field. */
function sweep(f0, f1, { from = 5000, to = 600, vel = 0.6, panFrom = -0.6, panTo = 0.6, q = 1.3, shape = "arc", rev = 0.1 } = {}) {
  const t0 = fr(f0), t1 = fr(f1);
  const i0 = idx(t0), len = Math.round((t1 - t0) * SR);
  const bp = new Biquad();
  for (let n = 0; n < len; n++) {
    const p = n / len;
    if (n % 32 === 0) bp.set("bp", from * Math.pow(to / from, p), q);
    const env = shape === "arc" ? Math.sin(Math.PI * p) ** 1.5 : shape === "rise" ? p ** 2.2 : (1 - p) ** 1.5;
    const [gl, gr] = pan(panFrom + (panTo - panFrom) * p);
    const v = bp.run(noise()) * env * vel;
    put(STEMS.ui, i0 + n, v * gl, v * gr);
    sendTo(REV, i0 + n, v * gl, v * gr, rev);
  }
}

function whip(f, vel = 0.6, dir = 1) {
  sweep(f, f + 9, { from: 7000, to: 700, vel, panFrom: -0.5 * dir, panTo: 0.5 * dir, q: 1.6, shape: "decay" });
  const i0 = idx(fr(f + 7)), len = Math.round(0.12 * SR);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const v = Math.sin(2 * Math.PI * (70 + 40 * Math.exp(-tt / 0.02)) * tt) * Math.exp(-tt / 0.05) * vel * 0.5;
    put(STEMS.ui, i0 + n, v, v);
  }
}

/** A soft low "thunk" — slabs settling into place. */
function thunk(f, vel = 0.5) {
  const i0 = idx(fr(f)), len = Math.round(0.14 * SR);
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const v = Math.sin(2 * Math.PI * (110 + 60 * Math.exp(-tt / 0.015)) * tt) * Math.exp(-tt / 0.045) * vel * 0.55;
    put(STEMS.ui, i0 + n, v, v);
  }
}

function riser(f0, f1, vel = 0.5) {
  const t0 = fr(f0), t1 = fr(f1);
  const i0 = idx(t0), len = Math.round((t1 - t0) * SR);
  const bp = new Biquad();
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const p = n / len;
    if (n % 32 === 0) bp.set("bp", 350 * Math.pow(18, p), 1.1);
    ph += (2 * Math.PI * (110 * Math.pow(4, p))) / SR;
    const env = p ** 2.3;
    const v = (bp.run(noise()) * 0.9 + Math.sin(ph) * 0.12) * env * vel;
    put(STEMS.hits, i0 + n, v, v);
    sendTo(REV, i0 + n, v, v, 0.15);
  }
}

/* ============================================================ the cue ===== */

const CH = {
  Dm: [50, 57, 62, 65], Dm9: [50, 57, 64, 65, 69], Bb: [46, 53, 60, 62, 65], Gm: [43, 50, 55, 58, 62],
  A: [45, 52, 57, 61, 64], Asus: [45, 52, 57, 62, 64], C: [48, 55, 60, 64, 67], F: [41, 48, 53, 57, 60],
  D: [38, 45, 50, 54, 57, 64],
};
const ARP = {
  Dm: [62, 65, 69, 74], Dm9: [62, 64, 65, 69], Bb: [58, 62, 65, 70], Gm: [55, 58, 62, 67],
  A: [57, 61, 64, 69], C: [60, 64, 67, 72], F: [57, 60, 65, 69],
};
const ROOT = { Dm: 38, Dm9: 38, Bb: 34, Gm: 31, A: 33, Asus: 33, C: 36, F: 29, D: 38 };
const BARS = {
  3: "Dm", 4: "Dm", 5: "Dm", 6: "Bb", 7: "Dm9", 8: "Bb", 9: "Gm", 10: "A", 11: "Dm", 12: "C",
  13: "Dm", 14: "Bb", 15: "F", 16: "C", 17: "Dm", 18: "Bb", 19: "A", 20: "Gm", 21: "Gm",
  22: "A", 23: "C", 24: "A", 25: "D", 26: "D", 27: "D",
};

const ACC = [1, 0.42, 0.68, 0.42];
const hats16 = (bar, vel, from = 0, to = 16, o = {}) => {
  for (let s = from; s < to; s++) hat(at(bar, s), vel * ACC[s % 4] * (0.92 + 0.16 * rnd()), o);
};

/* ---- bar 1 · pressure (0–100, film frames) ---- */
kick(0, 1.1, { f0: 190, f1: 52, ad: 0.16, drive: 2.4, click: 1.4, duck: 0 }); // the dry first transient
metal(0, 1.0, { f: 2900, pan: 0, decay: 0.03 });
noiseBurst(0, 0.05, 0.3, 6000, STEMS.drums, 0);
drone(0, fr(76), 0.32);
for (let b = 0; b < 3; b++) pulse(at(1, 4 + b * 4), 0.32 + b * 0.06); // a beat-pulse on beats 2–4
for (let s = 2; s < 12; s++) { // tight ticking 16ths, rising
  const p = s / 12;
  hat(at(1, s), (0.18 + 0.5 * p) * ACC[s % 4], { decay: 0.015, pan: 0 });
  if (s % 4 === 3) metal(at(1, s), 0.25 + 0.4 * p, { pan: 0, f: 2500 });
}
sweep(76, 100, { from: 400, to: 5200, vel: 0.35, panFrom: 0, panTo: 0, q: 1.0, shape: "rise", rev: 0.2 }); // the breath before
sweep(84, 101, { from: 6500, to: 300, vel: 0.5, panFrom: 0.4, panTo: -0.4, q: 1.2, shape: "arc" }); // the pull-out

/* ---- the hardware impact (film frame 100) ---- */
kick(at(3), 1.25, { f0: 140, f1: 40, ad: 0.5, len: 0.9, drive: 2.0, duck: 0.9 });
subDrop(at(3), 1.0, { f0: 80, f1: 32, glide: 0.35, decay: 0.95, len: 2.2 });
noiseBurst(at(3), 0.9, 0.28, 2600, STEMS.hits, 0.55);

/* ---- per-bar programme, bars 3–27 of the old cut (film bars 2–26) ---- */
function barProgramme(bar) {
  const ch = BARS[bar];
  const rootN = ROOT[ch];
  const t0 = at(bar), t1 = at(bar + 1);
  const K = (s, v = 1, o) => kick(at(bar, s), v, o);
  const Sn = (s, v = 1, o) => snare(at(bar, s), v, o);
  const B = (s, len, note = rootN, v = 1, o) => bassNote(at(bar, s), len * STEP * 0.92, note, v, o);

  // pads — the harmonic bed, deepening through capital, thinning for the review
  const padLevel = { 3: 0.10, 4: 0.12, 5: 0.12, 6: 0.13, 7: 0.16, 8: 0.2, 9: 0.21, 10: 0.22, 11: 0.15, 12: 0.15, 13: 0.15, 20: 0.14, 21: 0.17, 22: 0.15, 23: 0.18, 24: 0.2 }[bar] ?? 0.13;
  const padBright = bar >= 8 && bar <= 10 ? 1300 : bar >= 23 && bar <= 24 ? 2500 + (bar - 23) * 600 : 1750;
  if (bar <= 24) {
    const notes = bar >= 8 && bar <= 10 ? CH[ch].map((n, i) => (i === 0 ? n - 12 : n)) : CH[ch];
    pad(t0, t1 - 0.02, notes, padLevel, padBright, { att: bar === 3 ? 0.9 : 0.12, rel: 0.25, open: bar === 24 ? 1.5 : 0 });
  }

  // arpeggio: enters with the evidence, opens across research, steps aside for the review
  const arpOn = (bar >= 5 && bar <= 19) || (bar >= 22 && bar <= 24);
  if (arpOn) {
    const tones = ARP[ch] ?? ARP.Dm;
    const order = bar >= 14 ? [0, 2, 1, 3, 2, 0, 3, 1, 0, 2, 3, 1, 2, 3, 1, 0] : [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 3, 1];
    const gate = bar >= 14 ? [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1] : [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0];
    const cutoff = bar <= 19 ? 1500 + (bar - 5) * 180 : 2200 + (bar - 22) * 800;
    for (let s = 0; s < 16; s++) {
      if (!gate[s]) continue;
      if (bar === 6 && s >= 8) continue; // withdrawal before the answer
      const tAt = at(bar, s);
      if (tAt >= fr(2385)) continue;
      pluck(tAt, STEP * 0.8, tones[order[s]], (0.55 + 0.25 * (s % 4 === 0 ? 1 : 0)) * (bar === 7 && s < 4 ? 0.4 : 1), cutoff, s % 2 ? 0.35 : -0.35);
    }
  }

  if (bar === 3) {
    // one clear low impact, then a controlled groove from beat 3
    K(8, 0.95); K(11, 0.7); K(14, 0.8);
    B(8, 3); B(11, 3); B(14, 2, rootN + 12, 0.8);
    hats16(bar, 0.55, 8, 16);
    metal(at(bar, 12), 0.5, { pan: 0.35 });
  } else if (bar === 4) {
    K(0); K(6, 0.85); K(8); K(11, 0.7); K(14, 0.8);
    Sn(12, 0.55, { tail: 0.1 });
    B(0, 3); B(3, 2, rootN + 12, 0.7); B(6, 2); B(8, 3); B(11, 2); B(14, 2, rootN + 12, 0.8);
    hats16(bar, 0.62);
    metal(at(bar, 7), 0.45, { pan: 0.35 }); metal(at(bar, 15), 0.55, { pan: -0.35 });
  } else if (bar >= 5 && bar <= 10) {
    // breakbeat groove, the evidence lift
    const alt = bar % 2 === 1;
    const withdraw = bar === 6;
    K(0); if (!withdraw) { K(alt ? 6 : 3, 0.8); K(10, 0.95); if (!alt) K(11, 0.6); }
    else K(3, 0.75);
    Sn(4, 0.85);
    if (!withdraw) { Sn(12, 0.9); Sn(alt ? 7 : 9, 0.22, { tail: 0.06 }); Sn(15, 0.18, { tail: 0.05 }); }
    const pat = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0];
    for (let s = 0; s < 16; s++) {
      if (!pat[s]) continue;
      if (withdraw && s >= 8) continue;
      const up = s === 9 || s === 14;
      B(s, s === 12 ? 2 : 3, up ? rootN + 12 : rootN, up ? 0.75 : 1, bar >= 8 ? { cut: 260, peak: 800 } : {});
    }
    hats16(bar, 0.6, 0, withdraw ? 8 : 16);
    if (withdraw) for (let s = 8; s < 16; s += 2) hat(at(bar, s), 0.22, { decay: 0.012 });
    if (!withdraw) { metal(at(bar, 7), 0.4, { pan: 0.4 }); metal(at(bar, 13), 0.5, { pan: -0.4, f: 2650 }); }
    if (bar === 10) { Sn(13, 0.35, { tail: 0.05 }); Sn(14, 0.5, { tail: 0.05 }); Sn(15, 0.7, { tail: 0.06 }); }
  } else if (bar >= 11 && bar <= 13) {
    // syncopation for signals and tracked wallets: 3-3-2 kicks, offbeat claps, metal in the gaps
    K(0); K(3, 0.85); K(6, 0.9); K(10, 0.95); K(13, 0.75);
    Sn(4, 0.85); Sn(12, 0.9);
    clap(at(bar, 7), 0.55); clap(at(bar, 15), 0.45);
    for (const s of [0, 3, 6, 10, 13]) B(s, s === 13 ? 3 : 2.5, s === 6 ? rootN + 12 : rootN, s === 6 ? 0.8 : 1, { peak: 1400 });
    hats16(bar, 0.66);
    for (const [s, p] of [[2, -0.5], [5, 0.5], [9, -0.4], [11, 0.4], [14, -0.5]]) metal(at(bar, s), 0.52, { pan: p, f: 2200 + s * 40 });
  } else if (bar === 14) {
    // half syncopation, then the research drive drops in on frame 1350 (step 8)
    K(0); K(3, 0.85); K(6, 0.9);
    Sn(4, 0.85); clap(at(bar, 7), 0.5);
    for (const s of [0, 3, 6]) B(s, 2.5, s === 6 ? rootN + 12 : rootN, 1, { peak: 1400 });
    hats16(bar, 0.66, 0, 8);
    kick(at(bar, 8), 1.15, { ad: 0.32, duck: 0.8 });
    noiseBurst(at(bar, 8), 0.7, 0.22, 7000, STEMS.drums, 0.35); // crash where the wipe lands
    K(10); Sn(12, 0.95); Sn(15, 0.2, { tail: 0.05 });
    const roll = [1, 0, 1, 1, 0, 1, 1, 0];
    for (let s = 8; s < 16; s++) if (roll[s - 8]) B(s, 1, s % 4 === 2 ? rootN + 12 : rootN, s % 4 === 0 ? 1 : 0.72, { peak: 1200, cutDecay: 0.05 });
    hats16(bar, 0.6, 8, 16);
    for (const s of [10, 14]) hat(at(bar, s), 0.36, { open: true, pan: -0.2 });
  } else if (bar >= 15 && bar <= 19) {
    // the research drive: rolling bass, full break, open hats, evolving accents
    const v = bar - 14;
    K(0); K(v % 2 ? 7 : 6, 0.8); K(10); if (v % 3 === 2) K(13, 0.7);
    Sn(4, 0.9); Sn(12, 0.95);
    for (const s of v % 2 ? [2, 9, 14] : [7, 11, 15]) Sn(s, 0.2, { tail: 0.05 });
    const roll = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0];
    for (let s = 0; s < 16; s++) if (roll[s]) B(s, 1, s % 4 === 2 ? rootN + 12 : rootN, s % 4 === 0 ? 1 : 0.72, { peak: 1200 + v * 120, cutDecay: 0.05 });
    hats16(bar, 0.6);
    for (const s of [2, 6, 10, 14]) if ((s + v) % 8 !== 0) hat(at(bar, s), 0.36, { open: true, pan: -0.2 });
    for (let s = 0; s < 16; s += 2) metal(at(bar, s + 1), 0.22 + 0.1 * ((s + v) % 3 === 0), { pan: s % 4 ? 0.45 : -0.45, f: 2050 + v * 70 });
    if (bar === 16 || bar === 18) for (const s of [12, 13, 14, 15]) Sn(s, 0.35 + (s - 12) * 0.12, { tail: 0.05 });
    if (bar === 19) { for (let s = 8; s < 16; s++) Sn(s, 0.3 + (s - 8) * 0.07, { tail: 0.05 }); clap(at(bar, 15), 0.6); }
  } else if (bar === 20) {
    // reduce around the review/control moment
    K(0); K(8, 0.85);
    B(0, 6); B(8, 6);
    for (let s = 0; s < 16; s += 2) hat(at(bar, s), 0.45 * (s % 4 ? 0.6 : 1));
    metal(at(bar, 12), 0.35, { pan: 0.3 });
  } else if (bar === 21) {
    // the deliberate pause under "You stay in control": no kick, a held root, a clock
    bassNote(at(bar), 16 * STEP * 0.98, rootN, 0.75, { cut: 180, peak: 300, grit: 0.15 });
    for (let s = 0; s < 16; s += 4) metal(at(bar, s), 0.32, { pan: 0, f: 2900, decay: 0.01 });
    for (let s = 2; s < 16; s += 4) hat(at(bar, s), 0.2, { decay: 0.012 });
  } else if (bar === 22) {
    // rebuild, tighter
    K(0); K(4); K(8); K(12); K(14, 0.6); K(15, 0.7);
    Sn(12, 0.8);
    for (let s = 0; s < 16; s += 2) B(s, 1.6, s % 4 === 2 ? rootN + 12 : rootN, 0.9, { peak: 1300 });
    hats16(bar, 0.6);
  } else if (bar >= 23 && bar <= 24) {
    // the final climb
    const v = bar - 22;
    for (const s of [0, 4, 8, 12]) if (at(bar, s) < fr(2385)) K(s, 1);
    if (v < 2) K(10, 0.6);
    Sn(4, 0.85); Sn(12, 0.9);
    const step = bar === 24 ? 1 : 2;
    for (let s = 0; s < 16; s += step) if (at(bar, s) < fr(2385)) B(s, step * 0.9, s % 4 === 2 ? rootN + 12 : rootN, 0.85 + v * 0.05, { peak: 1300 + v * 400 });
    hats16(bar, 0.62 + v * 0.05, 0, bar === 24 ? 13 : 16);
    if (bar === 23) for (const s of [12, 13, 14, 15]) Sn(s, 0.4 + (s - 12) * 0.1, { tail: 0.05 });
    if (bar === 24) {
      // a roll that accelerates into the vacuum
      let tt = at(bar, 4);
      let gap = STEP * 2;
      while (tt < fr(2384)) {
        snare(tt, 0.3 + 0.5 * ((tt - at(bar, 4)) / (fr(2384) - at(bar, 4))), { tail: 0.04, rev: 0.08 });
        tt += gap;
        gap = Math.max(STEP / 2, gap * 0.86);
      }
    }
  } else if (bar === 25) {
    // the rhythm recedes under the announcement
    K(8, 0.6, { duck: 0.3 });
    for (let s = 2; s < 16; s += 2) hat(at(bar, s), 0.3 * (s % 4 ? 0.6 : 1));
    bassNote(at(bar), 16 * STEP, 38, 0.55, { cut: 200, peak: 300, grit: 0.12, decay: 0.8 });
  } else if (bar === 26) {
    K(0, 0.45, { duck: 0.2 });
    for (let s = 4; s < 16; s += 4) hat(at(bar, s), 0.2);
    metal(at(bar, 8), 0.3, { pan: 0.2, f: 2900 });
  }
}

for (let bar = 3; bar <= 24; bar++) barProgramme(bar);

/* ---- headline accent (evidence, 544 → film 444) and the answer (600 → film 500) ---- */
kick(fr(544), 0.6, { f0: 110, f1: 44, ad: 0.2, click: 0.3, duck: 0.3 });
riser(560, 600, 0.22);
bell(fr(600), 74, 0.9, { pan: -0.15, decay: 1.6 }); // D5
bell(fr(600), 81, 0.6, { pan: 0.2, decay: 1.4 }); // A5 — the insight dyad
pad(fr(600), fr(700), [62, 69, 74, 76], 0.07, 2600, { att: 0.02, rel: 0.6, rev: 0.5 });

/* ---- the final climb and the vacuum ---- */
riser(2300, 2385, 0.45);
sweep(2340, 2398, { from: 900, to: 4800, vel: 0.28, panFrom: 0.7, panTo: 0, q: 1.0, shape: "rise", rev: 0.1 });

/* ---- UI and transition sounds, on the film's real cuts (old frames; fr() shifts them) ---- */
sweep(262, 280, { from: 2400, to: 900, vel: 0.16, panFrom: -0.3, panTo: 0.5, q: 1.4 });
click(321, 0.5, { pitch: 0.9, pan: -0.2 });
click(352, 0.5, { pitch: 1.0, pan: 0.2 });
sweep(388, 401, { from: 900, to: 5000, vel: 0.3, panFrom: 0, panTo: 0, q: 1.2, shape: "rise" });

// 01 Ask — the question lifts out of the phone, is sent, the work, the answer
sweep(402, 424, { from: 700, to: 3800, vel: 0.24, panFrom: -0.6, panTo: 0.3, q: 1.2, shape: "arc" });
click(478, 0.85, { pitch: 1.15 }); // send (the recording's own)
sweep(478, 498, { from: 1200, to: 5200, vel: 0.2, panFrom: 0.2, panTo: 0.2, shape: "arc" });
tick(488, 0.4, 1.2);
[616, 628, 642, 652].forEach((f, i) => tick(f, 0.45, 1.1 + i * 0.08, 0.1));
click(690, 0.45, { pitch: 1.4 });
sweep(702, 722, { from: 900, to: 4200, vel: 0.22, panFrom: 0, panTo: 0, shape: "arc" });
thunk(722, 0.4);

// chapter wipes (lime bar, right → left)
for (const f of [750, 1050, 1350, 1900, 2160]) sweep(f, f + 15, { from: 5200, to: 1400, vel: 0.36, panFrom: 0.8, panTo: -0.8, q: 1.3, shape: "arc" });

// 02 Capital
thunk(766, 0.45);
[772, 784, 797, 809].forEach((f, i) => tick(f, 0.6, 1 + i * 0.12, -0.3 + i * 0.2));
sweep(900, 918, { from: 2600, to: 900, vel: 0.2, panFrom: 0.4, panTo: -0.4 });
thunk(936, 0.45); thunk(952, 0.4);

// 03 Signals
thunk(1086, 0.5);
sweep(1130, 1146, { from: 1500, to: 5000, vel: 0.2, panFrom: 0, panTo: 0, shape: "arc" });
[1164, 1176, 1188, 1200].forEach((f, i) => tick(f, 0.5, 1.05 + i * 0.07, -0.4));
sweep(1234, 1262, { from: 700, to: 2600, vel: 0.18, panFrom: -0.3, panTo: -0.3 });
click(1266, 0.45);

// 04 Research
thunk(1384, 0.5); thunk(1394, 0.4);
sweep(1416, 1440, { from: 1000, to: 3600, vel: 0.22, panFrom: -0.2, panTo: 0.6 });
sweep(1460, 1478, { from: 3600, to: 900, vel: 0.2, panFrom: 0, panTo: 0 });
thunk(1494, 0.5);
riser(1490, 1552, 0.12); tick(1552, 0.5, 1.4);
sweep(1554, 1574, { from: 900, to: 4000, vel: 0.22, panFrom: 0.7, panTo: 0.1 });
[1576, 1583, 1590].forEach((f, i) => tick(f, 0.5, 1.1 + i * 0.1, 0.4));
for (const f of [1598, 1638, 1675, 1713, 1750, 1788]) sweep(f, f + 14, { from: 3200, to: 1000, vel: 0.22, panFrom: 0.7, panTo: -0.5, q: 1.4 });
[1612, 1650, 1687, 1725, 1762, 1800].forEach((f, i) => tick(f, 0.55, 1.0 + i * 0.06, 0.2));
sweep(1834, 1856, { from: 800, to: 4400, vel: 0.26, panFrom: 0, panTo: 0, shape: "arc" });
thunk(1858, 0.5);

// 05 Wallet
thunk(1938, 0.5);
tick(1950, 0.5, 1.3); tick(1972, 0.45, 1.3);
sweep(1988, 2006, { from: 3600, to: 900, vel: 0.2, panFrom: 0, panTo: 0 });
[2030, 2044, 2058].forEach((f) => thunk(f, 0.42));
sweep(2066, 2088, { from: 1200, to: 4600, vel: 0.14, panFrom: -0.4, panTo: 0.4, shape: "rise" });

// 06 Alerts
thunk(2196, 0.5); click(2204, 0.45);
sweep(2250, 2270, { from: 2600, to: 900, vel: 0.2, panFrom: 0.3, panTo: -0.3 });
thunk(2272, 0.45);
sweep(2326, 2344, { from: 3600, to: 900, vel: 0.18, panFrom: -0.2, panTo: 0.6 });

/* ---- the vacuum (2386–2400 → film 2286–2300): the build stops dead, tails included ---- */
function muteFrom(st, f, fade = 0.004) {
  const a = idx(fr(f)), F = Math.round(fade * SR);
  for (let i = a; i < N; i++) {
    const g = i < a + F ? 1 - (i - a) / F : 0;
    st[0][i] *= g; st[1][i] *= g;
  }
}
for (const st of [...Object.values(STEMS), REV_A, DLY_A]) muteFrom(st, 2386);
REV = REV_B;
DLY = DLY_B;

for (let bar = 25; bar <= 27; bar++) barProgramme(bar);
/* ---- the launch (2400 → film 2300) ---- */
kick(at(25), 1.3, { f0: 135, f1: 38, ad: 0.6, len: 1.0, drive: 2.0, duck: 0.6 });
subDrop(at(25), 1.0, { f0: 74, f1: 36.7, glide: 0.4, decay: 1.5, len: 3.2 }); // lands on D1
noiseBurst(at(25), 1.4, 0.24, 3200, STEMS.hits, 0.6);
pad(at(25), fr(2640), CH.D, 0.2, 1900, { att: 0.02, rel: 0.9, rev: 0.45 }); // the resolving D major
pad(at(25), fr(2640), [66, 69, 76], 0.06, 3200, { att: 0.25, rel: 0.9, rev: 0.6 }); // add9 shimmer
bell(at(25), 74, 1.0, { pan: -0.12, decay: 1.8, rev: 0.38 }); // signature, note one: D5
bell(at(25, 4), 81, 0.95, { pan: 0.18, decay: 2.2, rev: 0.42 }); // note two, one beat later: A5
bell(at(26, 8), 81, 0.25, { pan: 0.3, decay: 1.6, rev: 0.5, dly: 0.3 }); // a faint echo of the motif

/* ============================================================ mixdown ===== */

// sidechain: bass fully, pads and arp lightly
for (let i = 0; i < N; i++) {
  const d = duck[i];
  STEMS.bass[0][i] *= d; STEMS.bass[1][i] *= d;
  const m = 1 - (1 - d) * 0.4;
  STEMS.music[0][i] *= m; STEMS.music[1][i] *= m;
}

// the opening bar is narrow: fold drums and music toward mono before the impact (film 100)
const wide = (i) => Math.min(1, Math.max(0, (i - idx(fr(96))) / idx(fr(8))));
for (const st of [STEMS.drums, STEMS.music]) {
  for (let i = 0; i < idx(fr(104)); i++) {
    const w = 0.15 + 0.85 * wide(i);
    const mid = (st[0][i] + st[1][i]) / 2, side = (st[0][i] - st[1][i]) / 2;
    st[0][i] = mid + side * w; st[1][i] = mid - side * w;
  }
}

// returns
const returns = (rev, dly) => [pingpong(dly[0], dly[1], { time: STEP * 3, feedback: 0.36, tone: 3000 }), freeverb(rev[0], rev[1], { room: 0.86, damp: 0.35 })];
const [[dlA, drA], [rlA, rrA]] = returns(REV_A, DLY_A);
const [[dlB, drB], [rlB, rrB]] = returns(REV_B, DLY_B);
const cutA = idx(fr(2386));
const fadeA = (i) => (i < cutA ? 1 : Math.max(0, 1 - (i - cutA) / Math.round(0.004 * SR)));
const dl = dlA.map((v, i) => v * fadeA(i) + dlB[i]), dr = drA.map((v, i) => v * fadeA(i) + drB[i]);
const rl = rlA.map((v, i) => v * fadeA(i) + rlB[i]), rr = rrA.map((v, i) => v * fadeA(i) + rrB[i]);
const hpR = [new Biquad().set("hp", 220, 0.7), new Biquad().set("hp", 220, 0.7)];
for (let i = 0; i < N; i++) {
  STEMS.music[0][i] += dl[i] * 0.55 + hpR[0].run(rl[i]) * 0.9;
  STEMS.music[1][i] += dr[i] * 0.55 + hpR[1].run(rr[i]) * 0.9;
}

// stem levels
const LEVEL = { drums: db(-3), bass: db(-6.5), music: db(-1.0), hits: db(-3), ui: db(-6) };
for (const [k, st] of Object.entries(STEMS)) for (const ch of st) for (let i = 0; i < N; i++) ch[i] *= LEVEL[k];

// the vacuum before the announcement: everything but the riser's tail drops out
function gainRamp(st, f0, f1, g, fade = 0.003) {
  const a = idx(fr(f0)), b = idx(fr(f1)), F = Math.round(fade * SR);
  for (let i = a - F; i < b + F; i++) {
    if (i < 0 || i >= N) continue;
    let w = 1;
    if (i < a) w = (i - (a - F)) / F; else if (i >= b) w = 1 - (i - b) / F;
    const gg = 1 - (1 - g) * w;
    st[0][i] *= gg; st[1][i] *= gg;
  }
}
// the breath before the hardware reveal (film frames)
gainRamp(STEMS.drums, 77, 99.5, 0.0);
gainRamp(STEMS.bass, 78, 99.5, 0.15, 0.02);

// natural ending: a gentle fade over the last 0.3 s so nothing is truncated
for (const st of Object.values(STEMS)) {
  const a = N - Math.round(0.3 * SR);
  for (let i = a; i < N; i++) { const g = Math.cos(((i - a) / (N - a)) * Math.PI / 2) ** 2; st[0][i] *= g; st[1][i] *= g; }
}

function sum(keys) {
  const L = new Float32Array(N), R = new Float32Array(N);
  for (const k of keys) for (let i = 0; i < N; i++) { L[i] += STEMS[k][0][i]; R[i] += STEMS[k][1][i]; }
  return [L, R];
}

/* ---- master: tone, glue, loudness, true-peak ceiling ---- */
function master(mix, gainDb) {
  const L = Float32Array.from(mix[0]), R = Float32Array.from(mix[1]);
  const eq = [
    [new Biquad().set("hp", 28, 0.7), new Biquad().set("hp", 28, 0.7)],
    [new Biquad().set("lowshelf", 120, 0.7, -2), new Biquad().set("lowshelf", 120, 0.7, -2)],
    [new Biquad().set("peak", 300, 0.9, -1.5), new Biquad().set("peak", 300, 0.9, -1.5)],
    [new Biquad().set("peak", 2600, 0.8, 1.5), new Biquad().set("peak", 2600, 0.8, 1.5)],
    [new Biquad().set("highshelf", 8000, 0.7, 2), new Biquad().set("highshelf", 8000, 0.7, 2)],
    [new Biquad().set("lp", 18000, 0.7), new Biquad().set("lp", 18000, 0.7)],
  ];
  const g = db(gainDb);
  for (let i = 0; i < N; i++) {
    let l = L[i], r = R[i];
    for (const [a, b] of eq) { l = a.run(l); r = b.run(r); }
    L[i] = l * g; R[i] = r * g;
  }
  compress([L, R], { threshold: -12, ratio: 2.2, attack: 0.012, release: 0.16, knee: 6 });
  // −3 dBTP leaves room for AAC overshoot: the delivered encode must stay under −1 dBTP
  limit([L, R], { ceilingDb: -3.0, lookahead: 0.0025, release: 0.09 });
  return [L, R];
}

function parse(text) {
  const tail = text.slice(text.lastIndexOf("Summary"));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1]);
  const LRA = Number(/LRA:\s+(-?[\d.]+) LU/.exec(tail)?.[1]);
  return { I, TP, LRA };
}
/** Integrated loudness and true peak, measured by ffmpeg's EBU R128 meter. */
function measureWav(pair) {
  const tmp = path.join(STEM_DIR, "_measure.wav");
  writeWav(tmp, pair, fs);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  fs.unlinkSync(tmp);
  return parse(r.stderr);
}

const premix = sum(["drums", "bass", "music", "hits", "ui"]);
let gain = 0;
let final = master(premix, gain);
let m = measureWav(final);
for (let iter = 0; iter < 4 && Math.abs(m.I + 14) > 0.15; iter++) {
  gain += -14 - m.I;
  final = master(premix, gain);
  m = measureWav(final);
}
console.log(`master: ${m.I.toFixed(1)} LUFS integrated, ${m.TP.toFixed(1)} dBTP, LRA ${m.LRA.toFixed(1)} LU (pre-gain ${gain.toFixed(1)} dB)`);

writeWav(path.join(OUT_DIR, "elyra-launch-mix.wav"), final, fs);

// stems at the master's gain (pre-glue, pre-limiter) so they sum close to the master
const g = db(gain);
const scaled = (pair) => [pair[0].map((v) => v * g), pair[1].map((v) => v * g)];
writeWav(path.join(STEM_DIR, "stem-drums.wav"), scaled(STEMS.drums), fs);
writeWav(path.join(STEM_DIR, "stem-bass.wav"), scaled(STEMS.bass), fs);
writeWav(path.join(STEM_DIR, "stem-music.wav"), scaled(STEMS.music), fs);
writeWav(path.join(STEM_DIR, "stem-hits.wav"), scaled(STEMS.hits), fs);
writeWav(path.join(STEM_DIR, "stem-ui-sfx.wav"), scaled(STEMS.ui), fs);
// a music-replaceable bed: the film's hits and UI sounds without the score
const fx = master(sum(["hits", "ui"]), gain);
writeWav(path.join(STEM_DIR, "fx-only-master-gain.wav"), fx, fs);
// and the score without the film's sounds
const scoreOnly = master(sum(["drums", "bass", "music"]), gain);
writeWav(path.join(STEM_DIR, "score-only-master-gain.wav"), scoreOnly, fs);
console.log("wrote public/audio/elyra-launch-mix.wav and out/stems/*.wav");
