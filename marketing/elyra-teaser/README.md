# Elyra — 20-second mobile teaser (Remotion project)

The editable source for `output/teaser-20s/elyra-teaser-20s-16x9.mp4`:
**1920 × 1080, 60 fps, exactly 1,200 frames (20.000 s), H.264 + stereo AAC.**

This is a standalone project. It is not part of the Next app or the Expo app.
The root `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts` and
`.vercelignore` exclude `marketing/`. It reads one file from the app,
`lib/tokens.ts`, so the film always uses the product's real colour values.

## Commands

```bash
cd marketing/elyra-teaser
npm install                 # Remotion 4.0.539, React 19, lucide-react
npm run studio              # live preview / scrubbing in Remotion Studio
npm run render              # → ../../output/teaser-20s/elyra-teaser-20s-16x9.mp4, then scripts/finalize.sh
npm run render:4k           # optional 3840×2160 master (--scale=2; every layer is vector or ≥1200 px)
npm run audio               # re-synthesise the soundtrack (Python, see below); --parts writes component stems
npm run qc                  # specs, exact frame count, R128 loudness/true peak, frames pulled from the encode
npm run stills              # delivery stills + contact sheet from the final encode
node scripts/stills.mjs 0 330 1100        # quick stills straight from the composition, to out/stills
python3 -I scripts/contact.py OUT.png 4 out/stills/*.png   # contact sheet
python3 -I audio/analyze.py public/audio/elyra-teaser-mix.wav out/audio.png  # audio QC
```

`scripts/finalize.sh` keeps Remotion's video stream untouched and muxes AAC
encoded straight from the 24-bit master, trimmed to exactly 20.000 s (AAC
frame padding otherwise leaves the container at about 20.011 s).

If Chrome Headless Shell cannot be downloaded, point Remotion at a local one:
`export REMOTION_BROWSER=/path/to/chrome-headless-shell`. `remotion.config.ts`
and `scripts/stills.mjs` both read this variable.

The audio script needs Python 3 with `numpy scipy soundfile pyloudnorm`.

## Where things live

| Path | What it holds |
|---|---|
| `src/config/timeline.json` | **Frame authority.** Scene ranges, copy, and every audio-visual cue (beat = 25 frames, bar = 100). `audio/synth.py` reads the same file, so moving a cue moves its sound. |
| `src/config/data.ts` | The one **illustrative** account (balances, allocation, perp, swap, strategy). Every reconstructed screen reads it. |
| `src/theme.ts` | Product colours imported from `lib/tokens.ts`. The only local values are the film's: handset hardware and light. |
| `src/camera.ts` | One persistent handset from frame 100 to 1199. Its placement is a keyframed track. Keys are written as "this screen point goes to this frame point", which makes match cuts exact. |
| `src/components/` | `Device` (Seeker-style handset, dp screen, `dpToFilm`), `DirBlur` (velocity-based directional motion blur), `Type` (kinetic headline, labels, disclosures), `Backdrop` (forest base, olive falloff, grain, vignette). |
| `src/screens/` | Interface rebuilt in dp from the Seeker captures: `ui.tsx` (shell, tabs, tab bar, agent rail, chips), `AskScreen`, `PortfolioScreen`, `FeedScreen`, `SwapScreen`, `StrategyScreen`. |
| `src/scenes/` | `S1Markets` (market field, hero candle → rail), `TypeMatch` ("Markets / move." → "Move with / clarity."), `Overlays` (headlines, montage labels, rail → cap-marker match, venue planes, lockup). |
| `audio/synth.py` | The original soundtrack and SFX, synthesised from oscillators and noise. It is mastered to −14 LUFS integrated, ≤ −1 dBTP. |
| `public/` | Local fonts, the real capture, the emblem, grain tiles and the mastered mix. Nothing loads from the network at render time. |

## Replacing assets

- **Soundtrack.** Replace `public/audio/elyra-teaser-mix.wav` with a 48 kHz
  stereo WAV. It must be exactly 20.000 s and start on the downbeat at sample
  0. Re-render. The film plays the file as delivered, with no fade.
- **Device footage.** `public/captures/01-ask-elyra.png` is the real Seeker
  capture (1200 × 2670) used in scenes 2 and 7. Any 1200 × 2670 capture drops
  in. `CaptureScreen` sizes it to the 412 × 917 dp screen, so the aspect ratio
  is always native.
- **Illustrative figures.** Edit `src/config/data.ts`.
- **Copy and timing.** Edit `src/config/timeline.json` (copy, cues).
  Headline line breaks are in `src/scenes/Overlays.tsx` and `TypeMatch.tsx`.
- **Emblem.** `public/brand/elyra-emblem.png` is a copy of
  `mobile/assets/images/elyra-emblem.png`. It is never recoloured, rotated or
  given effects.

## What is real, what is illustrative, what is a concept

- **Real device footage:** `01-ask-elyra.png`, captured over ADB from a Solana
  Seeker running `xyz.getelyra.app` 1.0.1. Its market figures are historical.
  It appears in scenes 2 and 7.
- **Reconstructed interface, illustrative data:** scenes 3–6a. The layouts,
  type roles, colours and copy come from the captures and `mobile/src`. The
  figures are invented, and the film labels them on screen ("Illustrative
  account data", "Illustrative data", "Illustrative · no transaction was
  made").
- **Product vision (concept, not a released feature):** scene 6b, frames
  900–999. This is the strategy builder: a goal, a risk condition, a what-if
  allocation and a rebalance ready for review. It carries a "Product vision"
  label and the line "A concept, not a released feature".
- No transaction was built, signed or sent for this film. The film makes no
  claims about customers, performance, returns, partners or a launch date.

## Transition grammar

| Cut | Match |
|---|---|
| 99 → 100 | The market field collapses into the handset. One sage **candle** becomes the real capture's **agent rail**, landing on its exact pixels (x 16.5 dp, y 163.6–677.4 dp). |
| 89 → 113 | Type match. "move." rises one line as "Markets" exits and becomes "Move" of "Move with / clarity.". |
| 186 → 200 | The camera pushes into the handset, from the capture to the Capital tab. |
| 388 → 412 | The **agent rail** lifts off the brief and becomes a full-height line. That line lands as the **25% cap marker** on the allocation bar (the allocation boundary). |
| 402 → 450 | Four venue planes (wallet, Hyperliquid, Binance, Kamino) converge into their rows. They lock at 412, 425, 437 and 450, each with an alignment click. |
| 600 / 650 / 700 / 750 | Scroll whips that land on the beat: signals, smart money, research, alerts. |
| 792 → 810 | The alert pulls back to the swap review, which slides up as a native sheet. |
| 892 → 901 | The review **card** pushes left. The **strategy card** (product vision) pushes in. |
| 988 → 1000 | The app header's emblem and wordmark lift out of the phone and become the logo lockup. |
