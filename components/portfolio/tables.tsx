"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bot } from "lucide-react";
import { Delta, Money, Quantity } from "@/components/portfolio/primitives";
import { CoinMark } from "@/components/ui/CoinMark";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatPrice } from "@/lib/format";
import { byNumber, type SortDirection } from "@/lib/portfolio/derive";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { PerpPosition, SpotHolding } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The two tables that have real data behind them.

   Column priority is done with container queries on the column itself
   (`hidden @[30rem]:table-cell`) rather than by measuring the panel in JS.
   The panel is a resizable shell column, so it changes width without the
   viewport changing at all — a media query would be reading the wrong box,
   and a ResizeObserver would be re-rendering a table on every frame of a
   drag to learn what CSS already knows.

   Nothing in either table executes anything. `Ask Elyra` prefills the
   existing composer with a question and focuses it — the operator still
   presses send, and any action that followed would go through the agent's
   own confirmation path. §32: no trade executes from a row menu, and nothing
   here is one click from an order.
--------------------------------------------------------------------------- */

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      className={cn(
        "inline-flex items-center gap-0.5",
        "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-chip",
        active && "text-text-primary",
      )}
    >
      {label}
      {active &&
        (direction === "desc" ? (
          <ArrowDown size={10} strokeWidth={2} aria-hidden />
        ) : (
          <ArrowUp size={10} strokeWidth={2} aria-hidden />
        ))}
    </button>
  );
}

/** Prefills the existing agent composer. Never sends, never executes. */
function useAskElyra(): (prompt: string) => void {
  const askElyra = useElyraStore((state) => state.askElyra);
  const setAssistOpen = useElyraStore((state) => state.setAssistOpen);
  return (prompt: string) => {
    setAssistOpen(true);
    askElyra(prompt);
  };
}

function AskButton({ prompt, label }: { prompt: string; label: string }) {
  const ask = useAskElyra();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => ask(prompt)}
      className={cn(
        "grid size-6 place-items-center rounded-chip text-text-muted opacity-0",
        "transition-[opacity,color] duration-[var(--dur-fast)] ease-brand",
        "group-hover:opacity-100 hover:text-agent-accent",
        "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      )}
    >
      <Bot size={12} strokeWidth={1.5} aria-hidden />
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Spot
--------------------------------------------------------------------------- */

type SpotSort = "value" | "change" | "allocation";

export function SpotTable({ holdings }: { holdings: SpotHolding[] }) {
  const [sort, setSort] = useState<SpotSort>("value");
  const [direction, setDirection] = useState<SortDirection>("desc");

  function toggle(next: SpotSort) {
    if (next === sort) setDirection((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(next);
      setDirection("desc");
    }
  }

  const rows = useMemo(() => {
    const pick =
      sort === "value"
        ? (row: SpotHolding) => row.valueUsd
        : sort === "change"
          ? (row: SpotHolding) => row.change24hPct
          : (row: SpotHolding) => row.allocationPct;
    return byNumber(holdings, pick, direction);
  }, [holdings, sort, direction]);

  /* Cost basis is null on every row today, so the columns that depend on it
     are not rendered at all. An "Avg cost" column of dashes teaches the
     reader to ignore the column; its absence, plus the note under the table,
     says the same thing once and honestly. */
  const columns: Column<SpotHolding>[] = [
    {
      key: "asset",
      header: "Asset",
      width: "34%",
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
      key: "balance",
      header: "Balance",
      align: "right",
      width: "20%",
      className: "hidden @[26rem]:table-cell",
      render: (row) => <Quantity value={row.quantity} className="text-text-secondary" />,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: "18%",
      className: "hidden @[34rem]:table-cell",
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
      width: "16%",
      className: "hidden @[30rem]:table-cell",
      render: (row) => (
        <Delta pct={row.change24hPct} reason="No 24h price series for this asset." />
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      width: "22%",
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
      width: "14%",
      className: "hidden @[38rem]:table-cell",
      render: (row) =>
        row.allocationPct === null ? (
          <span className="text-text-muted">—</span>
        ) : (
          <span className="tabular-nums text-text-secondary">
            {row.allocationPct.toFixed(1)}%
          </span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      headerSrOnly: true,
      align: "right",
      width: "8%",
      render: (row) => (
        <span className="flex justify-end">
          <AskButton
            label={`Ask Elyra about ${row.symbol}`}
            prompt={`Analyse my ${row.symbol} position — I hold ${row.quantity} ${row.symbol} in my portfolio. What should I know about it right now?`}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1.5">
        <span className="type-label text-text-muted">Sort</span>
        <SortableHeader
          label="Value"
          active={sort === "value"}
          direction={direction}
          onClick={() => toggle("value")}
        />
        <SortableHeader
          label="24H"
          active={sort === "change"}
          direction={direction}
          onClick={() => toggle("change")}
        />
        <SortableHeader
          label="Alloc"
          active={sort === "allocation"}
          direction={direction}
          onClick={() => toggle("allocation")}
        />
      </div>

      <DataTable
        caption="Spot holdings across the wallet and connected venues"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />

      <p className="type-label px-2 py-2 text-text-muted">
        Cost basis and realised PnL are not shown: no trade history is recorded
        for these holdings, so an average cost would be a guess.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Perps
--------------------------------------------------------------------------- */

export function PerpsTable({ positions }: { positions: PerpPosition[] }) {
  const rows = useMemo(
    () => byNumber(positions, (row) => row.notionalUsd, "desc"),
    [positions],
  );

  const columns: Column<PerpPosition>[] = [
    {
      key: "market",
      header: "Market",
      width: "28%",
      render: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-text-primary">{row.market}</span>
          <span className="type-label truncate text-text-muted">{row.venue}</span>
        </span>
      ),
    },
    {
      key: "side",
      header: "Side",
      width: "18%",
      render: (row) => (
        /* Text, not just colour. §16 and §40 both require the direction to
           survive without hue — a red/green pill alone fails for a
           colour-blind reader and in a screenshot. */
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
      width: "18%",
      className: "hidden @[26rem]:table-cell",
      render: (row) => <Quantity value={row.size} className="text-text-secondary" />,
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      width: "18%",
      className: "hidden @[34rem]:table-cell",
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
      header: "Mark",
      align: "right",
      width: "18%",
      className: "hidden @[30rem]:table-cell",
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
      key: "liq",
      header: "Liq.",
      align: "right",
      width: "18%",
      className: "hidden @[42rem]:table-cell",
      render: (row) =>
        row.liquidationPrice === null ? (
          /* Never estimated from leverage. This is the one number a user
             cannot afford to see a plausible wrong version of. */
          <span
            className="text-text-muted"
            title="This venue did not report a liquidation price. It is never estimated."
          >
            —
          </span>
        ) : (
          <span className="tabular-nums text-text-primary">
            ${formatPrice(row.liquidationPrice)}
          </span>
        ),
    },
    {
      key: "pnl",
      header: "uPnL",
      align: "right",
      width: "22%",
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
      key: "actions",
      header: "Actions",
      headerSrOnly: true,
      align: "right",
      width: "8%",
      render: (row) => (
        <span className="flex justify-end">
          <AskButton
            label={`Ask Elyra about ${row.market}`}
            prompt={`Review my ${row.side} position on ${row.market} at ${row.venue}. What is the risk here?`}
          />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      caption="Open perpetual positions across connected venues"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
    />
  );
}
