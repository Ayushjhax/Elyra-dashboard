# Elyra launch — cue sheet

**Status: TEMPORARY CUE.** The score in `public/audio/elyra-launch-mix.wav` is
original. It was composed and synthesised in code (`audio/score.mjs`, which
uses no samples or third-party audio) because no music-generation service or
licensed library was available to this production. It follows the cue map
below exactly. It is a working score, but it is **not** the fully produced
score the brief asks for. Replace it using the specification at the bottom of
this sheet.

Grid: 144 BPM, 4/4. One beat = 25 frames (0.4167 s), one 16th = 6.25 frames,
one bar = 100 frames. 27 bars = 2,700 frames = 45.000 s. Frame `f` is at
`f / 60` seconds. Key: D minor, resolving to D major at frame 2400.

## Score sections

| Bars | Frames | Time (s) | Picture | Score |
|---|---|---|---|---|
| 1–2 | 0–200 | 0.000–3.333 | Hook: chart macro, "LOOK PAST THE PRICE." | Dry transient on frame 0 (kick, metal, noise). D drone with an eighth-note tremolo that deepens. Beat pulse from beat 2. Tight 16th ticks that rise. Narrow image. Drums out at 177 (the breath). Swell 176–200, sweep 184–200 for the pull-out. |
| 3–4 | 200–400 | 3.333–6.667 | Reveal one: the handset | **Hardware impact on 200**: kick, sub drop (80 → 32 Hz) and noise. The image opens. A controlled groove from beat 3 of bar 3. |
| 5–7 | 400–700 | 6.667–11.667 | 01 Ask: question, send (478), working, headline (544), answer (600) | Breakbeat groove; the arpeggio enters. Low accent on 544 with the headline. **Withdrawal 550–600** (kick, bass and arpeggio leave; riser). **Insight tone on 600**: a D5 + A5 bell dyad and a bright pad. Ticks on each bullet reveal. |
| 8–10 | 700–1000 | 11.667–16.667 | Answer sources → 02 Capital | A deeper harmonic bed: Bb – Gm – A, pad lower and darker. Pitched ticks as the four tiles land (772–809). |
| 11–13 | 1000–1300 | 16.667–21.667 | Read-only → 03 Signals and smart money | Syncopation: 3-3-2 kicks, offbeat claps, metal in the gaps. Ticks as the table rows land. |
| 14 | 1300–1400 | 21.667–23.333 | 04 Research wipe on 1350 | Syncopated first half, then **the drive drops on frame 1350** (step 8) with a kick and crash under the wipe. |
| 15–19 | 1400–1900 | 23.333–31.667 | Reports, Backtests, Compare, carousel, wall | The sustained drive: rolling 16th bass, a full break with ghost notes, open hats. The arpeggio opens bar by bar. Fills at bars 16, 18 and 19. Directional sweeps on each carousel turn. |
| 20 | 1900–2000 | 31.667–33.333 | 05 "Prepare your move." | Reduced: kick on 1 and 3, eighth hats, no snare. |
| 21 | 2000–2100 | 33.333–35.000 | "You stay in control." | **The pause**: no kick, a held G, a metallic clock. |
| 22 | 2100–2200 | 35.000–36.667 | Steps hold → 06 Alerts (2160) | Rebuild: tight four on the floor with a kick roll. |
| 23–24 | 2200–2400 | 36.667–40.000 | "Set the condition." → "Tells you. Never trades." → the handset returns | The final climb: the bass moves to 16ths, a snare roll accelerates, a riser runs 2300–2385. **Vacuum 2386–2400**: everything stops, tails included. |
| 25–27 | 2400–2700 | 40.000–45.000 | "Live on Solana dApp Store" | **Launch impact on 2400** and a D major (add 9) resolution. **Signature D5 on 2400, A5 on 2425**, with a faint echo at 2550. The rhythm recedes; the pad releases from 2640; a 0.3 s fade ends in silence at 45.000. |

## Sync points (frame-accurate)

| Frame | Time (s) | Event |
|---|---|---|
| 0 | 0.000 | First transient |
| 200 | 3.333 | Hardware impact (the handset lands) |
| 402–424 | 6.70–7.07 | The question lifts out of the phone |
| 478 | 7.967 | Click: Send (the recording's own send) |
| 544 | 9.067 | Headline accent |
| 600 | 10.000 | Insight tone: the answer flies in |
| 750 / 1050 / 1350 / 1900 / 2160 | — | Chapter wipes (directional sweep, right to left) |
| 772 / 784 / 797 / 809 | 12.87–13.48 | Context tiles land |
| 1350 | 22.500 | The research drive drops |
| 1490–1552 | 24.83–25.87 | Equity-curve trace (soft riser, tick at the end) |
| 1612 / 1650 / 1687 / 1725 / 1762 / 1800 | 26.9–30.0 | Carousel turns |
| 2000–2100 | 33.33–35.00 | The pause under "You stay in control" |
| 2386–2400 | 39.767–40.000 | Vacuum |
| 2400 | 40.000 | Launch impact and signature |

Every other click, tick and sweep is listed with its frame in the
"UI and transition sounds" block of `audio/score.mjs`.

## Master

- 48 kHz, 24-bit stereo WAV, exactly 2,160,000 samples (45.000 s). The first
  downbeat is at sample 0.
- Measured on the delivered AAC: **−13.9 LUFS integrated, −2.2 dBTP**. The WAV is limited at −3 dBTP so that the AAC encode, which
  overshoots on transients, stays under −1 dBTP.
- Stems (`out/stems/`, copied to `output/launch-video-45s/audio/stems/`) are
  at the master's gain, before the glue compressor and limiter: drums, bass,
  music (pads, arpeggio, reverb and delay returns), hits (impacts, the insight
  tone, the signature, risers) and UI (clicks, ticks, sweeps).
  `fx-only-master-gain.wav` is hits + UI. `score-only-master-gain.wav` is
  drums + bass + music.

## Replacing the score

1. Deliver a 48 kHz stereo WAV that is exactly 45.000 s long and starts on
   the downbeat at sample 0, at 144 BPM.
2. Land its two big moments on **frame 200 (3.333 s)** and **frame 2400
   (40.000 s)**. Hold a near-silence from 2386 to 2400. Its answer resolution
   belongs on **frame 600 (10.000 s)**.
3. Either use it alone, or lay it under `fx-only-master-gain.wav` to keep the
   film's clicks, sweeps and impacts. If you keep those, leave out the new
   score's own impacts at 200 and 2400.
4. Save it as `public/audio/elyra-launch-mix.wav`, run `npm run render`, then
   check loudness on the AAC with `npm run qc`.
