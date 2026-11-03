# Elyra — 45-second launch film · delivery

## Status

The picture is finished. The soundtrack is an original, fully arranged
**temporary cue**. A produced score is still owed; it is the one open
dependency (see "Soundtrack").

## Files

| File | What it is |
|---|---|
| `elyra-launch-45s-16x9.mp4` | **The film.** H.264 High, 1920 × 1080, 60/1 fps, 2,700 frames, 45.000 s, yuv420p bt709. Stereo AAC-LC, 48 kHz, 320 kb/s. 141.7 MB. |
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
| True peak (on the AAC) | **−2.2 dBTP** |
| Black frames | none |
| Sync | Measured on the master: transient in frame 0; impact rising from −31 to −10 dB exactly at frame 200; insight tone at 600; silence below −100 dB from 2390; launch at 2400 |

### Revision 2 — the middle rebuilt for clarity

The first cut's middle (frames 400–2340) had about 45 cuts in 33 s, mostly
whole screens at small scale. It is now six chapters (Ask Elyra, Capital,
Signals, Research, Wallet, Alerts). Each moment lifts one real region of a
capture out as a card, stages it in 3D at 40–60 px text, and holds it long
enough to read. A chapter marker and progress line sit top-left, and a lime
bar wipes between chapters. The opening (0–400) and the launch (2340–2700)
are unchanged.

The chapters carry short statements ("Your capital. In context.",
"Read-only, by design.", "Prepare your move.", "Set the condition.",
"Tells you. Never trades.", and the app's own "Smart-money consensus" and
"You stay in control"). That makes more than the brief's four large
headline events; it was a deliberate trade for clarity, following review
feedback.

Motion was reviewed on a 540p preview, as frame strips through every
transition: the pop-out of the question (398–434), the headline handing off
to the answer (536–624), a lime wipe (744–776), the research carousel
(1596–1716), the wall (1836–1912), and the hand-off to the launch
(2316–2404). Muted, every beat is carried by on-screen text; no information
is in the audio alone.

## Feature coverage

Times are mm:ss.ff at 60 fps (frames in brackets). Sources are in
`output/launch-video-45s/`. `fp/` is `footage-60fps/`, `fpx/` is
`footage-60fps-extra/`, `cx/` is `captures-extra/` and `c/` is `captures/`;
stills went through `scripts/prepare-stills.sh`, and every card's rectangle is
in `src/scenes/*.tsx`.

| Family | When | What is on screen | Source |
|---|---|---|---|
| **Markets** | 0:00.00–0:03.33 [0–200] | SOL 1H candles, EMA 20, the live price tag, the prior-day pivots, the Pyth line "±0.0553 confidence · 19 publishers" | `fp/01-markets.mp4` |
| Markets: funding and OI | 0:01.77–0:02.40 [106–144] | Hyperliquid funding extremes and largest open interest | `cx/pulse-funding.png`, `cx/pulse-oi.png` |
| **Ask Elyra**: affordances | 0:05.50–0:06.67 [330–400] | Attach sheet (Photo; PDF, CSV, TXT, Markdown or JSON), the "/" shortcut list, the dictation mic, with labels anchored to each | `fpx/23-composer.mp4` |
| Ask Elyra: evidence | 0:06.67–0:12.73 [400–764] | The real question card (sent on the recording's own send), "Elyra is working…", the answer "What to watch in SOL", held from 0:10.00; the sources card Pyth · Binance | `fp/02-ask-stream.mp4` on the phone; `c/02-recording-frame-15s.png`, `c/02-recording-frame-25s.png` |
| **Capital Intelligence** | 0:12.50–0:15.10 [750–906] | Account context, 4 sources selected: Portfolio (Connected), Positions (None yet), Activity (None yet), Memory (Not set) | `c/03-capital-context.png` |
| **Connected capital** | 0:15.20–0:17.73 [912–1064] | "Read-only access — view balances and positions, no trading or transfers"; Connections row "Hyperliquid, Binance and Polymarket · Read-only" | `cx/connections1.png`, `cx/account1.png` |
| **Signals** | 0:17.73–0:19.13 [1064–1148] | "SOL · No thresholds crossed — A quiet market is a signal, too." | `cx/rtab-Signals.png` |
| **Smart money** | 0:19.00–0:22.73 [1140–1364] | The consensus table (HYPE, ETH, ZEC, SOL), then HYPE's mark, average entry and wallets. Label: "Share of value: the observed share of position value on that side — not a win rate." | `c/07-signals.png`, `c/07-smart-money-expanded.png` |
| **Research: Reports + PDF** | 0:22.73–0:24.60 [1364–1476] | NVIDIA Q2 FY2027 header, earnings scorecard, the PDF cover | `cx/report-top.png`, `cx/pdf3.png` |
| Research: Backtests and Compare | 0:24.60–0:26.87 [1476–1612] | SOL RSI (12) card with its real equity curve traced; MACD / RSI / Bollinger compared; "No winner is named: one period on one asset is not a forecast." | `cx/bt-curve1.png`, `cx/bt4.png` |
| Research: six more tools | 0:26.87–0:30.63 [1612–1838] | Prediction markets, Market recap, Signals, Yield (Galaxy USDT 8.49% APY), Unlocks (**Source unavailable**, as it is), SEC insider activity, each named large | `c/05-research-predictions.png`, `c/00-opened.png`, `cx/rtab-Signals.png`, `cx/yield-pools.png`, `cx/rtab-Unlocks.png`, `cx/sec-nvda1.png` |
| Research: all eight | 0:30.63–0:31.90 [1838–1914] | All eight in one wall: "Eight research tools. One tab." | as above |
| **Wallet** | 0:31.90–0:33.40 [1914–2004] | Receive · Swap · Transfer · Withdraw; "Swap, transfer, receive — every move signed by you." | `c/04-portfolio.png` |
| Wallet: review controls | 0:33.40–0:36.23 [2004–2174] | "You stay in control: 01 Ask · 02 Review · 03 Sign — Nothing is sent until your wallet signs." | `cx/actions2.png` |
| **Alerts** | 0:36.23–0:37.70 [2174–2262] | SOL price alerts: Rises above / Falls below, alert price, Now, Set alert | `c/08-alert-form.png` |
| Alerts: delivery | 0:37.70–0:39.10 [2262–2346] | "Inbox only · price pushes are off — alerts you set are kept in your inbox"; "Tells you. Never trades." | `c/08-alert-form.png` |
| **Launch** | 0:40.00–0:45.00 [2400–2700] | **Live on Solana dApp Store**, the unmodified badge, the emblem and wordmark, the handset (SOL chart and Decision brief), getelyra.xyz | `public/brand/*`, `fp/09-decision-brief.mp4` |

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

- **Coverage traded for clarity in revision 2.** These no longer appear: the
  portfolio's Capital accounts / Holdings / Risk / DeFi cards, the History and
  Memory sheets, the Receive QR, the inbox and notification-preferences
  screens, the account and referrals glimpses, and the Decision brief's "Set an
  alert" line. The material is filmed and prepared in `public/stills` if any
  should come back.

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
