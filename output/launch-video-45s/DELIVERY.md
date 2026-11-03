# Elyra — 45-second launch film · delivery

## Status

The picture is finished. The soundtrack is an original, fully arranged
**temporary cue**. A produced score is still owed; it is the one open
dependency (see "Soundtrack").

## Files

| File | What it is |
|---|---|
| `elyra-launch-45s-16x9.mp4` | **The film.** H.264 High, 1920 × 1080, 60/1 fps, 2,700 frames, 45.000 s, yuv420p bt709. Stereo AAC-LC, 48 kHz, 320 kb/s. 73.8 MB. |
| `contact-sheet.jpg` | 32 frames from the encode. |
| `stills/` | The same 32 frames at full size, named by frame and moment. |
| `audio/elyra-launch-45s-TEMP-score-master.wav` | 24-bit 48 kHz master of the temporary cue: exactly 45.000 s, first downbeat at sample 0. |
| `audio/stems/TEMP-*.wav` | Drums, bass, music, hits and UI stems; `fx-only` (hits + UI, for laying under a replacement score); `score-only`. |
| `captures-extra/`, `recordings-extra/`, `footage-60fps-extra/` | New Seeker material filmed for this cut (see "Filming log"). |
| `../../marketing/elyra-launch/` | Editable source. `README.md` covers preview, render and replacement; `audio/CUE-SHEET.md` lists every sync point. |

## Measured on the delivered file

| Check | Result |
|---|---|
| Decoded video frames | **2700** |
| Container, video and audio duration | **45.000000 s** each |
| Resolution / frame rate | 1920 × 1080 / 60/1 (constant) |
| Integrated loudness (EBU R128, on the AAC) | **−13.9 LUFS** |
| True peak (on the AAC) | **−1.9 dBTP** |
| Loudness range | 4.8 LU |
| Black frames | none |
| Sync | Measured on the master: transient in frame 0; impact rising from −31 to −10 dB exactly at frame 200; insight tone at 600; silence below −100 dB from 2390; launch at 2400 |

Motion was reviewed on a 540p preview, as frame strips through every
transition (the pull-out at 184–202, the rail to underline at 692–720, the
slab contraction at 1080–1100, chart to trace at 1350–1382, the alert match at
2088–2128, the handset's return at 2340–2400). Small-feed legibility was
checked at 480 × 270. Muted, every beat is carried by the product's own text,
the four headlines and the labels; no information is in the audio alone.

## Feature coverage

Times are mm:ss.ff at 60 fps (frames in brackets). Sources are in
`output/launch-video-45s/`. `fp/` is `footage-60fps/`, `fpx/` is
`footage-60fps-extra/`, `cx/` is `captures-extra/` and `c/` is `captures/`;
stills went through `scripts/prepare-stills.sh`.

| Family | When | What is on screen | Source |
|---|---|---|---|
| **Markets** | 0:00.00–0:03.33 [0–200] | SOL 1H candles, EMA 20, the live price tag (93.279), the prior-day pivots row, the Pyth line "updated · ±0.0553 confidence · 19 publishers" | `fp/01-markets.mp4` 0–200 |
| Markets: funding and OI | 0:01.77–0:02.40 [106–144] | Hyperliquid funding extremes (Funding APR) and largest open interest | `cx/pulse-funding.png`, `cx/pulse-oi.png` |
| Markets: alert entry | 0:34.17–0:35.00 [2050–2100] | Decision brief "Watch next … Set an alert on it from the chart." | `fp/09-decision-brief.mp4` from 200 |
| **Ask Elyra**: affordances | 0:05.50–0:06.67 [330–400] | Attach sheet (Photo; PDF, CSV, TXT, Markdown or JSON), the "/" shortcut list, the dictation mic, with labels anchored to each | `fpx/23-composer.mp4` 32–122 and 1318–1366 |
| Ask Elyra: evidence | 0:06.67–0:11.67 [400–700] | The real question, sent; "Elyra is working…"; the answer "What to watch in SOL", held from 0:10.00; sources Pyth · Binance in macro | `fp/02-ask-stream.mp4` 400–478 (×1.5), 560, 650, 1325–1469 |
| **Capital Intelligence** | 0:11.67–0:13.17 [700–790] | Account context, 4 sources selected: Portfolio (Connected), Positions, Activity, Memory | `fp/03-capital-context.mp4` 0–90 |
| History and preferences | 0:13.17–0:14.17 [790–850] | Conversations (History); Saved preferences — "Standing instructions Elyra keeps across conversations" | `cx/cap-history.png`, `cx/cap-memory.png` |
| **Connected capital** | 0:14.17–0:15.42 [850–925] | Explore your portfolio: Capital accounts (equity, allocation, venues), Holdings, Risk, DeFi | `c/04-portfolio-details.png` |
| Connections | 0:15.42–0:16.67 [925–1000] | "Read-only access — no trading or transfers"; Hyperliquid and Binance options, each marked **Not connected** | `cx/connections1.png` |
| **Signals** | 0:16.67–0:18.00 [1000–1080] | "SOL · No thresholds crossed — A quiet market is a signal, too."; checks for price movement, funding and venue divergence | `cx/rtab-Signals.png` |
| **Smart money** | 0:18.00–0:20.00 [1080–1200] | Hyperliquid tracked-wallet consensus: HYPE 19 of 20 wallets, 100% share of value, entry versus mark. Label: "Share of value: the observed share of position value on that side — not a win rate." | `fp/07-smart-money.mp4` 60–180 |
| **Research: Reports + PDF** | 0:20.00–0:22.50 [1200–1350] | "NVDA latest earnings" query; NVIDIA Q2 FY2027 report card (Verified with warnings, Open PDF); the report view; the PDF cover and scorecard page | `fpx/10-report-start.mp4` 70–110; `cx/report-card.png`, `report-top.png`, `pdf3.png`, `pdf4.png` |
| Research: Backtests | 0:22.50–0:25.00 [1350–1500] | Chart fall → SOL RSI (12) equity curve and metrics; MACD / RSI / Bollinger comparison; "No winner is named: one period on one asset is not a forecast." | `fp/01-markets.mp4` 300; `cx/bt-curve1.png`, `cx/bt4.png` |
| Research: Prediction markets | 0:25.00–0:26.50 [1500–1590] | Tab underline into Prediction markets; categories, trending markets, Yes / No odds, volume | `fp/05-research-tour.mp4` 426–451; `c/05-research-predictions.png` |
| Research: Recap, Signals, Yield, Unlocks | 0:26.50–0:28.75 [1590–1725] | The native tab strip, cut on each underline move. Unlocks shows **Source unavailable**, as it is. | `fpx/16-research-tabs.mp4` 20, 612, 1058, 1598 |
| Research: SEC and insiders | 0:28.75–0:30.00 [1725–1800] | SEC EDGAR "Research at the source."; XBRL reported figures; insider activity (30 Form 4s, $183M sold by 7 insiders) | `cx/rtab-SEC.png`, `cx/sec-nvda1.png` |
| **Wallet** | 0:30.00–0:31.00 [1800–1860] | Receive · Swap · Transfer · Withdraw, with the app's own "The wallet holds nothing to move yet — receive first." | `c/04-portfolio.png` |
| Wallet: review controls | 0:31.00–0:33.17 [1860–1990] | "Your actions — Review prepared swaps before signing"; "You stay in control: 01 Ask · 02 Review · 03 Sign — Nothing is sent until your wallet signs." | `cx/actions1.png`, `cx/actions2.png` |
| Wallet: receive / QR | 0:33.17–0:34.17 [1990–2050] | Receive, Solana mainnet, the top half of the QR | `cx/receive1.png` (address blurred) |
| **Alerts** | 0:35.00–0:36.67 [2100–2200] | SOL price alerts: Rises above / Falls below, alert price, Set alert, "Inbox only · price pushes are off" | `fp/08-alert-controls.mp4` from 100 |
| Inbox and delivery | 0:36.67–0:37.77 [2200–2266] | Notifications inbox; preferences (Price alerts, Liquidation warnings, Market moves) | `cx/inbox1.png`, `cx/notif-settings.png` |
| Continuity | 0:37.77–0:39.20 [2266–2352] | Account: Solana mainnet, connected; Wallet, Notifications, Alerts & automation, Connections (read-only), Referrals; referral invite | `cx/account1.png`, `cx/referrals1.png` |
| **Launch** | 0:40.00–0:45.00 [2400–2700] | **Live on Solana dApp Store**, the unmodified `mobile/assets/dapp.png`, the gold emblem and wordmark, the handset (SOL chart and Decision brief), getelyra.xyz | `public/brand/*`, `fp/09-decision-brief.mp4` |

Real application UI is the main image for effectively all of the first 40
seconds; the brief's minimum is 26. There are four large headline events and
three reveals: frame 200 (mobile), frame 600 (evidence) and frame 2400
(launch).

## Product truth kept

- **No invented account state.** The account is unfunded with no positions;
  zeros are never the hero and are never repainted. Connections show "Not
  connected". No quote, signature, transaction, hash or success state appears.
- **No fake notification.** The alert form's "price pushes are off" stays on
  screen, and no push arrives.
- **Semantics.** The smart-money percentage is labelled as share of observed
  position value. Backtest returns are negative and shown unchanged, with the
  app's own "no winner" caveat. The report's "Verified with warnings" status
  stays visible.
- **Unavailable stays unavailable.** Unlocks shows "Source unavailable".
- **Compression.** About 15 s of "Elyra is working…" becomes about 2.5 s. It
  is an edit, not a response-time claim, and the film makes no speed claim.
- Market figures and timestamps are historical captures (3–4 November 2026).

## Filming log (4 November 2026, Seeker over ADB, app 1.0.1)

The kit lacked Reports, Backtest and PDF results, Research tabs, SEC, Receive,
Actions, inbox, account and referrals material, composer affordances, and
funding/OI rankings. The brief authorised more navigation, research queries
and draft forms, so these were filmed. That produced 20 recordings
(`recordings-extra/`, conformed to `footage-60fps-extra/`) and 50 stills
(`captures-extra/`).

What changed in the account:

- **One research report was created**: "NVDA latest earnings", which became
  NVIDIA Q2 FY2027 Earnings, now in Your reports.
- **Two backtests were run**: the MACD / RSI / Bollinger comparison and SOL
  RSI (12) 1h 1y.
- The report PDF was opened once in Google Drive's viewer ("Just once"; no
  default app was set).

What did not change: no transaction, signature, transfer, alert rule,
watchlist entry, setting or preference. The "/" typed into the composer was
deleted. The mic was not tapped (its permission is not granted, so tapping
would have raised a prompt). After the main session the phone was returned to
its home screen. It was then reopened to the Research tab for one extra shot
(a crypto prediction market). The phone disconnected before that shot, so the
app was left open on Research with nothing changed (see "Limitations").

## Privacy

- The status bar is redrawn clean; the captures' own bar carried
  notification icons.
- The wallet address is blurred on Receive and Account, as are the referral
  link and code. Only the QR's top half is framed and its bottom half is
  blurred, so it cannot be decoded.
- Wallet addresses in the smart-money list are public, truncated third-party
  Hyperliquid addresses. Insider names on the SEC page are public EDGAR Form 4
  data (Apple Inc.).
- No email address appears. The account card's "Google account" sign-in label
  is shown only in passing.

## Assets and licences

| Asset | Origin and terms |
|---|---|
| Product UI | Elyra's own app, captured from the device. |
| Fustat | The website's variable Latin cut, SIL OFL 1.1. |
| General Sans | The Android app's files, ITF Free Font License. |
| DM Serif Display | The Android app's file, SIL OFL 1.1 (the documented mobile exception). |
| Gold emblem | `mobile/assets/images/elyra-emblem.png`, byte-identical copy, unmodified. |
| dApp Store badge | `mobile/assets/dapp.png` (696 × 273), byte-identical copy, uniform 0.8 scale, nothing else. Supplied by Elyra. Confirm its use against Solana Mobile's badge guidelines before paid placement. Nothing in the film implies endorsement by Solana Mobile or any venue. |
| Score and sound design | Original, generated by `audio/score.mjs` (no samples, loops or third-party audio). Owned by the project. |
| Third-party names in data | Tickers, token logos, venues (Hyperliquid, Binance, Kamino, Pyth) and public companies (NVIDIA, Apple) appear only as data inside the product, not as endorsements. The Apple logo and the SEC quick-pick logos are cropped out. |

## Soundtrack

The brief asks for a fully produced original or cleared score. The
music-generation service available to this setup (Higgsfield) needs
authorisation that could not be completed in this session, and no licensed
library was available. The edit is therefore finished with a **clearly
identified temporary cue**.

The temporary cue is composed to the cue map, not looped. It is D minor at
144 BPM: a dry first transient, a pressure pulse, a hardware impact on 200, a
breakbeat groove, a withdrawal and FM insight tone on 600, a darker bed for
Capital, syncopation for Signals, a research drive, a deliberate pause in bar
20, a final climb into a true vacuum, and a D-major launch with a two-note
D5 → A5 signature on 2400. It has a clean tail to 45.000 s.

Its loudness, peaks, band balance and sync were measured. The score has not
been judged by ear. Treat it as a strong guide track. To finish, commission
or license a produced score to `marketing/elyra-launch/audio/CUE-SHEET.md`
(it lists the exact frames and the replacement steps). Lay it under
`audio/stems/TEMP-fx-only-master-gain.wav` to keep the film's hits and UI
sounds, then run `npm run render`.

## Limitations

- **The produced score is still owed** (above).
- **Watchlist and asset search are not featured.** The account's watchlist is
  empty, and adding one would change account state. Search was captured
  (`cx/search1.png`) but did not earn a place in the cut.
- **Native wallet sign-in (Mobile Wallet Adapter) is not filmed**, because it
  would need a logout. Wallet connection status is shown on Account instead.
- **The prediction-market detail is a live political market** (US House
  control). It is neutral data, but a crypto market would suit the film
  better. A replacement was being filmed when the phone disconnected.
- **The funding accent includes a real token named "USELESS"** for about
  0.3 s.
- **Disk space**: the machine's data volume was at 99% (≈2 GB free) during
  rendering. Remotion's webpack cache is disabled in this project for that
  reason.
