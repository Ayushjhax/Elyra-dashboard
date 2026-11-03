# Elyra — 45-second launch film

Copy everything below into Claude Opus with access to this repository. This brief asks Opus to build the finished film; the present document is the production prompt.

---

You are Elyra’s creative director, motion designer, editor and sound designer. Build and render an exceptional **45-second, 16:9 launch film for the real Elyra Android app, live on the Solana dApp Store**. Deliver the finished video and editable source. Make routine decisions and complete production without stopping at a storyboard or asking for approval of minor choices.

The film should feel aggressive, suspenseful, technically precise and aspirational. Its energy should make someone stop scrolling, then its real product should earn their attention. Three major reveals must land: **this terminal is mobile; this intelligence has evidence; this product is available now**. The final announcement is exactly **“Live on Solana dApp Store”**, accompanied by the actual supplied badge.

## The idea and editorial standard

**LOOK PAST THE PRICE.**

A price chart is the entrance. Follow one continuous thread deeper: market data becomes an agent’s evidence; evidence connects to personal capital; research expands the picture; a useful action or alert becomes ready for the person. Finish by revealing that this entire experience is already on their phone’s store.

Default to no voiceover. The real interface, disciplined typography, musical pressure and purposeful sound design carry the story. Muted playback must still communicate the product and availability. Aspiration comes from capability and control. Make the application desirable through what it actually does.

Study the earlier film in `output/teaser-20s/` and its project in `marketing/elyra-teaser/` only to understand what must change. That film repeats oversized left headlines beside a right-hand phone, uses mostly invented account screens and has a locally synthesised scratch soundtrack. **Create a new visual and editorial system.** Extending that timeline, replacing its copy or adding more effects will not meet this brief.

At least **65% of the first 40 seconds** must prominently show actual captured application UI. Use meaningful recorded behavior, authentic tool activity, readable product details and carefully selected stills. Real footage should occupy a substantial part of the canvas, rather than appearing inside a postage-stamp phone. Do not generate raster UI, invent dashboard screenshots or build an AI-image slideshow.

## Read the sources and select the material

Repository: `/Users/ayush/Desktop/Elyra-dashboard`.

Read relevant `AGENTS.md` files, `README.md`, `docs/ELYRA_BRAND.md`, the current mobile screens/components and `output/launch-video-45s/ASSET-MANIFEST.md`. The manifest describes fresh captures and recordings under:

- `output/launch-video-45s/captures/`
- `output/launch-video-45s/recordings/`
- `output/launch-video-45s/footage-60fps/` — prepared 60 fps, square-pixel copies with the Android status bar and gesture strip cropped; prefer these for editing.

Inspect the actual files and metadata before deciding shot lengths. Recorded material includes Markets, a streamed Ask Elyra response, Capital context, Portfolio, Research and additional focused flows. Filenames and availability in the manifest take precedence over this summary. Use source inspection to understand visible controls and select the right portions of footage.

The connected account is currently unfunded and has no positions. Do not replace its zeros with invented holdings, manufacture populated balances, invent trade quotes or reuse the earlier fictional account. Show authentic context switches, connection controls, available views, research results and actual market answers. Accurate capability labels can accompany source-confirmed controls without pretending the account contains data it does not.

Use these original assets:

- Gold emblem: `mobile/assets/images/elyra-emblem.png`.
- Store badge: **`mobile/assets/dapp.png`**, native **696 × 273**. Preserve its aspect ratio, pale mint artwork, black lettering and Solana Mobile mark unchanged.
- Fonts: the repository’s Fustat, General Sans and DM Serif Display assets. Inspect `mobile/src/theme/fonts.ts` and the existing font directories.

Root `brand.md` contains an old deferred setup note; the authoritative identity is `docs/ELYRA_BRAND.md` plus the documented mobile exceptions. The Seeker remains available through ADB as package `xyz.getelyra.app`: additional navigation, screenshots, recordings, research queries and draft forms are authorized when useful. Do not change the application to manufacture footage, log the person out just to stage sign-in, perform or sign transactions, send funds, change account settings or read secrets. If a missing detail can be resolved from source and an authentic capability/control shot, keep production moving. Restore any temporary navigation or draft changes when finished.

## Feature breadth that the film must communicate

Cover the major product families through behavior and visible interface details, with a few short supporting labels. Account settings are supporting glimpses. Feature coverage does not mean a separate title card for every capability.

- **Markets:** live prices, watchlists, asset search, candles, chart indicators/pivots and price-alert entry points.
- **Ask Elyra:** actual streaming answer and sources/tools; voice dictation, image/PDF/CSV/text attachments and useful command shortcuts. Dictation is voice input, not a live voice agent.
- **Capital Intelligence:** Portfolio, Positions, Activity and Memory context; saved preferences and conversational history. Show how context can be selected without inventing a populated account.
- **Connected capital:** Solana wallet, Binance, Hyperliquid, DeFi, positions, allocation and risk views. Existing venue connections are read-only. A connection option is not proof that the current account has connected it.
- **Signals and smart money:** market dislocations, funding/open interest and tracked-wallet consensus, using actual available surfaces.
- **Research:** Reports and PDF output; Backtests and comparisons; Prediction Markets analytics; Market Recap; Signals; Yield; Unlocks; SEC filings and insider research. These eight research areas deserve visible, deliberate coverage within their ten-second sequence.
- **Wallet:** user-signed swaps/transfers and receive/QR affordances. Show real review controls when available, without asserting a completed transaction.
- **Alerts and continuity:** price rules, push/inbox surfaces, native wallet sign-in, connected accounts and referrals. Use compact authentic glimpses rather than a settings tour.

This is the real product launch. Remove the earlier product-vision sequence entirely. No autonomous trading, automatic rebalancing, guaranteed outcomes, invented performance statistics or fictional live notifications.

Keep semantics precise: a smart-money percentage is the observed share of position value, not win probability; retain its context. Existing price rules use a five-minute delivery pass, so avoid an instant-delivery promise. The captured alert form says price pushes are off for this account; it proves the rule controls, not a push arriving. If an Unlocks provider is unconfigured, show its genuine navigation/capability without fabricating a populated schedule. Do not make an unavailable or disabled feature look active by repainting its state.

## Visual language and readable motion

Use the actual dark forest base `#101710`, panels `#182117`/`#1E281C`, ivory `#F7F8EA`, stone `#B8BAA8`, citron `#D2DC76` and machine-output lime `#E4EB9D`. Use current tokens for sage positive and clay negative market information. Lime identifies agent output or interaction; it does not mean a rising price. Keep the emblem gold.

Fustat supplies strong motion type and numerics; General Sans supplies UI/supporting copy; DM Serif Display supplies selected editorial Elyra identity. Maintain flat, faithful application surfaces. Put cinematic lighting, texture and depth in the surrounding composition and hardware staging.

Use full-frame interface crops, extreme detail, centered and off-center devices, asymmetric compositions and a few convincing hardware-angle reveals. If hardware is shown, it must suit an Android/Seeker app. Preserve portrait footage geometry. A product macro can fill the frame without a visible device bezel.

Build continuity from actual geometry: candle wick → chart cursor → agent source rail; context switch → allocation boundary; research chart → backtest trace; alert threshold → rule control. Match visual meaning, shape and direction. Use purposeful hard cuts alongside designed transitions; continuous choreography does not require one uninterrupted camera move.

Limit the film to **four large external headline events**: opening hook, mobile reveal, evidence reveal and launch announcement. Native feature names, small anchored callouts and the app’s own wordmark do not need oversized duplicates. Do not lock each scene to the same composition.

At 1080p, primary statements should generally be 80–140 px; meaningful supporting labels approximately 30–44 px. Enlarge selected source regions rather than expecting someone to read a whole phone at social-feed size. Keep critical content 80–96 px from horizontal edges and 60–64 px from vertical edges. Preserve at least 1–1.5 seconds for meaningful short product states. Brief accents can be faster; required feature names cannot be one-frame Easter eggs.

Use acceleration, decisive landings and deliberate pauses. Avoid constant shake, elastic bouncing, arbitrary glitch presets, particle tunnels, spinning coins, purple neon, glass cards and full-screen strobes. Most transitions can resolve within 8–16 frames, but do not force every cut onto an identical duration.

## Exact 45-second edit

Master: **1920 × 1080, 60 fps, exactly 2,700 frames**. Sound grid: **144 BPM, 4/4, 27 bars**. One beat is 25 frames; one bar is 100 frames. Frame intervals below are half-open: `[start, end)`. Decimal times are rounded; frames govern the edit. The grid supports the film rather than dictating equal feature slides.

### 0–200 | 0.000–3.333 s — Enter under pressure

Open on an actual chart macro already in motion. One candle, a moving crosshair, a precise price region. The first frame should be intentional and sharp. Reveal **“LOOK PAST THE PRICE.”** immediately, with a strong, confident typographic treatment. Let the chart continue beneath it while funding/open-interest details begin to emerge from real adjacent UI. Keep the screen uncluttered.

A low pulse and tight mechanical ticks create pressure. Use a short withdrawal near the exit. The suspense is a question of what lies beneath the chart, not an artificial system failure or loading sequence.

### 200–400 | 3.333–6.667 s — Reveal one: the terminal is mobile

Pull decisively out of the same real UI into the Seeker-style device. Land a substantial product composition and **“A terminal. In your hand.”** Show the real navigation and recognizable Elyra identity. Let the viewer register the phone for at least 1.2 seconds after the fast reveal. A bass impact lands with the hardware, not several frames late.

Change the frame architecture on this reveal. Do not reproduce the earlier left headline/right phone arrangement. Resolve into a composition that naturally invites the next push into Ask Elyra.

### 400–700 | 6.667–11.667 s — Reveal two: the answer has evidence

Use the recorded Ask question and answer. Choose the strongest real question/response from the footage; preserve its actual wording and meaning. Accelerate waiting and repetitive streaming while retaining the question, visible tool/source activity and a readable final insight. The three parts should causally connect.

Use the third large headline event sparingly: **“Intelligence. With evidence.”** Then clear it and give the real answer room. Hold the best concise answer region for approximately 1.5 seconds. Expand actual source/tool indicators into clear detail crops rather than inventing new citations. Voice, attachment and shortcut affordances can appear as small native details during the entry or exit.

### 700–1000 | 11.667–16.667 s — Bring capital into context

Follow the answer’s lime rail into actual Capital controls. Portfolio, Positions, Activity and Memory become the organizing rhythm. Show context selection, history/preferences where captured, then the authentic Portfolio/connection interface. An anchored **“Your capital. In context.”** label is sufficient; it is not another giant headline.

Show wallet, Binance/Hyperliquid connection options and DeFi/positions/allocation/risk controls through precise source-based crops. Avoid spending this sequence admiring a zero balance. Its point is the relationship between account context and intelligence, supported by the genuine controls. Do not suggest connected accounts or active positions that the recording does not contain.

### 1000–1200 | 16.667–20.000 s — Follow the signal

Use real Signals and Smart money views. Contrast a relevant market indicator with tracked-wallet consensus using one clean directional edit, then a brief readable hold. Funding, open interest and a signal/source label should remain visually tied to their actual UI. A small **“Signals / Smart money”** label can orient the viewer.

Let percussion become sharper here. Use a meaningful visual event as punctuation, rather than adding a whoosh to every row or token logo.

### 1200–1800 | 20.000–30.000 s — Research at full depth

Give breadth ten well-edited seconds. Use real research navigation and result screens, not eight floating screenshot cards. Start with a report and PDF affordance; follow a chart/axis into backtests and comparison; move through prediction-market analytics; then use the real tab rhythm and compact detail shots to show Recap, Signals, Yield and Unlocks. Include SEC/insider research as a distinct recognizable detail.

Vary durations: hold the richest report/backtest/prediction evidence longer; use shorter linked accents for supporting areas. Do not allocate eight equal snippets mechanically. Keep each required feature name readable through native labels or restrained anchored type. Transform selected interface geometry across cuts while retaining the source material’s fidelity. This sequence should feel like a deep toolset opening up, not a menu scrolling demonstration.

### 1800–2100 | 30.000–35.000 s — Prepare the next move

Use actual swap, transfer and receive/QR captures. Prefer a genuine quote/review state if the asset manifest includes one. Trace the path from intention to a review control, with the person visibly retaining approval. Small copy: **“Prepare your move.”**

If this account cannot produce a valid quote, use authentic token selection, transfer/receive controls and action entry points. Do not fake a quote, successful signature, completion checkmark or funded wallet. A usable real control is stronger than an invented transaction. Give the QR/receive detail a short, clean moment, then move into alerts through a threshold or action-control match.

### 2100–2400 | 35.000–40.000 s — Set the condition; stay connected

Show a real price-rule form and any genuinely saved rule captured. Small copy: **“Set the condition.”** Follow into the actual notification/inbox surface. Show a push arrival only if the source recording actually contains one. Otherwise the real delivery controls/inbox establish the capability honestly.

Use brief supporting glimpses of native wallet sign-in/connected accounts and referrals where available. These establish a coherent mobile product without becoming an account-settings reel. Begin drawing the composition back toward the phone and emblem. Strip the percussion shortly before frame 2400, creating a deliberate breath before the final announcement.

### 2400–2700 | 40.000–45.000 s — Reveal three: it is live

Land **“Live on Solana dApp Store”** exactly at frame 2400. Display the unmodified `mobile/assets/dapp.png` badge and a strong real-product phone hero. Use the gold emblem with restraint; the product and announcement lead. The badge is a real asset, not an AI recreation or a recolored mark.

Hold this readable composition for all five seconds. Very slight camera/lighting drift is enough. An optional small `getelyra.xyz` may appear, with the store as the primary destination. End on the product and live announcement, not black. Resolve the soundtrack naturally by 45.000 seconds.

## Soundtrack, rhythm and mix

Produce a real original or cleared instrumental electronic score. Read `output/launch-video-45s/SOUNDTRACK-PROMPT.txt` for the full music-generation brief. Use an available music-generation service or a suitable licensed asset, with a purposeful edit and asset record. Do not reuse the earlier score, loop it to fill the new duration or present an oscillator click track as final music. The soundtrack’s production quality is part of the result.

Music-generation direction: **144 BPM; suspenseful, aggressive precision techno with cinematic tension; short powerful warm kick, controlled sub with audible upper harmonics, dry metallic percussion, syncopated arpeggio, dark harmonic pressure and an expansive final resolution. No vocals, artist imitation, festival drop or generic corporate uplift. Immediate atmosphere, no long intro.**

Cue map: pressure from 0; major hardware impact at 3.333; groove and evidence lift at 6.667; deeper harmonic weight at 11.667; sharper percussion at 16.667; widening research momentum across 20–30; controlled action groove at 30; final climb across 35–40; short vacuum before 40; strongest resolved launch impact at 40; spacious tail through 45. Use selective off-beat cuts and asymmetric phrases inside that structure.

Measure the generated/licensed track, locate its actual downbeats and edit it to the cue map. A music prompt is not proof of exact tempo or duration. Place visual impacts against real transients, and move minor cuts within a chapter when it improves the music rather than imposing identical cuts on every beat.

Layer restrained mechanical clicks, precise directional sweeps, one insight-resolution tone and a distinct launch signature. Prioritize a few memorable events over constant sonic decoration. Check headphone and phone-speaker translation. A practical mix target is approximately −14 LUFS integrated and true peak no higher than −1 dBTP, adjusted after listening.

If finished music genuinely cannot be obtained, continue the complete edit with an explicitly identified temporary cue and report the missing final score. Do not quietly redefine a scratch track as a produced soundtrack. Supply a music-ready edit and exact cue sheet so replacement is straightforward.

## Build, delivery and acceptance

Create an isolated project at **`marketing/elyra-launch/`**. Preserve the old teaser, application source and root dependency configuration. Use Remotion/React/TypeScript or an equally controllable editing pipeline. Inspect installed versions and current official documentation before coding:

- [Remotion documentation](https://www.remotion.dev/docs)
- [Frame-driven animation](https://www.remotion.dev/docs/animating-properties)
- [Current audio/video guidance](https://www.remotion.dev/docs/video-and-audio)
- [Video component](https://www.remotion.dev/docs/media/video)
- [Transitions](https://www.remotion.dev/docs/transitions)
- [Rendering](https://www.remotion.dev/docs/render)

Probe recordings before import. Sources may be 1200 × 2670 with variable frame timing. Conform deliberately to stable timing, preserve crop/aspect ratio and review any speed changes. Do not assume recording frame numbers equal timeline frames. Use local fonts/media and deterministic animation; render without live network charts or runtime asset downloads.

Before the final render, make a contact sheet and watch an actual low-resolution motion preview. Revise if the old split-screen composition returns, features become unreadable, evidence is lost or the soundtrack feels like a placeholder. Verify transitions in motion, not only as attractive stills.

Deliver `output/launch-video-45s/elyra-launch-45s-16x9.mp4`: H.264, 1920 × 1080, 60 fps, exactly 2700 video frames/45 seconds, stereo AAC at 48 kHz. Also provide editable source with preview/render instructions, representative stills/contact sheet, a clean or music-replaceable master, practical audio stems, asset/license notes and a feature-coverage table naming each family’s timestamp and source.

Acceptance: all major families above are recognizably represented by real UI or accurate source-confirmed controls; at least 26 of the first 40 seconds prominently feature actual UI; three earned reveals and four-or-fewer large external headline events; no invented financial/account states; exact final launch wording and untouched badge visible throughout the last five seconds.

Inspect the rendered file with media tools and normal-speed viewing. Verify duration/frame count, resolution, stable footage, local fonts, sharp settled type, consistent colors, audio sync/peaks and natural ending. Check muted and small-feed playback. Correct stretched screens, illegible labels, accidental debug toasts, loading dead time, broken crops and audio padding before delivery. Finish with links to the video, source and stills, and accurately identify any remaining soundtrack limitation.
