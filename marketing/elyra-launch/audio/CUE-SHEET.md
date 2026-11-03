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
| 1–2 | 0–200 | 0.000–3.333 | Hook: chart macro, "LOOK PAST THE PRICE." | Dry transient on frame 0 (kick, metal, noise). D drone with an eighth-note tremolo that deepens. Beat pulse from beat 2. Tight 16th ticks that rise. Narrow (near-mono) image. |
| 2 (end) | 176–200 | 2.933–3.333 | Back on the price tag, then the pull-out | Drums out at 177 (the breath). Rising swell 176–200, then a directional sweep 184–200 for the pull-out. |
| 3–4 | 200–400 | 3.333–6.667 | Reveal one: the handset | **Hardware impact on frame 200**: kick, sub drop (80 → 32 Hz) and noise. The stereo image opens. A controlled groove from beat 3 of bar 3. Dm pad enters. |
| 5–7 | 400–700 | 6.667–11.667 | Ask: question, working, answer | Breakbeat groove. The arpeggio enters. Snare backbeat. Low accent at 472 (headline). **Withdrawal 550–600**: kick, bass and arpeggio leave; a riser runs 560–600. **Insight tone on frame 600**: a D5 + A5 FM bell dyad with a bright pad. The groove resumes lightly. |
| 8–10 | 700–1000 | 11.667–16.667 | Capital | Deeper harmonic bed: Bb – Gm – A, pad an octave lower and darker. The groove continues, with no second drop. Fill at the end of bar 10. |
| 11–12 | 1000–1200 | 16.667–20.000 | Signals / smart money | Syncopation: 3-3-2 kicks, offbeat claps, metallic percussion in the gaps. |
| 13–18 | 1200–1800 | 20.000–30.000 | Research | The strongest sustained drive: rolling 16th bass, a full break with ghost notes, open hats on the offbeats. The arpeggio filter opens bar by bar. Fills at bars 14, 16 and 18. |
| 19–21 | 1800–2100 | 30.000–35.000 | Prepare your move | Bar 19 reduces to kick on 1 and 3, eighth hats, no snare. **Bar 20 (1900–2000) is the pause**: no kick, a held G, a metallic clock. Bar 21 rebuilds tighter, four on the floor with a kick roll. |
| 22–24 | 2100–2400 | 35.000–40.000 | Set the condition → handset returns | The final climb: four on the floor, the bass moves to 16ths in bar 24, a snare roll accelerates, a riser runs 2300–2385. **Vacuum 2386–2400**: everything stops, reverb and delay tails included. |
| 25–27 | 2400–2700 | 40.000–45.000 | "Live on Solana dApp Store" | **Launch impact on frame 2400**: kick, sub drop landing on D1, noise, and a D major (add 9) chord. **Signature: D5 on 2400, A5 on 2425**, a rising fifth on the bell (the insight dyad from frame 600, played as a melody), with a faint echo at 2550. The rhythm recedes over bars 25–26. The pad releases from 2640, and a 0.3 s fade ends in silence at 45.000. |

## Sync points (frame-accurate, measured on the master)

| Frame | Time (s) | Event | Measured |
|---|---|---|---|
| 0 | 0.000 | First transient | −9 dBFS RMS in frame 0 |
| 200 | 3.333 | Hardware impact (the handset lands) | −31 dB at 199 → −10 dB at 200 |
| 452 | 7.533 | UI click: Send | — |
| 600 | 10.000 | Insight tone (the answer appears; source frame 1369) | −27 dB at 599 → −10 dB at 600 |
| 692–706 | 11.53–11.77 | Whip: the lime rail becomes Capital's tab underline | — |
| 738 / 750 / 763 / 775 | 12.30–12.92 | Pitched ticks: brackets on Portfolio, Positions, Activity, Memory | — |
| 1078–1096 | 17.97–18.27 | Whip into smart money, thunk as the slab settles | — |
| 1362 | 22.700 | Whip: the chart's fall → the backtest trace | — |
| 1590 / 1625 / 1658 / 1688 | 26.50–28.13 | Tab ticks: Market recap, Signals, Yield, Unlocks | — |
| 2100 | 35.000 | Click: "Set an alert" → "Set alert" | — |
| 2386–2400 | 39.767–40.000 | Vacuum | below −100 dB from 2390 |
| 2400 | 40.000 | Launch impact and signature | −9 dB at 2400 |

Every other UI click, tick and sweep is listed with its frame in the
"UI and transition sounds" block of `audio/score.mjs`.

## Master

- 48 kHz, 24-bit stereo WAV, exactly 2,160,000 samples (45.000 s). The first
  downbeat is at sample 0.
- Measured on the delivered AAC: **−13.9 LUFS integrated, −1.9 dBTP**, LRA
  4.8 LU. The WAV is limited at −3 dBTP so that the AAC encode, which
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
