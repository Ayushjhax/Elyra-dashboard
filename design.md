# Elyra Prediction Market Intelligence
## Polymarket real-time data, order books, probability baskets, technical signals, alerts, Agent + Telegram

## 0. Scope

Build Prediction Markets as a first-class Elyra capability across:

- Elyra Agent / Personalized
- Research
- Telegram bot
- Telegram Mini App
- Signal Engine
- NotificationService
- Backtesting Engine

Primary Phase-1 provider: **Polymarket**.

The system must use live Polymarket market data and order books, calculate deterministic order-book analytics and a probability basket, generate backtested technical signals, and surface the same data in the web Agent and Telegram.

A prediction signal may contain:

```text
Direction
Entry
Target
Stop / Invalidation
Risk / Reward
Historical Win Rate
Sample Size
Order-book evidence
Probability Basket
Liquidity
Spread
Freshness
Warnings
```

No numeric signal field may be invented by Claude or Gemini.

Claude/Gemini may explain deterministic tool results, but they cannot manufacture entry, target, stop, win rate, order-book imbalance, fair probability, or liquidity metrics.

A signal does **not** authorize a Polymarket order. Trading remains a separate PreparedAction → confirmation → authenticated execution flow.

For political prediction markets, keep the analytical layer neutral: report observable contract prices, order-book dynamics, historical signal behavior, and sourced public information. Do not turn Elyra's own political opinion into signal evidence or independent election-outcome advocacy.

---

# 1. Product placement

Recommended Research navigation:

```text
Research
├── Reports
├── Market Recap
├── Signals
├── Backtests
├── Prediction Markets
├── Yield
└── Unlocks
```

Suggested route:

```text
/research/prediction-markets
```

Telegram:

```text
/predictions
/signals
/alerts
```

Natural language remains primary.

---

# 2. Core user journeys

User can ask:

```text
Read the Polymarket order book for this market.
```

```text
Give me direction, entry, target, stop and win rate.
```

```text
What is Elyra's probability basket for this market?
```

```text
Show prediction markets with strong bid imbalance.
```

```text
Alert me if YES breaks 65¢ with strong book support.
```

```text
Show my prediction positions and estimate exit liquidity.
```

```text
Compare the live market price with the basket probability.
```

Same questions must work in Telegram.

---

# 3. Brand

Use current Elyra brand.

Typography:
- Fustat primary
- General Sans secondary
- tabular numerals for all market values

Palette:

```text
Elyra Green   #2E5129
Deep Forest   #1B3118
Moss          #45703D
Sage          #7A9E70
Mist Sage     #C3D6BC

Elyra Lime    #E4EB9D
Cream Lime    #F2F5D3
Citron        #D2DC76
Olive         #A8B44E
Khaki         #7C8535

Ivory         #F7F8EA
Stone         #B8BAA8
Slate         #5C5F52
Ink           #15170F

Clay          #C4633A
```

Do not copy Polymarket's visual theme.

---

# 4. High-level architecture

```text
Polymarket Official APIs / SDK / WebSocket
                  │
                  ▼
         PolymarketProvider
                  │
      ┌───────────┼──────────────┐
      │           │              │
      ▼           ▼              ▼
 Market       Order Books     User Data
 Discovery    + Trades        Positions/Orders
      │           │              │
      └───────────┴──────┬───────┘
                         ▼
            PredictionMarketStateService
                         │
          ┌──────────────┼────────────────┐
          ▼              ▼                ▼
 OrderBookAnalytics  ProbabilityBasket  Historical Data
          │              │                │
          └──────────────┼────────────────┘
                         ▼
              PredictionSignalEngine
                         │
           ┌─────────────┴────────────┐
           ▼                          ▼
 Prediction Backtests          Prediction Alerts
           │                          │
           └─────────────┬────────────┘
                         ▼
                 Signal Snapshot
                         │
                   ┌─────┴─────┐
                   ▼           ▼
                 Agent      Telegram
```

Telegram must not implement its own signal math.

---

# 5. Official Polymarket integration

Before implementing endpoints, inspect current official Polymarket documentation:

```text
https://docs.polymarket.com/llms.txt
```

Follow current official documentation/specs for:

- market discovery
- market details
- prices and order books
- public analytics
- real-time market feeds
- wallet activity
- positions
- open orders
- order lifecycle
- authenticated order updates
- OpenAPI specs
- AsyncAPI specs

Do not implement endpoint paths from memory if official schemas changed.

---

# 6. PolymarketProvider

Create or extend:

```text
PolymarketProvider
```

Required conceptual methods:

```ts
searchMarkets()
getMarket()
getMarketPrices()
getOrderBook()
getRecentTrades()
getPositions()
getOpenOrders()
getActivity()

subscribeMarket()
subscribeOrderBook()
subscribeTrades()
```

Use official SDK/API where practical.

---

# 7. Canonical market model

```ts
type PredictionMarket = {
  id: string
  provider: 'polymarket'
  eventId?: string

  question: string
  description?: string

  category?: string
  tags?: string[]

  outcomes: Array<{
    id: string
    label: string
    tokenId?: string
  }>

  status: 'open' | 'closed' | 'resolved' | 'cancelled'

  startsAt?: string
  endsAt?: string
  resolvedAt?: string

  volumeUsd?: number
  liquidityUsd?: number

  resolutionSource?: string
  marketUrl?: string

  updatedAt: string
}
```

---

# 8. Live outcome state

```ts
type PredictionOutcomeState = {
  marketId: string
  outcomeId: string
  label: string

  lastTradePrice?: number

  bestBid?: number
  bestAsk?: number

  midpoint?: number
  microprice?: number

  spread?: number
  spreadBps?: number

  bidDepthUsd?: number
  askDepthUsd?: number

  timestamp: string
}
```

Internal price domain:

```text
0..1
```

Display may be cents or percent.

---

# 9. Order book model

```ts
type PredictionOrderBook = {
  marketId: string
  outcomeId: string

  bids: Array<{ price: number; size: number; notional?: number }>
  asks: Array<{ price: number; size: number; notional?: number }>

  bestBid?: number
  bestAsk?: number
  midpoint?: number
  microprice?: number
  spread?: number

  sequence?: string | number

  timestamp: string
  source: 'polymarket'
}
```

Never reduce a market to only its last trade.

---

# 10. PredictionMarketStateService

Build:

```text
PredictionMarketStateService
```

Responsibilities:

1. initialize from official REST snapshot;
2. connect to official real-time feed;
3. update live price state;
4. maintain outcome order books;
5. maintain recent trades;
6. detect stale feeds;
7. reconnect with backoff;
8. re-snapshot after reconnect;
9. publish normalized internal events.

State machine:

```text
disconnected
→ connecting
→ snapshot
→ live
→ stale
→ reconnecting
→ snapshot
→ live
```

No actionable signal can be generated from a stale book.

---

# 11. PredictionSubscriptionManager

Create/reuse:

```text
PredictionSubscriptionManager
```

Reference-count subscriptions used by:

- open market page
- Agent
- active Telegram alert
- user position
- watchlist
- signal discovery

Do not open a separate upstream WebSocket connection for each user if shared subscriptions can be reused.

---

# 12. OrderBookAnalyticsService

Create:

```text
PredictionOrderBookAnalyticsService
```

Calculate deterministically:

```text
best bid
best ask
midpoint
spread
spread bps
microprice

top-1 bid depth
top-1 ask depth
top-5 bid depth
top-5 ask depth
top-10 depth

depth within 1¢
depth within 2¢

normalized order-book imbalance
weighted imbalance

persistent bid walls
persistent ask walls
support zones
resistance zones

book slope
liquidity vacuum
```

---

# 13. Order-book imbalance

Canonical form:

```text
(BidDepth - AskDepth) / (BidDepth + AskDepth)
```

Always retain the window used:

```text
top 5 levels
within 2 cents
```

Do not compare incompatible windows without labels.

---

# 14. Microprice

Calculate size-weighted microprice from top-of-book when valid.

Use it as a short-horizon analytical reference.

Never label it the true event probability.

---

# 15. Persistent liquidity zones

A single large order can disappear.

Support/resistance requires persistence.

Track:

```text
price level
cumulative depth
number of consecutive updates
lifetime
executions against level
```

Do not label a one-frame wall "strong support".

---

# 16. PredictionExecutionEstimator

Build:

```text
PredictionExecutionEstimator
```

Input:

```ts
{
  outcomeId,
  side: 'buy' | 'sell',
  notionalUsd?: number,
  shares?: number
}
```

Walk the live book.

Return:

```text
average execution price
worst execution price
estimated shares
slippage
book levels consumed
unfilled amount
```

Signal entry and position exit estimates must use executable depth when appropriate.

---

# 17. Probability Basket

Build:

```text
PredictionProbabilityBasketService
```

This is Elyra's **price/probability basketing** layer.

Phase-1 inputs:

```text
last trade
bid/ask midpoint
microprice
recent volume-weighted trade price
complementary YES/NO outcome
```

Optional later:

```text
related markets
external crypto reference model
other prediction providers
```

The basket must never be called "true probability".

Preferred label:

```text
Elyra Probability Basket
```

---

# 18. Fair-value model

```ts
type PredictionFairValueState = {
  marketId: string
  outcomeId: string

  observedLast?: number
  observedMid?: number
  microprice?: number
  recentVwap?: number

  complementaryNormalized?: number
  relatedMarketReference?: number
  externalModelReference?: number

  basketProbability?: number

  components: Array<{
    source: string
    value: number
    weight: number
    timestamp: string
  }>

  confidence: 'low' | 'medium' | 'high'
  warnings: string[]

  asOf: string
}
```

---

# 19. Binary YES/NO basket

For binary markets inspect both outcome books.

Calculate:

```text
YES midpoint
NO midpoint

YES microprice
NO microprice

YES/NO normalized reference
executable ask relationship
spread distortion
```

Optional normalized reference:

```text
P_yes = yesReference / (yesReference + noReference)
```

only if both sides are valid and fresh.

Keep observed prices untouched.

---

# 20. Multi-outcome safety

Only normalize across outcomes when they are verified as a mutually exclusive/exhaustive event set under current Polymarket structure.

Do not normalize arbitrary related markets.

Respect current negative-risk/combinatorial market mechanics.

---

# 21. Related-market service

Create optional:

```text
PredictionMarketRelationService
```

Relations must come from:
- provider metadata
- explicit deterministic rules
- manually verified mapping

Claude must not invent logical market relationships used in probability math.

---

# 22. External crypto reference

For markets like:

```text
Will BTC be above X at Y?
```

Elyra may use:

- Binance
- Jupiter/Birdeye
- Hyperliquid
- realized volatility
- time to expiry

as contextual model inputs.

Do not claim spot data alone determines the probability.

---

# 23. Basket deviation

Calculate:

```text
observedExecutablePrice - basketProbability
```

Possible interpretation:

```text
market_above_basket
market_below_basket
```

Do not automatically label every deviation "mispricing".

---

# 24. PredictionTechnicalSignalEngine

Create:

```text
PredictionTechnicalSignalEngine
```

Inputs:

```text
current market state
order-book analytics
recent trades
historical probability series
probability basket
time to resolution
liquidity
signal-strategy definition
historical backtest stats
```

---

# 25. Signal families

Initial families:

```text
probability_momentum
probability_mean_reversion
probability_breakout

orderbook_imbalance
microprice_divergence

basket_deviation
basket_convergence

support_break
resistance_break

spread_compression
spread_expansion

liquidity_breakout
volume_confirmation

cross_market_divergence
```

---

# 26. Required signal schema

```ts
type PredictionTechnicalSignal = {
  id: string

  marketId: string
  outcomeId: string

  marketQuestion: string
  outcomeLabel: string

  direction:
    | 'long_yes'
    | 'long_no'
    | 'long_outcome'
    | 'neutral'
    | 'watch'

  entry: {
    type: 'limit' | 'zone' | 'breakout' | 'confirmation'
    price?: number
    minPrice?: number
    maxPrice?: number
    trigger?: string
  }

  target: {
    price?: number
    minPrice?: number
    maxPrice?: number
    basis: string
  }

  stop: {
    price?: number
    invalidation?: string
    basis: string
  }

  riskReward?: number

  historicalWinRate?: {
    valuePct: number
    sampleSize: number
    strategyId: string
    strategyVersion: string
    lookback: string
    marketUniverse: string
    successDefinition: string
    dataSource: string
  }

  strength: 'low' | 'medium' | 'high'

  liquidityQuality: 'poor' | 'fair' | 'good'

  evidence: SignalEvidence[]

  generatedAt: string
  expiresAt?: string

  dataFreshnessMs: number
  warnings: string[]
}
```

---

# 27. Direction

User-facing direction should be explicit:

```text
LONG YES
LONG NO
WATCH
NEUTRAL
```

Do not use generic `BUY` without stating the outcome.

If bearish on YES, prefer `LONG NO` where that is the executable expression.

---

# 28. Entry

Entry must be generated by deterministic strategy logic.

Inputs may include:

- executable ask
- support zone
- breakout level
- spread
- basket deviation
- liquidity

Examples:

```text
Entry 61–63¢
```

or:

```text
Trigger above 64¢ only if top-5 bid imbalance remains > 0.25.
```

If market has already moved beyond the entry zone:

```text
Entry missed
```

Do not chase silently.

---

# 29. Target

Supported methods:

```text
next persistent liquidity zone
basket convergence
fixed probability points
volatility-scaled move
risk/reward multiple
historical move distribution
```

Validate:

```text
0 <= target <= 1
```

Round to valid market tick.

---

# 30. Stop / invalidation

Supported:

```text
hard probability level
support break
order-book imbalance reversal
basket invalidation
time stop
```

Prefer label:

```text
Invalidation
```

when a stop cannot be guaranteed to fill.

---

# 31. Stop execution warning

A thin order book can gap.

Signal panel should distinguish:

```text
Invalidation level
```

from:

```text
Guaranteed execution price
```

Never promise guaranteed stop fills.

---

# 32. Risk/reward

For numeric long-outcome setup:

```text
Reward = target - entry
Risk = entry - stop
R:R = Reward / Risk
```

Compute in backend.

Validate target/entry/stop ordering.

---

# 33. Historical win rate

Win rate **must** come from the existing Backtesting Engine.

Never let the Agent say:

```text
Win Rate 72%
```

without a stored/deterministic backtest result.

Display:

```text
Historical Win Rate
58.4% · 137 comparable signals
```

And retain:

```text
strategy version
sample size
date range
market universe
success definition
```

---

# 34. Success definition

Store exactly what counts as a win.

Examples:

```text
Target hit before invalidation after entry.
```

or:

```text
Outcome settles in directional favor.
```

These cannot be mixed.

---

# 35. Insufficient sample

If sample is too small:

```text
Historical Win Rate
Insufficient sample · 14 comparable signals
```

Do not headline an unstable percentage.

---

# 36. PredictionSignalStrategyRegistry

Create:

```text
PredictionSignalStrategyRegistry
```

Initial strategies:

```text
PM_MOMENTUM_BREAKOUT_V1
PM_MEAN_REVERSION_V1
PM_ORDERBOOK_IMBALANCE_V1
PM_MICROPRICE_DIVERGENCE_V1
PM_BASKET_CONVERGENCE_V1
PM_SUPPORT_BREAK_V1
PM_VOLUME_BREAKOUT_V1
```

All rules must be explicit and versioned.

---

# 37. PM_ORDERBOOK_IMBALANCE_V1

Example parameters:

```text
imbalanceWindow = top5
minImbalance = 0.25
maxSpread = configurable
minDepthUsd = configurable
persistenceUpdates = configurable
```

Long conditions:

```text
bid imbalance >= threshold
microprice > midpoint
spread acceptable
depth acceptable
condition persists N updates
```

Entry:
current executable ask / validated limit zone.

Target/stop:
configured deterministic methodology.

---

# 38. PM_BASKET_CONVERGENCE_V1

Long an outcome when:

```text
basketProbability - executableAsk >= minEdge
basket components fresh
spread <= max
liquidity >= min
```

Exit:

```text
convergence
target
invalidation
time expiry
```

Backtest only if historical basket inputs exist.

---

# 39. PM_MOMENTUM_BREAKOUT_V1

Use historical probability series.

Possible deterministic inputs:

```text
EMA
ROC
volume
probability breakout level
```

Version rules.

---

# 40. Existing technical indicators

Reuse the existing Backtesting Engine's indicator library where mathematically useful:

```text
RSI
MACD
Bollinger
EMA
VWMA
momentum
volatility
```

Do not blindly run all twenty technical indicators on every prediction market.

---

# 41. Time-to-resolution

Every signal includes:

```text
timeToResolution
```

Market behavior close to resolution differs from an early market.

Signal eligibility/strength may be adjusted deterministically.

---

# 42. Resolution proximity

Suggested classifications:

```text
far
medium
near
imminent
```

Strategy can disable itself in imminent state.

---

# 43. Event-risk windows

Known event windows may cause discontinuous price changes.

Add:

```text
eventRisk = true
```

where applicable.

Do not present ordinary chart-pattern confidence as unaffected by imminent event resolution.

---

# 44. Liquidity gates

Actionable signal must be downgraded/disabled if:

```text
book stale
spread too wide
depth too low
volume too low
```

A high-strength signal cannot come from poor liquidity.

---

# 45. Strength model

Strength is deterministic:

```text
technical confirmation
order-book confirmation
basket agreement
liquidity quality
historical robustness
```

Output only:

```text
Low
Medium
High
```

Do not output arbitrary AI-confidence percentages.

---

# 46. Evidence model

```ts
type SignalEvidence = {
  key: string
  label: string
  value: number | string
  direction: 'supports' | 'contradicts' | 'neutral'
  source: string
  timestamp: string
}
```

---

# 47. Conflicting evidence

If:

```text
momentum positive
book imbalance negative
basket neutral
```

signal can become:

```text
WATCH
```

Do not force direction.

---

# 48. Freshness and expiry

Every signal:

```text
generatedAt
expiresAt
```

If required live data becomes stale:

```text
Signal paused
```

---

# 49. Prediction backtesting

Extend HistoricalMarketDataService for prediction markets.

Possible normalized historical bar:

```ts
type PredictionMarketBar = {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number

  spread?: number
  bidDepth?: number
  askDepth?: number
  imbalance?: number
}
```

Only populate fields actually available.

---

# 50. Historical order-book limitation

If official/current historical data does not contain depth snapshots:

- price-based strategies may be backtested;
- order-book strategies may not have historical win rate.

Start collecting order-book features going forward.

Never reconstruct fake depth.

---

# 51. PredictionSignalBacktestService

Create:

```text
PredictionSignalBacktestService
```

Input:

```ts
{
  strategyId,
  strategyVersion,
  marketUniverse,
  dateRange,
  parameters,
  successDefinition
}
```

Output:

```text
wins
losses
sampleSize
winRate
averageReturn
averageRiskReward
warnings
```

---

# 52. Comparable market universe

Historical win rate must define universe.

Examples:

```text
liquid binary crypto markets
spread <= 5¢
7–30 days to resolution
entry probability 40–70%
```

Do not pool all market classes blindly.

---

# 53. Probability bands

Optionally segment historical results:

```text
0–20%
20–40%
40–60%
60–80%
80–100%
```

Contract behavior differs by price.

---

# 54. Historical vs forward track record

Show separately:

```text
Historical Backtest Win Rate
Forward Tracked Signal Win Rate
```

Never merge them.

---

# 55. Signal lifecycle

```text
generated
→ waiting_entry
→ entered
→ target_hit / invalidated / expired
```

If entry never occurs, it is not a win/loss.

---

# 56. Forward signal tracking

Once generated:
- watch live market;
- detect valid entry;
- track target/invalidation;
- record forward result.

This remains paper tracking, not auto trading.

---

# 57. PredictionAlertEngine

Extend NotificationService.

Alerts:

```text
price_above
price_below
probability_change
breakout
orderbook_imbalance
spread_expansion
spread_compression
liquidity_change

signal_new
signal_strengthened
signal_weakened
signal_entry
signal_target
signal_invalidated
signal_expired

market_resolution
position_pnl
order_fill
```

---

# 58. Alert state machine

No notification spam.

For thresholds:

```text
below
→ crossed
→ active
→ reset
```

For signals:

```text
new
→ active
→ strengthened/weakened
→ target/invalidated/expired
```

---

# 59. Natural-language alerts

Support:

```text
Alert me if YES crosses 65%.
```

```text
Alert me if bid imbalance is above 0.3.
```

```text
Alert me when this setup enters.
```

```text
Alert me if target is hit.
```

```text
Alert me if the signal becomes invalid.
```

Compile to validated alert rules.

No model-generated executable code.

---

# 60. Telegram `/predictions`

Menu:

```text
Prediction Markets

[Trending]
[My Positions]

[Signals]
[Alerts]

[Search]
[Open Elyra]
```

---

# 61. Telegram prediction signal

Example:

```text
Prediction Signal

Market
Will ... ?

Outcome
YES

Direction
LONG YES

Entry
61–63¢

Target
70¢

Invalidation
57¢

Risk / Reward
1.8

Historical Win Rate
58.4% · 137 signals

Order Book
Imbalance +0.31
Spread 2¢
Microprice 62.4¢

Basket
64.1%

Strength
Medium

[Live Book]
[Set Alert]
[Backtest]
[Open Market]
```

Render only available real values.

---

# 62. Telegram live order book

Natural language:

```text
read the orderbook
```

or button:

```text
[Live Book]
```

Output:

```text
YES Order Book

Best Bid       61¢
Best Ask       63¢
Mid            62¢
Microprice     62.4¢
Spread          2¢

Top-5 Depth
Bid   $18.2k
Ask   $11.4k

Imbalance
+0.23

[Refresh]
[Set Alert]
```

---

# 63. Telegram probability basket

User:

```text
what is the fair price?
```

Response:

```text
Elyra Probability Basket

Observed Mid
62.0%

Microprice
62.4%

YES/NO Normalized
63.2%

Basket
64.1%

Difference vs Market
+2.1 pts

Analytical reference, not guaranteed probability.

[Signal]
[Order Book]
```

---

# 64. Telegram prediction alerts

Integrate with existing `/alerts`.

Example notification:

```text
Polymarket Signal Triggered

Market
...

Direction
LONG YES

Entry zone
61–63¢

Current
62.5¢

Target
70¢

Invalidation
57¢

Historical Win Rate
58.4% · 137 comparable signals

[View Signal]
[Live Book]
```

---

# 65. Telegram target alert

```text
Signal Update

Target reached.

Market
...

Entry
61–63¢

Target
70¢

Current
70.5¢

[View Result]
```

Only for a previously tracked signal.

---

# 66. Telegram invalidation alert

```text
Signal Invalidated

YES fell below the 57¢ invalidation level.

The previous setup is no longer active.

[Live Book]
```

---

# 67. Telegram privacy

User positions, orders and private account details:
private chats only.

Public market signals may be viewable in group chat only if existing bot privacy policy allows it.

Safest Phase 1:
keep all prediction account tooling in private chat.

---

# 68. Telegram Mini App

Prediction Market views:

```text
Discover
Market Detail
Order Book
Signals
Alerts
My Positions
Orders
Activity
```

Reuse the existing Elyra Mini App and Privy identity.

---

# 69. Web Prediction Markets page

Recommended:

```text
PREDICTION MARKETS                               Live ●

Search markets...

[Trending] [Signals] [My Positions] [Alerts]

Question                     YES   NO  Volume  Liquidity  Signal
...
```

---

# 70. Market detail page

Show:

```text
Question
Resolution rules
Time remaining

YES / NO live prices
Spread
Volume
Liquidity

Price / Probability chart
Elyra Probability Basket

Order Book
Recent Trades

Technical Signal
Direction
Entry
Target
Invalidation
Historical Win Rate

My Position
Alerts
```

---

# 71. Probability chart

Possible series:

```text
observed midpoint
last trade
Elyra basket
signal markers
```

Clearly label basket as analytical.

---

# 72. Order-book UI

Desktop depth:

```text
ASKS
Price | Size | Cumulative

-----------------
Mid / Microprice
-----------------

BIDS
Price | Size | Cumulative
```

Use Elyra colors.

---

# 73. Signal panel

Example:

```text
TECHNICAL SIGNAL

Direction
LONG YES

Entry
61–63¢

Target
70¢

Invalidation
57¢

R:R
1.8

Historical Win Rate
58.4%
137 comparable signals
PM_ORDERBOOK_IMBALANCE_V1

Strength
Medium

Evidence
✓ persistent top-5 bid imbalance
✓ microprice above midpoint
✓ market below basket
△ resolution approaching

Generated
12 seconds ago
```

---

# 74. Agent semantic tools

Add:

```text
prediction.search_markets
prediction.get_market
prediction.get_live_state
prediction.get_orderbook
prediction.get_recent_trades

prediction.get_positions
prediction.get_open_orders

prediction.get_orderbook_analytics
prediction.get_probability_basket

prediction.get_signal
prediction.list_signals
prediction.backtest_signal
prediction.get_signal_history

prediction.create_alert
prediction.list_alerts
prediction.delete_alert
```

---

# 75. Agent signal flow

For:

```text
Give me direction, entry, target, stop and win rate.
```

Tool plan:

```text
resolve market
→ fetch live state
→ fetch live order book
→ order-book analytics
→ probability basket
→ strategy selection
→ backtest statistics
→ liquidity/freshness checks
→ deterministic signal
→ Agent explanation
```

---

# 76. Agent numeric integrity

Claude/Gemini must never create:
- entry;
- target;
- stop;
- R:R;
- win rate;
- book imbalance;
- basket probability.

Those numbers come from tool outputs.

Agent prose should be validated/templated against result fields.

---

# 77. User positions

When connected, show:

```text
Outcome
Shares
Average Entry
Current Mark
PnL
Estimated Exit Price
Estimated Exit Slippage
```

Use upstream data when available.

Do not infer realized PnL from the current book.

---

# 78. Position exit liquidity

Estimate:

```text
exit 25%
exit 50%
exit 100%
```

by walking current book.

Agent may say:

```text
A full exit would consume 4 price levels and has materially worse execution than the midpoint.
```

---

# 79. Pricing hierarchy

Use different references for different tasks:

```text
display mark
→ provider mark/mid where appropriate

executable entry/exit
→ actual book walk

technical signal
→ microprice + book + basket

portfolio estimation
→ existing normalized portfolio methodology
```

Do not use last trade for every purpose.

---

# 80. Real-time storage

Hot state:
- in-memory + shared Redis/pubsub if existing horizontal architecture needs it.

Persist:
- sampled market state;
- selected book features;
- signal-trigger snapshots.

Do not store every raw WebSocket update forever by default.

---

# 81. Book snapshot schema

```ts
type StoredPredictionBookSnapshot = {
  marketId: string
  outcomeId: string
  timestamp: string

  bestBid?: number
  bestAsk?: number

  bidDepth1?: number
  askDepth1?: number

  bidDepth5?: number
  askDepth5?: number

  imbalance5?: number
  microprice?: number

  rawDepthRef?: string
}
```

---

# 82. Signal persistence

```ts
type PredictionSignalRecord = {
  id: string

  marketId: string
  outcomeId: string

  strategyId: string
  strategyVersion: string

  signal: PredictionTechnicalSignal

  status:
    | 'generated'
    | 'waiting_entry'
    | 'entered'
    | 'target_hit'
    | 'invalidated'
    | 'expired'
    | 'cancelled'

  createdAt: string
  updatedAt: string
}
```

---

# 83. Market discovery

Search/filter:
- query;
- category;
- status;
- end date;
- volume;
- liquidity.

Trending must be deterministic, e.g. based on:
- volume;
- probability change;
- trade rate;
- liquidity.

Do not let LLM label markets trending without metrics.

---

# 84. Signal discovery

For:

```text
show strongest prediction setups
```

Filter out:
- stale books;
- insufficient liquidity;
- excessive spread;
- invalid backtest sample;
- expired markets.

Sort transparently.

---

# 85. Tick size

Use current market metadata.

Create/reuse:

```text
PredictionPriceNormalizer
```

Every entry/target/stop must be valid for current tick.

---

# 86. Outcome execution semantics

Maintain separate YES and NO books.

For LONG YES:
use YES ask for executable entry.

For LONG NO:
use NO ask.

Do not treat YES bid as identical to NO ask.

---

# 87. Resolution data

Show official resolution rules/source where available.

Technical signal does not override market resolution mechanics.

---

# 88. Political markets

For political markets:
- technical signals describe contract price behavior;
- order-book data remains factual;
- Polymarket prices are market prices, not Elyra political opinions;
- if public narrative research is added, use neutral sourced reporting;
- do not independently tell the user who will win or who to support.

---

# 89. Trading boundary

Do not introduce automatic Polymarket trading.

If authenticated trading already exists, signal can offer:

```text
[Prepare Order]
```

Flow:

```text
fresh book
→ execution estimate
→ PreparedAction
→ explicit confirmation
→ authenticated order
```

Never directly execute from signal card or Telegram alert.

---

# 90. Entry-missed handling

If market leaves entry zone:

```text
Signal status: Entry missed
```

Do not silently revise entry upward.

A revised setup should be a new signal/version.

---

# 91. Alerts from signal lifecycle

Support:
- waiting;
- entry triggered;
- target;
- invalidation;
- expiry.

Signal alert rules reference stored signal ID, not model text.

---

# 92. Provider health

Extend ProviderHealthService with:

```text
polymarket_rest
polymarket_realtime
polymarket_user
```

Track:
- latency;
- last event;
- stream lag;
- reconnect count;
- errors;
- rate limiting.

---

# 93. REST fallback

If realtime feed fails:
- optional REST polling;
- mark degraded;
- disable microstructure signals that require realtime fidelity.

Do not represent polling as equivalent to realtime.

---

# 94. Capability registry

Add:

```text
prediction.market_discovery
prediction.market_details
prediction.realtime
prediction.orderbook
prediction.orderbook_analytics
prediction.probability_basket
prediction.positions
prediction.signals
prediction.signal_backtest
prediction.alerts
```

---

# 95. Capability self-check

Before signal:

```text
market details          required
live price              required
order book              required for book strategy
history                 required for win rate
strategy                required
```

Optional:
- related markets;
- external model;
- user position.

Gracefully degrade.

---

# 96. API routes

Follow repository convention.

Conceptual:

```text
GET /api/prediction-markets/:id/live
GET /api/prediction-markets/:id/orderbook
GET /api/prediction-markets/:id/basket
GET /api/prediction-markets/:id/signal

GET /api/prediction-signals
GET /api/prediction-signals/:id

POST /api/prediction-alerts
GET /api/prediction-alerts
PATCH /api/prediction-alerts/:id
DELETE /api/prediction-alerts/:id
```

Server derives user identity.

---

# 97. Database additions

Reuse existing DB.

Possible new tables:

```text
prediction_market_snapshots
prediction_book_snapshots
prediction_signals
prediction_signal_outcomes
prediction_alert_rules
prediction_watchlist
```

Do not duplicate existing:
- positions;
- orders;
- notifications;
- backtest result tables.

---

# 98. Testing — provider

Mock:
- market search;
- detail;
- order book;
- trades;
- positions;
- open orders;
- realtime stream;
- reconnect/resnapshot.

---

# 99. Testing — order book

Exact unit tests:
- best bid/ask;
- spread;
- midpoint;
- microprice;
- imbalance;
- top-N depth;
- empty book;
- crossed book;
- zero size;
- tick normalization.

---

# 100. Testing — basket

Test:
- binary YES/NO;
- stale side;
- missing side;
- normalization;
- valid bounds;
- confidence downgrade;
- unrelated market rejection.

---

# 101. Testing — signals

Test:
- direction;
- entry;
- target;
- stop;
- R:R;
- stale book;
- low liquidity;
- wide spread;
- conflicting evidence;
- expiration.

---

# 102. Testing — win rate

Test:
- entry occurs;
- target first;
- stop first;
- no entry;
- time expiry;
- insufficient sample.

---

# 103. Testing — Agent

Queries:

```text
read the polymarket orderbook
```

```text
give me direction entry target stop win rate
```

```text
what is the basket probability
```

```text
alert me if YES breaks 65
```

Ensure all numeric output originates from deterministic tools.

---

# 104. Testing — Telegram

Test:
- `/predictions`;
- prediction signal;
- live book;
- basket;
- alert creation;
- alert dedupe;
- target;
- invalidation;
- stale realtime feed;
- user position privacy.

---

# 105. Security

Required:
- user positions scoped by auth;
- private Telegram account data only in private chat;
- no secrets in LLM context;
- validated market/outcome IDs;
- no arbitrary model code;
- no automatic trading;
- alert ownership checks;
- signal ownership where private.

---

# 106. Observability

Track:

```text
Polymarket REST latency
realtime connection status
stream lag
reconnect rate
order-book updates/sec
signal generation latency
alert latency
stale-market count
backtest sample size
```

---

# 107. Analytics

Events:

```text
prediction_market_opened
prediction_orderbook_opened
prediction_signal_viewed
prediction_signal_backtested
prediction_alert_created
telegram_prediction_signal_viewed
telegram_prediction_alert_created
```

Do not log private raw chat by default.

---

# 108. Phase 1

Ship:

- real Polymarket discovery;
- live market data;
- live order books;
- recent trades;
- user positions/orders where already authenticated;
- order-book analytics;
- executable-price estimator;
- binary Probability Basket;
- technical Signal Engine;
- Direction;
- Entry;
- Target;
- Stop/Invalidation;
- R:R;
- historical win rate when backtest data supports it;
- signal freshness;
- prediction alerts;
- Agent integration;
- Telegram integration;
- Mini App market/order-book/signal views;
- historical price-strategy backtests.

---

# 109. Phase 1.5

Add:

- persistent order-book history;
- order-book historical strategy backtests;
- related-market basket;
- richer multi-outcome constraints;
- forward signal track record.

---

# 110. Definition of done

Complete when:

- current official Polymarket APIs/streams are used;
- real-time state works;
- books are normalized;
- reconnect/resnapshot works;
- stale data blocks actionable signal;
- order-book analytics work;
- Probability Basket works;
- signal has Direction;
- signal has Entry;
- signal has Target;
- signal has Stop/Invalidation;
- R:R is deterministic;
- win rate is from Backtesting Engine;
- sample size is shown;
- insufficient history is handled;
- Agent supports prediction technical signals;
- Telegram supports prediction technical signals;
- Telegram alerts work;
- order-book view works;
- private positions remain private;
- no automatic trading is added;
- existing Research/Backtests/Signals/Portfolio remain intact;
- typecheck passes;
- lint passes;
- tests pass;
- production build passes.

---

# 111. Final product bar

A user should be able to ask:

```text
Read this Polymarket order book and give me direction, entry, target, stop and win rate.
```

Elyra should:

```text
resolve market
→ load live Polymarket data
→ load YES/NO books
→ calculate spread, depth, microprice, imbalance
→ calculate Elyra Probability Basket
→ evaluate deterministic strategy
→ fetch valid historical backtest statistics
→ enforce liquidity and freshness gates
→ create a structured signal
→ explain it in Agent/Telegram
```

Then:

```text
alert me when this setup triggers
```

should create a real signal-lifecycle alert using the same backend.

The standard is:

> **Real-time Polymarket microstructure + executable pricing + probability baskets + backtested strategy rules + auditable alerts.**
