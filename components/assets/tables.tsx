"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { Delta, Money, Quantity } from "@/components/portfolio/primitives";
import { CoinMark } from "@/components/ui/CoinMark";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { orderBalances, venueLabel, type BalanceGrouping } from "@/lib/assets/derive";
import { formatPrice, truncateMiddle } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import type { PerpPosition, SpotHolding } from "@/lib/portfolio/types";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The workspace tables.

   Column priority is done with container queries on the column itself
   (`hidden @[46rem]:table-cell`) rather than by measuring in JS. This page
   is a shell column whose width changes on a drag with the viewport
   unchanged, so a media query would be reading the wrong box.

   These are Assets' own tables rather than Portfolio's: the columns differ
   (Account/Venue and Available are specific to a treasury view), and
   reaching into Portfolio's table components to parameterise them would put
   this task's changes inside a page the brief says not to touch. Only the
   shared cell primitives are reused.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Balances
--------------------------------------------------------------------------- */

export function BalancesTable({
  holdings,
  grouping,
}: {
  holdings: SpotHolding[];
  grouping: BalanceGrouping;
}) {
  const rows = useMemo(() => orderBalances(holdings, grouping), [holdings, grouping]);

  const columns: Column<SpotHolding>[] = [
    {
      key: "asset",
      header: "Asset",
      width: "24%",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <CoinMark symbol={row.symbol} logo={row.logo} size={16} />
          <span className="min-w-0 truncate">
            <span className="text-text-primary">{row.symbol}</span>
            {row.name !== null && (
              <span className="type-label ml-1 text-text-muted">{row.name}</span>
            )}
          </span>
          {!row.verified && (
            <span
              title="Not in the verified token index — shown, never counted toward totals."
              className="type-label shrink-0 rounded-chip border border-negative/40 px-1 text-negative"
            >
              !
            </span>
          )}
        </span>
      ),
    },
    {
      key: "account",
      header: "Account",
      width: "14%",
      className: "hidden @[38rem]:table-cell",
      render: (row) => (
        <span className="truncate text-text-secondary">{venueLabel(row.venue)}</span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      width: "14%",
      className: "hidden @[28rem]:table-cell",
      render: (row) => <Quantity value={row.quantity} className="text-text-secondary" />,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: "12%",
      className: "hidden @[52rem]:table-cell",
      render: (row) =>
        row.priceUsd === null ? (
          <span className="text-text-muted" title="No market source prices this asset.">
            —
          </span>
        ) : (
          <span className="tabular-nums text-text-secondary">
            ${formatPrice(row.priceUsd, row.priceUsd < 1 ? 6 : 2)}
          </span>
        ),
    },
    {
      key: "change",
      header: "24H",
      align: "right",
      width: "11%",
      className: "hidden @[44rem]:table-cell",
      render: (row) => (
        <Delta pct={row.change24hPct} reason="No 24h price series for this asset." />
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      width: "14%",
      render: (row) => (
        <Money
          value={row.verified ? row.valueUsd : null}
          reason={
            row.verified
              ? "No price source lists this asset."
              : "Unverified token — shown but never counted."
          }
          className="text-text-primary"
        />
      ),
    },
    {
      key: "allocation",
      header: "Alloc",
      align: "right",
      width: "10%",
      className: "hidden @[58rem]:table-cell",
      render: (row) =>
        row.allocationPct === null ? (
          <span className="text-text-muted">—</span>
        ) : (
          <span className="tabular-nums text-text-secondary">
            {row.allocationPct > 0 && row.allocationPct < 0.05 ? "<0.1" : row.allocationPct.toFixed(1)}%
          </span>
        ),
    },
    {
      key: "available",
      header: "Available",
      align: "right",
      width: "13%",
      className: "hidden @[66rem]:table-cell",
      /* Equal to the balance, and truthfully so: Elyra has no order book, no
         escrow and no staking lock, so nothing reserves a wallet token
         against anything. The column exists because §7 asks for it and it
         becomes meaningful the moment something can lock a balance. */
      render: (row) => <Quantity value={row.quantity} className="text-text-secondary" />,
    },
  ];

  return (
    <DataTable
      caption="Token balances across capital accounts"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
    />
  );
}

/* ---------------------------------------------------------------------------
   Positions
--------------------------------------------------------------------------- */

export function PositionsTable({ positions }: { positions: PerpPosition[] }) {
  const rows = useMemo(
    () => [...positions].sort((a, b) => b.notionalUsd - a.notionalUsd),
    [positions],
  );

  const columns: Column<PerpPosition>[] = [
    {
      key: "position",
      header: "Position",
      width: "22%",
      render: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-text-primary">{row.market}</span>
          <span className="type-label truncate text-text-muted">Perpetual</span>
        </span>
      ),
    },
    {
      key: "venue",
      header: "Venue",
      width: "14%",
      className: "hidden @[38rem]:table-cell",
      render: (row) => (
        <span className="truncate text-text-secondary">{venueLabel(row.venue)}</span>
      ),
    },
    {
      key: "side",
      header: "Side",
      width: "14%",
      render: (row) => (
        /* Text, never colour alone — §36 and a screenshot both need it. */
        <span
          className={cn(
            "type-label rounded-chip border px-1.5 py-0.5",
            row.side === "long"
              ? "border-positive/40 bg-positive-bg text-positive"
              : "border-negative/40 bg-negative-bg text-negative",
          )}
        >
          {row.side === "long" ? "LONG" : "SHORT"}
          {row.leverage !== null && ` ${row.leverage.toFixed(0)}×`}
        </span>
      ),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      width: "14%",
      className: "hidden @[30rem]:table-cell",
      render: (row) => (
        <span className="flex flex-col items-end">
          <Quantity value={row.size} className="text-text-secondary" />
          <Money value={row.notionalUsd} compact className="type-label text-text-muted" />
        </span>
      ),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      width: "12%",
      className: "hidden @[52rem]:table-cell",
      render: (row) =>
        row.entryPrice === null ? (
          <span className="text-text-muted" title="This venue does not report an entry price.">
            —
          </span>
        ) : (
          <span className="tabular-nums text-text-secondary">
            ${formatPrice(row.entryPrice)}
          </span>
        ),
    },
    {
      key: "mark",
      header: "Current",
      align: "right",
      width: "12%",
      className: "hidden @[44rem]:table-cell",
      render: (row) =>
        row.markPrice === null ? (
          <span className="text-text-muted">—</span>
        ) : (
          <span className="tabular-nums text-text-secondary">
            ${formatPrice(row.markPrice)}
          </span>
        ),
    },
    {
      key: "pnl",
      header: "PnL",
      align: "right",
      width: "16%",
      render: (row) => (
        <span className="flex flex-col items-end">
          <Money
            value={row.unrealizedPnlUsd}
            reason="This venue does not report unrealized PnL."
            sign
            className={cn(
              row.unrealizedPnlUsd === null
                ? undefined
                : row.unrealizedPnlUsd >= 0
                  ? "text-positive"
                  : "text-negative",
            )}
          />
          {row.roePct !== null && (
            <span
              className={cn(
                "type-label tabular-nums",
                row.roePct >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {row.roePct >= 0 ? "+" : ""}
              {row.roePct.toFixed(1)}% ROE
            </span>
          )}
        </span>
      ),
    },
    {
      key: "risk",
      header: "Risk",
      align: "right",
      width: "14%",
      className: "hidden @[60rem]:table-cell",
      render: (row) => {
        /* Distance to liquidation, and only when the venue supplied both
           numbers. Estimating it from leverage would be a guess about the
           one figure a leveraged operator cannot afford to see wrong. */
        if (row.liquidationPrice === null || row.markPrice === null || row.markPrice <= 0) {
          return (
            <span
              className="text-text-muted"
              title="This venue did not report a liquidation price. It is never estimated."
            >
              —
            </span>
          );
        }
        const distance =
          (Math.abs(row.markPrice - row.liquidationPrice) / row.markPrice) * 100;
        return (
          <span
            className={cn(
              "type-data-sm tabular-nums",
              distance <= 10
                ? "text-negative"
                : distance <= 25
                  ? "text-accent"
                  : "text-text-secondary",
            )}
            title={`Liquidation at $${formatPrice(row.liquidationPrice)}`}
          >
            {distance.toFixed(1)}% away
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      caption="Open positions across connected venues"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
    />
  );
}

/* ---------------------------------------------------------------------------
   History

   Built on the wallet activity feed, which returns confirmed signatures
   rather than decoded transfers — its route explains why. So the Action,
   Asset and Amount columns are honest about what a signature list actually
   contains, and the explorer link is a secondary action rather than a raw
   hash standing in as the row's label (§10).
--------------------------------------------------------------------------- */

export function HistoryTable({ items }: { items: WalletActivity[] }) {
  const now = useMinute();

  const columns: Column<WalletActivity>[] = [
    {
      key: "time",
      header: "Time",
      width: "16%",
      render: (row) => (
        <span className="tabular-nums text-text-secondary">
          {row.at === null || now === null
            ? "—"
            : new Date(row.at).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      width: "26%",
      render: (row) => (
        <span className="min-w-0 truncate text-text-primary">{row.memo ?? "Transaction"}</span>
      ),
    },
    {
      key: "asset",
      header: "Asset",
      width: "14%",
      className: "hidden @[44rem]:table-cell",
      /* Decoding which mint moved needs a getTransaction per signature plus
         an instruction parser per program — the activity route declines that
         deliberately, so this column declines to guess. */
      render: () => (
        <span
          className="text-text-muted"
          title="Transfer contents are not decoded — open the transaction for detail."
        >
          —
        </span>
      ),
    },
    {
      key: "account",
      header: "Account",
      width: "14%",
      className: "hidden @[38rem]:table-cell",
      render: () => <span className="text-text-secondary">Spot</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: "14%",
      className: "hidden @[52rem]:table-cell",
      render: () => <span className="text-text-muted">—</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      width: "16%",
      render: (row) => (
        <span
          className={cn(
            "type-label",
            row.status === "confirmed"
              ? "text-positive"
              : row.status === "pending"
                ? "text-accent"
                : "text-negative",
          )}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: "link",
      header: "Transaction",
      headerSrOnly: true,
      align: "right",
      width: "10%",
      render: (row) => (
        <a
          href={txExplorerUrl(row.signature)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${truncateMiddle(row.signature, 4, 4)} in the explorer`}
          title={row.signature}
          className={cn(
            "inline-flex items-center gap-1 rounded-chip text-text-muted",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          )}
        >
          <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
        </a>
      ),
    },
  ];

  return (
    <DataTable
      caption="Recent account activity"
      columns={columns}
      rows={items}
      getRowKey={(row) => row.signature}
    />
  );
}
