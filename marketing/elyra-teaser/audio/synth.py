"""
Elyra teaser — original scratch soundtrack and sound design, synthesised locally.

Everything here is generated from oscillators and noise: no samples, no
loops, no third-party audio, so the result is original and cleared by
construction. It follows the film's grid exactly — 144 BPM, 4/4, one beat =
25 frames = 20,000 samples at 48 kHz, 12 bars = 960,000 samples = 20.000 s —
and reads every sync point from src/config/timeline.json, so moving a cue in
the film moves its sound.

Outputs (24-bit / 48 kHz stereo WAV):
  public/audio/elyra-teaser-mix.wav          mastered mix used by the render
  ../../output/teaser-20s/stems/music.wav    music stem (pre-master, mix level)
  ../../output/teaser-20s/stems/sfx.wav      SFX stem   (pre-master, mix level)
  ../../output/teaser-20s/stems/mix.wav      copy of the master

Run:  python3 audio/synth.py        (needs numpy, scipy, soundfile, pyloudnorm)
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TL = json.load(open(os.path.join(ROOT, "src", "config", "timeline.json")))

SR = 48000
FPS = TL["fps"]
SPF = SR // FPS  # samples per frame = 800
BEAT = TL["beatFrames"] * SPF  # 20000
BAR = BEAT * 4
N = TL["totalFrames"] * SPF  # 960000
CUE = TL["cues"]

assert BEAT == round(SR * 60 / TL["bpm"]), "beat grid and BPM disagree"

rng = np.random.default_rng(144)


def fs(frame: float) -> int:
    """Frame (may be fractional) → sample index."""
    return int(round(frame * SPF))


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def buf() -> np.ndarray:
    return np.zeros((N, 2))


def place(dst: np.ndarray, x: np.ndarray, at: int, gain: float = 1.0, pan: float = 0.0) -> None:
    """Add mono or stereo x into dst at sample `at` (clipped to the film)."""
    if x.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], axis=1)
    if at >= N:
        return
    if at < 0:
        x = x[-at:]
        at = 0
    end = min(N, at + len(x))
    dst[at:end] += x[: end - at] * gain


def t_(n: int) -> np.ndarray:
    return np.arange(n) / SR


def exp_env(n: int, decay: float, attack: float = 0.002) -> np.ndarray:
    t = t_(n)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    return a * np.exp(-t / decay)


def sos(kind: str, fc, order: int = 2):
    return signal.butter(order, fc, kind, fs=SR, output="sos")


def filt(x: np.ndarray, kind: str, fc, order: int = 2) -> np.ndarray:
    return signal.sosfilt(sos(kind, fc, order), x, axis=0)


def sweep_lp(x: np.ndarray, fc_curve: np.ndarray, block: int = 256, q_order: int = 2) -> np.ndarray:
    """Time-varying low-pass: block-wise biquads with carried state."""
    y = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        fc = float(np.clip(fc_curve[min(i, len(fc_curve) - 1)], 30, SR * 0.45))
        s = sos("low", fc, q_order)
        if zi is None or zi.shape[0] != s.shape[0]:
            zi = np.zeros((s.shape[0], 2) + x.shape[1:])
        y[i : i + block], zi = signal.sosfilt(s, x[i : i + block], axis=0, zi=zi)
    return y


def saw(f: float, n: int, detune_cents: float = 0.0, phase: float = 0.0) -> np.ndarray:
    """Band-limited saw by additive synthesis (no aliasing)."""
    f = f * 2 ** (detune_cents / 1200)
    t = t_(n)
    k_max = int(min(48, (SR * 0.42) // f))
    out = np.zeros(n)
    for k in range(1, k_max + 1):
        out += ((-1) ** (k + 1)) * np.sin(2 * np.pi * k * f * t + phase * k) / k
    return out * (2 / np.pi)


def sine(f, n, phase=0.0) -> np.ndarray:
    return np.sin(2 * np.pi * f * t_(n) + phase)


def noise(n: int) -> np.ndarray:
    return rng.standard_normal(n)


def make_ir(seconds: float, damp_hz: float, seed: int) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_(n)
    ir = r.standard_normal((n, 2)) * np.exp(-t / (seconds / 6.5))[:, None]
    ir = filt(ir, "low", damp_hz)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt(np.sum(ir**2) / 2)


def reverb(x: np.ndarray, ir: np.ndarray, mix: float) -> np.ndarray:
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x * (1 - mix) + wet * mix


# --------------------------------------------------------------------------
# Harmony: minor-key tension that opens into a resolved A major at bar 11.
# --------------------------------------------------------------------------

ROOTS = [33, 33, 33, 29, 33, 31, 33, 29, 31, 28, 33, 33]  # A A A F A G A F G E | A A
CHORDS = {
    33: [57, 60, 64, 67, 71],  # Am9
    29: [53, 57, 60, 64, 67],  # Fmaj9
    31: [55, 59, 62, 64, 69],  # G6/9
    28: [52, 56, 59, 62, 65],  # E7(b9)
}
FINAL = [45, 52, 57, 61, 64, 71]  # A major add9 — the brand chord


def bar_of(sample: int) -> int:
    return min(11, sample // BAR)


# --------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------


def kick(vel=1.0) -> np.ndarray:
    n = int(0.34 * SR)
    t = t_(n)
    f = 46 + 110 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.16)
    click = filt(noise(n), "high", 2500) * np.exp(-t / 0.0025) * 0.35
    k = np.tanh((body + click) * 1.6) * 0.9
    return k * vel


def clap() -> np.ndarray:
    n = int(0.25 * SR)
    t = t_(n)
    nz = filt(noise(n), "band", [900, 2600])
    env = np.zeros(n)
    for d in (0.0, 0.009, 0.018):
        i = int(d * SR)
        env[i:] += np.exp(-(t[: n - i]) / (0.006 if d < 0.018 else 0.09))
    return nz * env * 0.5


def hat(open_=False, bright=1.0) -> np.ndarray:
    n = int((0.22 if open_ else 0.05) * SR)
    t = t_(n)
    metal = np.zeros(n)
    for f in (3150, 4620, 5340, 6870, 8110, 9470):
        metal += signal.square(2 * np.pi * f * bright * t)
    x = filt(metal * 0.18 + noise(n) * 0.8, "high", 7000)
    return x * np.exp(-t / (0.07 if open_ else 0.012)) * 0.32


def tick(f=4200.0, dur=0.018, level=0.35) -> np.ndarray:
    n = int(dur * SR)
    t = t_(n)
    return (np.sin(2 * np.pi * f * t) * 0.35 + filt(noise(n), "high", 5000) * 0.65) * np.exp(-t / (dur / 5)) * level


def bass_note(m: float, dur: float, cutoff: float, vel=1.0) -> np.ndarray:
    n = int(dur * SR)
    f = midi(m)
    x = saw(f, n) * 0.6 + saw(f, n, 7) * 0.4
    env = exp_env(n, dur * 0.7, 0.003)
    fc = cutoff * (1 + 2.2 * np.exp(-t_(n) / 0.03))
    y = sweep_lp(x * env, fc, block=128)
    sub = np.sin(2 * np.pi * f / 2 * t_(n)) * exp_env(n, dur * 0.9, 0.004) * 0.55
    return (np.tanh(y * 1.4) * 0.7 + sub) * vel


def pluck(m: float, dur: float, cutoff: float, vel=1.0) -> np.ndarray:
    n = int(dur * SR)
    f = midi(m)
    x = saw(f, n) * 0.55 + signal.square(2 * np.pi * f * t_(n), 0.32) * 0.18 + saw(f, n, -9) * 0.3
    fc = cutoff * (0.25 + 1.6 * np.exp(-t_(n) / 0.045))
    y = sweep_lp(x, fc, block=64)
    return y * exp_env(n, dur * 0.45, 0.002) * vel


def pad_chord(notes, n: int, cutoff_curve: np.ndarray, attack=0.35) -> np.ndarray:
    out = np.zeros((n, 2))
    for i, m in enumerate(notes):
        f = midi(m)
        l = saw(f, n, -6 - i) + saw(f, n, 4 + i) * 0.7
        r = saw(f, n, 6 + i) + saw(f, n, -4 - i) * 0.7
        out[:, 0] += l
        out[:, 1] += r
    out /= len(notes) * 1.6
    out = sweep_lp(out, cutoff_curve, block=512)
    t = t_(n)
    env = np.clip(t / attack, 0, 1)
    return out * env[:, None]


def bell(m: float, dur: float, level=0.4) -> np.ndarray:
    n = int(dur * SR)
    f = midi(m)
    t = t_(n)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 1.4 * np.exp(-t / 0.18)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (dur * 0.32))
    x += np.sin(2 * np.pi * f * 2 * t) * 0.25 * np.exp(-t / (dur * 0.12))
    a = np.clip(t / 0.003, 0, 1)
    return x * a * level


def thump(f0=55.0, dur=1.2, level=1.0) -> np.ndarray:
    n = int(dur * SR)
    t = t_(n)
    f = f0 + 60 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.35))
    air = filt(noise(n), "low", 900) * np.exp(-t / 0.06) * 0.35
    return np.tanh((body + air) * 1.3) * level


def air_sweep(dur: float, f_from: float, f_to: float, level=0.3, reverse=False) -> np.ndarray:
    n = int(dur * SR)
    t = t_(n)
    x = noise(n)
    fc = f_from * (f_to / f_from) ** (t / dur)
    y = sweep_lp(filt(x, "high", 300), fc, block=128)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2 if not reverse else (t / dur) ** 2.2
    return y * env * level


# --------------------------------------------------------------------------
# Music
# --------------------------------------------------------------------------


def compose_music():
    drums = buf()
    bass = buf()
    arp = buf()
    pad = buf()
    chord = buf()
    kick_env = np.zeros(N)

    kick_out = fs(CUE["kickOut"])  # the half-beat of air before the logo
    land = fs(CUE["brandLand"])

    # Kick: four on the floor from bar 2 (the product reveal) to the logo.
    for b in range(4, 40):  # beats 4..39
        at = b * BEAT
        if at >= kick_out:
            continue
        vel = 0.92 if b < 8 else 1.0
        k = kick(vel)
        place(drums, k, at, 0.95)
        e = np.exp(-t_(len(k)) / 0.11)
        end = min(N, at + len(e))
        kick_env[at:end] = np.maximum(kick_env[at:end], e[: end - at])
    # One soft kick under the brand impact, then percussion recedes.
    place(drums, kick(0.8), land, 0.9)

    # Clap on 2 and 4 from bar 3; dry and restrained.
    for b in range(8, 40):
        if b % 4 in (1, 3):
            place(drums, clap(), b * BEAT, 0.42, pan=0.05)

    # Hats: 8th offbeats from bar 3, 16ths from bar 7 (the montage), opens in 9–10.
    for s16 in range(0, 48 * 4):
        at = s16 * BEAT // 4
        if at >= kick_out and at < land:
            continue
        beat, sub = divmod(s16, 4)
        bar = beat // 4
        if bar >= 2 and bar < 10 and sub == 2:
            place(drums, hat(False), at, 0.5, pan=0.25)
        if bar >= 6 and bar < 10 and sub in (1, 3):
            place(drums, hat(False, 1.12), at, 0.22 + 0.04 * (bar - 6), pan=-0.3)
        if bar in (8, 9) and sub == 2 and beat % 2 == 1:
            place(drums, hat(True), at, 0.2, pan=0.15)
        if bar == 10 and sub == 2 and beat < 42:  # thinning out after the logo
            place(drums, hat(False), at, 0.32 * (1 - (beat - 40) / 2.5), pan=0.25)
    # Fine metallic ticks in the montage (bars 7–8), on syncopated 16ths.
    for bar in (6, 7):
        for s in (3, 6, 11, 14):
            place(drums, tick(5200, 0.012, 0.22), bar * BAR + s * BEAT // 4, 1.0, pan=0.45 if s % 2 else -0.45)

    # Bar 1: the filtered pulse (16ths on A, filter slowly opening) and two ticks.
    for s in range(16):
        at = s * BEAT // 4
        cutoff = 220 + 18 * s
        place(bass, bass_note(33 + (12 if s % 4 == 2 else 0), 0.11, cutoff, 0.55 + 0.02 * s), at, 0.55)

    # Bar 2: the deep bass arrival — a held A with audible upper harmonics.
    arrival = bass_note(33, 1.6, 420, 1.0)
    place(bass, arrival, BAR, 0.6)

    # Bars 3–10: rolling off-beat bass (16ths 2–4 of each beat), weight grows from bar 5.
    for bar in range(2, 10):
        root = ROOTS[bar]
        for beat in range(4):
            for sub in (1, 2, 3):
                at = bar * BAR + beat * BEAT + sub * BEAT // 4
                if at >= kick_out:
                    continue
                m = root + (12 if sub == 2 and (beat % 2 == 1) else 0)
                cutoff = 360 if bar < 4 else 520 + 40 * (bar - 4)
                vel = 0.8 if sub == 1 else 0.68
                place(bass, bass_note(m, 0.1, cutoff, vel), at, 0.62)

    # Arpeggio: enters at bar 3, brighter and an octave up through the montage and the build.
    pattern = [0, 3, 6, 8, 10, 13]
    for bar in range(2, 10):
        notes = CHORDS[ROOTS[bar]]
        up = 12 if bar >= 6 else 0
        cutoff = 1500 if bar < 4 else 2000 if bar < 6 else 3200 + 400 * (bar - 6)
        steps = pattern if bar < 6 else pattern + [14, 15]
        for j, s in enumerate(steps):
            at = bar * BAR + s * BEAT // 4
            if at >= kick_out:
                continue
            m = notes[(j * 2 + bar) % len(notes)] + up
            vel = 0.85 if s in (0, 8) else 0.65
            place(arp, pluck(m, 0.22, cutoff, vel), at, 0.32, pan=-0.35 if j % 2 else 0.35)

    # Harmonic bed: from bar 5, opening through the crescendo; cut for the half-beat of air.
    for bar in range(4, 10):
        n = BAR + BEAT
        start = bar * BAR
        curve = np.full(n, 700.0)
        if bar >= 8:
            curve = np.linspace(800 + 900 * (bar - 8), 1700 + 900 * (bar - 8), n)
        p = pad_chord([m - 12 for m in CHORDS[ROOTS[bar]][:4]] + [CHORDS[ROOTS[bar]][4]], n, curve, attack=0.25)
        fade = np.ones(n)
        fade[-BEAT:] = np.linspace(1, 0, BEAT)
        if start + n > kick_out:
            cut = kick_out - start
            if 0 < cut < n:
                fade[cut:] = 0
                fade[max(0, cut - 600) : cut] *= np.linspace(1, 0, min(600, cut))
        g = 0.2 + 0.05 * max(0, bar - 7)
        place(pad, p * fade[:, None], start, g)

    # Bars 11–12: the resolved brand chord, held, decaying cleanly before 20 s.
    n = N - land
    t = t_(n)
    curve = 2600 * np.exp(-t / 2.2) + 500
    c = pad_chord(FINAL, n, curve, attack=0.01)
    env = np.exp(-t / 1.7)
    env *= np.clip((t_(n)[::-1]) / 0.35, 0, 1)  # reach silence by the last sample
    place(chord, c * env[:, None], land, 0.55)
    for i, m in enumerate(FINAL[2:]):
        place(chord, bell(m + 12, 3.2, 0.12), land + i * 90, 1.0, pan=(-0.4 + 0.25 * i))
    sub = np.sin(2 * np.pi * midi(33) * t) * np.exp(-t / 1.1) * np.clip(t / 0.004, 0, 1)
    sub *= np.clip((t[::-1]) / 0.3, 0, 1)
    place(chord, sub, land, 0.55)
    # The two-note sonic signature: E then A, an upward fourth that resolves.
    for f_, m in zip(CUE["signatureNotes"], (76, 81)):
        place(chord, bell(m, 2.2, 0.26), fs(f_), 1.0, pan=0.0)

    # The arc: focused through bars 3–4, weight in 5–6, lift in 7–8, crescendo in 9–10.
    arc = np.ones(N)
    for bar, g in enumerate([1.0, 0.8, 0.8, 0.84, 0.9, 0.93, 0.98, 1.0, 1.04, 1.1, 1.0, 1.0]):
        arc[bar * BAR : (bar + 1) * BAR] = g
    arc = np.convolve(arc, np.ones(2400) / 2400, mode="same")
    drums *= arc[:, None]
    bass *= arc[:, None]
    arp *= arc[:, None]

    # Sidechain the bed and bass to the kick.
    duck = 1 - 0.55 * kick_env
    bass *= duck[:, None]
    pad *= (1 - 0.6 * kick_env)[:, None]

    ir = make_ir(2.4, 5200, 7)
    arp_d = arp.copy()
    d = int(BEAT * 0.75)  # dotted eighth
    for k in range(1, 5):
        g = 0.38**k
        shifted = np.zeros_like(arp)
        shifted[d * k :] = arp[: N - d * k]
        if k % 2:
            shifted = shifted[:, ::-1]
        arp_d += shifted * g
    arp_d = filt(arp_d, "high", 180)
    music = drums + bass + reverb(arp_d, ir, 0.28) + reverb(pad, ir, 0.35) + reverb(chord, ir, 0.3)
    music = filt(music, "high", 24)
    stems = {"drums": drums, "bass": bass, "arp": arp_d, "pad": pad, "chord": chord}
    return music, stems


# --------------------------------------------------------------------------
# SFX — punctuation, kept under the music's line
# --------------------------------------------------------------------------


def compose_sfx():
    sfx = buf()
    ir = make_ir(1.4, 6500, 11)

    place(sfx, thump(48, 1.4, 0.9), fs(CUE["openImpact"]), 0.7)
    for f_ in CUE["openTicks"]:
        place(sfx, tick(3600, 0.02, 0.5), fs(f_), 0.7, pan=0.2)

    sw = air_sweep(0.22, 900, 7000, 0.5)
    place(sfx, sw, fs(CUE["airSweepEnd"]) - len(sw), 0.55, pan=-0.2)
    place(sfx, thump(41, 1.1, 0.7), fs(CUE["bassReveal"]), 0.5)

    # Typing texture and the send tap.
    t0, t1 = fs(CUE["typingStart"]), fs(CUE["typingEnd"])
    for i, at in enumerate(np.linspace(t0, t1, 12).astype(int)):
        place(sfx, tick(1900 + 260 * (i % 3), 0.012, 0.18), at, 0.6, pan=0.1 * ((i % 3) - 1))
    place(sfx, tick(1250, 0.035, 0.5) + np.pad(thump(180, 0.05, 0.3), (0, 0))[: int(0.035 * SR)], fs(CUE["sendTap"]), 0.55)
    for f_ in CUE["contextChecks"]:
        place(sfx, tick(2600, 0.014, 0.18), fs(f_), 0.5, pan=0.3)

    # Insight resolves: a soft, consonant tone.
    for i, m in enumerate((69, 76)):
        place(sfx, bell(m, 1.4, 0.16), fs(CUE["insightResolve"]) + i * 220, 1.0, pan=-0.15 + 0.3 * i)

    # Rail match: short directional sweep into the cut, restrained low impact on it.
    sw = air_sweep(0.18, 600, 5000, 0.45)
    place(sfx, sw, fs(CUE["railMatch"]) - len(sw), 0.5, pan=0.3)
    place(sfx, thump(52, 0.7, 0.6), fs(CUE["railMatch"]), 0.45)

    # Three alignment clicks as the planes lock.
    for i, f_ in enumerate(CUE["planeLocks"]):
        c = tick(3000 + 300 * i, 0.03, 0.55) + tick(900, 0.03, 0.25)
        place(sfx, c, fs(f_), 0.6, pan=-0.3 + 0.3 * i)

    place(sfx, air_sweep(0.14, 500, 3000, 0.25), fs(CUE["riskMacro"]) - int(0.14 * SR), 0.35)

    # Montage: four selective accents, not four whooshes.
    for i, f_ in enumerate(CUE["montage"]):
        big = i in (0, 2)
        place(sfx, tick(2400 if big else 3300, 0.04, 0.45 if big else 0.3), fs(f_), 0.6, pan=0.25 * (1 if i % 2 else -1))
        if big:
            sw = air_sweep(0.12, 1200, 6500, 0.3)
            place(sfx, sw, fs(f_) - len(sw), 0.4)

    sw = air_sweep(0.16, 700, 4500, 0.32)
    place(sfx, sw, fs(CUE["swapIn"]) - len(sw), 0.4)
    place(sfx, tick(1150, 0.04, 0.55), fs(CUE["approveTap"]), 0.6)
    place(sfx, bell(81, 0.6, 0.12), fs(CUE["approved"]), 1.0, pan=0.1)

    sw = air_sweep(0.15, 800, 5500, 0.28)
    place(sfx, sw, fs(CUE["visionIn"]) - len(sw), 0.4, pan=-0.2)
    place(sfx, tick(2900, 0.02, 0.35), fs(CUE["conditionHighlight"]), 0.6)
    for i, m in enumerate((64, 71)):
        place(sfx, bell(m, 1.0, 0.1), fs(CUE["allocationResolve"]) + i * 300, 1.0, pan=0.2 - 0.4 * i)

    # The half-beat of air: a short reverse swell into the logo, then the landing.
    k_out, land = fs(CUE["kickOut"]), fs(CUE["brandLand"])
    sw = air_sweep((land - k_out) / SR, 400, 6000, 0.35, reverse=True)
    place(sfx, sw, k_out, 0.55)
    place(sfx, thump(40, 2.6, 1.0), land, 0.8)

    return reverb(sfx, ir, 0.1)


# --------------------------------------------------------------------------
# Master
# --------------------------------------------------------------------------


def true_peak_db(x: np.ndarray) -> float:
    up = signal.resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


def limiter(x: np.ndarray, ceiling_db=-1.3, look_ms=2.0, release_ms=90.0) -> np.ndarray:
    ceil = 10 ** (ceiling_db / 20)
    up = signal.resample_poly(np.max(np.abs(x), axis=1), 4, 1)
    peak = np.maximum.reduceat(np.abs(up), np.arange(0, len(up), 4))[: len(x)]
    need = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    la = int(look_ms * SR / 1000)
    # Look-ahead minimum, then smooth release.
    need_la = _sliding_min(need, la + 1)
    g = np.empty_like(need_la)
    rel = np.exp(-1 / (release_ms * SR / 1000))
    cur = 1.0
    for i in range(len(g)):
        target = need_la[i]
        cur = target if target < cur else target + (cur - target) * rel
        g[i] = cur
    return x * g[:, None]


def _sliding_min(a: np.ndarray, w: int) -> np.ndarray:
    from scipy.ndimage import minimum_filter1d

    return minimum_filter1d(a, size=w, origin=-(w // 2))


def master(music: np.ndarray, sfx: np.ndarray):
    mix = music * 1.0 + sfx * 0.85
    meter = pyln.Meter(SR)
    target = -14.0
    gain = 1.0
    out = mix
    for _ in range(4):
        loud = meter.integrated_loudness(out)
        gain *= 10 ** ((target - loud) / 20)
        out = limiter(mix * gain)
    # Natural tail: make sure the last sample is silence (no click, no cut).
    out[-int(0.02 * SR) :] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
    return out, gain


def main() -> None:
    music, parts = compose_music()
    sfx = compose_sfx()
    mix, gain = master(music, sfx)
    meter = pyln.Meter(SR)
    report = {
        "integrated_lufs": round(meter.integrated_loudness(mix), 2),
        "true_peak_dbtp": round(true_peak_db(mix), 2),
        "samples": len(mix),
        "seconds": len(mix) / SR,
        "master_gain_db": round(20 * np.log10(gain), 2),
    }
    out_public = os.path.join(ROOT, "public", "audio")
    out_stems = os.path.join(ROOT, "..", "..", "output", "teaser-20s", "stems")
    os.makedirs(out_public, exist_ok=True)
    os.makedirs(out_stems, exist_ok=True)
    sf.write(os.path.join(out_public, "elyra-teaser-mix.wav"), mix, SR, subtype="PCM_24")
    sf.write(os.path.join(out_stems, "mix.wav"), mix, SR, subtype="PCM_24")
    # Stems at the same gain as the master (before the limiter), so music + sfx ≈ mix.
    sf.write(os.path.join(out_stems, "music.wav"), np.clip(music * gain, -1, 1), SR, subtype="PCM_24")
    sf.write(os.path.join(out_stems, "sfx.wav"), np.clip(sfx * 0.85 * gain, -1, 1), SR, subtype="PCM_24")
    json.dump(report, open(os.path.join(out_stems, "loudness.json"), "w"), indent=2)
    print(json.dumps(report, indent=2))
    if "--parts" in sys.argv:
        for k, v in parts.items():
            sf.write(os.path.join(out_stems, f"part-{k}.wav"), np.clip(v * gain, -1, 1), SR, subtype="PCM_24")


if __name__ == "__main__":
    main()
