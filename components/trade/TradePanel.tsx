"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRightLeft, ChevronDown, CircleCheck, Clock, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { TicketAccount } from "@/components/paper/Paper";
import { ClosePosition, ExitEditor, FillReport, PartialsNote, usePositionActions, type Write } from "@/components/trade/PositionControls";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CLOSE_FRACTIONS } from "@/lib/autotrade/manage";
import { LIMITS, marketFor, PAPER_COSTS, type PerpMarket, type Side } from "@/lib/autotrade/rules";
import type { OrderView, TradeView } from "@/lib/autotrade/types";
import { refreshAutomation, useAutomation } from "@/lib/autotrade/useAutomation";
import { formatCompactUsd, formatPriceUsd, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { bookStats, type Book } from "@/lib/market/book";
import type { PriceRow } from "@/lib/market/pyth/types";
import { useLevels } from "@/lib/market/useLevels";
import { refreshPaper, usePaper } from "@/lib/paper/usePaper";
import { fillOutcome, positionForOrder, ticketPreview, type OrderType } from "@/lib/trade/ticket";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Trading from the chart: the selected market's order ticket, its live
   liquidity, and the positions and orders already open on it.

   - A market long or short, its take-profit and stop-loss in the same
     request — POST /api/automation/trade, the one market-order path
     (openMarketTrade), which holds it to LIMITS and the account gate.
   - A limit order: the price typed, or taken from what the chart shows —
     bid, ask, mid, yesterday's pivots, the day's range — sent to POST
     /api/automation/orders, the one limit-order path. It waits for its
     fill; only a fill opens a position.
   - The preview (lib/trade/ticket.ts): where the entry is expected — the
     paper engine's own fill on paper, a walk of Hyperliquid's live book on
     live — its fee, margin and exits. After a fill, the fill is shown
     against the estimate the order was sent with, worse or better by side.
   - The position it opened: its exits moved by the existing editor and
     closed in part or whole through its own route (PositionControls).

   Three states share one surface: entering an order, an order that waits
   for its fill, and a position just opened. Opening another order is kept
   apart from closing this one. Graphite glass, like the paper setup dialog
   (README, CLAUDE.md): lime is the order action, amber closes a position
   whole. TradingView's embedded chart takes no clicks for prices, so the
   chart's prices are offered as buttons instead. The account is the one the
   header shows; a signal's Paper trade is always paper. A market that is not
   one of Elyra's perps offers the wallet swap instead, if it is swappable.
--------------------------------------------------------------------------- */

const STOCK_PREFIX = "xyz:";

/** The perp market for the chart's symbol: "BTC", or "NVDA" as trade[XYZ]'s "xyz:NVDA". */
export function perpFor(symbol: string): PerpMarket | null {
  return marketFor(symbol) ?? marketFor(`${STOCK_PREFIX}${symbol}`);
}

/** How often a resting limit order is looked for while the ticket waits on it. */
const WAIT_REFRESH_MS = 15_000;

function useBook(coin: string | null): { book: Book | null; error: string | null } {
  const [state, setState] = useState<{ book: Book | null; error: string | null }>({ book: null, error: null });
  useEffect(() => {
    if (coin === null) return;
    let cancelled = false;
    const read = () =>
      fetch(`/api/market/book?coin=${encodeURIComponent(coin)}`)
        .then(async (response) => (await response.json()) as { book: Book | null; error: string | null })
        .then((body) => {
          if (!cancelled) setState({ book: body.book, error: body.error });
        })
        .catch(() => {
          if (!cancelled) setState((current) => ({ ...current, error: "network" }));
        });
    void read();
    const timer = window.setInterval(() => void read(), 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [coin]);
  return state;
}

const FIELD = "graphite-field type-data h-10 w-full px-3 tabular-nums";
const UNIT = (value: number) => Number(value.toPrecision(6));

function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
  markStart = false,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
  label: string;
  /** Marks the chosen option as where focus starts when the ticket opens. */
  markStart?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="graphite-segment grid auto-cols-fr grid-flow-col gap-1 p-1">
      {options.map(([id, text]) => (
        <button
          key={id}
          data-ticket-start={markStart && value === id ? "" : undefined}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className="type-body h-9 px-2 font-medium"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="type-label text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-body-sm text-text-secondary">{label}</dt>
      <dd className={cn("type-data tabular-nums text-text-primary", tone)}>{value}</dd>
    </div>
  );
}

/** The book in one line — its spread — opened for the depth either side. */
function LiquidityRow({ book, error }: { book: Book | null; error: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const stats = book === null ? null : bookStats(book);
  return (
    <div className="graphite-inset">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 w-full items-center gap-3 rounded-[inherit] px-4 text-left"
      >
        <span className="type-body flex-1 font-medium text-text-primary">{t("Liquidity")}</span>
        <span className="type-data-sm tabular-nums text-text-secondary">
          {stats !== null
            ? t("Spread {bps} bps", { bps: stats.spreadBps.toFixed(1) })
            : error !== null
              ? t("Book unavailable")
              : t("Reading the order book…")}
        </span>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden className={cn("shrink-0 text-text-secondary transition-transform duration-[var(--dur-fast)] ease-brand", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panel} className="flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--stone)_14%,transparent)] px-4 pb-3.5 pt-3">
          {stats === null ? (
            <p className="type-label text-text-muted">{error !== null ? t("Hyperliquid's order book could not be read just now.") : t("Reading the order book…")}</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Row label={t("Best bid")} value={formatPriceUsd(stats.bestBid)} tone="text-positive" />
                <Row label={t("Best ask")} value={formatPriceUsd(stats.bestAsk)} tone="text-negative" />
              </dl>
              <dl className="grid grid-cols-3 gap-2">
                {stats.depth.map((band) => (
                  <div key={band.pct} className="min-w-0">
                    <dt className="type-label text-text-muted">{t("Within {pct}%", { pct: band.pct })}</dt>
                    <dd className="type-data-sm tabular-nums text-text-primary">
                      <span className="text-positive">{formatCompactUsd(band.bidUsd)}</span>
                      {" / "}
                      <span className="text-negative">{formatCompactUsd(band.askUsd)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="type-label text-text-muted">{t("Bids / asks on Hyperliquid's book, read every 3 seconds.")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotTradable({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const t = useT();
  const auth = useElyraAuth();
  const [swapping, setSwapping] = useState(false);
  /* The swap allowlist is served (/api/swap/tokens), never copied into the client: lib/trade.ts is server-only. */
  const [swappable, setSwappable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/swap/tokens?include=sunrise")
      .then((response) => response.json() as Promise<{ groups?: Array<{ symbols?: string[] }> }>)
      .then((payload) => {
        const wanted = symbol.toUpperCase();
        if (!cancelled) setSwappable((payload.groups ?? []).some((group) => (group.symbols ?? []).includes(wanted)));
      })
      .catch(() => {
        /* Without the list, the swap is simply not offered. */
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  if (swapping) {
    return <SwapDialog address={auth.solanaAddress} onClose={onClose} initialFrom="USDC" initialTo={symbol.toUpperCase()} />;
  }
  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      <p className="type-body-sm text-text-secondary">
        {t("{symbol} is not one of Elyra's Hyperliquid perp markets, so it cannot be traded from the chart.", { symbol })}
      </p>
      {swappable && (
        <Button variant="accent" onClick={() => setSwapping(true)} disabled={!auth.authenticated}>
          <ArrowRightLeft size={14} strokeWidth={1.5} aria-hidden />
          {t("Swap {symbol} in your wallet", { symbol })}
        </Button>
      )}
    </div>
  );
}

/** What the ticket is showing below the form: an order that waits, or what one opened. */
type Result =
  | { kind: "position"; tradeId: string; trade: TradeView; estimate: number | null }
  | { kind: "order"; orderId: string; order: OrderView };

/** The position a fill just opened: the confirmation, the position, and closing it. */
function OpenedPosition({
  trade,
  estimate,
  label,
  write,
  statusRef,
}: {
  trade: TradeView;
  estimate: number | null;
  label: string;
  write: Write;
  statusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const actions = usePositionActions(trade, write, setNote);
  const [editing, setEditing] = useState(false);
  const fill = fillOutcome(trade, estimate);
  const paper = trade.mode === "paper";
  const title =
    trade.side === "long" ? (paper ? t("Paper long opened") : t("Live long opened")) : paper ? t("Paper short opened") : t("Live short opened");
  /* Closing it whole takes the close buttons away: focus goes to what replaced them. */
  const closed = trade.status === "closed";
  useEffect(() => {
    if (closed) statusRef.current?.focus();
  }, [closed, statusRef]);

  if (trade.status === "closed") {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="graphite-inset flex flex-col gap-1.5 p-4 focus:outline-none">
        <p className="type-h2 text-text-primary">{t("Position closed")}</p>
        <p className="type-body-sm text-text-secondary">
          {t("Closed at {price}, {pnl} after fees.", {
            price: trade.exitPrice === null ? "—" : formatPriceUsd(trade.exitPrice),
            pnl: trade.realisedPnlUsd === null ? "—" : formatUsd(trade.realisedPnlUsd, { sign: true }),
          })}
        </p>
        {note !== null && <p className="type-label text-caution">{t(note)}</p>}
      </div>
    );
  }

  return (
    <>
      <div ref={statusRef} tabIndex={-1} role="status" className="graphite-inset flex flex-col gap-1.5 p-4 focus:outline-none">
        <p className="type-h2 flex items-center gap-2 text-text-primary">
          <CircleCheck size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-positive" />
          {title}
        </p>
        <p className="type-body-sm flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-text-secondary">
          <span>
            {fill.estimate === null
              ? t("Filled at {price}", { price: formatPriceUsd(fill.filled) })
              : t("Filled at {price} vs. estimated {estimate}", { price: formatPriceUsd(fill.filled), estimate: formatPriceUsd(fill.estimate) })}
          </span>
          {fill.bps !== null && (
            <span className={cn("type-data-sm tabular-nums", fill.verdict === "worse" ? "text-caution" : fill.verdict === "better" ? "text-positive" : "text-text-secondary")}>
              {fill.verdict === "even"
                ? t("no slippage")
                : fill.verdict === "worse"
                  ? t("{bps} bps worse", { bps: Math.abs(fill.bps).toFixed(1) })
                  : t("{bps} bps better", { bps: Math.abs(fill.bps).toFixed(1) })}
            </span>
          )}
        </p>
      </div>

      <section aria-label={t("Position")} className="graphite-inset flex flex-col gap-3.5 p-4">
        <p className="type-h1 text-text-primary">
          {trade.side === "long" ? t("Long") : t("Short")} · {t("{quantity} {coin}", { quantity: UNIT(trade.size), coin: label })}
        </p>
        <dl className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="type-body-sm text-text-secondary">{t("Take-profit (TP)")}</dt>
            <dd className="font-sans text-[20px] font-semibold leading-7 tabular-nums text-text-primary">{formatPriceUsd(trade.takeProfit)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="type-body-sm text-text-secondary">{t("Stop-loss (SL)")}</dt>
            <dd className="font-sans text-[20px] font-semibold leading-7 tabular-nums text-text-primary">{formatPriceUsd(trade.stopLoss)}</dd>
          </div>
        </dl>
        <PartialsNote trade={trade} />
        {editing ? (
          <ExitEditor glass trade={trade} actions={actions} onDone={() => setEditing(false)} />
        ) : (
          !trade.fund && (
            <button type="button" onClick={() => setEditing(true)} className="graphite-outline type-body inline-flex h-10 items-center justify-center gap-2 font-medium">
              <Pencil size={15} strokeWidth={1.5} aria-hidden />
              {t("Edit TP/SL")}
            </button>
          )
        )}
      </section>

      <ClosePosition trade={trade} actions={actions} />
      {note !== null && <p className="type-label text-caution">{t(note)}</p>}
      {actions.error !== null && (
        <p role="alert" className="type-body-sm text-negative">
          {t(actions.error)}
        </p>
      )}
    </>
  );
}

/** A limit order waiting for its fill, or how it ended without one. */
function WaitingOrder({
  order,
  label,
  write,
  statusRef,
}: {
  order: OrderView;
  label: string;
  write: Write;
  statusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paper = order.mode === "paper";
  const waiting = order.status === "open" || order.status === "filled";
  const title = !waiting
    ? order.status === "cancelled"
      ? t("Limit order cancelled")
      : t("Limit order failed")
    : order.side === "long"
      ? paper
        ? t("Paper limit long placed")
        : t("Live limit long placed")
      : paper
        ? t("Paper limit short placed")
        : t("Live limit short placed");

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const sent = await write(`/api/automation/orders/${order.id}`, "DELETE");
    setBusy(false);
    if (sent.error !== null) setError(sent.error);
    if (paper) refreshPaper();
  };

  return (
    <div ref={statusRef} tabIndex={-1} role="status" className="graphite-inset flex flex-col gap-3 p-4 focus:outline-none">
      <div className="flex flex-col gap-1">
        <p className="type-h2 flex items-center gap-2 text-text-primary">
          <Clock size={18} strokeWidth={1.75} aria-hidden className={cn("shrink-0", waiting ? "text-caution" : "text-text-muted")} />
          {title}
        </p>
        <p className="type-body-sm text-text-secondary">
          {order.status === "filled"
            ? t("Filled. Reading the position…")
            : waiting
              ? paper
                ? t("Waiting for {coin} to trade at {price}. Paper limit orders are checked every five minutes; nothing opens until one fills.", { coin: label, price: formatPriceUsd(order.price) })
                : t("Resting on Hyperliquid's book at {price}; nothing opens until it fills.", { price: formatPriceUsd(order.price) })
              : order.error !== null
                ? t(order.error)
                : t("Nothing was opened.")}
        </p>
      </div>
      <dl className="flex flex-col gap-1.5">
        <Row label={t("Limit price")} value={formatPriceUsd(order.price)} />
        <Row label={t("Order size")} value={formatUsd(order.sizeUsd)} />
        <Row label={t("Take-profit")} value={formatPriceUsd(order.takeProfit)} />
        <Row label={t("Stop-loss")} value={formatPriceUsd(order.stopLoss)} />
      </dl>
      {order.status === "open" && (
        <button type="button" aria-disabled={busy || undefined} onClick={() => void cancel()} className="graphite-outline type-body h-10 font-medium">
          {busy ? t("Cancelling…") : t("Cancel order")}
        </button>
      )}
      {error !== null && (
        <p role="alert" className="type-body-sm text-negative">
          {t(error)}
        </p>
      )}
    </div>
  );
}

/** Another open position on this market, managed in place. */
function PositionRow({ trade, label, write }: { trade: TradeView; label: string; write: Write }) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const actions = usePositionActions(trade, write, setNote);
  const [editing, setEditing] = useState(false);
  return (
    <div className="graphite-inset flex flex-col gap-2 p-3">
      <p className="type-body-sm text-text-primary">
        {trade.side === "long" ? t("Long") : t("Short")} · {t("{quantity} {coin}", { quantity: UNIT(trade.size), coin: label })} · {t(trade.mode)}
        <span className="type-label text-text-muted">
          {" · "}
          {t("TP {tp} · SL {sl}", { tp: formatPriceUsd(trade.takeProfit), sl: formatPriceUsd(trade.stopLoss) })}
        </span>
      </p>
      <FillReport trade={trade} />
      <PartialsNote trade={trade} />
      {editing ? (
        <ExitEditor glass trade={trade} actions={actions} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {!trade.fund && (
            <button type="button" onClick={() => setEditing(true)} className="graphite-outline type-label h-8 px-2.5">
              {t("Edit TP/SL")}
            </button>
          )}
          <span className="type-label ml-1 text-text-muted">{t("Close")}</span>
          {CLOSE_FRACTIONS.filter((fraction) => fraction === 1 || !trade.fund).map((fraction) => (
            <button
              key={fraction}
              type="button"
              aria-disabled={actions.busy !== null || undefined}
              onClick={() => void actions.close(fraction)}
              aria-label={fraction === 1 ? t("Close all of the position") : t("Close {pct}% of the position", { pct: fraction * 100 })}
              className={cn("type-label h-8 px-2.5 tabular-nums", fraction === 1 ? "graphite-amber" : "graphite-outline")}
            >
              {actions.busy === `close:${fraction}` ? "…" : fraction === 1 ? t("All") : `${fraction * 100}%`}
            </button>
          ))}
        </div>
      )}
      {note !== null && <p className="type-label text-caution">{t(note)}</p>}
      {actions.error !== null && (
        <p role="alert" className="type-label text-negative">
          {t(actions.error)}
        </p>
      )}
    </div>
  );
}

function Ticket({
  market,
  row,
  initialSide = "long",
  paperOnly = false,
  onSending,
}: {
  market: PerpMarket;
  row: PriceRow | undefined;
  initialSide?: Side;
  paperOnly?: boolean;
  /** Tells the dialog an order is on its way, so it does not close under it. */
  onSending: (sending: boolean) => void;
}) {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useAutomation();
  const data = feed.data;
  const { book, error: bookError } = useBook(market.coin);
  const { data: levels } = useLevels(market.coin.replace(STOCK_PREFIX, ""));

  const [side, setSide] = useState<Side>(initialSide);
  const [type, setType] = useState<OrderType>("market");
  /* The account the header shows — Live or Paper — is the account the order goes to; a Paper trade always goes to paper. */
  const paperFeed = usePaper();
  const mode = paperOnly ? "paper" : paperFeed.mode;
  const [sizeUsd, setSizeUsd] = useState("100");
  const [leverage, setLeverage] = useState(2);
  const [tpPct, setTpPct] = useState("4");
  const [slPct, setSlPct] = useState("2");
  const [limitPrice, setLimitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const backToEntry = useRef(false);
  /* A ref as well as state: a second press in the same frame is refused before React re-renders. */
  const inFlight = useRef(false);

  const size = Number(sizeUsd);
  const stats = book === null ? null : bookStats(book);
  const preview = ticketPreview({
    mode,
    type,
    side,
    sizeUsd: size,
    leverage,
    takeProfitPct: Number(tpPct),
    stopLossPct: Number(slPct),
    limitPrice: type === "limit" ? Number(limitPrice) : null,
    book,
    quote: row?.price ?? null,
  });
  const liveReady = data?.live.enabled === true && data.agent?.approved === true;

  const trades = data?.trades ?? [];
  const orders = data?.orders ?? [];

  /* What the result is now, read from the feed so edits, closes and fills show as they land. */
  let opened: { trade: TradeView; estimate: number | null } | null = null;
  let waiting: OrderView | null = null;
  if (result?.kind === "position") {
    opened = { trade: trades.find((trade) => trade.id === result.tradeId) ?? result.trade, estimate: result.estimate };
  } else if (result?.kind === "order") {
    const order = orders.find((entry) => entry.id === result.orderId) ?? result.order;
    const position = positionForOrder(order, trades);
    if (position !== null) opened = { trade: position, estimate: order.price };
    else waiting = order;
  }
  const focusId = opened?.trade.id ?? null;
  const mine = trades.filter((trade) => trade.coin === market.coin && trade.status === "open" && trade.id !== focusId);
  const resting = orders.filter((order) => order.coin === market.coin && order.status === "open" && order.id !== waiting?.id);

  /* A limit order that rests is looked for more often than the feed's minute, until it fills or ends. */
  const watching = waiting !== null && waiting.status !== "cancelled" && waiting.status !== "failed";
  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(refreshAutomation, WAIT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [watching]);
  /* The fill moved paper funds: read the balance as soon as the position appears. */
  const filledFromOrder = result?.kind === "order" && opened !== null;
  useEffect(() => {
    if (filledFromOrder && mode === "paper") refreshPaper();
  }, [filledFromOrder, mode]);

  /* Focus follows the state: to the confirmation when one appears, back to the action when entering again. */
  const resultKey = result === null ? null : result.kind === "position" ? `p:${result.tradeId}` : `o:${result.orderId}`;
  useEffect(() => {
    if (resultKey !== null) statusRef.current?.focus();
    else if (backToEntry.current) {
      backToEntry.current = false;
      submitRef.current?.focus();
    }
  }, [resultKey]);

  /* Any change to the form starts a new order: the result moves to the list below. */
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      if (result !== null && !inFlight.current) setResult(null);
    };

  const newOrder = () => {
    backToEntry.current = true;
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    if (inFlight.current || !(size > 0)) return;
    if (type === "limit" && (preview.entry === null || preview.takeProfit === null || preview.stopLoss === null)) {
      setError(t("Enter the price to open at."));
      return;
    }
    inFlight.current = true;
    onSending(true);
    setBusy(true);
    setError(null);
    /* The estimate this order is sent with, to show its fill against. */
    const estimate = preview.entry;
    const common = { coin: market.coin, side, sizeUsd: size, leverage, mode };
    if (type === "market") {
      const sent = await feed.write("/api/automation/trade", "POST", { ...common, takeProfitPct: Number(tpPct), stopLossPct: Number(slPct) });
      if (sent.error !== null) setError(sent.error);
      else {
        const trade = sent.body.position as TradeView;
        setResult({ kind: "position", tradeId: trade.id, trade, estimate });
      }
    } else {
      const sent = await feed.write("/api/automation/orders", "POST", {
        ...common,
        price: preview.entry,
        takeProfit: UNIT(preview.takeProfit as number),
        stopLoss: UNIT(preview.stopLoss as number),
      });
      if (sent.error !== null) setError(sent.error);
      else {
        const order = sent.body.order as OrderView;
        setResult({ kind: "order", orderId: order.id, order });
      }
    }
    if (mode === "paper") refreshPaper();
    inFlight.current = false;
    onSending(false);
    setBusy(false);
  };

  if (!auth.authenticated) {
    return (
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="type-body-sm text-text-secondary">{t("Sign in to trade {symbol} from the chart. New trades start on paper.", { symbol: market.label })}</p>
        <Button variant="accent" onClick={auth.login} disabled={!auth.available}>
          {t("Sign in")}
        </Button>
      </div>
    );
  }

  const paper = mode === "paper";
  const action =
    type === "market"
      ? side === "long"
        ? paper
          ? t("Open paper long")
          : t("Open live long")
        : paper
          ? t("Open paper short")
          : t("Open live short")
      : side === "long"
        ? paper
          ? t("Place paper limit long")
          : t("Place live limit long")
        : paper
          ? t("Place paper limit short")
          : t("Place live limit short");

  const picks: Array<[string, number | null | undefined]> = [
    [t("Bid"), stats?.bestBid],
    [t("Mid"), stats?.mid],
    [t("Ask"), stats?.bestAsk],
    ["S1", levels?.levels?.s1],
    ["P", levels?.levels?.pivot],
    ["R1", levels?.levels?.r1],
    [t("24h low"), row?.low24h],
    [t("24h high"), row?.high24h],
  ];

  const basisNote =
    type === "limit"
      ? preview.crosses === true
        ? t("At this price the order crosses the book and fills at once, like a market order.")
        : preview.restsPct !== null
          ? t("Rests {pct}% from the mid until the price trades there.", { pct: preview.restsPct.toFixed(2) })
          : null
      : preview.basis === "paper"
        ? t("Paper fills at Hyperliquid's mid, moved {bps} bps against you.", { bps: (PAPER_COSTS.slippagePct * 100).toFixed(0) })
        : preview.basis === "quote"
          ? t("From the chart's quote until Hyperliquid's book is read.")
          : preview.beyondCap
            ? t("The visible book cannot fill this within the {cap}% cap; part of it may not fill.", { cap: LIMITS.entrySlippagePct })
            : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-5" data-ticket-scroll>
      <TicketAccount
        paperOnly={paperOnly}
        liveReady={liveReady}
        liveNote={
          data?.live.enabled !== true
            ? t("This server sends no live orders, so an order on Live is refused. Switch to Paper to practise.")
            : t("Approve Elyra's trading key on Automation before trading live on Hyperliquid {network}.", { network: data.live.network })
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Segment<Side>
          label={t("Direction")}
          value={side}
          onChange={edit(setSide)}
          options={[
            ["long", t("Long")],
            ["short", t("Short")],
          ]}
          markStart
        />
        <Segment<OrderType>
          label={t("Order type")}
          value={type}
          onChange={edit(setType)}
          options={[
            ["market", t("Market")],
            ["limit", t("Limit")],
          ]}
        />
      </div>

      {type === "limit" && (
        <div className="flex flex-col gap-2">
          <Field label={t("Limit price ($)")}>
            <input inputMode="decimal" value={limitPrice} onChange={(event) => edit(setLimitPrice)(event.target.value)} className={FIELD} placeholder={stats ? formatPriceUsd(stats.mid) : ""} />
          </Field>
          <div role="group" aria-label={t("Prices from the chart")} className="flex flex-wrap gap-1.5">
            {picks.map(([label, value]) =>
              value === null || value === undefined ? null : (
                <button key={label} type="button" onClick={() => edit(setLimitPrice)(String(UNIT(value)))} className="graphite-outline type-label h-7 px-2">
                  {label} <span className="tabular-nums text-text-muted">{formatPriceUsd(value)}</span>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Order size ($)")}>
          <input inputMode="decimal" value={sizeUsd} onChange={(event) => edit(setSizeUsd)(event.target.value)} className={FIELD} />
        </Field>
        <Field label={t("Leverage")}>
          <span className="relative block">
            <select value={leverage} onChange={(event) => edit(setLeverage)(Number(event.target.value))} className={cn(FIELD, "appearance-none pr-9")}>
              {Array.from({ length: LIMITS.maxLeverage }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
            <ChevronDown size={16} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          </span>
        </Field>
        <Field label={t("Take-profit (%)")}>
          <input inputMode="decimal" value={tpPct} onChange={(event) => edit(setTpPct)(event.target.value)} className={FIELD} />
        </Field>
        <Field label={t("Stop-loss (%)")}>
          <input inputMode="decimal" value={slPct} onChange={(event) => edit(setSlPct)(event.target.value)} className={FIELD} />
        </Field>
      </div>

      {result === null ? (
        <>
          <section aria-label={t("Order preview")} className="graphite-inset flex flex-col gap-2.5 p-4">
            <dl className="flex flex-col gap-2.5">
              <Row label={type === "market" ? t("Estimated fill") : t("Limit price")} value={preview.entry === null ? "—" : formatPriceUsd(preview.entry)} />
              <Row label={t("Taker fee ({pct}%)", { pct: PAPER_COSTS.takerFeePct })} value={preview.feeUsd === null ? "—" : formatUsd(preview.feeUsd)} />
              <Row
                label={t("Quantity")}
                value={preview.quantity === null ? "—" : t("{quantity} {coin}", { quantity: UNIT(preview.quantity), coin: market.label })}
              />
              <Row label={t("Margin at {leverage}×", { leverage })} value={preview.marginUsd === null ? "—" : formatUsd(preview.marginUsd)} />
              <Row label={t("Est. take-profit")} value={preview.takeProfit === null ? "—" : formatPriceUsd(preview.takeProfit)} />
              <Row label={t("Est. stop-loss")} value={preview.stopLoss === null ? "—" : formatPriceUsd(preview.stopLoss)} />
            </dl>
            <p className={cn("type-label", preview.beyondCap ? "text-caution" : "text-text-muted")}>
              {t("Order size is the position's full value; the margin is what it holds from your account.")}
              {basisNote !== null && <> {basisNote}</>}
            </p>
          </section>

          <LiquidityRow book={book} error={bookError} />

          {error !== null && (
            <p role="alert" className="type-body-sm rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
              {t(error)}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <p id="ticket-risk" className="type-body-sm text-text-secondary">
              {t("Isolated margin, held to Elyra's limits and your account's. Leverage magnifies losses; a stop can fill past its price in a fast market.")}
            </p>
            <button
              ref={submitRef}
              type="button"
              aria-describedby="ticket-risk"
              aria-disabled={busy || undefined}
              disabled={!(size > 0)}
              onClick={() => void submit()}
              className="graphite-glass-cta graphite-cta-rect type-body inline-flex h-12 items-center justify-center gap-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <LoaderCircle size={16} strokeWidth={2} aria-hidden className="motion-safe:animate-spin" />}
              {busy ? t("Sending…") : action}
            </button>
          </div>
        </>
      ) : (
        <>
          {opened !== null ? (
            opened.trade.status === "open" || opened.trade.status === "closed" ? (
              <OpenedPosition trade={opened.trade} estimate={opened.estimate} label={market.label} write={feed.write} statusRef={statusRef} />
            ) : (
              <div ref={statusRef} tabIndex={-1} role="status" className="graphite-inset p-4 focus:outline-none">
                <p className="type-body-sm text-text-secondary">
                  {opened.trade.status === "failed"
                    ? t(opened.trade.error ?? "Nothing was opened.")
                    : t("Sent to Hyperliquid. Waiting for the fill to be confirmed.")}
                </p>
              </div>
            )
          ) : (
            waiting !== null && <WaitingOrder order={waiting} label={market.label} write={feed.write} statusRef={statusRef} />
          )}
          {/* Opening another order is its own step, apart from closing this one. */}
          <div className="border-t border-[color-mix(in_srgb,var(--stone)_14%,transparent)] pt-4">
            <button type="button" onClick={newOrder} className="graphite-glass-quiet type-body inline-flex h-10 w-full items-center justify-center gap-2 font-medium">
              <Plus size={16} strokeWidth={1.5} aria-hidden />
              {t("New order")}
            </button>
          </div>
        </>
      )}

      {(mine.length > 0 || resting.length > 0) && (
        <section aria-label={t("Open on {coin}", { coin: market.label })} className="flex flex-col gap-2.5 border-t border-[color-mix(in_srgb,var(--stone)_14%,transparent)] pt-4">
          <h3 className="type-h2 text-text-primary">{t("Open on {coin}", { coin: market.label })}</h3>
          {mine.map((trade) => (
            <PositionRow key={trade.id} trade={trade} label={market.label} write={feed.write} />
          ))}
          {resting.map((order) => (
            <div key={order.id} className="graphite-inset flex items-center justify-between gap-2 p-3">
              <p className="type-body-sm min-w-0 text-text-primary">
                {t("Limit {side} at {price}", { side: order.side === "long" ? t("Long") : t("Short"), price: formatPriceUsd(order.price) })}
                <span className="type-label text-text-muted"> · {formatUsd(order.sizeUsd, { decimals: 0 })} · {t(order.mode)}</span>
              </p>
              <button type="button" onClick={() => void feed.write(`/api/automation/orders/${order.id}`, "DELETE")} className="graphite-outline type-label h-8 shrink-0 px-2.5">
                {t("Cancel order")}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function TradePanel({
  symbol,
  row,
  onClose,
  initialSide,
  paper = false,
}: {
  symbol: string;
  row: PriceRow | undefined;
  onClose: () => void;
  /** The side to start on — a signal's. */
  initialSide?: Side;
  /** A Paper trade: sent to the paper account whatever the header shows. */
  paper?: boolean;
}) {
  const t = useT();
  const market = perpFor(symbol);
  /* While an order is on its way the ticket stays open: its result would otherwise land nowhere. */
  const inFlight = useRef(false);
  const onSending = useCallback((sending: boolean) => {
    inFlight.current = sending;
  }, []);
  /* The control that opened the ticket — the chart's Trade button, a signal's
     Paper trade — taken before the dialog moves focus, to give it back:
     Radix returns focus only to a DialogTrigger, and this has none. */
  const [opener] = useState<HTMLElement | null>(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  return (
    <Dialog open onOpenChange={(next) => !next && !inFlight.current && onClose()}>
      <DialogContent
        side="center"
        showClose={false}
        overlayClassName="graphite-glass-overlay"
        className="graphite-glass graphite-sheet flex max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] flex-col gap-0 p-0 compact:max-h-[min(900px,calc(100dvh-48px))]"
        onOpenAutoFocus={(event) => {
          /* The direction, not a field: a phone would open its keyboard over the ticket. */
          const start = document.querySelector<HTMLElement>("[data-ticket-start]");
          if (start) {
            event.preventDefault();
            start.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (opener !== null && opener.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
      >
        <header className="flex shrink-0 items-center gap-3 px-5 pb-4 pt-5">
          <DialogTitle className="type-h1 min-w-0 flex-1 truncate text-text-primary">{t("Trade {symbol}", { symbol: market?.label ?? symbol })}</DialogTitle>
          {/* The figures stack, not Fustat: Fustat's tabular period is a full digit wide (README). */}
          {row !== undefined && <span className="shrink-0 font-sans text-[18px] font-semibold leading-6 tabular-nums text-text-primary">{formatPriceUsd(row.price)}</span>}
          <DialogClose aria-label={t("Close")} className="graphite-glass-quiet -mr-1.5 inline-flex size-9 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary">
            <X size={20} strokeWidth={1.5} aria-hidden />
          </DialogClose>
          <DialogDescription className="sr-only">
            {t("Open a long or a short on Hyperliquid from the chart, with its take-profit and stop-loss, and manage what is open.")}
          </DialogDescription>
        </header>
        {market === null ? <NotTradable symbol={symbol} onClose={onClose} /> : <Ticket market={market} row={row} initialSide={initialSide} paperOnly={paper} onSending={onSending} />}
      </DialogContent>
    </Dialog>
  );
}
