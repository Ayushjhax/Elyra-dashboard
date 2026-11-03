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
| `src/scenes/*.tsx` | One file per act, written in **absolute film frames**: `Opening` (0–400), `Evidence` (400–720), `Capital`, `Signals`, `Research`, `Move`, `Condition`, `Launch`. Every camera key, crop and label is in these files. |
| `src/components/Shot.tsx` | A window onto one captured source. Camera keys say which source point sits at the window's centre and at what uniform scale. Sources are never stretched. |
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
| 200–400 | 3.33–6.67 | Reveal one | The same image pulls out without a cut into the handset, which lands at 200. **A terminal. In your hand.** flanks a centred phone. Native stack pop to Ask, then the attach sheet and the "/" shortcut list, with labels anchored to the real controls. |
| 400–700 | 6.67–11.67 | Reveal two | The real question is sent (452). Working. **Intelligence. With evidence.** over the dimmed working state. A tighter shot of the work during the withdrawal. The answer lands on 600 and is held, then its Pyth · Binance sources in macro. |
| 700–1000 | 11.67–16.67 | Capital | The lime rail becomes Capital's tab underline. Brackets step across Portfolio / Positions / Activity / Memory. History → Memory. Explore your portfolio. Read-only connections. |
| 1000–1200 | 16.67–20.00 | Signals | "A quiet market is a signal, too." and what was checked. Tracked-wallet consensus contracts into a slab, with share-of-value semantics stated beside it. |
| 1200–1800 | 20.00–30.00 | Research | Report query → NVIDIA report → PDF spread. The chart's fall → backtest trace → three-way comparison. A tab underline → prediction markets. The native tab rhythm (Market recap, Signals, Yield, Unlocks). SEC filings and insider activity. |
| 1800–2100 | 30.00–35.00 | Prepare your move | Wallet action row. Actions: "You stay in control — 01 Ask · 02 Review · 03 Sign". Receive (QR top half only). The Decision brief's "Set an alert on it from the chart." |
| 2100–2400 | 35.00–40.00 | Set the condition | Cut to the real "Set alert" button, pull back into the form. Inbox and notification preferences. Account and referrals. The handset returns into the vacuum. |
| 2400–2700 | 40.00–45.00 | Reveal three | **Live on Solana dApp Store** · the handset · emblem and wordmark · the unmodified badge · getelyra.xyz. |

Four large headline events: hook, mobile reveal, evidence reveal, launch.
Everything else is the product's own text or small anchored labels.

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
