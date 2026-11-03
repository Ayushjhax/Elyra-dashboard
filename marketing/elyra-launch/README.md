# Elyra — 45-second launch film (Remotion project)

The editable source for `output/launch-video-45s/elyra-launch-45s-16x9.mp4`:
**1920 × 1080, 60 fps, exactly 2,600 frames (43.333 s), H.264 High +
stereo AAC 48 kHz.** (The folder and file keep their `45s` names from the
first cuts; see "Revision 4" below.)

This project stands alone. It is not part of the Next app, the Expo app or
the 20-second teaser (`marketing/elyra-teaser`), which it does not import.
The root `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts` and
`.vercelignore` already exclude `marketing/`. The only file it reads from the
app is `lib/tokens.ts`, so the film always uses the product's real colours.

## Commands

```bash
cd marketing/elyra-launch
npm install                      # Remotion 4.0.540, React 19.2, TypeScript 5.9 (exact versions)
npm run studio                   # live preview and scrubbing in Remotion Studio
npm run preview                  # 960×540 motion preview with sound → out/preview-540p.mp4 (≈1 min)
npm run audio                    # re-render the score and stems (Node only, ≈5 s) → public/audio, out/stems
npm run render                   # silent 1080p60 master, then scripts/finalize.sh muxes the AAC (≈5 min)
npm run qc                       # specs, exact frame count, R128 loudness/true peak, black frames, frames from the encode
npm run stills                   # review stills straight from the composition → out/stills (+ contact.jpg)
bash scripts/deliver-stills.sh   # delivery stills and contact sheet from the encode → output/launch-video-45s/
bash scripts/prepare-stills.sh   # rebuild public/stills from the Seeker captures (crops and privacy blurs)
npm run typecheck
```

- `npm run render` renders with `--props='{"withAudio":false}'`. The
  `<Audio>` element is only there for Studio and previews. The delivered
  audio is muxed by `scripts/finalize.sh` straight from the 24-bit WAV and
  trimmed to exactly 43.333 s.
- Concurrency is 4 (`remotion.config.ts`). Six Chrome tabs ran out of
  headroom on the 13-inch machine. The webpack cache is disabled to save
  ≈230 MB of disk.
- Everything is local: fonts in `public/fonts`, footage in `public/footage`,
  stills in `public/stills`, brand assets in `public/brand`. Nothing loads
  from the network at render time.

## Where things live

| Path | What it holds |
|---|---|
| `src/Film.tsx` | The scene list and frame ranges. Every scene after the opening is mounted inside `<Sequence from={-TRIM}>` (`TRIM` = 100), which plays it one bar earlier. The audio element is for Studio and previews only. |
| `src/scenes/*.tsx` | One file per act. `Opening` is written in **film frames** (0–300). `Ask` (400–764), `CapitalV2`, `SignalsV2`, `ResearchV2`, `WalletAlerts` (Wallet and Alerts) and `Launch` are written in **scene frames**, the frames of the 2,700-frame cut: film frame = scene frame − 100. Every card rectangle, camera key and label is in these files. |
| `src/components/Card.tsx` | A crop of a real capture staged as a 3D card (`Stage` gives a shared perspective). It supports top-down and left-right reveals and overlays in card coordinates. |
| `src/components/Chapter.tsx` | The chapter marker and progress line, and `LimeWipe`, the transition between chapters. |
| `src/components/Shot.tsx` | A window onto one captured source (used by the opening). Camera keys say which source point sits at the window's centre and at what uniform scale. Sources are never stretched. |
| `src/components/Device.tsx` | The Seeker-style handset, at the capture's own pixel geometry (1200 × 2670 screen), sized in output pixels so the footage stays sharp under 3D. `deviceMap` projects a screen point to the frame, which anchors labels to real controls. |
| `src/components/Type.tsx` | `Headline` (used for the four headline events only), `Label` (small anchored copy with a leader line), `Brackets`. |
| `src/lib/motion.ts` | Eases (including the brand's own `cubic-bezier(0.2, 0, 0, 1)`), log-scale camera interpolation, keyed tracks. Everything is a pure function of the frame. |
| `src/lib/frame.ts` | `useAbsFrame()` — the scene's own frame inside any Shot's `<Sequence>` (the film frame in `Opening`, the scene frame everywhere else). |
| `audio/score.mjs`, `audio/dsp.mjs` | The temporary score and all sound design, synthesised in code. `audio/CUE-SHEET.md` lists the cue map and the replacement spec. |
| `scripts/` | `prepare-stills.sh`, `finalize.sh`, `qc.sh`, `deliver-stills.sh`, `stills.mjs`. |
| `public/footage/` | Conformed 60 fps edit copies of the Seeker recordings (1200 × 2520). |

## The cut

Film frames. Scene frames (in `src/scenes/` after the opening) are 100 higher.

| Frames | Time | Sequence | Composition |
|---|---|---|---|
| 0–100 | 0.00–1.67 | Hook | Extreme macro inside the real SOL chart, drifting toward the live price. **LOOK PAST THE PRICE.** |
| 100–300 | 1.67–5.00 | Reveal one | From 84 the same image pulls out, without a cut, into the handset, which lands on 100 with the bass impact. **A terminal. In your hand.** Native stack pop to Ask; the attach sheet and "/" shortcuts, labelled at the real controls. |
| 300–664 | 5.00–11.07 | 01 Ask Elyra | The question lifts out of the phone's composer as a card and is sent on the recording's own send (378). "Elyra is working…". **Intelligence. With evidence.** as the work recedes. The real answer flies forward on 500 and reveals bullet by bullet, held to read. Its sources lift out: "Sources come from the tools it used." |
| 650–964 | 10.8–16.1 | 02 Capital | "Your capital. In context." beside the four real context tiles, landing on eighths with a lime pulse on each checked box. "Read-only, by design." with the real read-only and Connections copy. |
| 950–1264 | 15.8–21.1 | 03 Signals | "A quiet market is a signal, too." as a large card. Smart-money consensus: the real table cascades in, and the HYPE row expands into entry, mark and wallets, with share-of-value semantics anchored to the 100%. |
| 1250–1814 | 20.8–30.2 | 04 Research | Reports: the NVIDIA header and scorecard, with the PDF cover sliding out. Backtests: a lime cursor traces the real equity curve (`src/lib/equity-curve.json`). Compare: three strategy cards and the app's "no winner" caveat. A 3D carousel of the other six tools, each named large. A wall of all eight: "Eight research tools. One tab." |
| 1800–2074 | 30.0–34.6 | 05 Wallet | "Prepare your move." over the real action row. "You stay in control." beside the three real steps, with a lime underline drawn under "Nothing is sent until your wallet signs." |
| 2060–2246 | 34.3–37.4 | 06 Alerts | "Set the condition." beside the real SOL alert form. "Tells you. Never trades." beside its inbox-only delivery note. |
| 2240–2300 | 37.3–38.3 | Return | The handset flies back in, into the silence before the announcement. |
| 2300–2600 | 38.33–43.33 | Reveal three | **Live on Solana dApp Store** · the handset · emblem and wordmark · the unmodified badge · getelyra.xyz. |

The middle is built from **cards**: one real region of a capture, lifted out
and staged in 3D at a size that reads (40–60 px text at 1080p), held long
enough to read. Chapters 02–06 enter behind a lime bar sweeping right to
left (the agent rail, made graphic). A chapter marker with a six-segment
progress line sits top-left from 300 to 2246.

### Revision 4 — the opening trimmed by one bar

The opening's three hard-cut inserts (funding extremes, largest open
interest, the Pyth line) and the tight hold on the price tag are gone: the
client found them confusing, and they delayed the hook's payoff. "LOOK PAST
THE PRICE." now pulls straight out into the handset. Exactly one bar (100
frames at 144 BPM) was removed, so the film stays on the grid: 2,700 → 2,600
frames, 45.000 → 43.333 s. The phone and the impact land on 100 (was 200),
the answer on 500 (was 600) and the announcement on 2300 (was 2400), which
still holds for the final 300 frames.

Everything from old frame 200 onward is unchanged and plays 100 frames
earlier — picture (rendered stills at film frames 300, 500, 1400, 2290,
2300 and 2599 are pixel-identical to the old cut 100 frames later) and score. Only
`Opening` was re-timed; the other scenes keep their frame numbers and are
offset in `Film.tsx`. The score does the same with `fr()` and `at()` in
`audio/score.mjs`.

## Replacing assets

- **Score**: see `audio/CUE-SHEET.md`. Drop a 43.333 s, 48 kHz stereo WAV at
  `public/audio/elyra-launch-mix.wav` and run `npm run render`.
- **Footage**: `public/footage/*.mp4` must stay 1200 × 2520 at 60 fps. Conform
  new Seeker recordings with
  `ffmpeg -i in.mp4 -map 0:v:0 -vf "fps=60,crop=1200:2520:0:96,setsar=1" -c:v libx264 -crf 14 -pix_fmt yuv420p -an out.mp4`.
- **Stills**: edit `scripts/prepare-stills.sh`. It is the only place stills
  are cropped or blurred.
- **Badge and emblem**: `public/brand/dapp.png` and `public/brand/elyra-emblem.png`
  are byte-identical copies of `mobile/assets/dapp.png` and
  `mobile/assets/images/elyra-emblem.png`. They are drawn at uniform scale,
  with no filter, tint, crop or effect.

## What is real

Every frame of product UI is the Elyra Android app (`xyz.getelyra.app` 1.0.1)
on a Solana Seeker, captured over ADB on 4 November 2026. Nothing is rebuilt,
generated or repainted. See `output/launch-video-45s/DELIVERY.md` for the
coverage table, the filming log, the privacy blurs and the licence notes.
