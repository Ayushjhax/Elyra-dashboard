# Scout

Route `/scout`, beside the chart. Five tabs:

- **Read**: read any YouTube video, post on X or article, with every claim graded.
- **Smart money**: what Hyperliquid's most profitable traders just opened.
- **Auto-buys**: rules that trade on code-detected signals.
- **Poly scan**: Polymarket read three ways.
- **Poly baskets**: Polymarket outcomes held together on paper.

It costs nothing to run. The data is public: Hyperliquid, Polymarket, and the
Bybit, OKX and Upbit announcement feeds. The model is Gemini Flash on Google's
free tier (`GEMINI_API_KEY`).

## The idea

Two posts appear at once. One says an exchange has officially announced it will
list a token; the other says the community is speculating it might. Attention
goes to the louder one before either is read.

Scout puts every claim on one scale, by who said it and how it was said. It
shows the strongest evidence first, never the loudest. It then checks the
claim against what smart money actually did.

## Rules

- **The model reads; code decides.** Gemini lists each claim with the source's
  own words for it. Everything else is code:
  - a claim is kept only when its quote is in the source (`quoteFound`,
    `lib/scout/claims.ts`);
  - a statement or summary with a number the source does not hold is replaced
    (`staysOnFacts`);
  - the grade is computed by code (`lib/scout/grade.ts`).
- **Who is speaking comes from where the text came from, never from what it
  says.**
  - An article's tier comes from the host it was fetched from.
  - A post's tier comes from the author X's embed reports. The handle in a
    pasted link can be anything.
  - Videos and pasted text are always unverified.
- **Hedging wins.** A quote that hedges ("reportedly", "could", "sources say";
  "may", except before a date) is speculation, whatever kind the model chose.
- **Listings are checked against the exchanges' own feeds.**
  - A claim that names one exchange is settled only by that exchange's feed. A
    rumour that Binance will list HYPE is not confirmed by Upbit listing it.
  - Bybit, OKX and Upbit are read. A claim about Binance, Coinbase or another
    exchange whose feed is not free says so (`unreadable`) and keeps its grade.
  - Otherwise, a listing claim is confirmed when a feed announced that ticker
    in the last 21 days, and flagged with the feeds checked when none did.
  - Upbit's investment-warning notices (유의 종목) are not delistings and are
    left out.
- **Nothing a read finds is acted on.** Only code-detected signals trigger an
  auto-buy.
- **Cost is capped.** A read claims one daily run (`claimAgentRun`). A link
  anyone read in the last day is answered from the shared cache
  (`scout_sources`) with no model run. Market data is always fresh.

## Grades

| Grade | When |
|---|---|
| Confirmed | Any of: <ul><li>an announcement from the party itself (an official host or X handle);</li><li>a listing an official feed shows.</li></ul> |
| Reported | An announcement or report from a newsroom (`NEWSROOM_HOSTS`, `NEWSROOM_HANDLES`) |
| Unverified | Stated as fact by anyone else |
| Speculation | Framed as possible, or its quote hedges |
| Opinion | A view, a forecast or a price call |

Attention cues (`attentionCues`), such as 🚨, BREAKING, "!!" and ALL CAPS, are
counted and shown. They never change a grade.

## Read (`lib/scout/read.ts`)

1. **Fetch** (`lib/scout/fetch.ts`).
   - **Article:** `parseLink` refuses a link that could point inside a network.
     `fetchPage` then checks every address the name resolves to. It follows at
     most three redirects by hand, re-checking each, caps the body at 2.5 MB
     and reads HTML only. The article text comes from Open Graph, then JSON-LD
     (`articleBody`), then the page's paragraphs with scripts, navigation and
     footers removed (`lib/scout/html.ts`).

     Most newsrooms (CoinDesk, The Block, Decrypt) refuse servers behind bot
     walls. When the direct read is refused or finds no text, Google fetches
     the page for Gemini through its URL context tool, and Gemini copies the
     text (`copyPage`, labelled `page_copy`).

     The copy is credited to the host that refused Scout after following the
     link's redirects (`ScoutError.host`), never to the pasted address alone.
     An open redirect on an official site therefore cannot lend its standing
     to another page. A 404 is not retried this way.

     The page is parsed with linear scans (`stripBlocks`, the paragraph pass),
     never lazy regexes across the page, so a hostile page of unclosed tags
     cannot stall a read.
   - **Post on X:** `publish.twitter.com/oembed`. The embed dates a post only
     to the day, so its time comes from the status id (a snowflake,
     `snowflakeTime`).
   - **YouTube:** `youtube.com/oembed` gives the title and channel. Gemini reads
     the video by its address: the first 20 minutes, at low resolution
     (`transcribe`, `lib/scout/gemini.ts`).
2. **Claims.** Gemini answers in JSON held to `CLAIMS_SCHEMA`. It tries
   `gemini-3.5-flash`, then `gemini-3.5-flash-lite`, both free tier.
3. **Grades and the listing check.**
4. **Smart-money check** for each coin Hyperliquid trades, up to 5:
   - the move since the source was published, or over 24 hours;
   - what the cohort opened and closed in that window (at most a day);
   - whether the cohort holds the coin;
   - whether the source's lean agrees with what smart money did.

## Smart money (`lib/scout/flows.ts`, `lib/scout/smartMoney.ts`)

- **Cohort.** The cohort is the 30 most profitable of the existing leaderboard
  cohort (`smartMoneyCohort`, `lib/smartmoney/hyperliquid.ts`). Their last day
  of fills (`userFillsByTime`) is read six wallets at a time and shared for
  four minutes.
- **Opening vs closing.** Each fill's `dir` field ("Open Long", "Close Short",
  "Long > Short") tells opening from closing.
- **Flow signal.** A flow signal fires when at least 3 wallets opened one side
  inside the window and at most a third as many opened the other. It is
  counted by wallet, not by dollar.
- **Holdings.** These come from the existing consensus
  (`hyperliquidConsensus`).
- **Listings.** These come from Bybit's and OKX's documented public APIs and
  Upbit's notice feed, shared for three minutes (`lib/scout/announcements.ts`).
  Stock perps and tokenised shares are left out.

## Auto-buys (`lib/scout/autobuy.ts`, `lib/scout/engine.ts`)

A rule (`scout_rules`) sets:

- the trigger: `smart_money` or `listing`;
- the side to follow;
- the markets: any of Elyra's crypto and memecoin perps;
- the minimum wallets;
- size, leverage, take-profit and stop-loss, all held to `LIMITS`;
- trades a day, at most 5;
- paper or live.

A live rule is refused unless `liveRefusal` passes.

`runScoutTick` runs on the five-minute tick, after insider watch:

- It reads nothing unless a rule is active.
- A smart-money signal counts opens in the last hour.
- A listing fires only within two hours of the announcement.
- A rule acts on a coin at most once per UTC day for each trigger. The keys
  are `sm:{coin}:{day}` and `listing:{coin}:{day}`. A second exchange listing
  the coin does not buy it again, and the cohort flipping later that day does
  not open the opposite side.
- The fire row (`scout_fires`, unique on rule and signal) is written before
  the order.
- The order goes through `openMarketTrade`: `accountGate`, the live switch, and
  take-profit and stop-loss in the same request.
- The person is notified when a trade opens.
- At most 20 orders are placed per pass.

## Poly scan (`lib/poly/scanMath.ts`, `lib/poly/scan.ts`)

All reads use Data API v2 and Gamma, with no key.

- **Smart money.**
  - Reads Polymarket's 30-day PnL leaderboard (by category) and each top
    wallet's open positions.
  - An outcome shows when 3 or more of those wallets hold it and two thirds of
    the top wallets in that market agree.
  - Positions under $100 are left out, as are markets priced past 3¢ or 97¢
    and markets that have ended.
- **Movers.** The day's largest moves among markets with $25,000 or more of
  volume in 24 hours.
- **Book sums.** In events with one winner (`negRisk`), the YES asks should sum
  to about $1. Scout shows gaps of 0.5 points or more, before fees and depth.
  An event with a missing quote is skipped.

## Poly baskets (`lib/poly/basketMath.ts`, `lib/poly/baskets.ts`)

- **Paper only.** Elyra places no Polymarket orders.
- **Shape.** A basket has 2 to 8 outcomes, one per market, and a stake of
  $10–$10,000 split evenly.
- **Entry.** Each leg's entry walks the ask side of its book for its stake
  (`estimateExecution`). A book that cannot fill the stake refuses the basket.
- **Value.** Open legs are valued by walking the bids for their shares. All
  the books come from one batch request (`polymarketBooks`).
- **Settlement.** A leg settles at $1 or $0 once Gamma reports its market
  closed at 1/0.

## Tables (migration `0035_scout.sql`)

| Table | Holds |
|---|---|
| `scout_sources` | A link's claims, shared for a day. Never pasted text. |
| `scout_reads` | A person's reads, as they were when read |
| `scout_rules` | Auto-buy rules |
| `scout_fires` | What each rule did. Unique on (`rule_id`, `signal_key`) |
| `poly_baskets`, `poly_basket_legs` | Paper baskets |

RLS is on with no policies. Writes go through the service role, and every query
is filtered by `user_id`.

## Routes

| Route | Does |
|---|---|
| `GET/POST /api/scout/read` | The person's reads; read `{ url }` or `{ text }` |
| `GET /api/scout/smart-money?window=1h\|6h\|24h` | Flows, signals, holdings and listings. Public |
| `GET/POST /api/scout/autobuys`, `PATCH/DELETE /api/scout/autobuys/[id]` | Auto-buy rules |
| `GET /api/poly/scan?category=overall\|politics\|crypto\|sports` | Poly scan. Public |
| `GET/POST /api/poly/baskets`, `DELETE /api/poly/baskets/[id]` | Paper baskets |

## Not built

- **Reading X without a link.** X's API is paid. A post is read through its
  public embed, or pasted.
- **Transcripts past 20 minutes**, which would exceed the free tier's
  per-minute allowance.
- **Real Polymarket orders.**
- **Scout in the Android app.**
