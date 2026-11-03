# Elyra — 45-second launch film · delivery

## Status

The picture is finished. The soundtrack is an original, fully arranged
**temporary cue**. A produced score is still owed; it is the one open
dependency (see "Soundtrack").

## Files

| File | What it is |
|---|---|
| `elyra-launch-45s-16x9.mp4` | **The film.** H.264 High, 1920 × 1080, 60/1 fps, 2,600 frames, 43.333 s, yuv420p bt709. Stereo AAC-LC, 48 kHz, 320 kb/s. 122.6 MB. **Not committed to git** (GitHub rejects files over 100 MB): render it with `npm run render` in `marketing/elyra-launch`, which writes it here. The copy tracked at this path in git is the superseded 45 s cut (Revision 3, re-encoded small), not this film. The file name keeps `45s` from the first cuts. |
| `contact-sheet.jpg` | 31 frames from the encode. |
| `stills/` | The same 31 frames at full size, named by frame and moment. |
| `audio/elyra-launch-45s-TEMP-score-master.wav` | 24-bit 48 kHz master of the temporary cue: exactly 43.333 s (2,080,000 samples), first downbeat at sample 0. |
| `audio/stems/TEMP-*.wav` | Drums, bass, music, hits and UI stems; `fx-only` (hits + UI, for laying under a replacement score); `score-only`. |
| `captures-extra/`, `recordings-extra/`, `footage-60fps-extra/` | New Seeker material filmed for this cut (see "Filming log"). |
| `../../marketing/elyra-launch/` | Editable source. `README.md` covers preview, render and replacement; `audio/CUE-SHEET.md` lists every sync point. |

## Measured on the delivered file

| Check | Result |
|---|---|
| Decoded video frames | **2600** |
| Container, video and audio duration | **43.333333 s** container and video; **43.333000 s** audio (the AAC ends on its last whole frame, 16 samples short) |
| Resolution / frame rate | 1920 × 1080 / 60/1 (constant) |
| Integrated loudness (EBU R128, on the AAC) | **−13.8 LUFS** |
| True peak (on the AAC) | **−1.5 dBTP** |
| Black frames | none |
| Sync | Per-frame RMS on the master WAV: transient in frame 0 (−9.9 dB); impact rising from −30.3 to −9.7 dB exactly at frame 100; insight tone at 500 (−24.9 → −10.3 dB); the vacuum falls from 2286 to −99.6 dB at 2290, −116 dB at 2291 and digital silence from 2293 to 2299; launch at 2300 (silence → −9.9 dB); the tail fades to −91 dB in the last frame |

### Revision 4 — the opening trimmed by one bar

The client found the opening's three hard-cut inserts (funding extremes,
largest open interest, the Pyth line) and the tight hold on the price tag
confusing, and they delayed the hook's payoff. They are gone: "LOOK PAST THE
PRICE." pulls straight out of the chart into the handset, which now lands
with the impact on **frame 100** (was 200). Exactly one bar (100 frames at
144 BPM) was removed, so the film stays on the grid: **2,600 frames,
43.333 s**. Everything from old frame 200 onward — picture and score — is
unchanged and plays 100 frames earlier: the answer lands on 500, the vacuum is
2286–2300, and "Live on Solana dApp Store" lands on **2300** and holds for the
final 300 frames.

Checked: stills of the new cut at frames 300, 500, 1400, 2290, 2300 and 2599
are pixel-identical to the old cut 100 frames later. A 540p preview was
reviewed as a frame strip through 70–140 (hook → pull-out → phone): the
motion is continuous, with no jump where the hook and its scrim leave. Frame
numbers in the Revision 2 and 3 notes below are in the 2,700-frame cut.

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

**Revision 3 — finish pass.** Every card's crop was measured against the
app's own panel edges in the pixels (page background, panel fill, border),
so each card is either the app's exact panel, with its own corners and
border, or a clean cut just inside it. Corners no longer double, and no
background slivers or inner dividers show. Text on the plain page
background is lighten-blended into the stage, so it never sits in a box.
Titles and bottom rows have real padding, brackets and underlines sit
inside or beneath what they mark, the carousel no longer ghosts its next
card, and the PDF cover no longer covers report figures.

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
| **Markets** | 0:00.00–0:03.00 [0–180] | SOL 1H candles and EMA 20 in macro under the hook; as the handset lands, the live price tag, the prior-day pivots and the Pyth line "±0.0553 confidence · 19 publishers" | `fp/01-markets.mp4` |
| **Ask Elyra**: affordances | 0:03.83–0:05.00 [230–300] | Attach sheet (Photo; PDF, CSV, TXT, Markdown or JSON), the "/" shortcut list, the dictation mic, with labels anchored to each | `fpx/23-composer.mp4` |
| Ask Elyra: evidence | 0:05.00–0:11.07 [300–664] | The real question card (sent on the recording's own send), "Elyra is working…", the answer "What to watch in SOL", held from 0:08.33; the sources card Pyth · Binance | `fp/02-ask-stream.mp4` on the phone; `c/02-recording-frame-15s.png`, `c/02-recording-frame-25s.png` |
| **Capital Intelligence** | 0:10.83–0:13.43 [650–806] | Account context, 4 sources selected: Portfolio (Connected), Positions (None yet), Activity (None yet), Memory (Not set) | `c/03-capital-context.png` |
| **Connected capital** | 0:13.53–0:16.07 [812–964] | "Read-only access — view balances and positions, no trading or transfers"; Connections row "Hyperliquid, Binance and Polymarket · Read-only" | `cx/connections1.png`, `cx/account1.png` |
| **Signals** | 0:16.07–0:17.47 [964–1048] | "SOL · No thresholds crossed — A quiet market is a signal, too." | `cx/rtab-Signals.png` |
| **Smart money** | 0:17.33–0:21.07 [1040–1264] | The consensus table (HYPE, ETH, ZEC, SOL), then HYPE's mark, average entry and wallets. Label: "Share of value: the observed share of position value on that side — not a win rate." | `c/07-signals.png`, `c/07-smart-money-expanded.png` |
| **Research: Reports + PDF** | 0:21.07–0:22.93 [1264–1376] | NVIDIA Q2 FY2027 header, earnings scorecard, the PDF cover | `cx/report-top.png`, `cx/pdf3.png` |
| Research: Backtests and Compare | 0:22.93–0:25.20 [1376–1512] | SOL RSI (12) card with its real equity curve traced; MACD / RSI / Bollinger compared; "No winner is named: one period on one asset is not a forecast." | `cx/bt-curve1.png`, `cx/bt4.png` |
| Research: six more tools | 0:25.20–0:28.97 [1512–1738] | Prediction markets, Market recap, Signals, Yield (Galaxy USDT 8.49% APY), Unlocks (**Source unavailable**, as it is), SEC insider activity, each named large | `c/05-research-predictions.png`, `c/00-opened.png`, `cx/rtab-Signals.png`, `cx/yield-pools.png`, `cx/rtab-Unlocks.png`, `cx/sec-nvda1.png` |
| Research: all eight | 0:28.97–0:30.23 [1738–1814] | All eight in one wall: "Eight research tools. One tab." | as above |
| **Wallet** | 0:30.23–0:31.73 [1814–1904] | Receive · Swap · Transfer · Withdraw; "Swap, transfer, receive — every move signed by you." | `c/04-portfolio.png` |
| Wallet: review controls | 0:31.73–0:34.57 [1904–2074] | "You stay in control: 01 Ask · 02 Review · 03 Sign — Nothing is sent until your wallet signs." | `cx/actions2.png` |
| **Alerts** | 0:34.57–0:36.03 [2074–2162] | SOL price alerts: Rises above / Falls below, alert price, Now, Set alert | `c/08-alert-form.png` |
| Alerts: delivery | 0:36.03–0:37.43 [2162–2246] | "Inbox only · price pushes are off — alerts you set are kept in your inbox"; "Tells you. Never trades." | `c/08-alert-form.png` |
| **Launch** | 0:38.33–0:43.33 [2300–2600] | **Live on Solana dApp Store**, the unmodified badge, the emblem and wordmark, the handset (SOL chart and Decision brief), getelyra.xyz | `public/brand/*`, `fp/09-decision-brief.mp4` |

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
144 BPM: a dry first transient, a pressure pulse, a hardware impact on 100, a
breakbeat groove, a withdrawal and FM insight tone on 500, a darker bed for
Capital, syncopation for Signals, a research drive, a deliberate pause in bar
20, a final climb into a true vacuum, and a D-major launch with a two-note
D5 → A5 signature on 2300. It has a clean tail to 43.333 s.

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
- **Disk space**: the machine's data volume was at 99% (≈2 GB free) during
  rendering. Remotion's webpack cache is disabled in this project for that
  reason.
