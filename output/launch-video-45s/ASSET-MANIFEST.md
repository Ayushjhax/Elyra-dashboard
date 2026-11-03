# Elyra launch production kit — captured 4 November 2026

This kit accompanies `OPUS-LAUNCH-PROMPT.md`. It contains actual phone evidence and a finished creative brief, not the new rendered launch film or a generated final soundtrack.

## Source and editing format

- Connected phone: Solana Mobile Seeker, opened through ADB.
- Installed package: `xyz.getelyra.app`, versionName `1.0.1`, versionCode `7`.
- Raw screenshots: native **1200 × 2670** PNG.
- Raw recordings in `recordings/`: native **1200 × 2670**, variable frame timing, silent screen capture. Use video stream 0; Android can add metadata tracks.
- Editing copies in `footage-60fps/`: **1200 × 2520, 60/1 fps, square pixels**, H.264/yuv420p. These preserve the source's timing, cropped 96 pixels from the top and 54 from the bottom to remove Android status icons/gesture strip. They are portrait SOURCE assets, to be composed into the **1920 × 1080, 60 fps, 45-second** final canvas. Do not stretch them to landscape.
- `MEDIA-REPORT.json` records probed dimensions, duration and frame count. A screenshot or paused still can be used for a longer proof hold without pretending a live event happened.

## Recorded shots

| File, in both recording folders | Actual material | Editorial use and limits |
|---|---|---|
| `01-markets.mp4` | Loaded SOL chart, price, indicator and pivot surfaces; a native chart hold with live data updates | Strong opening macro and phone reveal. Actual price/candles remain unchanged. This clip does not contain a recorded timeframe switch. |
| `02-ask-stream.mp4` | A real new SOL question is drafted/sent, the app works, and a fresh answer appears | Useful approximate points: early seconds show the draft, around 15 seconds shows the working state, around 25 seconds shows the completed answer. Scrub for precise cuts. The fresh answer has Pyth/Binance sources and price/funding/open-interest context. Compression of waiting is editorial, not a response-speed claim. |
| `03-capital-context.mp4` | Capital Intelligence, selected sources, account-context expansion and a scroll | The account has no positions/activity/memory and tracked equity is zero. Use source tiles and controls, not invented monetary data or a fake funded-account reveal. |
| `04-portfolio.mp4` | Portfolio overview, positions/activity and navigation to Capital accounts, Holdings, Risk and DeFi | The current account has zero holdings and no connected prediction-market positions. Use authentic navigation/control detail. No populated cross-venue account was verified. |
| `05-research-tour.mp4` | Reports form, Backtests form and a populated Prediction Markets view | Good real navigation and product-detail material. Prediction rows reflect captured provider data; prefer an appropriate crypto detail if more footage is taken. No completed report is in this clip. |
| `06-backtest-run.mp4` | A real SOL RSI preset is selected and the native Run backtest control is available | A completed simulation/result was **not verified** in this capture. Treat it as form/preset footage despite the filename. Do not fabricate returns/equity curves or label the form a finished backtest result. |
| `07-smart-money.mp4` | Populated Hyperliquid tracked-wallet consensus, expansion and scroll | Strong actual proof. The 99–100% figures are **share of observed position value**, not win probability. Keep their context; do not detach a large percentage as performance marketing. The selected SOL signal surface says no notable dislocation, while smart-money rows are populated. |
| `08-alert-controls.mp4` | Native SOL price-alert form, direction, target and delivery explanation | No alert was saved. Price pushes are off for this account; the form says inbox only. Show controls without a fake notification arrival or enabled-push state. |
| `09-decision-brief.mp4` | Actual expanded SOL Decision brief: price structure, account exposure and what to watch | Excellent shape-match from chart to reasoning to alert threshold. This account has no SOL exposure; preserve the actual content. |

## Useful stills

The `captures/` directory retains original captures and a few extracted video frames. Particularly useful:

- `01-sol-chart.png`, `01-sol-decision-brief.png`
- `02-ask-answer.png`, `02-recording-frame-15s.png`, `02-recording-frame-25s.png`
- `03-capital-context.png`, `03-capital-expanded.png`
- `04-portfolio.png`, `04-portfolio-details.png`
- `05-research-reports.png`, `05-research-backtests.png`, `05-research-predictions.png`
- `06-backtest-result.png` is an intermediate **form view**, despite its name. It is not evidence of a completed backtest.
- `07-signals.png`, `07-smart-money-expanded.png`
- `08-alert-form.png`, `08-alert-controls.png`. `08-alert-sheet.png` is a mid-animation capture; prefer the settled form.

Use raw originals or the prepared video copies. The previously generated gallery banners under `output/dapp-store-gallery/` are marketing graphics, not source screenshots; the old teaser's synthetic screens are not live product evidence.

## Original brand assets

- Store badge: `mobile/assets/dapp.png`, **696 × 273**, copied unchanged into `assets/dapp.png` for this kit. Preserve its pale mint artwork, native colors and ratio.
- Gold emblem: `mobile/assets/images/elyra-emblem.png`, copied unchanged into `assets/elyra-emblem.png`.
- Typography: Fustat, General Sans and selected DM Serif Display from the actual app/repository. Fonts are not embedded in this kit; resolve them from the repository's licensed assets.

## Coverage still requiring additional filming or careful treatment

Native swap/transfer quote and signing review, receive QR, a populated notification inbox, a delivered push, a completed research report/backtest comparison, full SEC/insider output, yield and unlock-provider data were not all freshly captured. Current source implements these capability families, with the documented availability and signing boundaries. Additional safe navigation, research queries and draft forms are within the user's filming request. Do not invent a successful transaction, private account positions, delivered notification or unavailable provider data to fill a gap.

Do not sign transactions, send funds, log the person out to stage sign-in, or alter notification/account preferences for filming. No transaction, alert rule or saved account preference was created during this capture session. One new Ask Elyra question and a backtest preset/form interaction were used; the question remains as actual conversation history.

Market values and timestamps are captured historical UI, not current quotes or performance claims. Avoid exposing full account addresses, emails or personal notifications in the final film. The crop on editing copies removes status-bar notification icons.

## Handoff

- Main instruction: `OPUS-LAUNCH-PROMPT.md`
- Separate score-generation brief: `SOUNDTRACK-PROMPT.txt`
- Exact launch requirement: **Live on Solana dApp Store**, visible with the original badge throughout **40.000–45.000 seconds**.
- No new launch MP4 has been rendered in this preparation task. Opus is instructed to build it as a new project under `marketing/elyra-launch/`.
