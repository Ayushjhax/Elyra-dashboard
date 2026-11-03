// DSP building blocks for the launch cue. Plain JavaScript, no dependencies,
// deterministic (seeded noise), 48 kHz float.

export const SR = 48000;

/** mulberry32 — seeded, so every render of the score is identical. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export const db = (d) => Math.pow(10, d / 20);

export function stereo(n) {
  return [new Float32Array(n), new Float32Array(n)];
}

/** equal-power pan, p in [-1, 1] */
export function pan(p) {
  const a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** RBJ biquad. Coefficients can be updated per block for sweeps. */
export class Biquad {
  constructor() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0;
  }
  set(type, f, q = 0.707, gainDb = 0) {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = (2 * Math.PI * f) / SR;
    const cs = Math.cos(w), sn = Math.sin(w);
    const alpha = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lp") {
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
    } else if (type === "hp") {
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
    } else if (type === "bp") {
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
    } else if (type === "peak") {
      const A = Math.pow(10, gainDb / 40);
      b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
    } else if (type === "lowshelf" || type === "highshelf") {
      const A = Math.pow(10, gainDb / 40);
      const s2 = 2 * Math.sqrt(A) * alpha;
      if (type === "lowshelf") {
        b0 = A * ((A + 1) - (A - 1) * cs + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s2);
        a0 = (A + 1) + (A - 1) * cs + s2; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s2;
      } else {
        b0 = A * ((A + 1) + (A - 1) * cs + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s2);
        a0 = (A + 1) - (A - 1) * cs + s2; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s2;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Band-limited sawtooth (polyBLEP). */
export class Saw {
  constructor(phase = 0) { this.p = phase; }
  run(f) {
    const dt = f / SR;
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    let v = 2 * this.p - 1;
    v -= blep(this.p, dt);
    return v;
  }
}
export class Square {
  constructor(phase = 0) { this.p = phase; }
  run(f) {
    const dt = f / SR;
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    let v = this.p < 0.5 ? 1 : -1;
    v += blep(this.p, dt);
    v -= blep((this.p + 0.5) % 1, dt);
    return v;
  }
}
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Freeverb (Jezar), stereo, tuned for 48 kHz. */
export function freeverb(inL, inR, { room = 0.84, damp = 0.32, width = 1 } = {}) {
  const k = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * k));
  const apT = [556, 441, 341, 225].map((d) => Math.round(d * k));
  const spread = Math.round(23 * k);
  const mk = (T) => T.map((d) => ({ buf: new Float32Array(d), i: 0, store: 0 }));
  const cl = mk(combT), cr = mk(combT.map((d) => d + spread));
  const al = mk(apT), ar = mk(apT.map((d) => d + spread));
  const n = inL.length;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const comb = (c, x) => {
    const y = c.buf[c.i];
    c.store = y * d2 + c.store * d1;
    c.buf[c.i] = x + c.store * fb;
    if (++c.i >= c.buf.length) c.i = 0;
    return y;
  };
  const ap = (a, x) => {
    const b = a.buf[a.i];
    const y = -x + b;
    a.buf[a.i] = x + b * 0.5;
    if (++a.i >= a.buf.length) a.i = 0;
    return y;
  };
  const w1 = width / 2 + 0.5, w2 = (1 - width) / 2;
  for (let i = 0; i < n; i++) {
    const x = (inL[i] + inR[i]) * 0.015;
    let l = 0, r = 0;
    for (let j = 0; j < 8; j++) { l += comb(cl[j], x); r += comb(cr[j], x); }
    for (let j = 0; j < 4; j++) { l = ap(al[j], l); r = ap(ar[j], r); }
    outL[i] = l * w1 + r * w2;
    outR[i] = r * w1 + l * w2;
  }
  return [outL, outR];
}

/** Stereo ping-pong delay with a darkening loop. */
export function pingpong(inL, inR, { time, feedback = 0.38, tone = 3200 } = {}) {
  const d = Math.round(time * SR);
  const n = inL.length;
  const bl = new Float32Array(d), br = new Float32Array(d);
  const lpL = new Biquad().set("lp", tone, 0.6), lpR = new Biquad().set("lp", tone, 0.6);
  const outL = new Float32Array(n), outR = new Float32Array(n);
  let i = 0;
  for (let s = 0; s < n; s++) {
    const yl = bl[i], yr = br[i];
    outL[s] = yl; outR[s] = yr;
    bl[i] = (inL[s] + inR[s]) * 0.5 + lpR.run(yr) * feedback;
    br[i] = lpL.run(yl) * feedback;
    if (++i >= d) i = 0;
  }
  return [outL, outR];
}

/** Feed-forward compressor on a stereo pair (linked), in place. */
export function compress([L, R], { threshold = -16, ratio = 2.5, attack = 0.01, release = 0.15, makeup = 0, knee = 6 } = {}) {
  const ga = Math.exp(-1 / (attack * SR)), gr = Math.exp(-1 / (release * SR));
  let env = 0;
  const mk = db(makeup);
  for (let i = 0; i < L.length; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    env = x > env ? ga * env + (1 - ga) * x : gr * env + (1 - gr) * x;
    const lev = 20 * Math.log10(env + 1e-9);
    let over = lev - threshold;
    let red = 0;
    if (over > knee / 2) red = over * (1 - 1 / ratio);
    else if (over > -knee / 2) red = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    const g = db(-red) * mk;
    L[i] *= g; R[i] *= g;
  }
}

/** Look-ahead peak limiter with 4x-interpolated true-peak detection, in place. */
export function limit([L, R], { ceilingDb = -1.2, lookahead = 0.002, release = 0.08 } = {}) {
  const c = db(ceilingDb);
  const la = Math.round(lookahead * SR);
  const n = L.length;
  // per-sample required gain from a true-peak estimate: 4x polyphase
  // windowed-sinc interpolation, as an EBU R128 / BS.1770 meter does
  const TAPS = 12;
  const phases = [0.25, 0.5, 0.75].map((t) => {
    const w = [];
    for (let j = -TAPS + 1; j <= TAPS; j++) {
      const x = j - t;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      w.push(sinc * (0.5 + 0.5 * Math.cos((Math.PI * x) / TAPS)));
    }
    return w;
  });
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (p > c * 0.7 && i >= TAPS && i < n - TAPS) {
      for (const w of phases) {
        let sl = 0, sr = 0;
        for (let j = 0; j < w.length; j++) { const q = i - TAPS + 1 + j; sl += L[q] * w[j]; sr += R[q] * w[j]; }
        p = Math.max(p, Math.abs(sl), Math.abs(sr));
      }
    }
    need[i] = p > c ? c / p : 1;
  }
  // h[i] = min(need[i .. i+la]) — the gain each sample must already have
  const h = new Float32Array(n);
  const dq = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[head] > i + la) head++;
    h[i] = need[dq[head]];
  }
  // release: gain may only rise slowly
  const rel = Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = h[i] < g ? h[i] : rel * g + (1 - rel) * h[i];
    if (g > h[i]) g = h[i];
    h[i] = g;
  }
  // attack: a box average over the look-ahead keeps every gain change continuous;
  // each peak's window holds only values at or below its own requirement
  const gain = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += h[i];
    if (i >= la) acc -= h[i - la];
    gain[i] = Math.min(h[i], acc / Math.min(i + 1, la));
  }
  for (let i = 0; i < n; i++) { L[i] *= gain[i]; R[i] *= gain[i]; }
}
/** 24-bit PCM stereo WAV. */
export function writeWav(file, [L, R], fs) {
  const n = L.length;
  const data = Buffer.alloc(n * 6);
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < 2; ch++) {
      let v = (ch === 0 ? L : R)[i];
      v = Math.max(-1, Math.min(1, v));
      const s = Math.round(v * 8388607);
      const o = i * 6 + ch * 3;
      data[o] = s & 0xff; data[o + 1] = (s >> 8) & 0xff; data[o + 2] = (s >> 16) & 0xff;
    }
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 6, 28); h.writeUInt16LE(6, 32); h.writeUInt16LE(24, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
