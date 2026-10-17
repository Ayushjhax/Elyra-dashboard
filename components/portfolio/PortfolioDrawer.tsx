"use client";

import { useMemo, useState } from "react";
import { useFundWallet } from "@privy-io/react-auth/solana";
import {
  ArrowLeftRight,
  ArrowRight,
  Coins,
  Eye,
  EyeOff,
  Plus,
  QrCode,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { Delta, Money, Quantity, useBalancesHidden } from "@/components/portfolio/primitives";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { IconButton, InfoTip, StatusDot, Tip } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { OptionMenu } from "@/components/ui/OptionMenu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAge, formatPct, truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { ALL_ACCOUNTS, drawerView, perpEquity, type DrawerView } from "@/lib/portfolio/drawer";
import type { PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import type { DefiPosition, PerpPosition, PortfolioSnapshot, SourceNote, SpotHolding } from "@/lib/portfolio/types";
import { CLUSTER_LABEL, EXPECTED_CLUSTER, type Cluster } from "@/lib/solana/cluster";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";

/* ---------------------------------------------------------------------------
   The Portfolio drawer: your capital, in one place.

   One snapshot (`usePortfolio`, reference counted, thirty-second poll) and
   one pure view of it per account scope (lib/portfolio/drawer.ts). Switching
   scope, tab or visibility is a render over data already held — nothing here
   fetches on its own.

   Loading, a failed read, a stale reading, a partial one and a genuine zero
   each look different. Only the last may say $0.00, and only it shows the
   onboarding beside it.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

const card = "min-w-0 rounded-panel border border-border-subtle bg-surface-raised";

const outlined = cn(
  "type-body-sm inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium",
  "border border-accent-quiet text-text-primary",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:border-accent hover:bg-surface-hover active:bg-surface-panel",
  "disabled:pointer-events-none disabled:opacity-60",
);

function noteFor(notes: SourceNote[], ...scopes: string[]): SourceNote | undefined {
  return notes.find((note) => scopes.includes(note.scope) && note.kind === "failed");
}

/* ---------------------------------------------------------------------------
   Account scope and network
--------------------------------------------------------------------------- */

function ScopeMenu({
  snapshot,
  scope,
  onChange,
}: {
  snapshot: PortfolioSnapshot;
  scope: string;
  onChange: (scope: string) => void;
}) {
  return (
    <OptionMenu
      label="Account"
      icon={WalletCards}
      value={scope}
      onChange={onChange}
      options={[
        { id: ALL_ACCOUNTS, label: "All accounts" },
        ...snapshot.scopes.map((entry) => ({
          id: entry.id,
          label: entry.label,
          detail: entry.address === null ? null : truncateMiddle(entry.address, 4, 4),
        })),
      ]}
    />
  );
}

/** Which network this is read from. Not a menu: there is one network to read. */
function NetworkBadge({ cluster }: { cluster: Cluster | null }) {
  const logos = useTickerLogos(SOL);
  const wrong = cluster !== null && cluster !== EXPECTED_CLUSTER;
  const label = cluster === null || cluster === EXPECTED_CLUSTER ? "Solana" : CLUSTER_LABEL[cluster];
  return (
    <span
      className={cn(
        "type-body-sm inline-flex h-9 min-w-0 shrink-0 items-center gap-2 rounded-control border px-3",
        wrong ? "border-negative/50 text-negative" : "border-border-subtle text-text-primary",
      )}
      title={`Balances are read from ${CLUSTER_LABEL[cluster ?? EXPECTED_CLUSTER]}`}
    >
      <CoinMark symbol="SOL" {...logos("SOL")} size={18} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Balance
--------------------------------------------------------------------------- */

function SyncLine({ feed, now }: { feed: PortfolioFeed; now: number | null }) {
  const age = feed.fetchedAt === null || now === null ? null : formatAge(feed.fetchedAt, now);
  const failed = feed.snapshot?.notes.filter((note) => note.kind === "failed") ?? [];

  if (feed.refreshing) return <StatusDot tone="muted">Syncing…</StatusDot>;
  if (feed.stale) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusDot tone="caution" className="whitespace-normal">Refresh failed · showing the reading from {age ?? "earlier"}</StatusDot>
        <button type="button" onClick={feed.refetch} className={cn("type-label rounded-chip text-text-primary underline underline-offset-2")}>
          Retry
        </button>
      </span>
    );
  }
  if (failed.length > 0) {
    return (
      <Tip openOnTap label={failed.map((note) => note.reason).join(" ")}>
        <span tabIndex={0} className={cn("rounded-chip")}>
          <StatusDot tone="caution">
            Partial · {failed.length} {failed.length === 1 ? "source" : "sources"} unavailable
          </StatusDot>
        </span>
      </Tip>
    );
  }
  return <StatusDot tone="positive">Synced {age ?? "just now"}</StatusDot>;
}

function Performance({ view }: { view: DrawerView }) {
  if (view.unfunded) return <p className="type-body-sm text-text-secondary">Performance appears once funded</p>;
  if (view.change === null) {
    return <p className="type-body-sm text-text-muted">No 24h price for what&rsquo;s held, so change can&rsquo;t be measured</p>;
  }
  return (
    <p className="type-body-sm flex flex-wrap items-baseline gap-x-1.5">
      <Delta pct={view.change.pnlPct} usd={view.change.pnlUsd} />
      <span className="text-text-secondary">past 24h</span>
      {view.change.coveragePct < 95 && (
        <span className="text-text-muted">· over {view.change.coveragePct.toFixed(0)}% of value</span>
      )}
    </p>
  );
}

function BalanceCard({ view, feed }: { view: DrawerView; feed: PortfolioFeed }) {
  const hidden = useBalancesHidden();
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const now = useSecond();

  return (
    <section aria-label="Total portfolio value" className={cn(card, "p-4 @max-[340px]:p-3")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="type-body-sm text-text-secondary">
            {view.scopeEntry === null ? "Total portfolio value" : `${view.scopeEntry.label} value`}
          </p>
          <Money
            value={view.totalUsd}
            reason="No source returned a value that could be totalled."
            className="type-display mt-1 block truncate font-sans text-text-primary"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton
            label={hidden ? "Show balances" : "Hide balances"}
            aria-pressed={hidden}
            onClick={() => setHidden(!hidden)}
            className={cn("size-9 border border-border-subtle", hidden && "text-accent")}
          >
            {hidden ? <EyeOff size={16} strokeWidth={1.5} aria-hidden /> : <Eye size={16} strokeWidth={1.5} aria-hidden />}
          </IconButton>
          <IconButton
            label={feed.refreshing ? "Refreshing portfolio" : "Refresh portfolio"}
            onClick={feed.refetch}
            disabled={feed.refreshing}
            className="size-9 border border-border-subtle"
          >
            <RefreshCw size={16} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
          </IconButton>
        </div>
      </div>
      <div className="mt-1">
        <Performance view={view} />
      </div>

      <div className="mt-4 grid grid-cols-2 border-t border-border-subtle pt-3">
        <div className="min-w-0 border-r border-border-subtle pr-3">
          <p className="type-body-sm flex items-center gap-1 text-text-secondary">
            Available
            <InfoTip text="Stablecoins held plus free collateral at connected venues — what could be deployed without selling anything." />
          </p>
          <Money
            value={view.availableUsd}
            reason="No stablecoin balance or venue collateral was readable."
            className="type-h1 mt-0.5 block truncate font-sans text-text-primary"
          />
        </div>
        <div className="min-w-0 pl-4">
          <p className="type-body-sm flex items-center gap-1 text-text-secondary">
            In positions
            <InfoTip text="Perp margin with its open PnL, DeFi deposits and prediction-market shares. Wallet balances are never counted here." />
          </p>
          <Money
            value={view.inPositionsUsd}
            reason="Positions at this account could not be valued."
            className="type-h1 mt-0.5 block truncate font-sans text-text-primary"
          />
        </div>
      </div>

      <div className="mt-3" aria-live="polite">
        <SyncLine feed={feed} now={now} />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Funding
--------------------------------------------------------------------------- */

const primary = cn(
  "type-body inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium",
  "bg-accent text-text-on-accent transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:bg-accent-hover active:bg-accent-quiet active:text-text-primary disabled:opacity-60",
);

/** Privy's own funding flow. A component of its own because the hook throws with no provider mounted. */
function AddFundsWithPrivy({ address }: { address: string }) {
  const { fundWallet } = useFundWallet();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        /* Rejects when the person closes the flow, which is not a failure. */
        void fundWallet({ address })
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
      className={primary}
    >
      <Plus size={18} strokeWidth={1.75} aria-hidden />
      {busy ? "Opening…" : "Add funds"}
    </button>
  );
}

function FundingActions({ address, onReceive }: { address: string | null; onReceive: () => void }) {
  const auth = useElyraAuth();
  return (
    <div className="grid grid-cols-2 gap-3 @max-[300px]:grid-cols-1">
      {auth.available && address !== null ? (
        <AddFundsWithPrivy address={address} />
      ) : (
        /* No funding flow without a wallet to fund: the honest next step is
           the address, which says why when there is none. */
        <button type="button" onClick={onReceive} className={primary}>
          <Plus size={18} strokeWidth={1.75} aria-hidden />
          Add funds
        </button>
      )}
      <button type="button" onClick={onReceive} className={cn(outlined, "h-11")}>
        <QrCode size={18} strokeWidth={1.5} aria-hidden />
        Receive
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Tabs
--------------------------------------------------------------------------- */

function EmptyPanel({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={cn(card, "flex flex-col items-center gap-1 px-4 py-6 text-center")}>
      <p className="type-body-sm font-medium text-text-primary">{title}</p>
      <p className="type-label max-w-72 text-text-secondary">{body}</p>
      {action}
    </div>
  );
}

function FailedPanel({ note, onRetry }: { note: SourceNote; onRetry: () => void }) {
  return (
    <div role="alert" className={cn(card, "flex flex-col gap-2 border-negative/40 px-4 py-3")}>
      <p className="type-body-sm text-negative">This part of the portfolio couldn&rsquo;t be read</p>
      <p className="type-label text-text-secondary">{note.reason}</p>
      <button type="button" onClick={onRetry} className={cn(outlined, "h-8 self-start px-3")}>
        <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
        Retry
      </button>
    </div>
  );
}

function WalletIllustration() {
  /* A wallet with a coin rising out of it, in Sage and Lime line work. */
  return (
    <svg viewBox="0 0 120 92" aria-hidden className="h-20 w-auto">
      <path d="M18 74a42 42 0 0 1 84 0" fill="none" stroke="currentColor" strokeDasharray="2 4" className="text-border-strong" />
      <g className="text-accent" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M14 58h8M18 54v8M100 54h8M104 50v8M34 24h6M37 21v6" />
      </g>
      <g className="text-sage" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <rect x="36" y="46" width="44" height="34" rx="6" className="fill-surface-raised" />
        <path d="M70 58h12a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H70a5 5 0 0 1 0-10Z" className="fill-surface-raised" />
        <circle cx="72" cy="63" r="1.8" fill="currentColor" stroke="none" />
      </g>
      <g className="text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="66" cy="32" r="13" className="fill-surface-raised" />
        <path d="M60 27.5h11l-2 2.5H58zM60 33.5h11l-2 2.5H58z" strokeWidth="1.8" strokeLinejoin="round" fill="currentColor" />
      </g>
    </svg>
  );
}

function EmptyPortfolio({ onReceive }: { onReceive: () => void }) {
  return (
    <div className={cn(card, "flex flex-col items-center px-4 pb-5 pt-4 text-center")}>
      <WalletIllustration />
      <h3 className="type-h2 mt-2 text-text-primary">Your portfolio starts here</h3>
      <p className="type-body-sm mt-1 max-w-72 text-text-secondary">
        Add funds to see your assets, positions and portfolio allocation.
      </p>
      <button
        type="button"
        onClick={onReceive}
        className={cn(
          "type-body-sm mt-3 inline-flex items-center gap-1.5 rounded-chip font-medium text-accent",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-accent-hover",
        )}
      >
        View wallet address
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

function HoldingRow({
  holding,
  logo,
  onSwap,
  actionColumn,
}: {
  holding: SpotHolding;
  logo: { logo: string | null; fallbackLogo: string | null };
  onSwap: ((holding: SpotHolding) => void) | null;
  /** Some row in the list has an action, so every row keeps its column. */
  actionColumn: boolean;
}) {
  return (
    <li className="group flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 transition-colors duration-[var(--dur-fast)] ease-brand last:border-b-0 hover:bg-surface-hover">
      {/* An unverified token never borrows the real one's artwork: a fake
          "USDC" must not wear the USDC logo. */}
      <CoinMark
        symbol={holding.symbol}
        logo={holding.verified ? (holding.logo ?? logo.logo) : holding.logo}
        fallbackLogo={holding.verified ? logo.fallbackLogo : null}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <p className="type-body-sm truncate font-medium text-text-primary" title={holding.name ?? holding.symbol}>
          {holding.name ?? holding.symbol}
        </p>
        <p className="type-label flex min-w-0 items-center gap-1.5 text-text-secondary">
          <span className="truncate">{holding.symbol}</span>
          {holding.venue !== "wallet" && <span className="shrink-0 capitalize text-text-muted">· {holding.venue}</span>}
          {!holding.verified ? (
            <Tip openOnTap label="Not recognised by Jupiter, so it is shown but never counted.">
              <span tabIndex={0} className={cn("shrink-0 rounded-chip border border-border-subtle px-1 text-text-muted")}>
                Unverified
              </span>
            </Tip>
          ) : (
            holding.allocationPct !== null && (
              <span className="shrink-0 tabular-nums text-text-muted">· {holding.allocationPct.toFixed(1)}%</span>
            )
          )}
        </p>
      </div>
      <div className="flex min-w-0 shrink-0 flex-col items-end">
        <Money
          value={holding.verified ? holding.valueUsd : null}
          reason={holding.verified ? "No price for this token." : "Unverified tokens are not valued."}
          className="type-body-sm font-medium text-text-primary"
        />
        <span className="type-label max-w-36 truncate text-text-secondary">
          <Quantity value={holding.quantity} /> {holding.symbol}
        </span>
      </div>
      {onSwap !== null ? (
        <IconButton label={`Swap ${holding.symbol}`} onClick={() => onSwap(holding)} className="-mr-1.5">
          <ArrowLeftRight size={15} strokeWidth={1.5} aria-hidden />
        </IconButton>
      ) : (
        actionColumn && <span aria-hidden className="-mr-1.5 size-8 shrink-0" />
      )}
    </li>
  );
}

function HoldingsPanel({
  view,
  snapshot,
  onReceive,
  onRetry,
  onSwap,
}: {
  view: DrawerView;
  snapshot: PortfolioSnapshot;
  onReceive: () => void;
  onRetry: () => void;
  onSwap: ((holding: SpotHolding) => void) | null;
}) {
  const symbols = useMemo(() => view.holdings.map((holding) => holding.symbol), [view.holdings]);
  const logos = useTickerLogos(symbols);

  if (view.unfunded) return <EmptyPortfolio onReceive={onReceive} />;
  if (view.holdings.length === 0) {
    const failed = noteFor(snapshot.notes, "wallet", ...(view.scopeEntry === null ? [] : [view.scopeEntry.id]));
    return failed ? (
      <FailedPanel note={failed} onRetry={onRetry} />
    ) : (
      <EmptyPanel title="No holdings in this account" body="Tokens held here will appear with their value and share of the portfolio." />
    );
  }
  const swappable = (holding: SpotHolding) => onSwap !== null && holding.venue === "wallet" && holding.verified;
  const actionColumn = view.holdings.some(swappable);
  return (
    <ul className={cn(card, "list-none overflow-hidden")}>
      {view.holdings.map((holding) => (
        <HoldingRow
          key={holding.id}
          holding={holding}
          logo={logos(holding.symbol)}
          onSwap={swappable(holding) ? onSwap : null}
          actionColumn={actionColumn}
        />
      ))}
    </ul>
  );
}

function PerpRow({ position }: { position: PerpPosition }) {
  const venueUrl = position.venue === "hyperliquid" ? "https://app.hyperliquid.xyz/trade" : null;
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="type-body-sm flex min-w-0 items-center gap-1.5 font-medium text-text-primary">
          <span className="truncate">{position.market}</span>
          <span
            className={cn(
              "type-label shrink-0 rounded-chip px-1.5",
              position.side === "long" ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative",
            )}
          >
            {position.side === "long" ? "Long" : "Short"}
            {position.leverage !== null && ` ${position.leverage}×`}
          </span>
        </p>
        <p className="type-label truncate capitalize text-text-secondary">
          {venueUrl === null ? (
            position.venue
          ) : (
            <a href={venueUrl} target="_blank" rel="noopener noreferrer" className={cn("rounded-chip hover:text-text-primary")}>
              {position.venue} ↗
            </a>
          )}{" "}
          · Perp
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <Money value={perpEquity(position)} className="type-body-sm font-medium text-text-primary" />
        <Delta
          pct={position.roePct}
          usd={position.unrealizedPnlUsd}
          reason="The venue reported no PnL for this position."
          className="type-label"
        />
      </div>
    </li>
  );
}

function PositionsPanel({ view, snapshot, onRetry }: { view: DrawerView; snapshot: PortfolioSnapshot; onRetry: () => void }) {
  const prediction = view.prediction;
  const hasPrediction = prediction !== null && (prediction.activeMarkets ?? 0) > 0;
  if (view.perps.length === 0 && !hasPrediction) {
    const failed = noteFor(snapshot.notes, "venues", "hyperliquid", "prediction", ...(view.scopeEntry === null ? [] : [view.scopeEntry.id]));
    return failed ? (
      <FailedPanel note={failed} onRetry={onRetry} />
    ) : (
      <EmptyPanel
        title="No open positions"
        body="Perpetuals at connected venues and prediction-market shares appear here with their value and open PnL."
      />
    );
  }
  return (
    <ul className={cn(card, "list-none overflow-hidden")}>
      {view.perps.map((position) => (
        <PerpRow key={position.id} position={position} />
      ))}
      {hasPrediction && prediction !== null && (
        <li className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="type-body-sm font-medium text-text-primary">Prediction markets</p>
            <p className="type-label text-text-secondary">
              {prediction.activeMarkets} active {prediction.activeMarkets === 1 ? "market" : "markets"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <Money value={prediction.valueUsd} reason="Positions could not be valued." className="type-body-sm font-medium text-text-primary" />
            <Delta pct={null} usd={prediction.unrealisedPnlUsd} reason="No PnL reported." className="type-label" />
          </div>
        </li>
      )}
    </ul>
  );
}

const CATEGORY: Record<DefiPosition["category"], string> = {
  lend: "Lending",
  borrow: "Borrowing",
  lp: "Liquidity",
  stake: "Staking",
  vault: "Vault",
  other: "Position",
};

function YieldPanel({ view, snapshot, onRetry }: { view: DrawerView; snapshot: PortfolioSnapshot; onRetry: () => void }) {
  if (view.scopeEntry !== null) {
    return (
      <EmptyPanel
        title="Yield is counted under All accounts"
        body="DeFi deposits are netted against their receipt tokens across the whole portfolio, so they show with every account selected."
      />
    );
  }
  if (view.defi.length === 0) {
    const failed = noteFor(snapshot.notes, "defi");
    return failed ? (
      <FailedPanel note={failed} onRetry={onRetry} />
    ) : (
      <EmptyPanel title="No yield positions" body="Kamino lending and vault deposits from this wallet appear here with their rate and value." />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className={cn(card, "list-none overflow-hidden")}>
        {view.defi.map((position) => (
          <li key={position.id} className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="type-body-sm truncate font-medium text-text-primary" title={position.label}>
                {position.label}
              </p>
              <p className="type-label truncate text-text-secondary">
                {position.protocol} · {CATEGORY[position.category]}
                {position.apyPct !== null && <span className="tabular-nums"> · {formatPct(position.apyPct, { sign: false })} APY</span>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <Money
                value={position.suppliedUsd ?? position.valueUsd}
                reason="The protocol reported no value."
                className="type-body-sm font-medium text-text-primary"
              />
              {position.earnedUsd !== null ? (
                <span className="type-label text-positive">
                  <Money value={position.earnedUsd} sign /> earned
                </span>
              ) : position.borrowedUsd !== null && position.borrowedUsd > 0 ? (
                <span className="type-label text-text-secondary">
                  <Money value={-position.borrowedUsd} /> borrowed
                </span>
              ) : (
                <span className="type-label text-text-muted">Deposited</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="type-label px-1 text-text-muted">
        Rates are the protocol&rsquo;s current variable APY — they move, and are not a promised return.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Onboarding and footer
--------------------------------------------------------------------------- */

function TrackList() {
  const rows = [
    { icon: Coins, title: "Assets across your wallets", body: "Balances and allocation in one view" },
    { icon: TrendingUp, title: "Positions & yield", body: "Track deployed capital and earnings" },
  ];
  return (
    <section aria-label="What you can track" className={cn(card, "px-4 py-3")}>
      <h3 className="type-body-sm font-medium text-text-primary">What you can track</h3>
      <ul className="mt-1 flex list-none flex-col divide-y divide-border-subtle">
        {rows.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-center gap-3 py-2.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-control border border-border-subtle bg-surface-base text-text-secondary">
              <Icon size={18} strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              <span className="type-body-sm block text-text-primary">{title}</span>
              <span className="type-label block text-text-secondary">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FooterStrip({ cluster, feed }: { cluster: Cluster | null; feed: PortfolioFeed }) {
  const logos = useTickerLogos(SOL);
  const tone = feed.stale ? "caution" : feed.snapshot === null ? "negative" : "positive";
  return (
    <footer className={cn(card, "flex items-center gap-3 px-4 py-2.5")}>
      <CoinMark symbol="SOL" {...logos("SOL")} size={24} />
      <div className="min-w-0 flex-1">
        <p className="type-body-sm truncate text-text-primary">{CLUSTER_LABEL[cluster ?? EXPECTED_CLUSTER]}</p>
        {/* True: the snapshot polls every thirty seconds and on returning to the tab. */}
        <p className="type-label text-text-secondary">Balances update automatically</p>
      </div>
      <StatusDot tone={tone}>{feed.stale ? "Last read failed" : feed.snapshot === null ? "Unreachable" : "Connected"}</StatusDot>
    </footer>
  );
}

/* ---------------------------------------------------------------------------
   Loading
--------------------------------------------------------------------------- */

function DrawerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Reading your portfolio" className="flex flex-col gap-3">
      <div className="flex justify-between gap-3">
        <span className="skeleton h-9 w-40 rounded-control" />
        <span className="skeleton h-9 w-28 rounded-control" />
      </div>
      <div className={cn(card, "flex flex-col gap-2 p-4")}>
        <span className="skeleton h-3.5 w-36" />
        <span className="skeleton h-9 w-44 rounded-control" />
        <span className="skeleton h-3.5 w-52" />
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border-subtle pt-3">
          <span className="skeleton h-12 rounded-control" />
          <span className="skeleton h-12 rounded-control" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <span className="skeleton h-11 rounded-control" />
        <span className="skeleton h-11 rounded-control" />
      </div>
      <span className="skeleton h-9 w-full rounded-control" />
      <div className={cn(card, "flex flex-col")}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
            <span className="skeleton size-8 rounded-pill" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="skeleton h-3 w-24" />
              <span className="skeleton h-2.5 w-14" />
            </span>
            <span className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The drawer's body
--------------------------------------------------------------------------- */

type Tab = "holdings" | "positions" | "yield";

export function PortfolioCards() {
  /* The wallet store is read for its cluster only — the status bar already holds it open. */
  return <PortfolioView auth={useElyraAuth()} feed={usePortfolio()} cluster={useWalletDashboard().cluster} />;
}

/** The drawer with its data passed in, so it renders the same from fixtures. */
export function PortfolioView({ auth, feed, cluster }: { auth: ElyraAuth; feed: PortfolioFeed; cluster: Cluster | null }) {
  const [scope, setScope] = useState(ALL_ACCOUNTS);
  const [tab, setTab] = useState<Tab>("holdings");
  const [receiving, setReceiving] = useState(false);
  const [swapping, setSwapping] = useState<SpotHolding | null>(null);

  const view = useMemo(() => (feed.snapshot === null ? null : drawerView(feed.snapshot, scope)), [feed.snapshot, scope]);
  const address = auth.solanaAddress;
  const canSign = auth.available && address !== null;

  if (!auth.available) {
    return (
      <EmptyPanel title="Sign-in isn't configured" body="This deployment has no sign-in, so there is no portfolio to read." />
    );
  }
  if (!auth.ready || (feed.signedIn && feed.snapshot === null && feed.loading)) return <DrawerSkeleton />;
  if (!feed.signedIn) {
    return (
      <EmptyPanel
        title="Connect your wallet"
        body="Sign in to see your capital across wallets, venues and positions."
        action={
          <button type="button" onClick={auth.login} className={cn(primary, "mt-3 h-9 px-4")}>
            Connect wallet
          </button>
        }
      />
    );
  }
  if (feed.snapshot === null || view === null) {
    /* Never a $0.00: a failed read is not an empty portfolio. */
    return (
      <div role="alert" className={cn(card, "flex flex-col gap-2 border-negative/40 p-4")}>
        <p className="type-body-sm font-medium text-negative">
          {feed.unconfigured ? "The portfolio isn't configured" : "Your portfolio couldn't be read"}
        </p>
        <p className="type-label text-text-secondary">{feed.error ?? "The portfolio could not be assembled."}</p>
        {!feed.unconfigured && (
          <button type="button" onClick={feed.refetch} disabled={feed.refreshing} className={cn(outlined, "h-8 self-start px-3")}>
            <RefreshCw size={13} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
            Retry
          </button>
        )}
      </div>
    );
  }

  const snapshot = feed.snapshot;
  const openReceive = () => setReceiving(true);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScopeMenu snapshot={snapshot} scope={view.scope} onChange={setScope} />
        <NetworkBadge cluster={cluster} />
      </div>

      <BalanceCard view={view} feed={feed} />
      <FundingActions address={address} onReceive={openReceive} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="gap-3">
        <TabsList aria-label="Portfolio" className="grid grid-cols-3 gap-0 border-b border-border-subtle">
          {(
            [
              ["holdings", "Holdings", view.holdings.length],
              ["positions", "Positions", null],
              ["yield", "Yield", null],
            ] as const
          ).map(([value, label, count]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="type-body-sm h-10 justify-center gap-2 px-2"
            >
              {label}
              {count !== null && (
                <span className="type-label min-w-5 rounded-chip bg-surface-hover px-1.5 tabular-nums text-text-secondary">{count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="holdings">
          <HoldingsPanel
            view={view}
            snapshot={snapshot}
            onReceive={openReceive}
            onRetry={feed.refetch}
            onSwap={canSign ? setSwapping : null}
          />
        </TabsContent>
        <TabsContent value="positions">
          <PositionsPanel view={view} snapshot={snapshot} onRetry={feed.refetch} />
        </TabsContent>
        <TabsContent value="yield">
          <YieldPanel view={view} snapshot={snapshot} onRetry={feed.refetch} />
        </TabsContent>
      </Tabs>

      {view.unfunded && <TrackList />}
      <FooterStrip cluster={cluster} feed={feed} />

      <ReceiveDialog open={receiving} onOpenChange={setReceiving} address={address} cluster={cluster} />
      {swapping !== null && canSign && (
        <SwapDialog
          address={address}
          initialFrom={swapping.symbol}
          initialTo={swapping.symbol === "USDC" ? "SOL" : "USDC"}
          onExecuted={() => feed.refetch()}
          onClose={() => setSwapping(null)}
        />
      )}
    </>
  );
}
