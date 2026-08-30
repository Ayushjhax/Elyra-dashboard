"use client";

import { useCallback, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ValueTone } from "@/components/ui/DeltaText";
import { ASSETS_BY_SYMBOL } from "@/lib/mock/assets";
import { LEDGER_EMPTY } from "@/lib/mock/emptyStates";
import { HISTORY } from "@/lib/mock/history";
import { ORDERS } from "@/lib/mock/orders";
import { POSITIONS } from "@/lib/mock/positions";
import {
  formatPct,
  formatPrice,
  formatQty,
  formatTimestamp,
  formatUsd,
  truncateMiddle,
} from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import type { LedgerTab, MarketType, Order, Position, Trade } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: { value: LedgerTab; label: string }[] = [
  { value: "positions", label: "Positions" },
  { value: "orders", label: "Orders" },
  { value: "history", label: "History" },
];

const FILTERS: { value: MarketType; label: string }[] = [
  { value: "spot", label: "Spot" },
  { value: "perps", label: "Perps" },
  { value: "prediction", label: "Prediction" },
  { value: "defi", label: "DeFi" },
];

type Stub = { title: string; body: string; confirmLabel: string } | null;

/** Long / Short / Buy / Sell, coloured by what it means, never by taste. */
function SideCell({ side }: { side: "long" | "short" | "buy" | "sell" }) {
  const positive = side === "long" || side === "buy";
  const label = side.charAt(0).toUpperCase() + side.slice(1);
  return (
    <span className={positive ? "text-positive" : "text-negative"}>{label}</span>
  );
}

function precisionFor(symbol: string, market?: MarketType) {
  const asset = ASSETS_BY_SYMBOL[symbol];
  /* Prediction markets trade whole shares priced in cents on the dollar. */
  if (market === "prediction") return { price: 2, qty: 0 };
  return {
    price: asset?.pricePrecision ?? 2,
    qty: asset?.qtyPrecision ?? 2,
  };
}

export function LedgerPanel() {
  const ledgerTab = useElyraStore((state) => state.ledgerTab);
  const setLedgerTab = useElyraStore((state) => state.setLedgerTab);
  const marketType = useElyraStore((state) => state.marketType);
  const setMarketType = useElyraStore((state) => state.setMarketType);
  const selectedSymbol = useElyraStore((state) => state.selectedSymbol);
  const prices = useElyraStore((state) => state.prices);
  const [stub, setStub] = useState<Stub>(null);

  /* The selected symbol is the spine, so its rows come first in every tab. */
  const selectedFirst = useCallback(
    <T extends { symbol: string }>(rows: T[]) => {
      const mine = rows.filter((row) => row.symbol === selectedSymbol);
      const rest = rows.filter((row) => row.symbol !== selectedSymbol);
      return [...mine, ...rest];
    },
    [selectedSymbol],
  );

  /* Positions mark to the live feed, so PnL moves with the price. Prediction
     markets are quoted in probability and are left alone. */
  const positions = useMemo(() => {
    const marked = POSITIONS.filter(
      (position) => position.market === marketType,
    ).map((position) => {
      if (position.market === "prediction") return position;
      const live = prices[position.symbol];
      if (!live) return position;
      const markPrice = live.price;
      const direction = position.side === "long" ? 1 : -1;
      const pnl = (markPrice - position.entryPrice) * position.size * direction;
      return {
        ...position,
        markPrice,
        pnl,
        pnlPct: position.margin === 0 ? 0 : (pnl / position.margin) * 100,
      };
    });
    return selectedFirst(marked);
  }, [marketType, prices, selectedFirst]);

  const orders = useMemo(
    () => selectedFirst(ORDERS.filter((order) => order.market === marketType)),
    [marketType, selectedFirst],
  );

  const history = useMemo(
    () =>
      selectedFirst(
        HISTORY.filter((trade) => trade.market === marketType).sort(
          (a, b) => Date.parse(b.filledAt) - Date.parse(a.filledAt),
        ),
      ),
    [marketType, selectedFirst],
  );

  /* Rows on the selected market sit on --surface-raised. */
  const markSelected = useCallback(
    (row: { symbol: string }) =>
      row.symbol === selectedSymbol ? "bg-surface-raised" : undefined,
    [selectedSymbol],
  );

  const positionColumns: Column<Position>[] = [
    {
      key: "market",
      header: "Market",
      width: "102px",
      render: (row) => (
        <span className="block truncate text-text-primary" title={row.label}>
          {row.label}
        </span>
      ),
    },
    { key: "side", header: "Side", width: "52px", render: (row) => <SideCell side={row.side} /> },
    {
      key: "size",
      header: "Size",
      align: "right",
      width: "88px",
      render: (row) => formatQty(row.size, precisionFor(row.symbol, row.market).qty),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      width: "88px",
      render: (row) => formatPrice(row.entryPrice, precisionFor(row.symbol, row.market).price),
    },
    {
      key: "mark",
      header: "Mark",
      align: "right",
      width: "88px",
      render: (row) => formatPrice(row.markPrice, precisionFor(row.symbol, row.market).price),
    },
    {
      key: "liq",
      header: "Liq. Price",
      align: "right",
      width: "88px",
      render: (row) =>
        row.liquidationPrice === null ? (
          <span className="text-text-muted">—</span>
        ) : (
          formatPrice(row.liquidationPrice, precisionFor(row.symbol, row.market).price)
        ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      width: "96px",
      render: (row) => formatUsd(row.margin),
    },
    {
      key: "pnl",
      header: "PnL",
      align: "right",
      width: "96px",
      render: (row) => (
        <ValueTone value={row.pnl} className="flex flex-col items-end leading-4">
          <span>{formatUsd(row.pnl, { sign: true })}</span>
          <span className="type-data-sm leading-[14px]">{formatPct(row.pnlPct)}</span>
        </ValueTone>
      ),
    },
    {
      key: "close",
      header: "Close",
      align: "right",
      width: "62px",
      headerSrOnly: true,
      render: (row) => (
        <Button
          size="xs"
          variant="quiet"
          className="px-1.5"
          onClick={() =>
            setStub({
              title: `Close ${row.label}`,
              body: `This would close ${formatQty(row.size, precisionFor(row.symbol, row.market).qty)} ${row.symbol} ${row.side} at mark, realising ${formatUsd(row.pnl, { sign: true })}. Order routing is not wired up in this build, so nothing is sent.`,
              confirmLabel: "Close position",
            })
          }
        >
          Close
        </Button>
      ),
    },
  ];

  const orderColumns: Column<Order>[] = [
    {
      key: "time",
      header: "Time",
      width: "102px",
      render: (row) => (
        <time dateTime={row.placedAt} className="text-text-secondary">
          {formatTimestamp(row.placedAt)}
        </time>
      ),
    },
    {
      key: "market",
      header: "Market",
      width: "102px",
      render: (row) => (
        <span className="block truncate" title={row.label}>
          {row.label}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "78px",
      render: (row) => (
        <span className="capitalize text-text-secondary">{row.kind}</span>
      ),
    },
    { key: "side", header: "Side", width: "52px", render: (row) => <SideCell side={row.side} /> },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: "88px",
      render: (row) => formatPrice(row.price, precisionFor(row.symbol, row.market).price),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      width: "88px",
      render: (row) => formatQty(row.size, precisionFor(row.symbol, row.market).qty),
    },
    {
      key: "filled",
      header: "Filled",
      align: "right",
      width: "56px",
      render: (row) => (
        <span className={row.filled > 0 ? "text-text-primary" : "text-text-muted"}>
          {formatPct(row.filled * 100, { sign: false, decimals: 0 })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "64px",
      render: (row) => (
        <span className="capitalize text-text-secondary">{row.status}</span>
      ),
    },
    {
      key: "cancel",
      header: "Cancel",
      align: "right",
      width: "72px",
      headerSrOnly: true,
      render: (row) => (
        <Button
          size="xs"
          variant="quiet"
          className="px-1.5"
          onClick={() =>
            setStub({
              title: `Cancel ${row.kind} order`,
              body: `This would cancel the ${row.side} of ${formatQty(row.size, precisionFor(row.symbol, row.market).qty)} ${row.symbol} at ${formatPrice(row.price, precisionFor(row.symbol, row.market).price)}. Order routing is not wired up in this build, so the order stays where it is.`,
              confirmLabel: "Cancel order",
            })
          }
        >
          Cancel
        </Button>
      ),
    },
  ];

  const historyColumns: Column<Trade>[] = [
    {
      key: "time",
      header: "Time",
      width: "102px",
      render: (row) => (
        <time dateTime={row.filledAt} className="text-text-secondary">
          {formatTimestamp(row.filledAt)}
        </time>
      ),
    },
    {
      key: "market",
      header: "Market",
      width: "102px",
      render: (row) => (
        <span className="block truncate" title={row.label}>
          {row.label}
        </span>
      ),
    },
    { key: "side", header: "Side", width: "52px", render: (row) => <SideCell side={row.side} /> },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: "88px",
      render: (row) => formatPrice(row.price, precisionFor(row.symbol, row.market).price),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      width: "88px",
      render: (row) => formatQty(row.size, precisionFor(row.symbol, row.market).qty),
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      width: "66px",
      render: (row) => <span className="text-text-secondary">{formatUsd(row.fee)}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      width: "96px",
      render: (row) => formatUsd(row.total),
    },
    {
      key: "tx",
      header: "Tx",
      align: "right",
      width: "86px",
      render: (row) => (
        <span className="type-mono-addr text-text-muted" title={row.txHash}>
          {truncateMiddle(row.txHash, 4, 4)}
        </span>
      ),
    },
  ];

  const empty = LEDGER_EMPTY[ledgerTab][marketType];

  const body = (() => {
    if (ledgerTab === "positions") {
      return positions.length ? (
        <DataTable
          columns={positionColumns}
          rows={positions}
          getRowKey={(row) => row.id}
          minWidth={760}
          rowClassName={markSelected}
          caption={`Open ${marketType} positions`}
        />
      ) : null;
    }
    if (ledgerTab === "orders") {
      return orders.length ? (
        <DataTable
          columns={orderColumns}
          rows={orders}
          getRowKey={(row) => row.id}
          minWidth={702}
          rowClassName={markSelected}
          caption={`Resting ${marketType} orders`}
        />
      ) : null;
    }
    return history.length ? (
      <DataTable
        columns={historyColumns}
        rows={history}
        getRowKey={(row) => row.id}
        minWidth={680}
          rowClassName={markSelected}
        caption={`${marketType} trade history`}
      />
    ) : null;
  })();

  return (
    <Panel label="Ledger" className="min-h-0 flex-1">
      {/* Row 1 — primary tabs, underlined in --accent. */}
      <Tabs
        value={ledgerTab}
        onValueChange={(value) => setLedgerTab(value as LedgerTab)}
        className="shrink-0"
      >
        <TabsList className="border-b border-border-subtle px-2">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Row 2 — market filter, single select. */}
      <div
        role="radiogroup"
        aria-label="Market type"
        className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-1.5"
      >
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
                "type-data-sm h-6 rounded-pill px-2.5",
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
        <span className="type-label ml-auto shrink-0 text-text-muted">
          {selectedSymbol} rows first
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {body ?? <EmptyState icon={Inbox} title={empty.title} body={empty.body} />}
      </div>

      <Dialog open={stub !== null} onOpenChange={(open) => !open && setStub(null)}>
        <DialogContent aria-describedby="ledger-stub-help">
          <DialogHeader>
            <DialogTitle>{stub?.title ?? ""}</DialogTitle>
            <DialogDescription id="ledger-stub-help">
              Confirm before anything is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <p className="type-body text-text-secondary">{stub?.body}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStub(null)}>
              Keep it open
            </Button>
            <Button variant="accent" onClick={() => setStub(null)}>
              {stub?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
