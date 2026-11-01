# Elyra 20-second teaser — deliverables, assets and licences

## Deliverables

| File | What it is |
|---|---|
| `elyra-teaser-20s-16x9.mp4` | The film: 1920 × 1080, 60 fps, 1,200 frames (20.000 s), H.264 High, yuv420p, BT.709, stereo AAC 48 kHz |
| `stills/` | 13 stills across the seven scenes, plus both sides of the three signature cuts (99/100, 399/412, 999/1000). Every still is pulled from the final encode |
| `contact-sheet.jpg` | The scene stills on one sheet, labelled by frame |
| `stems/music.wav`, `stems/sfx.wav` | Music and SFX stems, 24-bit / 48 kHz, at mix level before the limiter |
| `stems/percussion.wav` | The percussion bus alone (kick, clap, hats, ticks), dry, at mix level |
| `stems/mix.wav` | The mastered mix (identical to the film's audio before AAC encoding) |
| `stems/loudness.json` | The master's measured integrated loudness and true peak |
| `../../marketing/elyra-teaser/` | Editable Remotion source. Its README has the preview, render and replacement steps |

## Assets used

| Asset | Source | Licence / status |
|---|---|---|
| Ask Elyra screen | `captures/01-ask-elyra.png`, real ADB capture from a Solana Seeker running `xyz.getelyra.app` 1.0.1 | Elyra's own product UI. The market figures are historical, captured live and not current claims |
| Gold emblem | `mobile/assets/images/elyra-emblem.png` | Elyra's own mark. Used unaltered: no recolour, rotation or effect |
| Fustat (variable, Latin) | `app/fonts/Fustat-Latin-Variable.woff2` | SIL Open Font License 1.1 |
| General Sans 400/500/600 | `mobile/assets/fonts/GeneralSans-*.otf` | ITF Free Font License, used unmodified (see `docs/THIRD_PARTY.md`) |
| DM Serif Display | `mobile/assets/fonts/DMSerifDisplay-Regular.ttf` | SIL Open Font License 1.1 |
| Interface icons | `lucide-react` 1.x, the same set the app uses through `lucide-react-native` | ISC |
| Handset | Drawn in CSS: a generic slim Android body with a centred punch-hole camera. Not a photo or a trademark asset | Original |
| Film grain | Six noise tiles generated with a fixed seed (144) | Original |
| Soundtrack and SFX | `marketing/elyra-teaser/audio/synth.py`. Every sound is synthesised from oscillators and noise, with no samples, loops or third-party audio | Original. See "Audio status" below |

The other Seeker captures (`00`, `02`–`07`) were layout references only. None
appears as footage, so no TradingView chart footage, and no chart
attribution, is in the film.

## Illustrative data and concept graphics

The reconstructed screens in scenes 3–6 (frames 200–899) show one invented
account (`marketing/elyra-teaser/src/config/data.ts`):

- $48,260 across a Solana wallet, Hyperliquid, Binance and Kamino
- SOL at 41% against a saved 25% cap
- a SOL-PERP long 3× at $94.20 with liquidation at $77.30 (18% headroom)
- a JUP unlock
- funding rates, smart-money wallets, a backtest curve, a price alert
- a prepared 80 SOL → 7,536.8 USDC swap

Each shot is labelled on screen. The backtest card shows no return figures
and is tagged "Hypothetical results". No transaction was built, signed or
sent.

**Product vision.** Frames 900–999 show a concept, not a released feature: a
conversational strategy builder with a risk condition, a what-if allocation
and a rebalance ready for review. They carry a "Product vision" label and
the line "A concept, not a released feature". Today the app's automation is
price alerts, its exchange and prediction-market connections are read-only,
and swaps need the person's own signature. The film's copy keeps all three
true ("A rule tells you. It never trades.", "Exchanges are read-only",
"Nothing is sent until your wallet signs it.").

The film makes no claims about customers, performance, returns, partners,
store badges or a launch date.

## Audio status

No music-generation tool or cleared library track was available in this
environment. The soundtrack is an **original cue synthesised locally**. Its
structure is complete:

- 144 BPM, 12 bars, locked to the frame grid
- impact at 0, bass reveal at 1.667 s, full groove at 3.333 s
- added weight at 6.667 s, top-end rhythm at 10 s, crescendo
- the kick drops for the last half-beat before the logo
- resolved A-major chord and a two-note E→A signature at 16.667 s
- a natural tail to silence at 20.000 s

It is mastered to −14 LUFS integrated with a true peak of −1.3 dBTP.

It is a well-structured synthesised scratch, not a produced record. A
composer or a generated and cleared cue would add sound-design depth and
mix polish that oscillator synthesis cannot. To replace it, drop a 20.000 s,
48 kHz stereo WAV at `marketing/elyra-teaser/public/audio/elyra-teaser-mix.wav`
and re-render. The sync points to hit are in `src/config/timeline.json`.
