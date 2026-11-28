# Elyra: paper trading launch film (Remotion project)

The editable source for `output/paper-trading/elyra-paper-trading-1080p.mp4`:
**1920 × 1080, 60 fps, exactly 2,000 frames (33.333 s), H.264 High + stereo
AAC 48 kHz, −14.3 LUFS.** Made for posting natively on X.
`output/paper-trading/poster-1080p.png` is a thumbnail frame ("Trade $100,000.
Risk $0.").

It stands alone, like the other films in `marketing/`. The only file it reads
from the app is `lib/tokens.ts`, so the film uses the product's real colours.
It is authored at 1280 × 720 and rendered with `--scale=1.5`, so the type and
the vectors are drawn at full 1080p resolution.

## Commands

```bash
cd marketing/paper-trading
npm install
npm run studio      # preview and scrub
npm run audio       # re-synthesise the score → public/audio/paper-trading-mix.wav (≈10 s)
npm run render      # silent 1080p master, then scripts/finalize.sh muxes the AAC (≈7 min)
npm run typecheck
```

The 3200 × 1800 captures are slow to decode at 1.5x. If a render stops with
a frame timeout, add `--timeout=120000` to the `remotion render` command.

## The cut (60 fps, 144 BPM, one bar = 100 frames)

| Frames | Scene | Source |
|---|---|---|
| 0–200 | Trade $100,000. Risk $0. | type |
| 200–500 | Live → Paper → claim $100,000 → the paper band | three captures of one session, pointer and camera |
| 500–600 | Real prices, real costs | the chart's ticket on the paper account |
| 600–700 | The fill report | the ticket after a paper market order |
| 700–800 | Market or limit, exits attached | the limit ticket with the chart's prices |
| 800–900 | 33 markets | `PERP_MARKETS` in `lib/autotrade/rules.ts`, drawn |
| 900–1000 | Position controls | Automation's Trades card |
| 1000–1100 | Paper trade analysis | Automation's analysis card |
| 1100–1200 | Rules start on paper | Automation's Rules card |
| 1200–1300 | Two accounts, one switch | the header's switch, drawn at 4x |
| 1300–1400 | The balance is the trades | the paper account dialog |
| 1400–1500 | Reset | the reset confirmation |
| 1500–1700 | Everything, ticked off | type over the paper workspace |
| 1700–2000 | End card | the claim, emblem, wordmark, getelyra.xyz |

## What is real

The screens are the website at `main` (667b3ef72), built locally and captured
headless at 1600 × 900 CSS pixels, 2x, on 28 November 2026. Nothing in a
capture is repainted. The chart (TradingView), the prices (Pyth, Hyperliquid)
and Hyperliquid's order book are live. The account behind them is a demo:

- sign-in is faked in the local build only (`capture/patch_site.py`);
- the paper account, its positions, its closed trades and the rules are
  stand-in data in the app's own response shapes (`capture/mocks.mjs`), priced
  from Hyperliquid's live mids;
- the analysis card is the app's own `analysePaperTrades` run over those
  closed trades (`capture/analysis.json`). It has 10 trades, a 50% win rate
  and the small-sample warning showing.

The end card says "demo account shown". Every feature named is in the code:
the claim and reset (`app/api/paper`), fills at Hyperliquid's prices with
`PAPER_COSTS` (0.045% taker fee, 0.05% slippage), TP/SL on every entry
(`validateMarketOrder`), partial closes and moved exits
(`PositionControls`), the signal card's Paper trade (`SignalsWidget`), voice
orders defaulting to paper (`lib/voice`), and new rules and AI funds born on
paper.

To shoot again, see `capture/`: copy the repo to a scratch folder, run
`patch_site.py` on the copy, `source env_site.sh`, run `next build --webpack`
and `next start`, then `node capture.mjs <url> <outDir> flow,trading,automation,cards`
with `playwright-core`. `env_site.sh` reads the Pyth key from `.env.local`
and never prints it.

The score (`audio/score.mjs`) is original. It is synthesised in code with no
samples, using the update film's instruments and master chain, and every hit
lands on this cut's frames.
