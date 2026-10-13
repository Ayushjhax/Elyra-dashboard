"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, ExternalLink, Inbox, Wallet } from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button, buttonVariants } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ValueTone } from "@/components/ui/DeltaText";
import {
  formatCompactUsd,
  formatPct,
  formatPrice,
  formatQty,
  formatRelativeTime,
  formatTimestamp,
  formatUsd,
} from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssets, useAssetsBySymbols, usePrices } from "@/lib/market/usePrices";
import {
  ledgerHistory,
  ledgerOrders,
  ledgerPositions,
  markToLive,
  type LedgerAction,
  type LedgerEvent,
  type LedgerOrder,
  type LedgerPosition,
} from "@/lib/portfolio/ledger";
import { LEDGER_EMPTY } from "@/lib/portfolio/ledgerEmpty";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { txExplorerUrl } from "@/lib/solana/address";
import { useElyraStore } from "@/lib/store";
import type { LedgerTab, MarketFilter, MarketType } from "@/lib/types";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useWalletActivity } from "@/lib/wallet/useWalletActivity";

const TABS: { value: LedgerTab; label: string }[] = [
  { value: "positions", label: "Positions" },
  { value: "orders", label: "Orders" },
  { value: "history", label: "History" },
];

const FILTERS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "spot", label: "Spot" },
  { value: "perps", label: "Perps" },
  { value: "prediction", label: "Prediction" },
  { value: "defi", label: "DeFi" },
];

/** Whether a row belongs under the current venue filter. */
function inFilter(market: MarketType, filter: MarketFilter): boolean {
  return filter === "all" || market === filter;
}

/** Long / Short / Buy / Sell as a badge, coloured by what it means. */
function SideCell({ side }: { side: "long" | "short" | "buy" | "sell" }) {
  const positive = side === "long" || side === "buy";
  const label = side.charAt(0).toUpperCase() + side.slice(1);
  return (
    <span
      className={cn(
        "type-label inline-flex rounded-chip px-1.5 py-px",
        positive ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative",
      )}
    >
      {label}
    </span>
  );
}

/** Left behind on a SOL sale for network fees and rent. */
const SOL_FEE_RESERVE = 0.01;

function Dash() {
  return <span className="text-text-muted">—</span>;
}

function price(value: number | null) {
  return value === null ? <Dash /> : formatPrice(value, priceDecimals(value));
}

function venueLabel(venue: string): string {
  if (venue === "okx") return "OKX";
  return venue.charAt(0).toUpperCase() + venue.slice(1);
}

/**
 * What a row offers. A wallet holding sells through the swap dialog, which
 * the browser wallet signs; everything on a venue is a link to the venue,
 * because Elyra's connections there are read-only.
 */
function ActionCell({
  action,
  canSign,
  onSell,
}: {
  action: LedgerAction;
  canSign: boolean;
  onSell: (symbol: string, quantity: number) => void;
}) {
  if (action === null) return null;
  if (action.kind === "swap") {
    return (
      <Button
        size="xs"
        variant="quiet"
        className="px-1.5"
        disabled={!canSign}
        title={canSign ? `Swap ${action.symbol} to USDC, signed in your wallet` : "Wallet signing is unavailable"}
        onClick={() => onSell(action.symbol, action.quantity)}
      >
        Sell
      </Button>
    );
  }
  if (action.href === null) return null;
  return (
    <a
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Elyra's ${venueLabel(action.venue)} connection is read-only — manage this on ${venueLabel(action.venue)}`}
      className={cn(buttonVariants({ variant: "quiet", size: "xs" }), "px-1.5")}
    >
      {venueLabel(action.venue)}
      <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
    </a>
  );
}

/* ---------------------------------------------------------------------------
   Trading activity: positions, orders and history, under the chart.

   The signed-in account's own ledger, from /api/portfolio and the wallet's
   transaction list: wallet holdings, venue perps and DeFi deposits, marked
   to the live Pyth price where there is one. Nothing is sample data, and
   an empty tab means the read succeeded and found nothing.

   Folds to its header like every module in the workspace. The tab and the
   venue filter live in the store, so folding, reopening or reloading finds
   them where they were.
--------------------------------------------------------------------------- */

export function TradingActivity() {
  const open = useElyraStore((state) => state.tradingOpen);
  const setOpen = useElyraStore((state) => state.setTradingOpen);
  const ledgerTab = useElyraStore((state) => state.ledgerTab);
  const setLedgerTab = useElyraStore((state) => state.setLedgerTab);
  const marketType = useElyraStore((state) => state.marketType);
  const setMarketType = useElyraStore((state) => state.setMarketType);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const selectedSymbol = byId.get(selectedAssetId)?.symbol.toUpperCase() ?? "";

  const auth = useElyraAuth();
  const portfolio = usePortfolio();
  const wallet = useWalletActivity(25);
  const now = useMinute();
  const snapshot = portfolio.snapshot;
  const canSign = auth.available && auth.solanaAddress !== null;
  const [sell, setSell] = useState<{ symbol: string; amount: string } | null>(null);

  const basePositions = useMemo(() => (snapshot === null ? [] : ledgerPositions(snapshot)), [snapshot]);

  /* Re-marked to the live feed between portfolio reads, so a value and a PnL
     move with the chart beside them rather than every thirty seconds. */
  const symbols = useMemo(() => [...new Set(basePositions.map((row) => row.symbol))], [basePositions]);
  const assets = useAssetsBySymbols(symbols);
  const ids = useMemo(() => [...assets.values()].map((asset) => asset.id), [assets]);
  const feed = usePrices(ids);

  /* The selected symbol is the spine, so its rows come first in every tab. */
  const selectedFirst = useCallback(
    <T extends { symbol: string }>(rows: T[]) => [
      ...rows.filter((row) => row.symbol === selectedSymbol),
      ...rows.filter((row) => row.symbol !== selectedSymbol),
    ],
    [selectedSymbol],
  );

  const allPositions = useMemo(
    () =>
      basePositions.map((row) => {
        const asset = assets.get(row.symbol);
        return markToLive(row, asset ? feed.rows.get(asset.id)?.price : undefined);
      }),
    [basePositions, assets, feed],
  );
  const allOrders = useMemo(() => (snapshot === null ? [] : ledgerOrders(snapshot)), [snapshot]);
  const allHistory = useMemo(
    () => ledgerHistory(snapshot, wallet.items, txExplorerUrl),
    [snapshot, wallet.items],
  );

  const positions = useMemo(
    () => selectedFirst(allPositions.filter((row) => inFilter(row.market, marketType))),
    [allPositions, marketType, selectedFirst],
  );
  const orders = useMemo(
    () => selectedFirst(allOrders.filter((row) => inFilter(row.market, marketType))),
    [allOrders, marketType, selectedFirst],
  );
  const history = useMemo(
    () => allHistory.filter((row) => inFilter(row.market, marketType)),
    [allHistory, marketType],
  );

  const markSelected = useCallback(
    (row: { symbol: string }) => (row.symbol === selectedSymbol ? "bg-surface-raised" : undefined),
    [selectedSymbol],
  );

  const positionColumns: Column<LedgerPosition>[] = [
    {
      key: "market",
      header: "Market",
      width: "132px",
      render: (row) => (
        <span className="block truncate text-text-primary" title={row.label}>
          {row.label}
        </span>
      ),
    },
    {
      key: "side",
      header: "Side",
      width: "64px",
      render: (row) =>
        row.side !== null ? (
          <SideCell side={row.side} />
        ) : row.category !== null ? (
          <span className="type-label capitalize text-text-secondary">{row.category}</span>
        ) : (
          <span className="type-label text-text-secondary">Hold</span>
        ),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      width: "88px",
      render: (row) => (row.size === null ? <Dash /> : formatQty(row.size, row.size < 1 ? 4 : 2)),
    },
    { key: "entry", header: "Entry", align: "right", width: "88px", render: (row) => price(row.entryPrice) },
    { key: "mark", header: "Mark", align: "right", width: "88px", render: (row) => price(row.markPrice) },
    { key: "liq", header: "Liq. Price", align: "right", width: "88px", render: (row) => price(row.liquidationPrice) },
    {
      key: "value",
      header: "Value",
      align: "right",
      width: "88px",
      render: (row) => (row.valueUsd === null ? <Dash /> : formatCompactUsd(row.valueUsd)),
    },
    {
      key: "pnl",
      header: "PnL",
      align: "right",
      width: "96px",
      render: (row) =>
        row.pnlUsd === null ? (
          <Dash />
        ) : (
          <ValueTone value={row.pnlUsd} className="flex flex-col items-end leading-4">
            <span>{formatUsd(row.pnlUsd, { sign: true })}</span>
            {row.pnlPct !== null && <span className="type-data-sm leading-[14px]">{formatPct(row.pnlPct)}</span>}
          </ValueTone>
        ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      width: "96px",
      headerSrOnly: true,
      render: (row) => (
        <ActionCell
          action={row.action}
          canSign={canSign}
          onSell={(symbol, quantity) => {
            /* SOL pays the network fee, so a full-balance sale would fail at
               signing. A small reserve stays behind; the amount is editable. */
            const amount = symbol === "SOL" ? Math.max(0, quantity - SOL_FEE_RESERVE) : quantity;
            setSell({ symbol, amount: amount.toFixed(9).replace(/\.?0+$/, "") });
          }}
        />
      ),
    },
  ];

  const orderColumns: Column<LedgerOrder>[] = [
    {
      key: "time",
      header: "Time",
      width: "102px",
      render: (row) => (
        <time dateTime={row.createdAt} className="text-text-secondary">
          {formatTimestamp(row.createdAt)}
        </time>
      ),
    },
    {
      key: "market",
      header: "Market",
      width: "132px",
      render: (row) => (
        <span className="block truncate" title={row.label}>
          {row.label}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "72px",
      render: (row) => <span className="capitalize text-text-secondary">{row.type}</span>,
    },
    { key: "side", header: "Side", width: "64px", render: (row) => <SideCell side={row.side} /> },
    { key: "price", header: "Price", align: "right", width: "88px", render: (row) => price(row.priceUsd) },
    {
      key: "size",
      header: "Size",
      align: "right",
      width: "88px",
      render: (row) => formatQty(row.quantity, row.quantity < 1 ? 4 : 2),
    },
    {
      key: "filled",
      header: "Filled",
      align: "right",
      width: "56px",
      render: (row) => (
        <span className={row.filledPct > 0 ? "text-text-primary" : "text-text-muted"}>
          {formatPct(row.filledPct, { sign: false, decimals: 0 })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "72px",
      render: (row) => <span className="capitalize text-text-secondary">{row.status}</span>,
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      width: "96px",
      headerSrOnly: true,
      render: (row) => <ActionCell action={row.action} canSign={false} onSell={() => {}} />,
    },
  ];

  const historyColumns: Column<LedgerEvent>[] = [
    {
      key: "time",
      header: "Time",
      width: "112px",
      render: (row) =>
        row.at === null ? (
          <span className="text-text-muted">Pending</span>
        ) : (
          <time dateTime={row.at} className="text-text-secondary" title={`${formatTimestamp(row.at)} UTC`}>
            {now === null ? formatTimestamp(row.at) : formatRelativeTime(row.at, now)}
          </time>
        ),
    },
    {
      key: "summary",
      header: "Activity",
      width: "240px",
      render: (row) => (
        <span className="block truncate text-text-primary" title={row.summary}>
          {row.summary}
        </span>
      ),
    },
    {
      key: "venue",
      header: "Venue",
      width: "96px",
      render: (row) => <span className="text-text-secondary">{venueLabel(row.venue)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "88px",
      render: (row) => (
        <span
          className={cn(
            "capitalize",
            row.status === "failed" ? "text-negative" : row.status === "pending" ? "text-text-muted" : "text-text-secondary",
          )}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: "link",
      header: "Link",
      align: "right",
      width: "80px",
      headerSrOnly: true,
      render: (row) =>
        row.href === null ? null : (
          <a
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            className="type-label inline-flex items-center gap-1 text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            View
            <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
          </a>
        ),
    },
  ];

  const signedIn = portfolio.signedIn;
  const ordersMissing = snapshot?.notes.find((note) => note.scope === "orders" && note.kind === "missing");
  const failedNotes = snapshot?.notes.filter((note) => note.kind === "failed") ?? [];

  const empty = (() => {
    const copy = LEDGER_EMPTY[ledgerTab][marketType];
    if (ledgerTab === "orders" && ordersMissing && marketType !== "defi") {
      return {
        title: "Open orders are not read yet",
        body: `${ordersMissing.reason} Positions and balances on your connected venues are.`,
      };
    }
    if (ledgerTab === "history" && wallet.error !== null) {
      return { title: "Transactions could not be read", body: wallet.error };
    }
    return copy;
  })();

  const prediction = snapshot?.prediction;

  const body = (() => {
    if (!auth.available) {
      return (
        <EmptyState icon={Wallet} title="Sign-in is not configured" body="No account can be read, so there is no ledger to show." />
      );
    }
    if (!portfolio.authReady || (signedIn && portfolio.loading && snapshot === null)) {
      return (
        <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading trading activity">
          {[0, 1, 2].map((index) => (
            <span key={index} className="skeleton block h-5 w-full" />
          ))}
        </div>
      );
    }
    if (!signedIn) {
      return (
        <EmptyState
          icon={Wallet}
          title="Connect to see your trading activity"
          body="Your wallet holdings, venue positions and transactions appear here, marked to the live price."
          action={
            <Button size="sm" variant="accent" onClick={auth.login}>
              Connect wallet
            </Button>
          }
        />
      );
    }
    if (snapshot === null) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title={portfolio.unconfigured ? "Balances are not configured" : "Your accounts could not be read"}
          body={portfolio.error ?? "Try again in a moment."}
          action={
            <Button size="sm" variant="quiet" onClick={portfolio.refetch}>
              Try again
            </Button>
          }
        />
      );
    }

    if (ledgerTab === "positions" && marketType === "prediction" && prediction) {
      return (
        <EmptyState
          icon={Inbox}
          title={
            prediction.connected
              ? `${prediction.activeMarkets ?? 0} active prediction ${prediction.activeMarkets === 1 ? "market" : "markets"}`
              : "Prediction markets are not connected"
          }
          body={
            prediction.connected
              ? `${prediction.valueUsd === null ? "Value unavailable" : `${formatUsd(prediction.valueUsd)} at mark`}${
                  prediction.unrealisedPnlUsd === null ? "" : `, ${formatUsd(prediction.unrealisedPnlUsd, { sign: true })} unrealised`
                }. Each position is listed on Portfolio.`
              : (prediction.unavailableReason ?? "Elyra cannot see prediction positions for this account.")
          }
          action={
            <Link href="/portfolio" className={buttonVariants({ variant: "quiet", size: "sm" })}>
              Open Portfolio
            </Link>
          }
        />
      );
    }

    if (ledgerTab === "positions" && positions.length > 0) {
      return (
        <DataTable
          columns={positionColumns}
          rows={positions}
          getRowKey={(row) => row.id}
          minWidth={828}
          rowClassName={markSelected}
          caption={`Open ${marketType === "all" ? "" : `${marketType} `}positions`}
        />
      );
    }
    if (ledgerTab === "orders" && orders.length > 0) {
      return (
        <DataTable
          columns={orderColumns}
          rows={orders}
          getRowKey={(row) => row.id}
          minWidth={770}
          rowClassName={markSelected}
          caption={`Resting ${marketType === "all" ? "" : `${marketType} `}orders`}
        />
      );
    }
    if (ledgerTab === "history" && history.length > 0) {
      return (
        <DataTable
          columns={historyColumns}
          rows={history}
          getRowKey={(row) => row.id}
          minWidth={616}
          caption={`${marketType === "all" ? "All" : marketType} account history`}
        />
      );
    }
    if (ledgerTab === "history" && wallet.isLoading) {
      return (
        <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading history">
          {[0, 1, 2].map((index) => (
            <span key={index} className="skeleton block h-5 w-full" />
          ))}
        </div>
      );
    }
    return <EmptyState icon={Inbox} title={empty.title} body={empty.body} />;
  })();

  const counts: Record<LedgerTab, number> = {
    positions: allPositions.filter((row) => inFilter(row.market, marketType)).length,
    orders: allOrders.filter((row) => inFilter(row.market, marketType)).length,
    history: history.length,
  };

  return (
    <Section
      title="Trading activity"
      icon={<ArrowLeftRight size={16} strokeWidth={1.5} />}
      meta={snapshot === null ? undefined : `${allPositions.length} open ${allPositions.length === 1 ? "position" : "positions"}`}
      open={open}
      onOpenChange={setOpen}
    >
      {/* Row 1 — primary tabs, underlined in --accent. */}
      <Tabs value={ledgerTab} onValueChange={(value) => setLedgerTab(value as LedgerTab)}>
        <TabsList className="border-b border-border-subtle px-3">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {tab.label}
              {snapshot !== null && <span className="type-data-sm text-text-muted">{counts[tab.value]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Row 2 — venue filter, single select. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <div role="radiogroup" aria-label="Market type" className="flex flex-wrap items-center gap-1">
          {FILTERS.map((filter) => {
            const active = filter.value === marketType;
            return (
              <button
                key={filter.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMarketType(filter.value)}
                className={cn(
                  "type-label h-8 rounded-control px-3",
                  "transition-colors duration-[var(--dur-fast)] ease-brand",
                  active
                    ? "bg-surface-active text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        {selectedSymbol && snapshot !== null && ledgerTab !== "history" && (
          <span className="type-label ml-auto shrink-0 text-text-muted">{selectedSymbol} rows first</span>
        )}
      </div>

      {failedNotes.length > 0 && (
        <p role="status" className="type-label border-b border-border-subtle px-4 py-2 text-text-secondary">
          Incomplete — {failedNotes.map((note) => `${note.scope}: ${note.reason}`).join(" · ")}
        </p>
      )}

      {/* Horizontal scrolling stays inside the table; the page never scrolls
          sideways. Tall lists scroll inside too, so the section stays a
          section. */}
      <div className="max-h-[440px] min-h-[200px] overflow-auto">{body}</div>

      {sell !== null && canSign && (
        <SwapDialog
          address={auth.solanaAddress}
          initialFrom={sell.symbol}
          initialTo="USDC"
          initialAmount={sell.amount}
          onExecuted={() => portfolio.refetch()}
          onClose={() => setSell(null)}
        />
      )}
    </Section>
  );
}
