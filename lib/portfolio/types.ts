/* ---------------------------------------------------------------------------
   The portfolio's typed surface.

   Client-safe: no `server-only`, no environment reads, no provider payloads.
   The route composes these from the services that already exist — the Solana
   wallet read, the venue portfolio in lib/exchange — and the UI renders only
   this. A presentational component never sees a Hyperliquid response or a
   Jupiter token record.

   Two rules carried from lib/wallet/types.ts, for the same reason:

   Every figure that could be unknown is `| null` rather than defaulted to
   zero. A position worth nothing and a position nobody could price are
   different facts, and a capital dashboard that renders the second as the
   first is lying at the moment its user most needs it not to.

   And a source that could not be read is reported rather than omitted. A
   total assembled from three venues when four were asked is not the user's
   net worth; `notes` and `partial` are how the UI knows to say so.
--------------------------------------------------------------------------- */

/** Where a holding or position lives. Free-form: venues are added often. */
export type Venue = "wallet" | "hyperliquid" | "binance" | "okx" | (string & {});

/** Which surface produced a figure, for allocation by strategy. */
export type Strategy =
  | "cash"
  | "spot"
  | "perps"
  | "yield"
  | "lp"
  | "prediction"
  | "agent";

export interface SpotHolding {
  id: string;
  venue: Venue;
  /**
   * The network a wallet holding sits on: "Solana", "Ethereum" or "Robinhood
   * Chain" (lib/evm/chains.ts). "—" for a venue's own ledger.
   */
  chain: string;
  /**
   * The `WalletScope` this holding was read through, by id.
   *
   * Set on wallet holdings, which share `venue: "wallet"` across chains — the
   * venue alone would put an Ethereum balance under the Solana wallet's
   * scope. Absent on a venue's holdings, which match their scope by venue.
   */
  scopeId?: string;
  /** Mint (Solana), contract (EVM) or the venue's own symbol key. */
  address: string | null;
  symbol: string;
  name: string | null;
  logo: string | null;
  quantity: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  /** Share of `totalValueUsd`. Null when the total is not computable. */
  allocationPct: number | null;
  /**
   * Cost basis, and the PnL derived from it.
   *
   * Null throughout, on every path, today. Neither the Solana RPC nor the
   * venue account endpoints report what a holding was bought at — deriving
   * one needs a full trade history walk per asset. The columns exist so the
   * table can show them the day a basis service does; until then the UI hides
   * the column rather than rendering a zero that reads as break-even.
   */
  avgCostUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  /**
   * The venue recognises this asset as what it claims to be.
   *
   * Unverified holdings are shown and never counted — airdropping a token
   * named "USDC" at a wallet costs a few cents, and a dashboard that adds one
   * into a total can be made to display any figure an attacker likes.
   */
  verified: boolean;
  /** True for stablecoins, which count toward available capital. */
  liquid: boolean;
  /**
   * What market venues know this asset by, for 24h change and candles.
   *
   * Absent means the symbol itself. Null means ask nobody: a stock token's
   * ticker can name an unrelated crypto token on a crypto venue — "V" or
   * "ON" — and a 24h move borrowed from it would be a wrong figure presented
   * as a real one.
   */
  marketSymbol?: string | null;
  /**
   * A Robinhood Stock Token: an ERC-20 on Robinhood Chain giving economic
   * exposure to a US share or ETF. `multiplier` is shares per token
   * (ERC-8056 `uiMultiplier`, read on-chain), which reinvested dividends and
   * splits move off 1 — so a token is worth the share price times it.
   */
  stockToken?: { ticker: string; multiplier: number };
}

export interface PerpPosition {
  id: string;
  venue: Venue;
  market: string;
  side: "long" | "short";
  size: number;
  entryPrice: number | null;
  markPrice: number | null;
  leverage: number | null;
  marginUsd: number | null;
  liquidationPrice: number | null;
  notionalUsd: number;
  unrealizedPnlUsd: number | null;
  roePct: number | null;
  /** Null everywhere today: no venue adapter reads funding yet. */
  fundingUsd: number | null;
}

export interface DefiPosition {
  id: string;
  protocol: string;
  chain: string;
  category: "lend" | "borrow" | "lp" | "stake" | "vault" | "other";
  label: string;
  valueUsd: number | null;
  suppliedUsd: number | null;
  borrowedUsd: number | null;
  apyPct: number | null;
  earnedUsd: number | null;
  /** Only ever the protocol's own figure. Never derived here — see §17. */
  healthFactor: number | null;
  inRange: boolean | null;
}

export interface OpenOrder {
  id: string;
  venue: Venue;
  market: string;
  type: string;
  side: "buy" | "sell";
  priceUsd: number | null;
  quantity: number;
  filledQuantity: number;
  status: string;
  createdAt: string;
}

export interface PortfolioActivity {
  id: string;
  kind:
    | "deposit" | "withdrawal" | "swap" | "trade"
    | "perp_open" | "perp_close" | "defi" | "order" | "agent" | "transfer";
  /** One line, already written for a person. Never a bare signature. */
  summary: string;
  venue: Venue;
  status: "pending" | "confirmed" | "failed";
  at: string | null;
  /** Explorer or venue link. Null when there is nowhere useful to go. */
  href: string | null;
}

export interface PortfolioHistoryPoint {
  at: string;
  totalValueUsd: number;
  /** Cumulative deposits minus withdrawals, so a deposit is not read as PnL. */
  netFlowUsd: number | null;
}

export interface WalletScope {
  /** "all", or the address itself. */
  id: string;
  label: string;
  address: string | null;
  chain: string;
  venue: Venue;
  /**
   * This scope's own account value, available balance and open PnL —
   * additive fields the Portfolio page does not read. They exist for the
   * Assets page's account cards, which need "Hyperliquid is worth $X" as a
   * discrete figure rather than folded into the portfolio-wide total.
   *
   * Equity, not notional: for a leveraged venue this is margin plus
   * unrealised PnL, not the size of the position it backs. A 5x position
   * held on $1,000 of margin makes that account worth roughly $1,000 (plus
   * PnL), not $5,000 — the number a "where does my capital live" view has to
   * report is what was committed, not what it controls.
   */
  valueUsd?: number | null;
  availableUsd?: number | null;
  unrealizedPnlUsd?: number | null;
}

/**
 * A source that could not be read, or a surface that does not exist yet.
 *
 * `missing` is the important distinction. "Kamino is down" and "Elyra has no
 * Kamino integration" both produce an empty DeFi tab, and they call for
 * opposite responses: one is a retry, the other is a roadmap item. Rendering
 * them identically is how a dashboard teaches its user to ignore both.
 */
export interface SourceNote {
  scope: string;
  reason: string;
  kind: "failed" | "missing";
}

export interface PortfolioSummary {
  totalValueUsd: number | null;
  /** Stablecoins plus free venue collateral. */
  availableCapitalUsd: number | null;
  unrealizedPnlUsd: number | null;
  pnl24hUsd: number | null;
  pnl24hPct: number | null;
  agentManagedValueUsd: number | null;
  agentManagedPct: number | null;
}

/**
 * Prediction-market exposure, as the portfolio sees it.
 *
 * `connected` is the field that carries the weight. False means Elyra cannot
 * see the positions at all, which is NOT the same as there being none — and
 * every surface that renders this has to say which it is rather than showing
 * $0 either way.
 */
export interface PredictionSummary {
  connected: boolean;
  /** Null when not connected or unreadable. Never 0 as a stand-in. */
  valueUsd: number | null;
  costBasisUsd: number | null;
  unrealisedPnlUsd: number | null;
  /** Bounded and exact: shares settle at $1 or $0. */
  capitalAtRiskUsd: number | null;
  maxPayoutUsd: number | null;
  activeMarkets: number | null;
  resolvingWithin24h: number | null;
  resolvingWithin7d: number | null;
  claimableCount: number | null;
  claimableValueUsd: number | null;
  /** Why it is not connected or not readable. Null when it is fine. */
  unavailableReason: string | null;
}

export interface PortfolioSnapshot {
  asOf: string;
  summary: PortfolioSummary;
  scopes: WalletScope[];
  spot: SpotHolding[];
  perps: PerpPosition[];
  defi: DefiPosition[];
  orders: OpenOrder[];
  activity: PortfolioActivity[];
  history: PortfolioHistoryPoint[];
  /**
   * Prediction markets, always present so a caller never has to guess whether
   * the absence of this field means "none" or "not asked".
   */
  prediction: PredictionSummary;
  notes: SourceNote[];
  /**
   * A source failed, so the totals above are of what could be read and not of
   * what the user holds. The KPI strip labels itself rather than presenting
   * an incomplete figure as a complete one.
   */
  partial: boolean;
}

/** Which source produced a history series: stored snapshots, or rebuilt from candles. */
export type HistoryBasis = "recorded" | "reconstructed" | "none";

/** The periods /api/portfolio/history serves. */
export type HistoryRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

/** /api/portfolio/history. */
export interface HistoryResponse {
  points: PortfolioHistoryPoint[];
  /** Which of the two sources produced this — the UI must say which. */
  basis: HistoryBasis;
  /** Holdings the series could not price, named so the panel can say so. */
  uncovered: string[];
  coveragePct: number;
  error: string | null;
}

export interface PortfolioResponse {
  portfolio: PortfolioSnapshot | null;
  error: string | null;
  /** A configuration gap (no RPC url), not an outage. */
  unconfigured: boolean;
}

/* ---------------------------------------------------------------------------
   Derived views
--------------------------------------------------------------------------- */

export type AllocationMode = "asset" | "venue" | "strategy" | "chain";

export interface AllocationSlice {
  key: string;
  label: string;
  logo: string | null;
  valueUsd: number;
  pct: number;
}

export type HealthTone = "good" | "watch" | "risk" | "neutral";

export interface HealthMetric {
  key: string;
  label: string;
  /** Already formatted — the rule that produced it decides its precision. */
  value: string;
  detail: string;
  tone: HealthTone;
}

export interface BriefObservation {
  id: string;
  text: string;
  tone: "positive" | "negative" | "neutral";
}
