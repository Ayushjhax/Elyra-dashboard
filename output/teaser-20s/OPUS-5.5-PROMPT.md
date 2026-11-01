# Elyra — 20-second mobile teaser

Copy the master prompt below into Opus 5.5 while it has access to this repository. The soundtrack prompt at the end can also be used separately in a music generation tool.

Creative concept: **Markets move. Move with clarity.**

Audience: a crypto-native person who wants to understand markets, their capital and their next decision from their phone. Desired feeling: speed, intelligence, ambition and control. The primary action is to explore Elyra at **getelyra.xyz**.

The feature inventory combines existing product capabilities with a clearly identified product-vision sequence. It does not establish the proposed capabilities as a confirmed roadmap.

---

## Master prompt — paste into Opus

You are the creative director, motion designer, editor and sound designer for Elyra. Build and render a finished **20-second, 16:9, fast, aspirational mobile-app teaser** from this repository. Deliver the actual video and editable source, not only a storyboard, a website or a slideshow.

The film must make someone think: “That is a serious product. I want that on my phone.”

### 1. Creative idea

**MARKETS MOVE. MOVE WITH CLARITY.**

Turn fragmented market information into one coherent mobile intelligence. Open with speed and tension. Reveal Elyra as the organizing force. Show the app understanding a question, connecting someone's capital, surfacing intelligence and enabling an intentional next move. Finish with a confident, spacious product hero.

Aspiration comes from feeling informed and in control. The imagery should feel sophisticated, technically precise and expensive. Make the product itself desirable. Avoid wealth clichés, generic AI-brain imagery and stock trading footage.

This is a mobile product film with real interface details, kinetic typography and designed transitions. It is not a narrated feature tutorial. Default to **no voiceover**: typography, product motion, music and sound design carry the story. The meaning must remain clear with the sound muted.

### 2. Inspect the actual product first

Working directory: `/Users/ayush/Desktop/Elyra-dashboard`.

Read the relevant `AGENTS.md` files, then inspect:

- `README.md`, particularly the feature inventory, execution boundaries and deliberate Android brand deviations.
- `docs/ELYRA_BRAND.md` — authoritative. Root `brand.md` contains an obsolete deferred setup note.
- `mobile/src/app/(tabs)/` and the relevant components in `mobile/src/components/`.
- `mobile/src/components/ui/brand.tsx`, `mobile/src/theme/fonts.ts`, `mobile/src/theme/tokens.ts` and `lib/tokens.ts`.
- `output/teaser-20s/captures/README.md` and the fresh device captures in that folder.

A Solana Seeker is connected through ADB. Package: `xyz.getelyra.app`; URI scheme: `elyra`. You may inspect and capture the app, navigate tabs and open public asset views. Use the capture notes to decide whether an image is suitable as footage or only as a layout reference. If you operate the phone, restore its starting app view when finished. Do not submit trades, transfers, sign messages, change account settings or read secrets to make the video.

Use the existing assets:

- Original gold emblem: `mobile/assets/images/elyra-emblem.png`.
- Additional transparent emblem: `mobile/assets/elyra-login-assets/elyra_emblem_transparent.png`.
- General Sans and DM Serif Display: `mobile/assets/fonts/`.
- Fustat: find the installed app font assets or use the matching licensed font source.
- Optional real Seeker reference: `output/imagegen/references/solana-seeker-front-reference.png`. Inspect it before use.

Do not copy earlier promotional mockups blindly. The fresh app captures and current source determine the mobile interface.

### 3. Product inventory and how to use it

Elyra is an agentic crypto intelligence and trading workspace on Android. It has five main tabs: Markets, Portfolio, Elyra, Research and Account. Its strongest story is **understand → connect → anticipate → act**.

Existing capability families to represent across the visual system:

1. **Markets:** live market data, watchlists, asset search, candlestick charts, indicators/pivots and price alerts.
2. **Ask Elyra:** streaming answers with tool/source indicators; image, PDF and text attachments; voice dictation; persistent conversations.
3. **Capital Intelligence:** answers grounded in the user's portfolio, positions, activity and saved preferences/memory; personalized exposure and risk reasoning.
4. **Connected portfolio:** Solana wallet holdings, Hyperliquid and Binance account information, spot/perp visibility, P&L, allocation, DeFi deposits, capital health and liquidation headroom.
5. **Signals and smart money:** funding, open interest and market dislocations; consensus from tracked Hyperliquid wallets.
6. **Research:** public-company reports and PDFs, SEC filings/insider research, strategy backtests/comparisons, prediction-market intelligence, market recaps, signals, yield opportunities and token unlocks.
7. **Wallet actions:** Jupiter-routed swaps, transfers, QR receive/scanning, and wallet review/signing.
8. **Stay connected:** price-rule automation, push notifications and in-app inbox, wallet connections, account continuity across clients, referrals and wallet/email/Google/passkey sign-in surfaces.

These are a feature palette, not eight mandatory paragraphs of copy. Give Ask Elyra, Capital Intelligence and the connected portfolio the strongest screen time. Use the rest as intentional details in charts, research tabs, alert cards, source chips and peripheral feature planes. A viewer should understand the core promise after one watch and discover more detail on replay. Do not force every minor account feature into a headline.

**Product-vision extension, explicitly requested for this teaser:** show a polished conversational strategy builder, a what-if allocation simulator, proactive risk monitoring and a proposed automatic rebalancing workflow. Treat them as designed concept interfaces that belong to Elyra's visual language. Show a coherent flow: natural-language goal → risk condition → simulated allocation → strategy ready for review. Use a readable, discreet **“Product vision”** label throughout the concept shots. Do not use awkward “coming someday” placeholder cards. These additions should look fully art-directed.

Keep the production record accurate: source inspection does not verify live availability. Present-day exchange and prediction-market connections are read-only; current automation is alerts. Real swaps and transfers require the person's signature. Never make an actual transaction for the capture. Do not invent verified customer counts, performance, returns, partnerships or a launch date.

### 4. Visual direction

Use Elyra's actual palette:

- Base: forest `#101710`.
- Panels: `#182117` and `#1E281C`.
- Primary type: ivory `#F7F8EA`.
- Secondary type: stone `#B8BAA8`.
- Interactive accent: citron `#D2DC76`.
- Agent-generated output: lime `#E4EB9D`, especially the signature fine left rail.
- Positive market information: sage; negative information: clay, following the real tokens.
- The original emblem supplies the gold. Do not redesign or recolor it.

Maintain the dominant dark forest and ivory balance. Accent should guide the eye. Lime is not a generic price-up color. The product remains a flat, precise interface; depth belongs to the surrounding film composition and device staging.

Typography: Fustat for strong kinetic headlines and numerics; General Sans for interface/supporting copy; DM Serif Display for the Elyra wordmark and selected editorial brand moments, matching the mobile app. Use the fonts deliberately rather than mixing them inside every phrase.

The motion language has two main mechanisms: **type/image match cuts** and **controlled camera depth**. The transition grammar should be consistent: a candle becomes an agent rail; that rail becomes an allocation boundary; a research card becomes a strategy card; the final interface resolves into the logo lockup. Use actual alignment and geometry for these matches.

Show the app in a refined Android/Seeker-style silhouette, with an appropriate small camera cutout. Preserve the captured screen's native aspect ratio. Do not put an Android app in an iPhone frame. Use both full-device shots and generous macro crops; a tiny whole phone for 20 seconds wastes the horizontal canvas. In hero shots the device can occupy roughly 75–85% of frame height, while macro UI details fill much more of the canvas.

Headlines should generally be 100–160 px at 1080p; labels around 32–44 px; meaningful supporting type at least 28 px. Keep important text 96 px from the left/right edges and 64 px from the top/bottom. Fit type by measuring it, not by shrinking it into illegibility.

Use subtle olive falloff, fine texture and carefully controlled lighting outside the app to add depth. Keep the real logo sharp and unchanged. The cinematic wrapper can be more expressive than the product's own motion rules.

### 5. Exact timing and script

Master settings: **1920 × 1080, 60 fps, exactly 1,200 frames**. Optional 3840 × 2160 master if the render setup supports it reliably.

Soundtrack: **144 BPM, 4/4**. One beat is exactly **25 frames**; one bar is **100 frames**; 12 bars are exactly **20 seconds**. Frame ranges below are inclusive. Use frames as the authority; decimal timecodes are rounded for readability.

**Scene 1 — Frames 0–99 | 0.000–1.667 s | Bar 1**

Copy: **“Markets move.”**

Start on a designed first frame, not a fade up from black. Huge ivory type is already legible while cropped candles, market labels and fine data lines accelerate behind it. A single citron signal cuts through the field. The small Elyra signature can appear early, giving the opening brand ownership. Land the statement within the first few frames and hold it while the background moves. Do not reveal each letter so slowly that the phrase disappears before it is read.

Sound: immediate restrained low impact, filtered pulse, two fine ticks. Tension, not chaos.

**Scene 2 — Frames 100–199 | 1.667–3.333 s | Bar 2**

Copy: **“Move with clarity.”**

The data field snaps into a single Elyra phone on the downbeat. Show the real gold emblem, forest interface and serif wordmark. A fast camera move settles into a clean composition, with text opposite the device. This is the first aspirational product reveal. Motion blur belongs on the moving entrance, not the settled type.

Sound: first deep bass arrival and a short, precise air sweep.

**Scene 3 — Frames 200–399 | 3.333–6.667 s | Bars 3–4**

Copy: **“Ask Elyra.”**

Push into the native chat/Capital Intelligence interface. Show the concise question **“Where am I exposed?”** arriving as a quick, intentional text or voice-input gesture. Portfolio, positions, activity and memory context assemble into one short answer with exposure/risk/catalyst cards and source chips. Animate the signature lime agent rail as the answer resolves.

Use two or three short fragments, not an unreadable streamed essay. Have the question present by frame 220 and hold the resolved brief through frames 325–399. If financial values are illustrated rather than captured, keep them consistent, mark the visual as illustrative in a subtle legible way, and do not imply realized trading performance.

Sound: full beat enters; delicate UI tap, brief typing texture and a soft resolved note when the insight lands.

**Scene 4 — Frames 400–599 | 6.667–10.000 s | Bars 5–6**

Copy: **“All your capital.”**

Match the agent rail into the portfolio composition. Solana wallet, exchange positions and DeFi planes converge into a unified capital view. Show allocation and concentration/exposure details. Include a short, controlled liquidation-headroom or risk-detail macro, then return to one coherent view. Let the camera move through connected information instead of scattering arbitrary cards across the scene.

Sound: bass rhythm gains weight; three restrained alignment clicks follow the connected planes.

**Scene 5 — Frames 600–799 | 10.000–13.333 s | Bars 7–8**

Copy: **“See what matters.”**

Four two-beat detail shots, **50 frames each**:

- 600–649: **Signals** — funding/open-interest or a market dislocation.
- 650–699: **Smart money** — wallet traces converge into consensus.
- 700–749: **Research** — a report/backtest card, with prediction, yield and unlock details as supporting UI.
- 750–799: **Alerts** — one relevant event resolves into an Elyra notification/inbox card.

Keep the primary sentence stable while feature details change. Each micro-shot gets a single short label; no one is expected to read a paragraph in 0.833 seconds. Make this sequence rhythmically faster than the first half, while preserving hierarchy. Supporting detail can imply the breadth of the app without becoming a checklist.

Sound: tighter metallic percussion, brighter arpeggio, selective accents on the four meaningful transitions. Do not attach a huge whoosh to every cut.

**Scene 6 — Frames 800–999 | 13.333–16.667 s | Bars 9–10**

Copy: **“Your next move.”**

First bar, 800–899: show one already-prepared, native-looking swap-review screen with one deliberate wallet-approval gesture. The quote and review details are already present; do not try to show three successive forms in this short bar. Keep the person visibly in control. This is an illustrative UI animation; never submit a real swap for this film.

Second bar, 900–999: the product-vision burst. Use one persistent, focused strategy composition: **“Keep my allocation balanced”**, a risk condition, a compact what-if allocation chart and a rebalancing strategy ready for review. Let only two things change: highlight the condition, then resolve the allocation/ready status. Do not attempt four successive readable screens. Carry a readable **“Product vision”** label during these frames. The scene should communicate intent and capability, not imply guaranteed protection or profit.

Pull the busy layers inward during the last beat. Briefly remove the kick in the last half-beat before frame 1000 to create anticipation.

**Scene 7 — Frames 1000–1199 | 16.667–20.000 s | Bars 11–12**

Copy hierarchy:

**Elyra**

**Move with clarity.**

**Explore getelyra.xyz**

Land the logo/wordmark and product hero immediately on frame 1000. Place a large, beautifully lit Android phone showing Elyra opposite the brand lockup. Hold the readable final composition for the full **3.333 seconds**, with only a slight camera drift and natural lighting falloff. A small “On Solana Seeker” descriptor is optional if it fits the verified current product positioning; do not use an unverified store badge.

Sound: the final brand chord and low impact land exactly at frame 1000; a clean two-note sonic signature resolves; percussion thins out and all audio decays naturally by 20.000 seconds. No abrupt cut and no extra black frames.

### 6. Motion and readability rules

- Be fast through transitions, then let the important product state settle. Speed is designed acceleration, not constant shaking.
- Most major transitions should resolve in roughly 8–14 frames. Preserve readable holds around them.
- Use one focal point at a time, clear text hierarchy and intentional negative space.
- The big statements remain legible while the detail layer moves. Do not stack three competing headlines.
- Use tightly controlled easing with little or no bounce. Avoid springy, playful UI unless a specific small interaction justifies it.
- Use motion blur on fast visual movement. Keep settled headlines, the emblem and meaningful UI sharp.
- Design transitions from the geometry and meaning of the product. Do not alternate random zoom, glitch, wipe, spin and particle presets.
- Avoid full-screen strobes. No seizure-like flicker, constant chromatic aberration, floating coins, rockets, meme imagery, excessive glass, neon purple/blue or a particle tunnel.
- Do not stretch portrait screenshots to fill 16:9. Stage them properly and build macro-detail shots from the actual UI.

### 7. Music and sound design

Compose or obtain an original/cleared **144 BPM instrumental electronic cue**: precision techno with a cinematic progressive build. Confident, propulsive, sophisticated. No vocals, spoken samples, sentimental piano opening or long intro.

Palette: a deep controlled sub, short warm kick, dry restrained clap, fine metallic hats/ticks, syncopated arpeggio and a subtle wide harmonic bed. The first half feels focused and intelligent; the second half lifts into momentum. Bass must translate on headphones and the rhythmic detail must remain audible on phone speakers. Avoid a harsh festival drop or distorted bass wall.

Map the music to the actual scene boundaries: impact at 0; bass reveal at 1.667; full groove at 3.333; added weight at 6.667; increased top-end rhythm at 10; crescendo across 13.333–16.667; final logo chord at 16.667; clean tail by 20.

Use SFX as punctuation: restrained low impacts, short directional sweeps, fine alignment clicks, one insight-resolve tone and a two-note brand signature. Align important impacts within a frame of their visual events. Keep SFX below the music's main emotional line; no noisy whoosh pileup. As a working master target use approximately -14 LUFS integrated and a true peak at or below -1 dBTP, then listen and adjust for the actual cue. Deliver separate music and SFX stems if practical.

Use the standalone soundtrack prompt below if a music-generation tool is available. Generation may not follow exact bar timings; measure the output and edit it to this grid. If it cannot generate a 20-second cue, generate a longer original cue and edit it musically to these 12 bars. If no generator/cleared track is available, continue the visuals and produce an explicitly identified original scratch cue with locally available synthesis/audio tools; do not silently present a click track as finished sound design. Clearly report any soundtrack replacement still required.

### 8. Implementation and deliverables

Build an isolated **Remotion + React + TypeScript** video project under `marketing/elyra-teaser/`, or an equivalent isolated location if the repository already has a video workspace. Preserve the application source and dependencies. Do not turn the production Next.js app into the video project or deploy anything.

Read current Remotion documentation and the installed versions before choosing APIs. Drive animation, randomness and audio timing from deterministic frame data so preview and render agree. Use the current recommended media components for the installed version. Avoid runtime network dependencies in the final render: fonts, images, audio and the video UI must be available locally.

Useful official implementation references:

- Animation: https://www.remotion.dev/docs/animating-properties
- Audio/video: https://www.remotion.dev/docs/video-and-audio
- Rendering: https://www.remotion.dev/docs/render

Create reusable scene, typography, device, UI-card, transition and beat-grid components. Keep the frame timings, script and theme in editable configuration. A faithful React/SVG reconstruction of selected interface details is appropriate when it creates crisp, controllable motion. Keep its status clear as an illustrative or product-vision rendering; do not alter the actual application just to manufacture screenshot data.

Use screenshots for visual fidelity and real device moments. Do not depend on a live chart WebView inside the video renderer. Existing captures with empty/loading states are reference material; they should not become the hero shot. Preserve meaningful third-party chart attribution when actual chart footage is used.

Produce:

1. `output/teaser-20s/elyra-teaser-20s-16x9.mp4` — exactly 20 seconds, 1920×1080, 60 fps, H.264, high quality, stereo AAC.
2. A 4K master if the render environment can produce it reliably without compromising completion of the 1080p deliverable.
3. Editable project source with a short README explaining preview/render commands and asset replacement.
4. A contact sheet or representative stills for all seven scenes.
5. Music/SFX stems and an asset/license manifest if used; clearly identify concept graphics and illustrative data.

Quality-control the actual rendered file. Verify resolution, frame rate, exactly 1,200 frames/duration, audio presence and absence of clipping. Watch it at normal speed with sound, then muted, then at a smaller social-feed size. Inspect representative frames and both sides of every major transition. Fix clipped words, offscreen devices, stretched screenshots, fuzzy type, missing fonts, asset failures, incorrect brand colors and misaligned audio before delivery.

Make routine creative and implementation choices and complete the work. Do not stop after proposing a plan or request approval of every minor design decision. Ask only if essential access or information truly blocks progress. In the final response, link the render, source and stills and accurately state any remaining asset or soundtrack limitation.

---

## Standalone soundtrack-generation prompt

Create an ORIGINAL instrumental soundtrack for a premium mobile crypto-intelligence app film called Elyra. It should feel ambitious, precise, confident and expensive: controlled forward momentum, growing anticipation, then a resolved brand landing.

144 BPM, 4/4. Exactly 12 bars / 48 beats / 20.000 seconds if supported. Start on the downbeat immediately, without a pickup or silence. Keep a constant tempo. No vocals or speech.

Sound palette: warm short four-on-the-floor kick, deep clean controlled sub-bass with audible upper harmonics, dry subtle clap, crisp fine metallic hats, syncopated analog-style arpeggio and a spacious restrained harmonic bed. Minor-key tension that opens into a confident resolved final chord. Contemporary precision techno with a cinematic progressive build. Clear transients, breathing room, purposeful sound design. No imitation of an existing artist or copyrighted melody.

Arrange it to this grid:

- Bar 1 / 0.000–1.667: immediate low impact, filtered pulse, fine ticks; focused tension.
- Bar 2 / 1.667–3.333: deep bass and kick reveal; the product appears.
- Bars 3–4 / 3.333–6.667: full clean groove and a short intelligent arpeggio; insight resolves.
- Bars 5–6 / 6.667–10.000: add harmonic weight and momentum, keeping the mix uncluttered.
- Bars 7–8 / 10.000–13.333: increase metallic top-end rhythm for a fast feature montage.
- Bars 9–10 / 13.333–16.667: controlled crescendo; remove the kick for the final half-beat before the logo landing.
- Bar 11 downbeat / exactly 16.667: strongest elegant impact, resolved brand chord and delicate two-note signature.
- Bars 11–12 / 16.667–20.000: spacious held resolution; percussion recedes and the tail finishes naturally by the end of bar 12.

No festival EDM drop, aggressive wobble bass, orchestral trailer clichés, long risers, sentimental piano, melody clutter or abrupt cutoff. It must sound musical rather than like a metronome. Stereo, 48 kHz WAV preferred; provide music and percussion stems if possible.

If exact duration is unsupported, preserve the 144 BPM grid and generate enough material for an editor to extract this 12-bar structure. The final editor will verify and align the timing.
