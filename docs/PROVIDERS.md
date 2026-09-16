# Data providers

Every upstream is reduced to one envelope, one error taxonomy, and one
freshness stamp. Above `lib/providers/` nothing knows whether a price came
from Jupiter or Birdeye; below it nothing knows what a portfolio is.

## The two rules the layer exists to enforce

**A failed provider is never a zero.** `{ ok: false }` and a balance of `$0`
are opposite claims — one says "we could not look", the other says "there is
nothing there". Collapsing the first into the second is how a dashboard
confidently understates someone's net worth.

**A raw upstream error never reaches a model or a screen.** Providers return
HTML error pages, stack traces and vendor codes. All of it is mapped to the
taxonomy before it can be rendered or put in a prompt, and `providerFetch`
deliberately excludes response bodies from its summaries — a provider that
echoes a request into an error page would otherwise echo a key with it.

## Status

| Provider | Capabilities | Auth | Verified against |
| --- | --- | --- | --- |
| Jupiter | `solana_price`, `swap_quote` | `JUPITER_API_KEY` header | live API |
| Birdeye | `solana_price`, `historical_price` | `BIRDEYE_API_KEY` header | live API |
| Kamino | `defi_positions` | none | published OpenAPI + live call |
| Raydium | pools and yields | none | live API v3 |
| Hyperliquid | `perp_positions` (public) | none | live `/info` |
| Binance | `candles`, `perp_positions` (public) | none | live spot + fapi |
| Polymarket | markets, books, positions, activity | none | official OpenAPI specs + live |
| DFlow | `swap_quote` | — | **not connected** |

### Why DFlow is not connected

Its quote endpoint answers `403` with a zero-length body to every
unauthenticated request, `docs.dflow.net` does not resolve, and no schema is
published anywhere reachable. Two things are therefore unknown: what
credential it wants, and what it answers with.

Guessing a swap aggregator's response schema is the worst possible place to
guess one — a misread field in a route response is a real trade at a price
nobody quoted. So the adapter declares the provider, reports `UNSUPPORTED`
with the reason, and `providersFor()` never routes to it. Jupiter is
configured, verified, and answers the same question today.

Finishing it needs a DFlow platform credential in `DFLOW_API_KEY`
(server-side only), the response schema from DFlow's own documentation
confirmed against a live authenticated call, and a quote function written
uncached and unretried — a retry is a different price.

## Traps each adapter handles

These are documented because each one produces a *plausible* wrong number,
which is the kind that survives review.

**Kamino sends every figure as a decimal string.** `"0.4673503786241097951"`
is an LTV, and arithmetic on the raw field is string concatenation. Parsed in
one place; an unparseable value becomes `null`, never `NaN` or `0`.

**Kamino reports per-section indexing state.** A section with
`indexed: false` is one nobody looked at. It becomes a warning with
`partial: true`, never an empty array — rendering it as zero is how a
leveraged position disappears from a risk screen while it is still
liquidatable.

**Polymarket delivers `outcomes` and `outcomePrices` as JSON-encoded
strings**, not arrays. Iterating the raw field yields the characters of a
string. A market whose prices and labels do not line up is dropped rather than
patched: three labels and two prices has no correct interpretation.

**Hyperliquid's `metaAndAssetCtxs` is a positional join** — `universe[i]`
describes the same asset as `ctx[i]`, with no shared key. On a length mismatch
every row is dropped, because nothing says the shorter array was truncated
from the end, and attaching BTC's funding rate to SOL is a wrong number that
looks entirely plausible.

**Funding intervals differ by venue.** Hyperliquid settles hourly, Binance
every eight hours. The raw rates are not comparable, so `PerpMarket` carries
`fundingIntervalHours` and `annualisedFundingPct` applies it exactly once.

**Raydium's `apr` includes token emissions; `feeApr` does not.** A pool paying
12% in fees and 60% in its own token is not a 72% pool in any sense an
allocator cares about. Both travel, and the fee figure is the default.

**Binance answers `200` with an error object for an unknown symbol**, not a
404. Status alone does not establish that a call worked.

## Polymarket traps

Three APIs, all public, all verified against the specs Polymarket publishes at
`docs.polymarket.com/api-spec/`: Gamma (markets and events), CLOB (books and
price history) and the Data API (positions and activity). Positions are
on-chain, which is why reading them needs no credential — and why nothing in
the adapter can write.

**`redeemable` does not mean "won".** Polymarket sets it on every position in
a resolved market, winners and losers alike: a losing row comes back
`redeemable: true` with `currentValue: 0` and a `cashPnl` of minus the whole
stake. Trusting the flag alone reported 200 settled losses on a live account
as "unclaimed winnings". A claim is only a claim when there is something to
collect.

**Both order-book sides put the best price last.** Bids ascend and asks
descend, so `bids[0]` is the *worst* bid. Reading index 0 as best quotes
several ticks away on both sides and looks entirely plausible doing it.

**Timestamps are seconds.** Treating them as milliseconds dates every point to
January 1970 and renders an empty-looking chart.

**Tags are not categories.** The tag list is thousands of entries deep and
mostly long-tail; `crypto`, `politics` and `sports` exist, `culture` does not.
Category slugs are validated against the provider before use, because
filtering on one that does not exist returns an empty list that reads as
"nothing is happening".

**An account that is not linked cannot be read.** Positions live in a proxy
wallet whose address is not the user's EOA, so an empty result only means "no
positions" when we know we asked about the right address. Everything above the
adapter carries a `connected` flag for exactly this reason.

## Liquidation distance is never estimated

`liquidationHeadroom` returns `null` unless *both* the current LTV and the
protocol's published liquidation LTV came from the provider. Leverage is
usually sitting right there and it is tempting; inferring a distance from it
produces a guess that reads as a measurement. Everything above this layer —
the tools, the Telegram views, the Mini App — says "not published by the
protocol" rather than filling the gap.

## Double counting

A DeFi position issues a receipt token that sits in the wallet. The wallet
read prices it, and the protocol also values the underlying position — the
same dollars, twice, and the portfolio silently inflates by the size of every
LP position the user holds. Receipt mints travel with the positions as
`shareMint`, and `composePortfolio` excludes matching spot holdings from the
total while still showing the row, because the token really is in the wallet.

## Resilience

`providerFetch` owns timeout, retry with jittered backoff, `Retry-After`
handling, a per-provider circuit breaker (four failures, open thirty seconds),
rolling latency, and a TTL cache with stale-if-error. It never throws.

Retries are for transient codes only. `AUTH` is never retried — a bad key does
not become good by asking again, and a plan gap is not a blip. Swap quotes are
never retried and never cached, because a retry is a different price.

## Feature flags

Capability flags (`ENABLE_KAMINO`, `ENABLE_RAYDIUM`, `ENABLE_POLYMARKET`,
`ENABLE_HYPERLIQUID`, `ENABLE_BINANCE_PUBLIC`) default **on** and are read at
the point of use, so flipping one during an incident takes effect without a
redeploy. Surface flags (`ENABLE_TELEGRAM`, `ENABLE_TELEGRAM_MINI_APP`) default
on only when the credentials that make them work are present — a surface
advertised without its bot token is a button that 500s.
