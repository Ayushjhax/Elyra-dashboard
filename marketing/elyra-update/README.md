# Elyra — update film, 20 features in 8 days (Remotion project)

The editable source for `output/update-video/elyra-update-720p.mp4`:
**1280 × 720, 60 fps, exactly 2,200 frames (36.667 s), H.264 High + stereo
AAC 48 kHz, −14 LUFS, under −3 dBTP.** Made for posting natively on X.

It stands alone, like `marketing/elyra-launch` and `marketing/elyra-teaser`.
The only file it reads from the app is `lib/tokens.ts`, so the film uses the
product's real colours.

## Commands

```bash
cd marketing/elyra-update
npm install
npm run studio      # preview and scrub
npm run audio       # re-render the score → public/audio/elyra-update-mix.wav (≈5 s)
npm run render      # silent master, then scripts/finalize.sh muxes the AAC (≈4 min)
npm run typecheck
```

## The cut (60 fps, 144 BPM, one bar = 100 frames)

| Frames | Scene | Source |
|---|---|---|
| 0–200 | 20 features. 8 days. | type |
| 200–400 | ⌘K → Scout | real screen recording of the live site |
| 400–500 | Scout · smart money | real capture |
| 500–700 | The Desk | diagram: real seats and models, illustrative votes |
| 700–900 | Arena leagues | diagram: real rules, illustrative picks and scores |
| 900–1000 | Insider watch | real capture, both wallet addresses blurred |
| 1000–1100 | Sentiment | real capture |
| 1100–1200 | Tokenized stocks | real capture |
| 1200–1300 | Strategy lab | real capture |
| 1300–1400 | Copy trading | real capture |
| 1400–1500 | Agents ask. You sign. | type |
| 1500–1600 | English → 中文 | the same workspace captured in both languages |
| 1600–1900 | The twenty, the claim, silence | type over dimmed captures |
| 1900–2200 | End card | emblem, wordmark, getelyra.xyz |

## What is real

Every screen is the live website (api.getelyra.xyz), signed out, captured
headless at 2x on 25 November 2026 with Playwright and Chrome's screencast.
Nothing in a capture is repainted. The Desk and Arena leagues need a
signed-in account, so they are drawn as diagrams; their numbers are
illustrative and the Desk scene says so on screen.

"20 features. 8 days." is the repository's record: the first commit of each
feature's first file on `main`, from 18 to 25 November 2026 (the dates in
`src/scenes/Montage.tsx`).

The score (`audio/score.mjs`) is original, synthesised in code with no
samples, using the launch film's instruments and master chain.
