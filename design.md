# design.md — Elyra Unified Agent + Telegram Capital OS

## 0. Document purpose

This document specifies the full product and engineering architecture for extending **Elyra** into one unified, personalized capital intelligence system across:

1. the existing Elyra web dashboard;
2. the existing Personalized / Agent experience;
3. a new Telegram bot;
4. a Telegram Mini App;
5. a shared portfolio, wallet, memory, alerts, provider-data, and execution backend.

The implementation must connect and normalize data from:

- Jupiter
- Birdeye
- Kamino
- Raydium
- DFlow
- Hyperliquid
- Polymarket
- Binance public market data

It must continue using:

- Privy for Elyra identity and wallet ownership;
- Claude and Gemini for agent reasoning;
- Elyra's existing Portfolio and Assets infrastructure wherever it exists;
- preview → explicit confirmation → execution for all money-moving actions.

### Product principle

**There is one Elyra user, one identity graph, one portfolio, one memory system, one agent runtime, and one execution layer. Web and Telegram are only different clients.**

Do not build a separate Telegram wallet database, separate Telegram portfolio, or separate Telegram AI agent.

---

# 1. Immediate credential rule

A Jupiter credential has been shared outside the intended secret store during development.

The implementation must:

- never copy that literal credential into source code;
- never place it in this document;
- never place it in tests, screenshots, logs, prompts, analytics, or README files;
- read Jupiter credentials only from `.env.local` / production secret storage;
- support rotating the credential without code changes.

Before production, rotate any credential that was exposed outside the intended secrets manager.

Expected server-only variables:

```env
JUPITER_API_KEY=
BIRDEYE_API_KEY=

ANTHROPIC_API_KEY=
GEMINI_API_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
APP_URL=https://try.getelyra.xyz
```

Optional later:

```env
DFLOW_API_KEY=
BINANCE_API_KEY=
BINANCE_API_SECRET=
POLYMARKET_API_KEY=
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=
```

Never use `NEXT_PUBLIC_` for any secret.

---

# 2. Elyra brand system

All new dashboard UI and Telegram Mini App UI must preserve the supplied Elyra brand.

## Typography

Primary: **Fustat**

Use for:
- headings;
- financial values;
- tabs;
- buttons;
- navigation;
- card titles;
- important labels.

Secondary: **General Sans**

Use for:
- conversation body;
- metadata;
- timestamps;
- descriptions;
- helper text;
- source labels.

Use tabular numerals for prices, balances, PnL, and percentages.

## Palette

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

Recommended semantic tokens:

```css
--elyra-bg: #050704;
--elyra-panel: #090c08;
--elyra-panel-raised: #0d110c;
--elyra-panel-soft: #11160f;

--elyra-border: rgba(168,180,78,.18);
--elyra-border-strong: rgba(228,235,157,.30);

--elyra-text: #F7F8EA;
--elyra-text-secondary: #B8BAA8;
--elyra-text-muted: #6f7467;

--elyra-positive: #7A9E70;
--elyra-accent: #E4EB9D;
--elyra-negative: #C4633A;
```

Design character:
- near-black;
- institutional;
- compact;
- data-dense;
- restrained lime;
- thin olive borders;
- no generic blue/purple AI gradients;
- no consumer-bank rainbow cards;
- no permanent neon glow;
- no large glassmorphism panels.

---

# 3. User experience vision

A user should be able to ask Elyra from either web or Telegram:

```text
What should I care about today?
```

and Elyra should understand:

- current Privy wallet;
- wallet balances;
- portfolio equity;
- asset allocation;
- Hyperliquid exposure;
- Kamino positions;
- Raydium LP/owner positions;
- Polymarket exposure;
- current orders;
- recent activity;
- market prices;
- user risk preferences;
- past conversation;
- alerts;
- capital available to deploy.

The user should not need to specify which API to query.

For example:

```text
How much SOL do I own?
```

should return separate concepts:

```text
Direct SOL holdings
SOL collateral
SOL-related LP exposure
SOL perpetual notional
Net directional exposure (only if correctly calculable)
```

Do not mathematically combine 10 SOL spot with a $1,000 SOL perpetual as though both are token balances.

---

# 4. Product boundaries

## Portfolio

Portfolio answers:
- how much capital do I have?
- how has it performed?
- how is it allocated?
- what drove PnL?

## Assets

Assets answers:
- where are funds held?
- what balances do I have?
- what accounts/venues exist?
- what positions/orders/history exist?
- what can I deposit/swap/transfer/withdraw?

## Personalized / Agent

Agent answers:
- what matters for me?
- what changed?
- how does this market move affect my capital?
- where is my risk?
- what actions could I take?
- what do my preferences imply?

## Telegram

Telegram is a channel into the same Personalized / Agent system.

It does not own separate business logic.

---

# 5. High-level architecture

```text
                   ┌───────────────────────────┐
                   │     Elyra Dashboard       │
                   │ Portfolio / Assets / AI   │
                   └─────────────┬─────────────┘
                                 │
                                 │ Privy authenticated user
                                 ▼
                  ┌────────────────────────────┐
                  │      Elyra API / BFF       │
                  │ Auth + domain boundaries   │
                  └─────────────┬──────────────┘
                                │
          ┌─────────────────────┼─────────────────────────┐
          │                     │                         │
          ▼                     ▼                         ▼
┌───────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Personalized      │  │ Portfolio          │  │ Action / Execution │
│ Agent Runtime     │  │ Aggregation        │  │ Orchestrator       │
│ Claude + Gemini   │  │ Service            │  │                    │
└─────────┬─────────┘  └─────────┬──────────┘  └─────────┬──────────┘
          │                      │                       │
          └──────────────┬───────┴───────────────┬───────┘
                         │                       │
                         ▼                       ▼
             ┌────────────────────┐      ┌──────────────────┐
             │ Provider Adapters  │      │ Privy / Signers  │
             └──────────┬─────────┘      └──────────────────┘
                        │
  ┌─────────┬───────────┼────────┬─────────┬────────────┬───────────┐
  ▼         ▼           ▼        ▼         ▼            ▼           ▼
Jupiter  Birdeye     Kamino   Raydium    DFlow    Hyperliquid  Polymarket
                                                                  │
                                                                  ▼
                                                               Binance


                   ┌───────────────────────────┐
                   │       Telegram Bot        │
                   │ webhook + commands + AI   │
                   └─────────────┬─────────────┘
                                 │
                        Telegram numeric user ID
                                 │
                                 ▼
                   ┌───────────────────────────┐
                   │ Privy user resolution     │
                   └─────────────┬─────────────┘
                                 │
                                 └── same services above
```

---

# 6. The most important engineering rule: semantic Elyra tools

Claude and Gemini must not receive a giant list of vendor-specific endpoints.

Bad tool design:

```text
birdeye_wallet_v2_net_worth
jup_swap_v2_order
raydium_owner_v1_x
hyperliquid_clearinghouse_state
kamino_endpoint_42
```

Preferred domain tools:

```text
portfolio.get_summary
portfolio.get_changes
portfolio.get_allocation
portfolio.get_asset_exposure

wallet.get_balances
wallet.get_activity

market.get_asset_snapshot
market.get_prices
market.get_candles
market.get_orderbook

perps.get_positions
perps.get_orders
perps.get_funding

defi.get_positions
defi.get_protocol_summary
defi.get_yields

prediction.search_markets
prediction.get_market
prediction.get_positions

trading.prepare_swap
trading.prepare_transfer
trading.prepare_perp_order
trading.prepare_position_close
trading.prepare_order_cancel
trading.prepare_prediction_order
```

A deterministic provider router chooses the correct upstream API.

This protects the agent from provider API churn and keeps prompts small.

---

# 7. Provider abstraction

Create a server-side normalized provider layer.

Conceptual providers:

```text
JupiterProvider
BirdeyeProvider
KaminoProvider
RaydiumProvider
DFlowProvider
HyperliquidProvider
PolymarketProvider
BinanceProvider
```

Conceptual interfaces:

```ts
interface ProviderAdapter {
  id: ProviderId;
  capabilities: ProviderCapability[];
  health(): Promise<ProviderHealth>;
}

interface PriceProvider {
  getPrice(input: PriceRequest): Promise<PriceResult>;
}

interface WalletPortfolioProvider {
  getWalletPortfolio(input: WalletPortfolioRequest): Promise<WalletPortfolioResult>;
}

interface MarketDataProvider {
  getSnapshot(input: MarketSnapshotRequest): Promise<MarketSnapshot>;
  getCandles(input: CandleRequest): Promise<Candle[]>;
  getOrderBook?(input: OrderBookRequest): Promise<OrderBook>;
}

interface PositionProvider {
  getPositions(input: PositionRequest): Promise<UnifiedPosition[]>;
}

interface TradingProvider {
  prepare(input: TradingActionRequest): Promise<PreparedProviderAction>;
}
```

Provider adapters must be:
- server-only;
- typed;
- timeout-aware;
- rate-limit-aware;
- response-validated;
- testable with mocks;
- free of UI logic;
- free of LLM logic.

---

# 8. Standard provider/tool response envelope

```ts
type ToolResult<T> = {
  ok: boolean;
  data?: T;

  provider: string | string[];
  asOf: string;

  stale?: boolean;
  partial?: boolean;
  warnings?: string[];

  error?: {
    code:
      | 'AUTH'
      | 'RATE_LIMIT'
      | 'UPSTREAM_TIMEOUT'
      | 'UPSTREAM_UNAVAILABLE'
      | 'NOT_FOUND'
      | 'INVALID_REQUEST'
      | 'UNSUPPORTED'
      | 'STALE_DATA';

    message: string;
    retryable: boolean;
  };
};
```

Do not silently convert a failed protocol into a zero-dollar balance.

If Kamino fails, the unified result should be marked partial.

---

# 9. Provider capability matrix

| Provider | Main role | Public reads | Personal positions | Execution | Secret requirement |
|---|---|---:|---:|---:|---|
| Jupiter | Solana pricing + swap routing | yes | indirect wallet context | swap | configured API key |
| Birdeye | Solana wallet/token analytics | API-key read | wallet balances/net worth | no primary execution | API key |
| Kamino | lending, borrow, liquidity, holdings | yes | yes | unsigned tx/action surfaces | public read |
| Raydium | pools + owner positions | yes | Owner API | transaction API/SDK | mostly public read |
| DFlow | quote/orderbook/routing | dev public | execution context | swaps/orders | prod key |
| Hyperliquid | spot/perps + user account | yes | by wallet | signed exchange actions | public reads |
| Polymarket | markets + CLOB + user positions | yes | wallet/account data | authenticated CLOB | public reads; auth to trade |
| Binance | CEX market data | yes | requires private API connection | signed private API | private account key/secret |

### Critical distinction

“Open API” means public market/read data may be accessible.

It does **not** mean Elyra can read a user's private Binance account without that user's authenticated API connection.

---

# 10. Jupiter

Use the existing `.env.local` Jupiter key.

Never copy a literal key into code.

Current server gateway:

```text
https://api.jup.ag
```

Primary swap architecture should use current **Swap API V2** where compatible.

Conceptual execution:

```text
GET  /swap/v2/order
POST /swap/v2/execute
```

Authentication:

```http
x-api-key: ${JUPITER_API_KEY}
```

Elyra tools:

```text
market.get_solana_price
trading.get_swap_quote
trading.prepare_swap
```

Action flow:

```text
user intent
→ resolve token mints
→ validate balance
→ fetch order/quote
→ inspect expected output
→ inspect price impact
→ inspect fees
→ create PreparedAction
→ explicit user confirmation
→ wallet authorization/signing
→ execute
→ verify
→ ledger entry
```

LLMs must never submit Jupiter transaction payloads directly.

---

# 11. Birdeye

Use the Birdeye environment key already in the project.

Do not rename it if a working variable already exists.

Read capabilities should include, where plan permits:

- Solana wallet token balances;
- current wallet net worth;
- historical wallet net worth;
- token prices;
- token metadata;
- market data;
- OHLCV;
- wallet analytics;
- smart-money data if enabled.

Typical request headers:

```http
X-API-KEY: ...
x-chain: solana
```

High-value agent questions:

```text
What changed in my wallet today?
What assets are driving my wallet value?
How much is this wallet worth?
What did my wallet look like yesterday?
```

Historical wallet data should be cached/snapshotted rather than fetched on every prompt.

---

# 12. Kamino

Base:

```text
https://api.kamino.finance
```

Use its live official OpenAPI schema during implementation.

Do not guess endpoint paths from memory.

Relevant product surfaces:

- Lend;
- Borrow;
- Swap;
- Multiply;
- Liquidity;
- Leverage;
- User Holdings;
- protocol data/utilities;
- unsigned transactions.

Initial semantic tools:

```text
defi.get_kamino_positions
defi.get_kamino_health
defi.get_kamino_yields
```

Normalized position:

```ts
{
  protocol: 'kamino',
  category: 'lend' | 'borrow' | 'liquidity' | 'multiply' | 'leverage',
  asset: string,
  suppliedUsd?: number,
  borrowedUsd?: number,
  netValueUsd?: number,
  apyPct?: number,
  aprPct?: number,
  healthFactor?: number,
  rewards?: unknown[],
  asOf: string
}
```

Never fabricate a health factor.

Read-side integration should ship before transaction execution.

---

# 13. Raydium

Relevant current services:

```text
API v3:
https://api-v3.raydium.io

Transaction API:
https://transaction-v1.raydium.io

Owner API:
https://owner-v1.raydium.io
```

Use:

- API v3 for pools/mints/configs/chain information;
- Owner API for per-wallet positions, balances, claimable rewards;
- Transaction API or existing SDK for prepared actions if intentionally supported.

Semantic tools:

```text
market.get_raydium_pool
market.get_raydium_liquidity
defi.get_raydium_positions
defi.get_raydium_rewards
```

Do not implement unrelated LaunchLab forum authentication just because it appears in Raydium docs.

---

# 14. DFlow

Developer endpoints:

```text
https://dev-quote-api.dflow.net
wss://dev-quote-api.dflow.net
```

Production endpoints:

```text
https://quote-api.dflow.net
wss://quote-api.dflow.net
```

WebSocket paths:

```text
/quote-stream
/book-stream
/priority-fees/stream
```

Dev is keyless but testing/rate-limited.

Production uses:

```http
x-api-key: ${DFLOW_API_KEY}
```

when a production key is configured.

Useful current surfaces include:

```text
GET  /quote
POST /swap
POST /swap-instructions
GET  /order
GET  /order-status
GET  /tokens
GET  /venues
```

Semantic tools:

```text
market.get_dflow_quote
market.get_dflow_orderbook
trading.prepare_dflow_swap
```

Default route policy:

```text
Jupiter = primary general Solana swap route
DFlow = secondary quote/orderbook/routing source
```

The model should not randomly choose execution providers.

---

# 15. Hyperliquid

Mainnet:

```text
https://api.hyperliquid.xyz
```

Read account/exchange data through official info APIs.

Use WebSockets where the current application can benefit from live streams.

Normalized account data should cover:

```ts
{
  equityUsd?: number,
  availableUsd?: number,
  marginUsedUsd?: number,
  positions: UnifiedPosition[],
  openOrders: UnifiedOrder[],
  funding: FundingRecord[],
  asOf: string
}
```

Semantic tools:

```text
perps.get_positions
perps.get_orders
perps.get_funding
market.get_hyperliquid_book
market.get_hyperliquid_prices
```

Prepared actions:

```text
trading.prepare_hyperliquid_order
trading.prepare_hyperliquid_close
trading.prepare_hyperliquid_cancel
```

Signing remains outside LLM control.

---

# 16. Polymarket

Public read capabilities:

- market discovery;
- event/market details;
- current prices;
- orderbooks;
- analytics;
- live feeds;
- wallet activity where available.

User-specific capabilities:

- positions;
- activity;
- order lifecycle;
- authenticated CLOB trading when configured.

Semantic tools:

```text
prediction.search_markets
prediction.get_market
prediction.get_prices
prediction.get_orderbook
prediction.get_positions
prediction.get_wallet_activity
```

Future action tools:

```text
prediction.prepare_order
prediction.prepare_close
```

Public market browsing must not depend on private CLOB credentials.

---

# 17. Binance

Phase 1 should use **public market data only**.

Capabilities:

```text
ticker
candles / klines
orderbook
exchange information
recent trades
```

Semantic tools:

```text
market.get_binance_ticker
market.get_binance_candles
market.get_binance_book
```

Do not show a Binance personal balance unless a private Binance connection exists.

Private Binance integration is a separate capability because account and trade endpoints require authenticated/signed requests.

If added later:

- encrypt user API secrets at rest;
- implement read-only first;
- do not request withdrawal permission;
- encourage IP restrictions;
- keep trading permission a separate explicit opt-in;
- never expose credentials to browser or LLM.

---

# 18. Data provider router

Create:

```text
DataProviderRouter
```

Capabilities:

```ts
type DataCapability =
  | 'solana_price'
  | 'wallet_balances'
  | 'wallet_net_worth'
  | 'historical_wallet_value'
  | 'candles'
  | 'orderbook'
  | 'defi_positions'
  | 'perp_positions'
  | 'prediction_markets'
  | 'swap_quote';
```

Suggested routing:

```text
Solana wallet balances
  → existing wallet service / Birdeye

Solana prices
  → Jupiter
  → Birdeye fallback

Historical wallet value
  → stored Elyra snapshots
  → Birdeye as source/fallback

Kamino positions
  → Kamino

Raydium owner positions
  → Raydium Owner API

Hyperliquid
  → Hyperliquid

Prediction markets
  → Polymarket

CEX candles
  → Binance

Solana orderbook / secondary execution data
  → DFlow
```

Provider fallback should be deterministic and logged.

---

# 19. Cross-source quality

For current critical prices, the backend may compare multiple feeds.

Example:

```text
Jupiter price
Birdeye price
Binance SOLUSDT price
```

Do not blindly average different venues.

If divergence is above a configured threshold:

1. refresh;
2. mark uncertainty;
3. avoid execution based on stale data;
4. require a fresh executable quote.

---

# 20. Provider health

Create:

```text
ProviderHealthService
```

Track:

- last success;
- latency;
- error rate;
- 401/403;
- 429;
- timeout;
- circuit-breaker status.

Use provider-specific throttles/backoff.

Never keep hammering an API that is consistently returning 429.

Transaction submission retries require idempotency awareness; never blindly retry a potentially accepted transaction.

---

# 21. Canonical portfolio service

Build or extend one:

```text
PortfolioAggregationService
```

Inputs:

```ts
{
  userId: string;
  accountScope?: string[];
  include?: string[];
}
```

Output:

```ts
type UnifiedPortfolio = {
  asOf: string;
  status: 'complete' | 'partial';

  totalEquityUsd?: number;
  availableCapitalUsd?: number;

  accounts: UnifiedAccount[];
  balances: UnifiedBalance[];
  positions: UnifiedPosition[];
  orders: UnifiedOrder[];

  allocationByAsset: Allocation[];
  allocationByVenue: Allocation[];
  allocationByStrategy: Allocation[];

  warnings: PortfolioWarning[];
};
```

It must be used by:

- Portfolio;
- Assets;
- Personalized;
- Agent;
- Telegram.

Do not maintain separate financial totals per surface.

---

# 22. Canonical account model

```ts
type UnifiedAccountKind =
  | 'privy_solana_wallet'
  | 'external_solana_wallet'
  | 'hyperliquid'
  | 'polymarket'
  | 'kamino'
  | 'raydium'
  | 'binance'
  | 'other';
```

Protocol positions are not independent Elyra identities.

---

# 23. Canonical position model

```ts
type PositionKind =
  | 'spot'
  | 'perp'
  | 'lend'
  | 'borrow'
  | 'lp'
  | 'stake'
  | 'prediction'
  | 'vault';

type UnifiedPosition = {
  id: string;
  provider: string;
  accountId: string;
  kind: PositionKind;

  label: string;
  symbol?: string;

  valueUsd?: number;
  pnlUsd?: number;
  pnlPct?: number;

  side?: 'long' | 'short';
  leverage?: number;

  suppliedUsd?: number;
  borrowedUsd?: number;
  healthFactor?: number;

  apyPct?: number;
  aprPct?: number;

  metadata?: Record<string, unknown>;
  asOf: string;
};
```

---

# 24. Direct holdings vs derivatives

Never tell a user:

```text
You hold 20 SOL
```

if 10 SOL is spot and the rest is just perp notional.

Expose:

```text
Direct SOL holdings
SOL collateral
Long SOL perp notional
Short SOL perp notional
LP-related SOL value
Net directional exposure
```

Net exposure only when the model/data is mathematically sound.

---

# 25. Provenance

Financial data should retain provider provenance.

```ts
type DataProvenance = {
  provider: string;
  retrievedAt: string;
  sourceAccount?: string;
};
```

This is essential for debugging discrepancies.

Normal UI can show friendly labels rather than raw endpoint paths.

---

# 26. Caching

Suggested targets:

```text
prices                    5–15s
wallet balances          10–30s
Hyperliquid positions     2–10s
open orders               2–10s
Kamino positions         30–120s
Raydium positions        30–120s
Polymarket positions     10–30s
market metadata          minutes/hours
historical portfolio     persisted snapshots
```

Use existing Redis/cache infrastructure if present.

Do not add a new cache product unless necessary.

---

# 27. Personalized agent pipeline

```text
User message
    ↓
Intent classifier
    ↓
Context planner
    ↓
Semantic Elyra tools
    ↓
Deterministic financial analytics
    ↓
Model router
    ├── Claude
    └── Gemini
    ↓
Synthesis
    ↓
Structured Elyra answer
```

The LLM never receives API secrets.

The LLM never decides authorization.

---

# 28. Reasoning modes

Keep three modes:

```text
FAST
PERSONALIZED_REASONING
ACTION_PLANNING
```

## FAST

Examples:

```text
How much USDC do I have?
What is SOL?
How many open positions?
```

Use deterministic data and one model only if wording is needed.

## PERSONALIZED_REASONING

Examples:

```text
Why am I down?
What is my biggest risk?
What changed?
Am I too exposed to SOL?
```

Use relevant tools and potentially both Claude + Gemini.

## ACTION_PLANNING

Examples:

```text
Reduce my SOL exposure.
Swap $500 USDC to SOL.
Close half my perp.
```

No direct execution.

---

# 29. Deterministic analytics first

Compute in code:

- total equity;
- available capital;
- asset allocation;
- venue allocation;
- direct holdings;
- perp notional;
- stablecoin ratio;
- PnL attribution where supported;
- margin utilization;
- liquidation distance;
- health factor;
- net deposits/withdrawals;
- protocol position value;
- largest risk.

Models explain these numbers.

Models do not perform critical arithmetic from raw strings.

---

# 30. Shared memory

Telegram and dashboard must use the same durable Personalized memory.

Example:

```text
Max SOL exposure: 30%
Stablecoin buffer target: 20%
Preferred perp venue: Hyperliquid
```

Explicit preferences are authoritative.

Inferred behavior must not silently become a hard policy.

---

# 31. Shared conversations

Messages should identify channel:

```ts
type ConversationChannel = 'dashboard' | 'telegram';
```

A user can continue context across channels.

The system can choose whether Telegram starts a new thread or attaches to the user's active thread, but all conversation records belong to the same Elyra user.

---

# 32. Telegram identity architecture

Use Privy as the authoritative user identity.

Ideal Privy user:

```text
Privy User
├── existing login identity
├── Telegram linked account
│   └── telegram_user_id
├── Solana embedded wallet
├── external wallets
├── preferences
├── conversations
└── portfolio accounts
```

Use numeric `telegram_user_id`, not username, as the stable Telegram identity.

---

# 33. Existing dashboard user → Telegram

Preferred journey:

```text
Dashboard
→ Settings / Agent / Personalized
→ Connect Telegram
→ Privy Telegram link
→ Telegram linked to same Privy user
→ Open Elyra bot
→ bot resolves Telegram ID to Privy user
→ same wallet + portfolio + memory
```

Never link solely by asking the user to type their Telegram username.

---

# 34. Telegram-first user

```text
/start
→ bot cannot resolve Privy user
→ "Open Elyra" Mini App
→ Privy seamless Telegram auth
→ create/authenticate Privy user
→ check linked wallets
→ create/pregenerate Solana embedded wallet only if none exists
→ bot can now resolve Telegram user
```

Do not create a raw Solana private-key wallet inside bot code.

---

# 35. Wallet custody

Recommended Phase 1:

- Privy embedded Solana wallet;
- public address usable by bot;
- public balance data readable by backend;
- transaction preparation performed by backend;
- user approval/signing through Privy-enabled Mini App or existing secure flow.

Never:

- save a seed phrase in Elyra database;
- send a private key to Telegram;
- let Claude/Gemini see signing material;
- store user secret keys in webhook process;
- create a new wallet every `/start`.

---

# 36. Telegram bot commands

Configure:

```text
/start       Start or reconnect Elyra
/portfolio   Portfolio overview
/wallet      Wallet balances
/positions   Open positions
/orders      Open orders
/activity    Recent activity
/alerts      Alerts and settings
/markets     Market snapshot
/settings    Elyra Telegram settings
/link        Link to Elyra
/unlink      Disconnect Telegram
/help        Help
```

Natural language is the main interaction.

Commands are accelerators.

---

# 37. `/start` state machine

```text
/start
  ↓
read Telegram numeric user ID
  ↓
resolve Privy user
  ├─ found
  │    ↓
  │  load Elyra user
  │    ↓
  │  show private personalized home
  │
  └─ not found
       ↓
     show connection CTA
       ↓
     Open Elyra Mini App
```

Do not show portfolio values before authentication/linking.

---

# 38. Telegram home

Example structure:

```text
Elyra · Capital Overview

Total equity
$24,581.42

24H
-$442.10 (-1.77%)

Available
$6,881.25

Largest exposure
SOL · 34.2%

[Portfolio] [Positions]
[Wallet]    [Ask Elyra]
[Open Elyra]
```

These numbers must be real.

Prefer editing navigation messages over spamming the chat.

---

# 39. Telegram natural-language examples

```text
why am i down today
```

```text
how much SOL do i have everywhere
```

```text
show my kamino positions
```

```text
what is my hyperliquid margin usage
```

```text
find SOL yield opportunities
```

```text
what is happening on polymarket
```

```text
compare Jupiter and DFlow for swapping 100 USDC to SOL
```

The Telegram controller calls the same `PersonalizedAgentService` as web.

---

# 40. Telegram response renderer

The agent returns one channel-independent structured response.

Renderers:

```text
WebAnswerRenderer
TelegramAnswerRenderer
```

Telegram renderer should:
- be concise;
- escape markup safely;
- avoid giant tables;
- use inline buttons;
- preserve critical numbers;
- include partial-data warnings.

Do not run a separate second LLM merely to format Telegram.

---

# 41. Telegram private-chat rule

Private financial data is only available in private chat.

In group chat:
- generic public market questions may be allowed;
- portfolio/balance/position queries must not reveal anything;
- financial actions must not be prepared;
- direct the user to private chat.

This is mandatory.

---

# 42. Telegram Mini App

Create a mobile-first route inside the existing Elyra app, such as:

```text
/telegram
```

Views:

```text
Home
Portfolio
Wallet
Positions
Orders
Swap
Transfer
Action Confirmation
Settings
```

Reuse the Elyra component system.

Do not create a second unrelated visual language.

---

# 43. Mini App authentication

Use current Privy Telegram/Mini App support.

Requirements:

- authenticated Privy user;
- same Elyra user as dashboard;
- same wallet;
- no trust in raw Telegram `initDataUnsafe`;
- follow current Privy SDK API in the repo;
- use Telegram launch context only through verified/official flow.

---

# 44. Telegram wallet screen

Example:

```text
Elyra Wallet

Address
8rY...cEgo

Wallet value
$10,472.19

SOL        42.50
USDC    3,500.00
JUP     2,100.00

[Deposit]
[Swap]
[Transfer]
[Open wallet]
```

No seed phrase.

No private key export through chat.

---

# 45. Telegram action philosophy

Phase 1:

```text
Chat prepares
Mini App confirms/signs
Backend executes
Bot reports result
```

This is safer than making an inline Telegram callback equivalent to a wallet signature.

---

# 46. Swap flow

User:

```text
swap 100 USDC to SOL
```

Flow:

```text
parse intent
→ resolve user
→ resolve wallet
→ check live USDC balance
→ request Jupiter quote/order
→ normalize fees/output
→ create PreparedAction
→ send Telegram preview
→ user taps Review & Confirm
→ Mini App opens
→ Privy-authenticated confirmation
→ refresh/revalidate quote
→ wallet authorization/sign
→ execute
→ confirm chain result
→ record activity
→ Telegram completion message
```

---

# 47. Transfer flow

User:

```text
send 0.5 SOL to <address>
```

Must:

1. validate address;
2. show full destination on confirmation screen;
3. show amount;
4. show estimated fee;
5. require explicit confirmation;
6. revalidate balance;
7. authorize/sign;
8. execute once;
9. show signature/result.

One chat message must never immediately transfer funds.

---

# 48. Hyperliquid action flow

User:

```text
close half my SOL perp
```

Bot:

```text
SOL-PERP · LONG

Current size: ...
Entry: ...
Mark: ...
PnL: ...

Prepared action:
Close 50% of position

[Review & Confirm]
[Cancel]
```

Refresh the position immediately before execution.

---

# 49. Polymarket action flow

Read-only market/position data first.

If authenticated trading is correctly configured, a request like:

```text
buy $20 YES on <market>
```

creates a prepared CLOB action.

Do not pretend public Polymarket data access grants trading authorization.

---

# 50. Prepared action record

```ts
type PreparedActionRecord = {
  id: string;
  userId: string;
  conversationId?: string;
  channel: 'dashboard' | 'telegram';

  kind: string;
  provider: string;
  payload: unknown;

  status:
    | 'prepared'
    | 'awaiting_confirmation'
    | 'confirmed'
    | 'executing'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'expired';

  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};
```

The callback contains only an opaque action reference.

---

# 51. Action validation

Before any execution, verify:

- authenticated user;
- resource ownership;
- Telegram/Privy linkage;
- account still exists;
- balance still sufficient;
- position/order still exists;
- quote not stale;
- provider supports action;
- risk rules pass;
- amount under policy;
- destination valid;
- action not already executed;
- confirmation still valid.

LLM-generated IDs are never trusted without server lookup.

---

# 52. Action idempotency

A Telegram webhook can be retried.

A callback can be tapped repeatedly.

Therefore:
- Telegram `update_id` must be deduplicated;
- prepared action must have a state machine;
- execution must have an idempotency key where possible;
- already executing/succeeded actions cannot execute again.

This is mandatory for financial safety.

---

# 53. Telegram webhook

Create:

```text
POST /api/telegram/webhook
```

Production uses `setWebhook`.

Set a webhook secret.

Verify header:

```text
X-Telegram-Bot-Api-Secret-Token
```

against:

```env
TELEGRAM_WEBHOOK_SECRET
```

Reject invalid requests before business logic.

Webhook layer should:
1. verify secret;
2. parse update;
3. dedupe update ID;
4. route to app controller;
5. respond quickly.

---

# 54. Telegram services

Create an abstraction such as:

```text
TelegramBotService
```

Responsibilities:
- send message;
- edit message;
- answer callback;
- send chat action;
- create inline keyboards;
- create Mini App button;
- escape formatting;
- retry delivery safely.

And:

```text
TelegramAgentController
```

Responsibilities:
- commands;
- natural-language messages;
- callback routing;
- Privy resolution;
- portfolio calls;
- agent calls;
- prepared actions.

Provider-specific data code must not live in Telegram handlers.

---

# 55. Telegram linking cache

Optionally persist:

```ts
type TelegramLink = {
  telegramUserId: string;
  privyUserId: string;
  chatId: string;
  linkedAt: string;
  lastSeenAt: string;
};
```

Privy remains authoritative.

Use this only as a performance/indexing aid.

---

# 56. `/unlink`

Never disconnect on one accidental tap.

Flow:

```text
Disconnect Telegram from Elyra?

This stops Telegram portfolio access and alerts.

[Disconnect]
[Keep connected]
```

Then use the supported Privy unlink flow or secure dashboard/Mini App settings flow.

---

# 57. Dashboard Telegram card

Add a compact connection card in the most appropriate current settings/Personalized/Agent settings surface.

Disconnected:

```text
Telegram

Chat with Elyra and receive capital alerts.

[Connect Telegram]
```

Connected:

```text
Telegram
@username

Connected
Alerts enabled

[Open Telegram]
[Notification settings]
[Disconnect]
```

Do not expose numeric Telegram ID in normal UI.

---

# 58. Telegram notifications

The bot is an excellent delivery channel for Elyra alerts.

Potential alerts:

```text
price threshold
portfolio drawdown
asset concentration
margin utilization
liquidation proximity
funding spike
order fill
position change
prediction-market movement
saved risk preference crossed
action awaiting confirmation
```

Example:

```text
Risk watch

SOL exposure reached 31.4%.
Your saved limit is 30%.

[Review exposure]
```

Avoid alarmist copy.

---

# 59. Notification service

Do not duplicate alert logic inside Telegram.

Architecture:

```text
Risk / Alert engine
        ↓
Notification event
        ↓
NotificationService
   ├── in-app
   ├── Telegram
   └── future email
```

One event, multiple delivery channels.

---

# 60. Notification preferences

```ts
type TelegramNotificationPreferences = {
  userId: string;
  enabled: boolean;

  priceAlerts: boolean;
  portfolioAlerts: boolean;
  riskAlerts: boolean;
  orderUpdates: boolean;
  agentUpdates: boolean;

  quietHours?: {
    start: string;
    end: string;
    timezone: string;
  };
};
```

---

# 61. Alert deduplication

Persist trigger/delivery state.

Do not send the same alert every polling interval.

Use an alert/event ID and threshold state.

---

# 62. Portfolio history and “what changed?”

Persist portfolio snapshots.

Example:

```ts
type PortfolioSnapshot = {
  userId: string;
  timestamp: string;

  totalEquityUsd?: number;
  accountValues: Record<string, number>;
  assetValues: Record<string, number>;
  positionValues: Record<string, number>;

  cumulativeDepositsUsd?: number;
  cumulativeWithdrawalsUsd?: number;
};
```

This enables:

```text
What changed since yesterday?
Why am I down?
What moved my portfolio?
```

Deposits must not be described as profit.

---

# 63. Unified activity ledger

```ts
type UnifiedActivity = {
  id: string;
  userId: string;
  provider: string;
  accountId: string;

  type:
    | 'deposit'
    | 'withdrawal'
    | 'swap'
    | 'transfer'
    | 'spot_trade'
    | 'perp_open'
    | 'perp_close'
    | 'funding'
    | 'lend'
    | 'borrow'
    | 'repay'
    | 'lp_add'
    | 'lp_remove'
    | 'prediction_trade'
    | 'order';

  valueUsd?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
};
```

Use it on web and Telegram.

---

# 64. Provider connection state

For private providers later:

```ts
type ProviderConnection = {
  id: string;
  userId: string;
  provider: 'binance' | 'polymarket' | 'other';
  mode: 'read_only' | 'trading';
  status: 'active' | 'disabled' | 'error';
  encryptedCredentialsRef?: string;
  createdAt: string;
  updatedAt: string;
};
```

Never store plaintext private exchange secrets.

---

# 65. Binance private integration policy

Not required for Phase 1.

If later implemented:
- read-only first;
- explicit user consent;
- encrypted secret storage;
- no withdrawal scope;
- separate trading permission;
- audit every request;
- never pass credentials to Claude/Gemini.

The agent must know the distinction:

```text
Binance market data available.
Binance personal account not connected.
```

---

# 66. Telegram BotFather setup

## Step 1 — Create bot

Open `@BotFather`.

Run:

```text
/newbot
```

Choose:
- display name: Elyra;
- a unique username ending in `bot`.

Store the returned token only in:

```env
TELEGRAM_BOT_TOKEN=
```

## Step 2 — Profile

Set:
- Elyra logo;
- short description;
- about text.

Suggested description:

```text
Your personalized crypto capital agent — portfolio, markets, positions and Elyra alerts.
```

## Step 3 — Commands

Configure the command list from this document.

## Step 4 — Domain

Configure Elyra's production HTTPS domain, e.g.:

```text
https://try.getelyra.xyz
```

## Step 5 — Mini App

Configure the Mini App route, e.g.:

```text
https://try.getelyra.xyz/telegram
```

## Step 6 — Privy

In Privy dashboard:
- enable/configure Telegram authentication/linking;
- configure the Elyra bot as required by current Privy settings;
- enable seamless Mini App auth where appropriate;
- verify the production domain.

## Step 7 — Server env

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
APP_URL=
```

## Step 8 — Deploy webhook

Example:

```text
https://try.getelyra.xyz/api/telegram/webhook
```

## Step 9 — Register webhook

Use Telegram `setWebhook`.

Set:
- webhook URL;
- `secret_token`;
- `allowed_updates` initially:
  - `message`;
  - `callback_query`.

## Step 10 — Verify

Call `getWebhookInfo` and confirm:
- URL;
- no persistent error;
- sensible pending-update count.

---

# 67. Webhook setup script

Create:

```text
scripts/setup-telegram-webhook.ts
```

The script:

1. loads server env;
2. validates required variables;
3. sends `setWebhook`;
4. includes `secret_token`;
5. configures allowed updates;
6. prints safe status;
7. never prints bot token.

Optional:

```text
scripts/delete-telegram-webhook.ts
```

for development reset.

---

# 68. Local Telegram development

Production webhooks need reachable HTTPS.

For local development:
- use a secure tunnel approved by the team;
- use a separate dev bot if possible;
- never commit tunnel URLs;
- optionally use `getUpdates` in isolated dev;
- never run polling and production webhook simultaneously.

---

# 69. Callback security

Bad:

```text
callback_data = swap|USDC|SOL|100|wallet123
```

Good:

```text
callback_data = action:pa_xxxxx
```

The server loads the record and verifies:
- action owner;
- Telegram user;
- Privy user;
- status;
- expiry;
- account state;
- balance;
- quote freshness.

---

# 70. Telegram group privacy

Private account tools must be disabled in group chats.

Group chat may answer:

```text
What is SOL trading at?
```

Group chat must not answer:

```text
What is my portfolio?
```

with private data.

Reply:

```text
Open a private chat with Elyra to access your portfolio.
```

---

# 71. Telegram Mini App visual direction

Mobile-first, Elyra brand.

Example:

```text
┌───────────────────────────┐
│ Elyra              ● Live │
│                           │
│ Total Equity              │
│ $24,581.42                │
│ -1.77% today              │
│                           │
│ [Deposit] [Swap]          │
│ [Send]    [Portfolio]     │
│                           │
│ Capital                   │
│ Spot          $...        │
│ Hyperliquid   $...        │
│ DeFi          $...        │
│ Prediction    $...        │
│                           │
│ Ask Elyra                 │
│ [____________________] ↑  │
└───────────────────────────┘
```

Use 8–10px panel radii and compact spacing.

---

# 72. Telegram action confirmation screen

Example:

```text
SWAP PREVIEW

From
100 USDC

To
~1.01 SOL

Provider
Jupiter

Price impact
0.04%

Network/priority fees
...

Quote expires
24 seconds

[Confirm]
[Cancel]
```

If quote refresh changes output materially, show new values and require fresh confirmation.

---

# 73. Execution provider router

Read providers may fail over.

Execution providers cannot silently change after confirmation.

Prepared action records exact route/provider.

Example:

```ts
{
  routeProvider: 'jupiter',
  quoteRef: '...',
  expiresAt: '...',
}
```

If expired:
- refresh;
- compare;
- invalidate previous confirmation if materially changed.

---

# 74. Action permission levels

## Level 0 — read

No confirmation.

```text
portfolio
prices
positions
orders
research
```

## Level 1 — prepare

No execution.

```text
prepare swap
prepare transfer
prepare close
```

## Level 2 — financial action

Explicit confirmation + authorization.

```text
swap
transfer
perp order
prediction trade
DeFi deposit
```

## Level 3 — sensitive account operation

Stronger controls.

```text
withdrawal
API credential changes
wallet policy changes
wallet export
```

Do not implement private-key export through Telegram.

---

# 75. Server-side execution later

If later using Privy server-side wallet access:
- use policies;
- spend limits;
- approved contracts/destinations;
- explicit user approval;
- action size limits;
- audit logs;
- extra authorization for larger transfers.

Do not implement an unrestricted hot-wallet daemon.

---

# 76. Agent grounding metadata

Record internally:

```ts
{
  contextUsed: [
    'portfolio',
    'birdeye_wallet',
    'hyperliquid_positions',
    'kamino_positions'
  ],
  asOf: '...',
  partial: false
}
```

Dashboard may display:

```text
Context: Portfolio · Positions · Kamino
```

Telegram only needs to surface this when useful or when data is stale/partial.

---

# 77. API routes

Adapt to current repository conventions.

Conceptual routes:

```text
POST /api/agent/chat

GET  /api/portfolio
GET  /api/portfolio/changes
GET  /api/providers/health

POST /api/telegram/webhook
GET  /api/telegram/status
GET  /api/telegram/preferences
PATCH /api/telegram/preferences

GET  /api/actions/:id
POST /api/actions/:id/confirm
POST /api/actions/:id/cancel
```

Reuse existing Personalized endpoints rather than creating duplicates.

---

# 78. Mini App routes

Conceptual:

```text
/telegram
/telegram/portfolio
/telegram/wallet
/telegram/positions
/telegram/orders
/telegram/action/[id]
/telegram/settings
```

All account views require authenticated identity.

---

# 79. Suggested backend modules

Follow the repository's actual architecture, but conceptually:

```text
providers/
  jupiter/
  birdeye/
  kamino/
  raydium/
  dflow/
  hyperliquid/
  polymarket/
  binance/

portfolio/
  aggregation
  analytics
  snapshots
  normalization

agent/
  tools
  context
  orchestration

actions/
  prepare
  validate
  execute

telegram/
  bot-client
  controller
  commands
  callbacks
  renderer
  user-resolution
  webhook
```

Do not force these exact paths if the codebase already has a better pattern.

---

# 80. Rate limits

Rate-limit:
- Telegram messages per user;
- AI calls;
- provider-heavy scans;
- repeated portfolio refresh;
- prepared actions.

Respect:
- Birdeye plan limits;
- DFlow dev limits;
- Raydium Cloudflare limits;
- Binance weight limits;
- Hyperliquid limits;
- Telegram flood control.

---

# 81. Timeout strategy

Suggested starting targets:

```text
simple price request       3–5s
wallet data                5–8s
DeFi account               8–12s
portfolio aggregate       10–15s
AI fast                    ~10s
AI deep                    20–30s
```

Independent provider reads should run in parallel.

Return partial portfolio data when safe rather than blocking everything on one provider.

---

# 82. Observability

Track:
- provider latency;
- provider error rate;
- cache hit rate;
- 429 rate;
- portfolio aggregation latency;
- Claude/Gemini latency;
- Telegram webhook latency;
- Telegram send failures;
- action preparation;
- action confirmation;
- execution outcome.

Use correlation IDs.

Never log secret values.

---

# 83. Audit log

For every financial action:

```ts
{
  userId,
  channel,
  preparedActionId,
  provider,
  actionType,

  requestedAt,
  confirmedAt?,
  executionStartedAt?,
  executionFinishedAt?,

  result,
  transactionSignature?,
  errorCode?
}
```

No secret material.

---

# 84. Provider tests

For every adapter:

- happy path;
- malformed JSON;
- provider error;
- timeout;
- 401/403;
- 429;
- missing fields;
- decimal conversion;
- stale timestamp;
- normalization.

Unit tests should mock upstream calls.

Do not make production network calls in standard unit tests.

---

# 85. Portfolio tests

Fixture:

```text
wallet        $5,000
Kamino        $2,000
Raydium       $1,000
Hyperliquid   $2,000
```

Expected total:

```text
$10,000
```

Then simulate Kamino failure.

Expected:
- partial status;
- Kamino warning;
- UI/agent must not claim the total is guaranteed complete.

---

# 86. Telegram tests

Test:

```text
invalid webhook secret → reject
duplicate update_id → no duplicate processing
unlinked user → link prompt
linked user /portfolio → correct service
group /portfolio → private-chat warning
callback wrong user → reject
expired action → reject/refresh
```

---

# 87. Wallet tests

New Telegram-first user:

```text
Telegram auth
→ Privy user
→ Solana wallet created/pregenerated once
→ repeated /start reuses same wallet
```

Existing dashboard user:

```text
existing Privy user + wallet
→ link Telegram
→ bot resolves same user
→ same wallet appears
```

---

# 88. Swap/action tests

Input:

```text
swap 100 USDC to SOL
```

Must:
- resolve correct user;
- resolve wallet;
- fetch balance;
- fetch quote;
- create action preview;
- not execute yet;
- require confirmation;
- refresh/revalidate;
- sign securely;
- execute exactly once;
- persist result.

Duplicate callback must not submit twice.

---

# 89. Environment validation

Validate secrets server-side without logging values.

Core AI:

```text
ANTHROPIC_API_KEY
GEMINI_API_KEY
```

Configured provider:

```text
JUPITER_API_KEY
BIRDEYE_API_KEY
```

Telegram:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
APP_URL
```

If a feature is disabled, missing optional credentials should not crash the whole app.

---

# 90. Feature flags

Use existing flag mechanism where available.

Recommended:

```text
ENABLE_TELEGRAM
ENABLE_TELEGRAM_ACTIONS

ENABLE_KAMINO
ENABLE_RAYDIUM
ENABLE_DFLOW
ENABLE_HYPERLIQUID
ENABLE_POLYMARKET

ENABLE_BINANCE_PRIVATE
```

---

# 91. Rollout phases

## Phase 1 — read-only omnichannel

Ship:
- all requested provider read adapters;
- semantic tools;
- unified portfolio;
- Telegram bot;
- Telegram identity linking;
- Mini App login;
- wallet/portfolio/positions/orders reads;
- natural-language AI;
- Telegram alerts.

## Phase 2 — safe Solana actions

Ship:
- Jupiter swap previews;
- transfer previews;
- Mini App signing;
- transaction lifecycle/status.

## Phase 3 — protocol actions

Add one at a time:
- Kamino;
- Raydium;
- DFlow;
- Hyperliquid;
- Polymarket.

Each requires provider-specific tests and authorization review.

## Phase 4 — optional private CEX connection

Binance:
- encrypted read-only account integration first;
- optional trading later;
- never withdrawal permission.

---

# 92. Recommended implementation order

1. inspect repository;
2. inventory current services;
3. normalize provider interfaces;
4. connect/clean Jupiter;
5. connect/clean Birdeye;
6. connect Hyperliquid reads;
7. connect Kamino reads;
8. connect Raydium reads;
9. connect Polymarket reads;
10. connect DFlow reads;
11. connect Binance public market data;
12. unified portfolio;
13. semantic tools;
14. agent integration;
15. provider health/caching;
16. Telegram Bot client;
17. webhook + idempotency;
18. Privy Telegram identity resolution;
19. Mini App;
20. bot commands;
21. natural-language bot;
22. alerts;
23. prepared actions;
24. safe Mini App confirmation/signing;
25. tests;
26. observability;
27. production webhook.

Do not begin with unrestricted transaction execution.

---

# 93. Current official API references to verify during implementation

Use current official docs before writing each adapter.

```text
Jupiter
https://developers.jup.ag/

Birdeye
https://docs.birdeye.so/

Kamino
https://api.kamino.finance/

DFlow
https://pond.dflow.net/llms.txt

Raydium
https://docs.raydium.io/llms.txt

Hyperliquid
https://hyperliquid.gitbook.io/hyperliquid-docs/llms.txt

Polymarket
https://docs.polymarket.com/llms.txt

Binance
https://developers.binance.com/

Telegram
https://core.telegram.org/bots/api
https://core.telegram.org/bots/webapps

Privy
https://docs.privy.io/
```

Do not implement undocumented endpoint paths based only on model memory.

---

# 94. Definition of done

The full project extension is complete when:

- Jupiter adapter uses env key and no hardcoded secret;
- Birdeye adapter uses env key and normalized wallet analytics;
- Kamino read integration uses current official schema;
- Raydium read integration uses current API/Owner surfaces;
- DFlow dev/prod behavior is separated;
- Hyperliquid positions/orders/account context work;
- Polymarket public market and position context work where account data is available;
- Binance public market data works;
- private Binance balances are never falsely implied;
- unified portfolio handles partial provider failure;
- Agent uses semantic tools instead of raw vendor calls;
- Claude/Gemini receive only relevant normalized context;
- Telegram webhook is authenticated;
- duplicate updates cannot replay actions;
- Telegram numeric user ID resolves to Privy user;
- dashboard user can link Telegram;
- Telegram-first user can authenticate in Mini App;
- existing wallet is reused;
- wallet private material is never stored in Telegram bot;
- `/portfolio`, `/wallet`, `/positions`, `/orders` work;
- natural-language Telegram agent works;
- group chats cannot access private financial data;
- Telegram and dashboard share memory/conversations;
- alerts can deliver to Telegram;
- money-moving requests create prepared actions;
- explicit confirmation is required;
- execution revalidates state;
- Portfolio and Assets remain visually intact;
- TypeScript passes;
- lint passes;
- tests pass;
- production build passes.

---

# 95. Final product bar

A user should be able to ask on the Elyra dashboard:

```text
What is my biggest risk?
```

then open Telegram and say:

```text
What changed since then?
```

and Elyra should still understand the same:

- user;
- wallet;
- portfolio;
- positions;
- memory;
- conversation context;
- providers;
- risk constraints.

The target is:

> **One Elyra intelligence layer. One identity. One portfolio. Multiple protocols. Two interfaces — dashboard and Telegram.**
