# Elyra — 45-second launch film (Remotion project)

The editable source for `output/launch-video-45s/elyra-launch-45s-16x9.mp4`:
**1920 × 1080, 60 fps, exactly 2,700 frames (45.000 s), H.264 High +
stereo AAC 48 kHz.**

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
  trimmed to exactly 45.000 s.
- Concurrency is 4 (`remotion.config.ts`). Six Chrome tabs ran out of
  headroom on the 13-inch machine. The webpack cache is disabled to save
  ≈230 MB of disk.
- Everything is local: fonts in `public/fonts`, footage in `public/footage`,
  stills in `public/stills`, brand assets in `public/brand`. Nothing loads
  from the network at render time.

## Where things live

| Path | What it holds |
|---|---|
| `src/Film.tsx` | The scene list and frame ranges. The audio element is for Studio and previews only. |
| `src/scenes/*.tsx` | One file per act, written in **absolute film frames**: `Opening` (0–400), `Ask` (400–764), `CapitalV2`, `SignalsV2`, `ResearchV2`, `WalletAlerts` (Wallet and Alerts), `Launch`. Every card rectangle, camera key and label is in these files. |
| `src/components/Card.tsx` | A crop of a real capture staged as a 3D card (`Stage` gives a shared perspective). It supports top-down and left-right reveals and overlays in card coordinates. |
| `src/components/Chapter.tsx` | The chapter marker and progress line, and `LimeWipe`, the transition between chapters. |
| `src/components/Shot.tsx` | A window onto one captured source (used by the opening). Camera keys say which source point sits at the window's centre and at what uniform scale. Sources are never stretched. |
| `src/components/Device.tsx` | The Seeker-style handset, at the capture's own pixel geometry (1200 × 2670 screen), sized in output pixels so the footage stays sharp under 3D. `deviceMap` projects a screen point to the frame, which anchors labels to real controls. |
| `src/components/Type.tsx` | `Headline` (used for the four headline events only), `Label` (small anchored copy with a leader line), `Brackets`. |
| `src/lib/motion.ts` | Eases (including the brand's own `cubic-bezier(0.2, 0, 0, 1)`), log-scale camera interpolation, keyed tracks. Everything is a pure function of the frame. |
| `src/lib/frame.ts` | `useAbsFrame()` — the film frame inside any Shot's `<Sequence>`. |
| `audio/score.mjs`, `audio/dsp.mjs` | The temporary score and all sound design, synthesised in code. `audio/CUE-SHEET.md` lists the cue map and the replacement spec. |
| `scripts/` | `prepare-stills.sh`, `finalize.sh`, `qc.sh`, `deliver-stills.sh`, `stills.mjs`. |
| `public/footage/` | Conformed 60 fps edit copies of the Seeker recordings (1200 × 2520). |

## The cut

| Frames | Time | Sequence | Composition |
|---|---|---|---|
| 0–200 | 0.00–3.33 | Hook | Extreme macro inside the real SOL chart, drifting toward the live price. **LOOK PAST THE PRICE.** Hard-cut accents: funding extremes, largest open interest, the Pyth provenance line. |
| 200–400 | 3.33–6.67 | Reveal one | The same image pulls out, without a cut, into the handset, which lands on 200. **A terminal. In your hand.** Native stack pop to Ask; the attach sheet and "/" shortcuts, labelled at the real controls. |
| 400–764 | 6.67–12.73 | 01 Ask Elyra | The question lifts out of the phone's composer as a card and is sent on the recording's own send (478). "Elyra is working…". **Intelligence. With evidence.** as the work recedes. The real answer flies forward on 600 and reveals bullet by bullet, held to read. Its sources lift out: "Sources come from the tools it used." |
| 750–1064 | 12.5–17.7 | 02 Capital | "Your capital. In context." beside the four real context tiles, landing on eighths with a lime pulse on each checked box. "Read-only, by design." with the real read-only and Connections copy. |
| 1050–1364 | 17.5–22.7 | 03 Signals | "A quiet market is a signal, too." as a large card. Smart-money consensus: the real table cascades in, and the HYPE row expands into entry, mark and wallets, with share-of-value semantics anchored to the 100%. |
| 1350–1914 | 22.5–31.9 | 04 Research | Reports: the NVIDIA header and scorecard, with the PDF cover sliding out. Backtests: a lime cursor traces the real equity curve (`src/lib/equity-curve.json`). Compare: three strategy cards and the app's "no winner" caveat. A 3D carousel of the other six tools, each named large. A wall of all eight: "Eight research tools. One tab." |
| 1900–2174 | 31.7–36.2 | 05 Wallet | "Prepare your move." over the real action row. "You stay in control." beside the three real steps, with a lime underline drawn under "Nothing is sent until your wallet signs." |
| 2160–2346 | 36.0–39.1 | 06 Alerts | "Set the condition." beside the real SOL alert form. "Tells you. Never trades." beside its inbox-only delivery note. |
| 2340–2400 | 39.0–40.0 | Return | The handset flies back in, into the silence before the announcement. |
| 2400–2700 | 40.00–45.00 | Reveal three | **Live on Solana dApp Store** · the handset · emblem and wordmark · the unmodified badge · getelyra.xyz. |

The middle is built from **cards**: one real region of a capture, lifted out
and staged in 3D at a size that reads (40–60 px text at 1080p), held long
enough to read. Chapters 02–06 enter behind a lime bar sweeping right to
left (the agent rail, made graphic). A chapter marker with a six-segment
progress line sits top-left from 400 to 2346.

## Replacing assets

- **Score**: see `audio/CUE-SHEET.md`. Drop a 45.000 s, 48 kHz stereo WAV at
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
