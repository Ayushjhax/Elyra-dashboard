# Elyra launch — cue sheet

**Status: TEMPORARY CUE.** The score in `public/audio/elyra-launch-mix.wav` is
original. It was composed and synthesised in code (`audio/score.mjs`, which
uses no samples or third-party audio) because no music-generation service or
licensed library was available to this production. It follows the cue map
below exactly. It is a working score, but it is **not** the fully produced
score the brief asks for. Replace it using the specification at the bottom of
this sheet.

Grid: 144 BPM, 4/4. One beat = 25 frames (0.4167 s), one 16th = 6.25 frames,
one bar = 100 frames. 26 bars = 2,600 frames = 43.333 s. Frame `f` is at
`f / 60` seconds. Key: D minor, resolving to D major at frame 2300.

Frames and bars on this sheet are film frames and film bars.
`audio/score.mjs` still writes its cues in the frames and bars of the
2,700-frame cut; its `fr()` and `at()` play everything from old frame 200
(old bar 3) one bar earlier, so subtract 100 frames, or one bar, from
anything at or after old frame 200 there.

### Revision 4

One bar was removed from the opening, with the picture's insert cuts and
price-tag hold. The hook now runs for one bar (0–100) and goes straight into
the impact, which moves from 200 to 100. Everything from old frame 200 on —
every cue, bar and tail — is unchanged and one bar earlier: the answer on 500
(was 600), the vacuum 2286–2300 (was 2386–2400), the launch on 2300 (was
2400). The opening's own material was re-fitted to the shorter bar by hand:
the drone runs to 76, the beat pulse is three hits (beats 2–4), the ticks run
steps 2–11 with their rise scaled to that span, the swell is 76–100, the
pull-out whoosh 84–101, the breath 77–99.5, and the image widens over
96–104. The three insert clicks (106 / 125 / 144) and the cut click (162)
went with the inserts.

## Score sections

| Bars | Frames | Time (s) | Picture | Score |
|---|---|---|---|---|
| 1 | 0–100 | 0.000–1.667 | Hook: chart macro, "LOOK PAST THE PRICE." | Dry transient on frame 0 (kick, metal, noise). D drone with an eighth-note tremolo that deepens. Beat pulse on beats 2–4. Tight 16th ticks that rise. Narrow image. Drums out at 77 (the breath). Swell 76–100, sweep 84–101 for the pull-out. |
| 2–3 | 100–300 | 1.667–5.000 | Reveal one: the handset | **Hardware impact on 100**: kick, sub drop (80 → 32 Hz) and noise. The image opens. A controlled groove from beat 3 of bar 2. |
| 4–6 | 300–600 | 5.000–10.000 | 01 Ask: question, send (378), working, headline (444), answer (500) | Breakbeat groove; the arpeggio enters. Low accent on 444 with the headline. **Withdrawal 450–500** (kick, bass and arpeggio leave; riser). **Insight tone on 500**: a D5 + A5 bell dyad and a bright pad. Ticks on each bullet reveal. |
| 7–9 | 600–900 | 10.000–15.000 | Answer sources → 02 Capital | A deeper harmonic bed: Bb – Gm – A, pad lower and darker. Pitched ticks as the four tiles land (672–709). |
| 10–12 | 900–1200 | 15.000–20.000 | Read-only → 03 Signals and smart money | Syncopation: 3-3-2 kicks, offbeat claps, metal in the gaps. Ticks as the table rows land. |
| 13 | 1200–1300 | 20.000–21.667 | 04 Research wipe on 1250 | Syncopated first half, then **the drive drops on frame 1250** (step 8) with a kick and crash under the wipe. |
| 14–18 | 1300–1800 | 21.667–30.000 | Reports, Backtests, Compare, carousel, wall | The sustained drive: rolling 16th bass, a full break with ghost notes, open hats. The arpeggio opens bar by bar. Fills at bars 15, 17 and 18. Directional sweeps on each carousel turn. |
| 19 | 1800–1900 | 30.000–31.667 | 05 "Prepare your move." | Reduced: kick on 1 and 3, eighth hats, no snare. |
| 20 | 1900–2000 | 31.667–33.333 | "You stay in control." | **The pause**: no kick, a held G, a metallic clock. |
| 21 | 2000–2100 | 33.333–35.000 | Steps hold → 06 Alerts (2060) | Rebuild: tight four on the floor with a kick roll. |
| 22–23 | 2100–2300 | 35.000–38.333 | "Set the condition." → "Tells you. Never trades." → the handset returns | The final climb: the bass moves to 16ths, a snare roll accelerates, a riser runs 2200–2285. **Vacuum 2286–2300**: everything stops, tails included. |
| 24–26 | 2300–2600 | 38.333–43.333 | "Live on Solana dApp Store" | **Launch impact on 2300** and a D major (add 9) resolution. **Signature D5 on 2300, A5 on 2325**, with a faint echo at 2450. The rhythm recedes; the pad releases from 2540; a 0.3 s fade ends in silence at 43.333. |

## Sync points (frame-accurate)

| Frame | Time (s) | Event |
|---|---|---|
| 0 | 0.000 | First transient |
| 84–101 | 1.40–1.68 | The pull-out (whoosh) |
| 100 | 1.667 | Hardware impact (the handset lands) |
| 302–324 | 5.03–5.40 | The question lifts out of the phone |
| 378 | 6.300 | Click: Send (the recording's own send) |
| 444 | 7.400 | Headline accent |
| 500 | 8.333 | Insight tone: the answer flies in |
| 650 / 950 / 1250 / 1800 / 2060 | — | Chapter wipes (directional sweep, right to left) |
| 672 / 684 / 697 / 709 | 11.20–11.82 | Context tiles land |
| 1250 | 20.833 | The research drive drops |
| 1390–1452 | 23.17–24.20 | Equity-curve trace (soft riser, tick at the end) |
| 1512 / 1550 / 1587 / 1625 / 1662 / 1700 | 25.2–28.3 | Carousel turns |
| 1900–2000 | 31.67–33.33 | The pause under "You stay in control" |
| 2286–2300 | 38.100–38.333 | Vacuum |
| 2300 | 38.333 | Launch impact and signature |

Every other click, tick and sweep is listed with its frame in the
"UI and transition sounds" block of `audio/score.mjs` (in old frames:
subtract 100 from those at 200 or later).

## Master

- 48 kHz, 24-bit stereo WAV, exactly 2,080,000 samples (43.333 s). The first
  downbeat is at sample 0.
- Measured on the delivered AAC: **−13.8 LUFS integrated, −1.5 dBTP**. The WAV is limited at −3 dBTP so that the AAC encode, which
  overshoots on transients, stays under −1 dBTP.
- Stems (`out/stems/`, copied to `output/launch-video-45s/audio/stems/`) are
  at the master's gain, before the glue compressor and limiter: drums, bass,
  music (pads, arpeggio, reverb and delay returns), hits (impacts, the insight
  tone, the signature, risers) and UI (clicks, ticks, sweeps).
  `fx-only-master-gain.wav` is hits + UI. `score-only-master-gain.wav` is
  drums + bass + music.

## Replacing the score

1. Deliver a 48 kHz stereo WAV that is exactly 43.333 s (2,080,000 samples)
   long and starts on the downbeat at sample 0, at 144 BPM.
2. Land its two big moments on **frame 100 (1.667 s)** and **frame 2300
   (38.333 s)**. Hold a near-silence from 2286 to 2300. Its answer resolution
   belongs on **frame 500 (8.333 s)**.
3. Either use it alone, or lay it under `fx-only-master-gain.wav` to keep the
   film's clicks, sweeps and impacts. If you keep those, leave out the new
   score's own impacts at 100 and 2300.
4. Save it as `public/audio/elyra-launch-mix.wav`, run `npm run render`, then
   check loudness on the AAC with `npm run qc`.
