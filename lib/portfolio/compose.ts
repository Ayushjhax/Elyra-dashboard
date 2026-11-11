import "server-only";

import { EVM_CHAIN_KEYS, isEvmAddress } from "@/lib/evm/chains";
import { readEvmWallet } from "@/lib/evm/wallet";
import { isSuiAddress } from "@/lib/sui/chain";
import { readSuiWallet } from "@/lib/sui/wallet";
import { getPortfolio } from "@/lib/exchange/portfolio";
import { UpstreamError } from "@/lib/market/http";
import { pythConfigured } from "@/lib/market/pyth/catalog";
import { pricesForIds } from "@/lib/market/pyth/client";
import { snapshots } from "@/lib/market/router";
import { marketSymbolOf, SOLANA_CHAIN } from "@/lib/portfolio/chain";
import { exposureOf, resolvingWithin } from "@/lib/prediction/analytics";
import { predictionAccount } from "@/lib/prediction/account";
import { polymarketPositions } from "@/lib/providers/polymarket-account";
import { routeDefiPositions } from "@/lib/providers/router";
import type { DefiPosition as ProviderDefiPosition } from "@/lib/providers/types";
import { clusterOf, type Cluster } from "@/lib/solana/cluster";
import {
  RpcUnconfiguredError,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getBalance,
  getGenesisHash,
  getTokenAccountsByOwner,
  rpcConfigured,
} from "@/lib/solana/rpc";
import { resolveTokens, type TokenMeta } from "@/lib/solana/tokens";
import { composeSnapshot } from "@/lib/wallet/compose";
import { foldAccounts } from "@/lib/wallet/fold";
import { LAMPORTS_PER_SOL } from "@/lib/wallet/types";
import type {
  DefiPosition as DefiPositionView,
  PerpPosition,
  PortfolioSnapshot,
  PredictionSummary,
  SourceNote,
  SpotHolding,
  WalletScope,
} from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   One portfolio, assembled from the services this app already has.

   Nothing here is a new data source. The Solana side goes through the same
   RPC and token primitives the wallet panel uses; the account's EVM wallet
   is read on Ethereum and Robinhood Chain by lib/evm/wallet.ts; the venue
   side is `getPortfolio`, which already reads Hyperliquid and Binance behind
   one normalised shape. This file is the adapter between those and the page — the
   "smallest clean abstraction", not a second backend.

   What it adds that neither source has on its own:

     - one 24h-change lookup covering every symbol held anywhere, so the page
       makes one batched market request rather than one per row;
     - `SourceNote`s, which carry the difference between a source that failed
       and a surface that does not exist yet.

   That second distinction is the reason DeFi, orders and history appear here
   at all. Elyra has no Kamino, Meteora or order integration today and keeps
   no balance snapshots, so those arrays are empty on every path. They are
   returned as empty WITH a note saying why, rather than omitted — an empty
   tab that explains itself is a roadmap; an empty tab that does not is a bug
   report waiting to be filed.
--------------------------------------------------------------------------- */

/** Counted as available capital: spendable now, at face value. */
const STABLES = new Set(["USDC", "USDT", "PYUSD", "USDE", "DAI", "FDUSD", "USDS", "USDG"]);

/** Crypto.SOL/USD. Written out for the same reason the wallet route does. */
const SOL_FEED_ID = 6;

/** Holdings below this are noise in a capital view. */
const DUST_USD = 0.01;

/* ---------------------------------------------------------------------------
   DeFi

   Added with the provider layer. `routeDefiPositions` fans out across
   protocol adapters; today that is Kamino, whose schema was verified against
   its published OpenAPI document and a live call.
--------------------------------------------------------------------------- */

interface DefiRead {
  positions: DefiPositionView[];
  /** Net USD to add to the portfolio total. Null when nothing was readable. */
  valueUsd: number | null;
  /** Receipt mints already represented by a DeFi position — see below. */
  shareMints: Set<string>;
  notes: SourceNote[];
}

/**
 * Every DeFi position for a wallet, as portfolio rows.
 *
 * Two things here are easy to get wrong and expensive when wrong.
 *
 * DOUBLE COUNTING. An LP or vault position issues a receipt token that sits
 * in the wallet. The wallet read prices it, and the protocol also values the
 * underlying position — the same dollars, counted twice, and the portfolio
 * silently inflates. The receipt mints come back with the positions and the
 * matching spot holdings are excluded from the total below.
 *
 * NET VALUE, NOT SUPPLIED. A position supplying $124 against an $85 borrow
 * is worth $39. Adding the supplied figure would report borrowed money as
 * the user's own capital.
 */
async function readDefi(solanaAddress: string | null): Promise<DefiRead> {
  const empty: DefiRead = {
    positions: [],
    valueUsd: null,
    shareMints: new Set<string>(),
    notes: [],
  };

  if (solanaAddress === null) return empty;

  const result = await routeDefiPositions(solanaAddress);

  if (!result.ok || result.data === undefined) {
    return {
      ...empty,
      notes: [
        note(
          "defi",
          result.error?.message ?? "DeFi positions could not be read.",
          "failed",
        ),
      ],
    };
  }

  const notes: SourceNote[] = (result.warnings ?? []).map((warning) =>
    /* A protocol section that was not indexed is a read that did not happen,
       which is a `failed` note — it makes the snapshot partial, and the UI
       says the total is a floor. */
    note("defi", warning, "failed"),
  );

  const shareMints = new Set<string>();
  for (const position of result.data) {
    if (position.shareMint !== null && position.shareMint !== undefined) {
      shareMints.add(position.shareMint);
    }
  }

  const priced = result.data.filter((position) => position.netUsd !== null);
  const valueUsd =
    result.data.length === 0
      ? 0
      : priced.length === 0
        ? null
        : priced.reduce((sum, position) => sum + (position.netUsd ?? 0), 0);

  if (priced.length < result.data.length) {
    notes.push(
      note(
        "defi",
        `${result.data.length - priced.length} DeFi position(s) could not be valued and are not counted.`,
        "failed",
      ),
    );
  }

  return {
    positions: result.data.map(toDefiRow),
    valueUsd,
    shareMints,
    notes,
  };
}

/** A provider position as the row shape the Portfolio page already renders. */
function toDefiRow(position: ProviderDefiPosition): DefiPositionView {
  const CATEGORY: Record<string, DefiPositionView["category"]> = {
    lending: "lend",
    multiply: "lend",
    leverage: "lend",
    liquidity: "lp",
    earn: "vault",
    staking: "stake",
    private_credit: "vault",
  };

  return {
    id: `${position.provider}:${position.id}`,
    protocol: position.provider === "kamino" ? "Kamino" : position.provider,
    chain: "solana",
    category: CATEGORY[position.kind] ?? "other",
    label: position.label,
    valueUsd: position.netUsd,
    suppliedUsd: position.suppliedUsd,
    borrowedUsd: position.borrowedUsd,
    apyPct: position.apy,
    earnedUsd: null,
    /* Kamino reports LTV and the liquidation LTV, not a health factor. The
       two are not interchangeable and converting one into the other would be
       inventing the protocol's own risk metric — §17. */
    healthFactor: null,
    inRange: null,
  };
}

/* ---------------------------------------------------------------------------
   Prediction markets

   Included in the portfolio because prediction positions ARE capital: shares
   bought at 40c are dollars committed, and a portfolio that omits them
   understates what the operator has at work.

   ── Not connected is not zero ──────────────────────────────────────────

   Polymarket holds positions in a proxy wallet whose address is not the
   user's EOA, so without a linked address there is nothing to query. That is
   why `connected` travels with the figures and why every null here stays
   null: rendering an unlinked account as $0 prediction exposure is a claim
   about someone's money that nobody checked.
--------------------------------------------------------------------------- */

/** The honest shape for an account Elyra cannot see. */
export function predictionUnavailable(reason: string): PredictionSummary {
  return {
    connected: false,
    valueUsd: null,
    costBasisUsd: null,
    unrealisedPnlUsd: null,
    capitalAtRiskUsd: null,
    maxPayoutUsd: null,
    activeMarkets: null,
    resolvingWithin24h: null,
    resolvingWithin7d: null,
    claimableCount: null,
    claimableValueUsd: null,
    unavailableReason: reason,
  };
}

interface PredictionRead {
  summary: PredictionSummary;
  /** Counted toward the portfolio total. Null when unreadable. */
  valueUsd: number | null;
  notes: SourceNote[];
}

async function readPrediction(userId: string | null): Promise<PredictionRead> {
  const account = await predictionAccount(userId);

  if (account === null) {
    return {
      summary: predictionUnavailable(
        "No prediction-market account is linked, so positions cannot be read.",
      ),
      valueUsd: null,
      /* `missing`, not `failed`: nothing broke. An unlinked account is a
         setup step, and marking the whole portfolio partial over it would
         flag every user who does not trade prediction markets. */
      notes: [
        note("prediction", "No prediction-market account is linked.", "missing"),
      ],
    };
  }

  const result = await polymarketPositions(account.address);

  if (!result.ok || result.data === undefined) {
    const reason = result.error?.message ?? "Prediction positions could not be read.";
    return {
      summary: predictionUnavailable(reason),
      valueUsd: null,
      /* This one IS a failure: an account is linked and we could not read it,
         so the portfolio total is genuinely incomplete. */
      notes: [note("prediction", reason, "failed")],
    };
  }

  const exposure = exposureOf(result.data);

  return {
    summary: {
      connected: true,
      valueUsd: exposure.currentValueUsd,
      costBasisUsd: exposure.costBasisUsd,
      unrealisedPnlUsd: exposure.unrealisedPnlUsd,
      capitalAtRiskUsd: exposure.maxLossUsd,
      maxPayoutUsd: exposure.maxPayoutUsd,
      activeMarkets: exposure.openCount,
      resolvingWithin24h: resolvingWithin(result.data, 24).length,
      resolvingWithin7d: resolvingWithin(result.data, 24 * 7).length,
      claimableCount: exposure.claimableCount,
      claimableValueUsd: exposure.claimableValueUsd,
      unavailableReason: null,
    },
    valueUsd: exposure.currentValueUsd,
    notes:
      exposure.unvaluedCount > 0
        ? [
            note(
              "prediction",
              `${exposure.unvaluedCount} prediction position(s) could not be valued and are not counted.`,
              "failed",
            ),
          ]
        : [],
  };
}

export interface ComposeOptions {
  solanaAddress: string | null;
  /**
   * EVM. Makes Hyperliquid readable with nothing connected, and is the
   * address the Ethereum and Robinhood Chain balances are read at.
   */
  sessionWallet: string | null;
  /** Null when the profile store is unreachable — venues are then skipped. */
  userId: string | null;
  /**
   * The account's Sui wallet. Optional: only the surfaces that resolve it
   * (the portfolio and activity routes) read Sui; the rest are unchanged.
   */
  suiAddress?: string | null;
}

function note(scope: string, reason: string, kind: SourceNote["kind"]): SourceNote {
  return { scope, reason, kind };
}

/** Surfaces the product has not built yet, stated once, in one place. */
function missingSurfaces(): SourceNote[] {
  return [
    note("orders", "Order management is not implemented on this venue set.", "missing"),
    note(
      "history",
      "Portfolio history needs balance snapshots, which are not being recorded yet.",
      "missing",
    ),
  ];
}

/* ---------------------------------------------------------------------------
   The Solana wallet
--------------------------------------------------------------------------- */

interface WalletRead {
  holdings: SpotHolding[];
  scope: WalletScope | null;
  notes: SourceNote[];
}

async function readWallet(address: string | null): Promise<WalletRead> {
  if (address === null) return { holdings: [], scope: null, notes: [] };

  if (!rpcConfigured()) {
    return {
      holdings: [],
      scope: null,
      notes: [note("wallet", new RpcUnconfiguredError().message, "failed")],
    };
  }

  const [balance, spl, spl2022, genesis] = await Promise.allSettled([
    getBalance(address),
    getTokenAccountsByOwner(address, TOKEN_PROGRAM_ID),
    getTokenAccountsByOwner(address, TOKEN_2022_PROGRAM_ID),
    getGenesisHash(),
  ]);

  if (balance.status === "rejected") {
    const reason: unknown = balance.reason;
    return {
      holdings: [],
      scope: null,
      notes: [
        note(
          "wallet",
          reason instanceof UpstreamError || reason instanceof Error
            ? reason.message
            : "Could not read the wallet balance.",
          "failed",
        ),
      ],
    };
  }

  const notes: SourceNote[] = [];
  if (spl.status === "rejected" && spl2022.status === "rejected") {
    notes.push(
      note("wallet tokens", "Token balances could not be read; SOL is current.", "failed"),
    );
  }

  const accounts = [
    ...(spl.status === "fulfilled" ? spl.value.value : []),
    ...(spl2022.status === "fulfilled" ? spl2022.value.value : []),
  ];
  const held = foldAccounts(accounts);

  const [metaResult, solPriceResult] = await Promise.allSettled([
    resolveTokens([...held.keys()]),
    pythConfigured() ? pricesForIds([SOL_FEED_ID]) : Promise.resolve([]),
  ]);

  const meta: Map<string, TokenMeta> =
    metaResult.status === "fulfilled" ? metaResult.value : new Map();
  const solUsd =
    solPriceResult.status === "fulfilled"
      ? (solPriceResult.value.find((row) => row.id === SOL_FEED_ID)?.price ?? null)
      : null;

  if (solUsd === null) {
    notes.push(note("pyth", "SOL price unavailable; SOL is listed uncounted.", "failed"));
  }

  const cluster: Cluster = genesis.status === "fulfilled" ? clusterOf(genesis.value) : "unknown";

  /* composeSnapshot already applies the verified/priced rules and the display
     cap, so the wallet panel and this page can never disagree about what a
     wallet holds. Only the shape differs. */
  const snapshot = composeSnapshot({
    address,
    cluster,
    lamports: balance.value.value,
    slot: balance.value.context.slot,
    held,
    meta,
    solUsd,
    fetchedAt: new Date().toISOString(),
  });

  const holdings: SpotHolding[] = [];

  if (snapshot.sol > 0) {
    holdings.push({
      id: `wallet:SOL`,
      venue: "wallet",
      chain: SOLANA_CHAIN,
      scopeId: address,
      address: null,
      symbol: "SOL",
      name: "Solana",
      logo: null,
      quantity: snapshot.sol,
      decimals: 9,
      priceUsd: solUsd,
      valueUsd: solUsd === null ? null : snapshot.sol * solUsd,
      change24hPct: null,
      allocationPct: null,
      avgCostUsd: null,
      pnlUsd: null,
      pnlPct: null,
      verified: true,
      liquid: false,
    });
  }

  for (const token of snapshot.tokens) {
    if (token.usdValue !== null && token.usdValue < DUST_USD) continue;
    const symbol = token.symbol ?? token.mint.slice(0, 4);
    holdings.push({
      id: `wallet:${token.mint}`,
      venue: "wallet",
      chain: SOLANA_CHAIN,
      scopeId: address,
      address: token.mint,
      symbol,
      name: token.name,
      logo: token.icon,
      quantity: token.amount,
      decimals: token.decimals,
      priceUsd:
        token.usdValue === null || token.amount === 0 ? null : token.usdValue / token.amount,
      valueUsd: token.usdValue,
      change24hPct: null,
      allocationPct: null,
      avgCostUsd: null,
      pnlUsd: null,
      pnlPct: null,
      verified: token.verified,
      liquid: token.verified && STABLES.has(symbol.toUpperCase()),
    });
  }

  /* Summed here rather than left to a caller: every holding's `valueUsd` is
     already final at this point, and only `verified` ones should count — the
     same rule `composePortfolio` applies to the portfolio-wide total, kept
     here so a spoofed token cannot inflate what this scope reports either. */
  const walletValueUsd = holdings
    .filter((holding) => holding.verified)
    .reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);

  return {
    holdings,
    scope: {
      id: address,
      label: "Solana wallet",
      address,
      chain: cluster === "mainnet-beta" ? "Solana" : `Solana ${cluster}`,
      venue: "wallet",
      valueUsd: walletValueUsd,
      /* Every counted holding here is liquid by construction — it is a
         wallet balance, not collateral backing something else. */
      availableUsd: walletValueUsd,
      unrealizedPnlUsd: null,
    },
    notes,
  };
}

/* ---------------------------------------------------------------------------
   The EVM wallet, on Ethereum and on Robinhood Chain

   One address, two ledgers. Each chain is its own scope with its own notes,
   so Ethereum being unreachable never hides what Robinhood Chain holds, and
   the total says it is partial rather than quietly dropping one of them.
--------------------------------------------------------------------------- */

interface EvmRead {
  holdings: SpotHolding[];
  scopes: WalletScope[];
  notes: SourceNote[];
}

async function readEvm(address: string | null): Promise<EvmRead> {
  if (address === null || !isEvmAddress(address)) return { holdings: [], scopes: [], notes: [] };

  const reads = await Promise.all(
    EVM_CHAIN_KEYS.map((chain) =>
      readEvmWallet(chain, address).catch((error: unknown) => ({
        holdings: [],
        scope: null,
        notes: [
          note(
            chain === "ethereum" ? "ethereum" : "robinhood chain",
            error instanceof Error ? error.message.split("\n")[0] : "The wallet could not be read.",
            "failed",
          ),
        ],
      })),
    ),
  );

  return {
    holdings: reads.flatMap((read) => read.holdings),
    scopes: reads.flatMap((read) => (read.scope === null ? [] : [read.scope])),
    notes: reads.flatMap((read) => read.notes),
  };
}

/* ---------------------------------------------------------------------------
   Venues
--------------------------------------------------------------------------- */

interface VenueRead {
  perps: PerpPosition[];
  spot: SpotHolding[];
  scopes: WalletScope[];
  availableUsd: number | null;
  unrealizedPnlUsd: number | null;
  notes: SourceNote[];
}

const EMPTY_VENUES: VenueRead = {
  perps: [], spot: [], scopes: [], availableUsd: null, unrealizedPnlUsd: null, notes: [],
};

async function readVenues(options: ComposeOptions): Promise<VenueRead> {
  if (options.userId === null) {
    /* No profile row means no stored connections to load. Hyperliquid would
       still be readable from the session wallet alone, but `getPortfolio`
       reaches the database before it reaches any venue, so asking would
       throw rather than degrade. Reported, not hidden. */
    return {
      ...EMPTY_VENUES,
      notes: [
        note(
          "venues",
          "Exchange connections could not be loaded; the database is unreachable.",
          "failed",
        ),
      ],
    };
  }

  try {
    const result = await getPortfolio(options.userId, options.sessionWallet);

    const perps: PerpPosition[] = [];
    const spot: SpotHolding[] = [];

    for (const position of result.positions) {
      if (position.market === "perp") {
        const notional = position.notional;
        const margin =
          position.leverage !== null && position.leverage > 0
            ? notional / position.leverage
            : null;
        perps.push({
          id: `${position.exchange}:${position.label}:${position.side}`,
          venue: position.exchange,
          market: position.label,
          side: position.side,
          size: position.size,
          entryPrice: position.entryPrice,
          markPrice: position.markPrice,
          leverage: position.leverage,
          marginUsd: margin,
          liquidationPrice: position.liquidationPrice,
          notionalUsd: notional,
          unrealizedPnlUsd: position.unrealizedPnl,
          /* Return on equity needs the margin behind the position. Without a
             leverage figure there is no margin, and a ROE computed against
             notional would be a different, much smaller number wearing the
             same name. */
          roePct:
            position.unrealizedPnl !== null && margin !== null && margin > 0
              ? (position.unrealizedPnl / margin) * 100
              : null,
          fundingUsd: null,
        });
        continue;
      }

      spot.push({
        id: `${position.exchange}:${position.symbol}`,
        venue: position.exchange,
        chain: "—",
        address: null,
        symbol: position.symbol,
        name: null,
        logo: null,
        quantity: position.size,
        decimals: 8,
        priceUsd: position.markPrice,
        valueUsd: position.notional,
        change24hPct: null,
        allocationPct: null,
        avgCostUsd: position.entryPrice,
        pnlUsd: position.unrealizedPnl,
        pnlPct: null,
        verified: true,
        liquid: false,
      });
    }

    const available = result.equities
      .map((row) => row.available)
      .filter((value): value is number => value !== null);

    const unrealized = result.equities
      .map((row) => row.unrealizedPnl)
      .filter((value): value is number => value !== null);

    return {
      perps,
      spot,
      scopes: result.equities.map((row) => ({
        id: row.exchange,
        label: row.exchange === "hyperliquid" ? "Hyperliquid" : row.exchange,
        address: null,
        chain: "—",
        venue: row.exchange,
        /* The venue's own reported equity, not the notional of what it
           backs — see the field's doc comment on WalletScope. */
        valueUsd: row.equity,
        availableUsd: row.available,
        unrealizedPnlUsd: row.unrealizedPnl,
      })),
      availableUsd: available.length > 0 ? available.reduce((a, b) => a + b, 0) : null,
      unrealizedPnlUsd: unrealized.length > 0 ? unrealized.reduce((a, b) => a + b, 0) : null,
      notes: result.failures.map((failure) =>
        note(failure.scope, failure.reason, "failed"),
      ),
    };
  } catch (error: unknown) {
    return {
      ...EMPTY_VENUES,
      notes: [
        note(
          "venues",
          error instanceof Error ? error.message : "Venue accounts could not be read.",
          "failed",
        ),
      ],
    };
  }
}

/* ---------------------------------------------------------------------------
   24h change

   One request for every symbol held anywhere. A symbol no market source
   lists simply keeps `change24hPct: null`, and `change24h` in derive.ts
   reports the coverage that resulted rather than pretending to a
   portfolio-wide figure.
--------------------------------------------------------------------------- */

async function applyChange24h(holdings: SpotHolding[]): Promise<void> {
  /* By market symbol, not the holding's own: WETH moves as ETH does, and a
     stock token is asked about nowhere — see `SpotHolding.marketSymbol`. */
  const symbols = [
    ...new Set(
      holdings
        .filter((holding) => holding.verified && holding.valueUsd !== null)
        .map(marketSymbolOf)
        .filter((symbol): symbol is string => symbol !== null),
    ),
  ];
  if (symbols.length === 0) return;

  const rows = await snapshots(symbols).catch(() => []);
  const changeOf = new Map(rows.map((row) => [row.symbol, row.change24hPct]));

  for (const holding of holdings) {
    const symbol = marketSymbolOf(holding);
    const change = symbol === null ? undefined : changeOf.get(symbol);
    if (change !== undefined) holding.change24hPct = change;
  }
}

/* ---------------------------------------------------------------------------
   The portfolio
--------------------------------------------------------------------------- */

export async function composePortfolio(
  options: ComposeOptions,
): Promise<PortfolioSnapshot> {
  const [wallet, evm, sui, venues, defi, prediction] = await Promise.all([
    readWallet(options.solanaAddress),
    readEvm(options.sessionWallet),
    options.suiAddress === undefined || options.suiAddress === null || !isSuiAddress(options.suiAddress)
      ? Promise.resolve({ holdings: [], scope: null, notes: [] })
      : readSuiWallet(options.suiAddress).catch((error: unknown) => ({
          holdings: [] as SpotHolding[],
          scope: null,
          notes: [note("sui", error instanceof Error ? error.message.split("\n")[0] : "Sui could not be read.", "failed")],
        })),
    readVenues(options),
    readDefi(options.solanaAddress),
    readPrediction(options.userId),
  ]);

  const spot = [...wallet.holdings, ...evm.holdings, ...sui.holdings, ...venues.spot];
  await applyChange24h(spot);

  /* A receipt token for a DeFi position is the SAME dollars the protocol is
     already reporting. Counting both inflates the portfolio by the size of
     every LP position the user holds. The row stays visible — it is really in
     the wallet — but it does not count toward the total. */
  const counted = spot.filter(
    (holding) =>
      holding.verified &&
      holding.valueUsd !== null &&
      !(holding.address !== null && defi.shareMints.has(holding.address)),
  );
  const spotValue = counted.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);

  const perpValue = venues.perps.reduce(
    (sum, position) => sum + (position.marginUsd ?? 0) + (position.unrealizedPnlUsd ?? 0),
    0,
  );

  const notes = [
    ...wallet.notes,
    ...evm.notes,
    ...sui.notes,
    ...venues.notes,
    ...defi.notes,
    ...prediction.notes,
    ...missingSurfaces(),
  ];
  const partial = notes.some((entry) => entry.kind === "failed");

  /* Null, not zero, when nothing could be read at all. A wallet that was
     unreachable and a wallet that is empty are different facts, and $0.00 is
     the wrong one to show for the first. */
  const totalValueUsd =
    counted.length === 0 &&
    venues.perps.length === 0 &&
    defi.positions.length === 0 &&
    prediction.valueUsd === null &&
    (wallet.notes.length > 0 ||
      evm.notes.some((entry) => entry.kind === "failed") ||
      sui.notes.some((entry) => entry.kind === "failed"))
      ? null
      : spotValue + perpValue + (defi.valueUsd ?? 0) + (prediction.valueUsd ?? 0);

  if (totalValueUsd !== null && totalValueUsd > 0) {
    for (const holding of spot) {
      holding.allocationPct =
        holding.valueUsd === null || !holding.verified
          ? null
          : (holding.valueUsd / totalValueUsd) * 100;
    }
  }

  const stableValue = counted
    .filter((holding) => holding.liquid)
    .reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);

  const scopes: WalletScope[] = [
    ...(wallet.scope ? [wallet.scope] : []),
    ...evm.scopes,
    ...(sui.scope ? [sui.scope] : []),
    ...venues.scopes,
  ];

  return {
    asOf: new Date().toISOString(),
    summary: {
      totalValueUsd,
      availableCapitalUsd:
        stableValue > 0 || venues.availableUsd !== null
          ? stableValue + (venues.availableUsd ?? 0)
          : null,
      unrealizedPnlUsd: venues.unrealizedPnlUsd,
      /* Both null here and derived on the client from `change24hPct`, which
         is the only 24h input that exists. Computing it server-side would
         hide the coverage caveat that has to travel with it. */
      pnl24hUsd: null,
      pnl24hPct: null,
      /* Elyra runs no agent-managed strategies against live capital yet, so
         there is no exposure to report. Zero would be a claim; null is the
         fact, and the KPI renders it as unavailable with a reason. */
      agentManagedValueUsd: null,
      agentManagedPct: null,
    },
    scopes,
    spot,
    perps: venues.perps,
    defi: defi.positions,
    prediction: prediction.summary,
    orders: [],
    activity: [],
    history: [],
    notes,
    partial,
  };
}

export { LAMPORTS_PER_SOL };
