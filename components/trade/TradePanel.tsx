"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { FillReport, PositionControls } from "@/components/trade/PositionControls";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { OrderAccount } from "@/components/paper/Paper";
import { exitPrices, LIMITS, marketFor, PAPER_COSTS, type PerpMarket, type Side } from "@/lib/autotrade/rules";
import type { TradeView } from "@/lib/autotrade/types";
import { useAutomation } from "@/lib/autotrade/useAutomation";
import { formatCompactUsd, formatPriceUsd, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { bookStats, estimateFill, type Book } from "@/lib/market/book";
import type { PriceRow } from "@/lib/market/pyth/types";
import { useLevels } from "@/lib/market/useLevels";
import { refreshPaper, usePaper } from "@/lib/paper/usePaper";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Trading from the chart: the selected market's order ticket, its live
   liquidity, and the positions and orders already open on it.

   - Quick trade: a market long or short, its take-profit and stop-loss in
     the same request — POST /api/automation/trade, the one market-order
     path (openMarketTrade), which holds it to LIMITS and the account gate.
   - Limit orders from the chart: the price typed, or taken from what the
     chart shows — bid, ask, mid, yesterday's pivots, the day's range — and
     sent to POST /api/automation/orders, the one limit-order path.
   - See how it fills: before sending, the order is walked through
     Hyperliquid's live book (lib/market/book.ts) for its average fill and
     slippage; after, the position reports its fill against the mid it was
     sent at.

   TradingView's embedded chart takes no clicks for prices, so the chart's
   prices are offered as buttons instead. Paper by default; live only on a
   live deployment with the person's approved key. A market that is not one
   of Elyra's perps offers the wallet swap instead, if it is swappable.
--------------------------------------------------------------------------- */

const STOCK_PREFIX = "xyz:";

/** The perp market for the chart's symbol: "BTC", or "NVDA" as trade[XYZ]'s "xyz:NVDA". */
export function perpFor(symbol: string): PerpMarket | null {
  return marketFor(symbol) ?? marketFor(`${STOCK_PREFIX}${symbol}`);
}

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

const FIELD = "type-data h-9 w-full rounded-control border border-border-strong bg-surface-base px-2.5 text-text-primary";

function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string, string?]>; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-border-subtle bg-surface-base p-0.5">
      {options.map(([id, text, tone]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "type-label h-8 rounded-chip px-2 transition-colors duration-[var(--dur-fast)] ease-brand",
            value === id ? cn("bg-surface-active text-text-primary", tone) : "text-text-secondary hover:text-text-primary",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Liquidity({ book, error }: { book: Book | null; error: string | null }) {
  const t = useT();
  const stats = book === null ? null : bookStats(book);
  if (stats === null) {
    return <p className="type-label text-text-muted">{error !== null ? t("Hyperliquid's order book could not be read just now.") : t("Reading the order book…")}</p>;
  }
  return (
    <div className="rounded-card border border-border-subtle bg-surface-base p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>{t("Liquidity")}</Eyebrow>
        <span className="type-label text-text-muted">{t("Spread {bps} bps", { bps: stats.spreadBps.toFixed(1) })}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
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
      <p className="type-label mt-1.5 text-text-muted">{t("Bids / asks on Hyperliquid's book, read every 3 seconds.")}</p>
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
    <div className="flex flex-col gap-3 p-4">
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

function Ticket({
  market,
  row,
  onClose,
  initialSide = "long",
  paperOnly = false,
}: {
  market: PerpMarket;
  row: PriceRow | undefined;
  onClose: () => void;
  initialSide?: Side;
  paperOnly?: boolean;
}) {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useAutomation();
  const data = feed.data;
  const { book, error: bookError } = useBook(market.coin);
  const { data: levels } = useLevels(market.coin.replace(STOCK_PREFIX, ""));

  const [side, setSide] = useState<Side>(initialSide);
  const [type, setType] = useState<"market" | "limit">("market");
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
  const [result, setResult] = useState<{ kind: "position"; trade: TradeView } | { kind: "order"; price: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const stats = book === null ? null : bookStats(book);
  const size = Number(sizeUsd);
  const estimate = useMemo(
    () => (book === null || !(size > 0) ? null : estimateFill(book, side === "long" ? "buy" : "sell", size)),
    [book, side, size],
  );
  const liveReady = data?.live.enabled === true && data.agent?.approved === true;
  const entry = type === "limit" ? Number(limitPrice) : (estimate?.avgPrice ?? stats?.mid ?? row?.price ?? NaN);
  const planned = Number.isFinite(entry) && entry > 0 ? exitPrices(side, entry, Number(tpPct), Number(slPct)) : null;
  const feeUsd = size > 0 ? (size * PAPER_COSTS.takerFeePct) / 100 : null;

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

  const mine = (data?.trades ?? []).filter((trade) => trade.coin === market.coin && trade.status === "open");
  const resting = (data?.orders ?? []).filter((order) => order.coin === market.coin && order.status === "open");

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const common = { coin: market.coin, side, sizeUsd: size, leverage, mode };
    if (type === "market") {
      const sent = await feed.write("/api/automation/trade", "POST", { ...common, takeProfitPct: Number(tpPct), stopLossPct: Number(slPct) });
      if (sent.error !== null) setError(sent.error);
      else setResult({ kind: "position", trade: sent.body.position as TradeView });
      refreshPaper();
    } else {
      if (planned === null) {
        setBusy(false);
        setError(t("Enter the price to open at."));
        return;
      }
      const sent = await feed.write("/api/automation/orders", "POST", {
        ...common,
        price: entry,
        takeProfit: Number(planned.takeProfit.toPrecision(6)),
        stopLoss: Number(planned.stopLoss.toPrecision(6)),
      });
      if (sent.error !== null) setError(sent.error);
      else setResult({ kind: "order", price: entry });
      refreshPaper();
    }
    setBusy(false);
  };

  if (!auth.authenticated) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="type-body-sm text-text-secondary">{t("Sign in to trade {symbol} from the chart. New trades start on paper.", { symbol: market.label })}</p>
        <Button variant="accent" onClick={auth.login} disabled={!auth.available}>
          {t("Sign in")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-2">
        <Segment<Side> label={t("Direction")} value={side} onChange={setSide} options={[["long", t("Long"), "text-positive"], ["short", t("Short"), "text-negative"]]} />
        <Segment<"market" | "limit"> label={t("Order type")} value={type} onChange={setType} options={[["market", t("Market")], ["limit", t("Limit")]]} />
      </div>

      {type === "limit" && (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-muted">{t("Open at ($)")}</span>
            <input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} className={FIELD} placeholder={stats ? formatPriceUsd(stats.mid) : ""} />
          </label>
          <div className="flex flex-wrap gap-1" aria-label={t("Prices from the chart")}>
            {picks.map(([label, value]) =>
              value === null || value === undefined ? null : (
                <button
                  key={label}
                  type="button"
                  onClick={() => setLimitPrice(String(Number(value.toPrecision(6))))}
                  className="type-label rounded-chip border border-border-subtle px-2 py-0.5 text-text-secondary hover:border-border-strong hover:text-text-primary"
                >
                  {label} <span className="tabular-nums text-text-muted">{formatPriceUsd(value)}</span>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("Size ($)")}</span>
          <input inputMode="decimal" value={sizeUsd} onChange={(event) => setSizeUsd(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("Leverage (1–{maxLeverage}x)", { maxLeverage: LIMITS.maxLeverage })}</span>
          <select value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} className={FIELD}>
            {Array.from({ length: LIMITS.maxLeverage }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("Take-profit (%)")}</span>
          <input inputMode="decimal" value={tpPct} onChange={(event) => setTpPct(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("Stop-loss (%)")}</span>
          <input inputMode="decimal" value={slPct} onChange={(event) => setSlPct(event.target.value)} className={FIELD} />
        </label>
      </div>
      {planned !== null && (
        <p className="type-label text-text-muted">
          {mode === "paper"
            ? t("Take-profit at {tp} · stop-loss at {sl}, held on paper and checked every five minutes.", { tp: formatPriceUsd(planned.takeProfit), sl: formatPriceUsd(planned.stopLoss) })
            : t("Take-profit at {tp} · stop-loss at {sl}, placed on Hyperliquid with the entry.", { tp: formatPriceUsd(planned.takeProfit), sl: formatPriceUsd(planned.stopLoss) })}
        </p>
      )}

      <OrderAccount
        paperOnly={paperOnly}
        liveReady={liveReady}
        liveNote={
          data?.live.enabled !== true
            ? t("This server sends no live orders, so an order on Live is refused. Switch to Paper to practise.")
            : t("Approve Elyra's trading key on Automation before trading live on Hyperliquid {network}.", { network: data.live.network })
        }
      />

      {type === "market" ? (
        estimate !== null && (
          <div className="rounded-card border border-border-subtle bg-surface-raised p-3">
            <Eyebrow>{t("How it would fill")}</Eyebrow>
            <p className="type-body-sm mt-1 text-text-primary">
              {t("About {price} on average, {bps} bps from the mid, across {levels} book levels.", {
                price: formatPriceUsd(estimate.avgPrice),
                bps: estimate.slippageBps.toFixed(1),
                levels: estimate.levels,
              })}
            </p>
            <p className="type-label mt-0.5 text-text-muted">
              {feeUsd !== null && t("Taker fee about {fee}.", { fee: formatUsd(feeUsd) })}{" "}
              {!estimate.complete || estimate.slippageBps > LIMITS.entrySlippagePct * 100
                ? t("The visible book cannot fill this within the {cap}% cap; part of it may not fill.", { cap: LIMITS.entrySlippagePct })
                : t("Within the {cap}% slippage cap.", { cap: LIMITS.entrySlippagePct })}
            </p>
          </div>
        )
      ) : (
        stats !== null &&
        Number(limitPrice) > 0 && (
          <p className="type-label text-text-muted">
            {(side === "long" ? Number(limitPrice) >= stats.bestAsk : Number(limitPrice) <= stats.bestBid)
              ? t("At this price the order crosses the book and fills at once, like a market order.")
              : t("Rests {pct}% from the mid until the price trades there.", { pct: (Math.abs(Number(limitPrice) - stats.mid) / stats.mid * 100).toFixed(2) })}
          </p>
        )
      )}

      <Liquidity book={book} error={bookError} />

      {error !== null && (
        <p role="alert" className="type-body-sm text-negative">
          {error}
        </p>
      )}
      {result?.kind === "position" && (
        <div role="status" className="rounded-card border border-border-subtle bg-surface-raised p-3">
          <p className="type-body-sm text-text-primary">
            {t("{side} {coin} opened ({mode}).", { side: result.trade.side === "long" ? t("Long") : t("Short"), coin: market.label, mode: t(result.trade.mode) })}
          </p>
          <FillReport trade={result.trade} />
        </div>
      )}
      {result?.kind === "order" && (
        <p role="status" className="type-body-sm text-text-primary">
          {t("Limit order placed at {price}. It is listed below until it fills or you cancel it.", { price: formatPriceUsd(result.price) })}
        </p>
      )}

      <Button variant="accent" disabled={busy || !(size > 0)} onClick={() => void submit()} className={side === "short" ? "bg-negative text-text-primary hover:bg-negative" : undefined}>
        {busy
          ? t("Sending…")
          : type === "market"
            ? side === "long"
              ? t("Long {coin} now", { coin: market.label })
              : t("Short {coin} now", { coin: market.label })
            : t("Place limit order")}
      </Button>
      <p className="type-label text-text-muted">
        {t("Isolated margin, held to Elyra's limits and your account's. Leverage magnifies losses; a stop can fill past its price in a fast market.")}
      </p>

      {(mine.length > 0 || resting.length > 0) && (
        <section aria-label={t("Open on {coin}", { coin: market.label })} className="flex flex-col gap-3 border-t border-border-subtle pt-3">
          <Eyebrow>{t("Open on {coin}", { coin: market.label })}</Eyebrow>
          {note !== null && <p className="type-label text-caution">{note}</p>}
          {mine.map((trade) => (
            <div key={trade.id} className="flex flex-col gap-1.5 rounded-card border border-border-subtle p-3">
              <p className="type-body-sm text-text-primary">
                {trade.side === "long" ? t("Long") : t("Short")} · {Number(trade.size.toPrecision(6))} {market.label} · {t(trade.mode)}
                <span className="type-label text-text-muted">
                  {" · "}
                  {t("TP {tp} · SL {sl}", { tp: formatPriceUsd(trade.takeProfit), sl: formatPriceUsd(trade.stopLoss) })}
                </span>
              </p>
              <PositionControls trade={trade} write={feed.write} onNote={setNote} />
            </div>
          ))}
          {resting.map((order) => (
            <div key={order.id} className="flex items-center justify-between gap-2 rounded-card border border-border-subtle p-3">
              <p className="type-body-sm min-w-0 text-text-primary">
                {t("Limit {side} at {price}", { side: order.side === "long" ? t("Long") : t("Short"), price: formatPriceUsd(order.price) })}
                <span className="type-label text-text-muted"> · {formatUsd(order.sizeUsd, { decimals: 0 })} · {t(order.mode)}</span>
              </p>
              <Button size="xs" variant="danger" onClick={() => void feed.write(`/api/automation/orders/${order.id}`, "DELETE")}>
                {t("Cancel order")}
              </Button>
            </div>
          ))}
        </section>
      )}
      <Button variant="ghost" size="sm" onClick={onClose}>
        {t("Close")}
      </Button>
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
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="panel" className="flex max-h-[min(860px,92dvh)] w-[min(520px,calc(100vw-24px))] flex-col gap-0 p-0">
        {/* pr-11 keeps the price clear of the dialog's close button (right-3, size-6). */}
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle pl-4 pr-11">
          <DialogTitle asChild>
            <Eyebrow>{t("Trade {symbol}", { symbol: market?.label ?? symbol })}</Eyebrow>
          </DialogTitle>
          {market !== null && row !== undefined && <span className="type-data-sm ml-auto tabular-nums text-text-secondary">{formatPriceUsd(row.price)}</span>}
          <DialogDescription className="sr-only">
            {t("Open a long or a short on Hyperliquid from the chart, with its take-profit and stop-loss, and manage what is open.")}
          </DialogDescription>
        </header>
        {market === null ? <NotTradable symbol={symbol} onClose={onClose} /> : <Ticket market={market} row={row} onClose={onClose} initialSide={initialSide} paperOnly={paper} />}
      </DialogContent>
    </Dialog>
  );
}
