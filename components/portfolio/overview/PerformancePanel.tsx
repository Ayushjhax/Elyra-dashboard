"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, Money, Segmented, useBalancesHidden } from "@/components/portfolio/primitives";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { formatPct, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import {
  WINDOW_MS,
  WINDOWS,
  allTimeReturn,
  benchmarkSeries,
  isIntraday,
  tradeStats,
  windowChain,
  type CurrentReading,
  type OverviewResponse,
  type PerformanceWindow,
} from "@/lib/portfolio/performance";
import { cn } from "@/lib/utils";
import { PerformanceChart } from "@/components/portfolio/overview/PerformanceChart";

/* ---------------------------------------------------------------------------
   Performance: one line and the four numbers under it.

   Net PnL, Equity or Return %, over 24h, 7d, 30d, 3M or 1Y, with Bitcoin as
   a benchmark on Return %. Every figure is net of deposits and withdrawals
   (lib/portfolio/performance.ts) — Equity is the one line that is not, and
   says so. An interval whose flows could not be read is left out of PnL,
   return and drawdown, and the panel says how many there were and why.
--------------------------------------------------------------------------- */

type Metric = "pnl" | "equity" | "return";

const METRICS: ReadonlyArray<{ value: Metric; label: string }> = [
  { value: "pnl", label: msg("Net PnL") },
  { value: "equity", label: msg("Equity") },
  { value: "return", label: msg("Return %") },
];

const WINDOW_LABELS: Record<PerformanceWindow, string> = {
  "24h": msg("24h"),
  "7d": msg("7d"),
  "30d": msg("30d"),
  "3M": msg("3M"),
  "1Y": msg("1Y"),
};

const MASK = "••••••";

function StatCard({
  label,
  value,
  sub,
  tip,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tip: string;
  tone?: "positive" | "negative" | null;
}) {
  return (
    <div className="min-w-0 rounded-card border border-border-subtle bg-surface-panel px-3 py-2.5">
      <p className="type-label flex items-center gap-1.5 text-text-muted">
        {label}
        <InfoTip text={tip} />
      </p>
      <p
        className={cn(
          "type-data mt-1 truncate",
          tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-text-primary",
        )}
      >
        {value}
      </p>
      <p className="type-label mt-0.5 truncate text-text-muted">{sub}</p>
    </div>
  );
}

export function PerformancePanel({
  data,
  loading,
  error,
  current,
  now,
}: {
  data: OverviewResponse | null;
  loading: boolean;
  error: string | null;
  current: CurrentReading | null;
  now: number | null;
}) {
  const t = useT();
  const hidden = useBalancesHidden();
  const [metric, setMetric] = useState<Metric>("pnl");
  const [window, setWindow] = useState<PerformanceWindow>("30d");
  const [benchmarkOn, setBenchmarkOn] = useState(false);

  const view = useMemo(() => {
    if (data === null || now === null) return null;
    const chain = windowChain(data, window, current, now);
    const since = now - WINDOW_MS[window];
    const stats = tradeStats(data.trades, since);
    const allTime = allTimeReturn(data, current);
    const bench = benchmarkSeries(isIntraday(window) ? data.benchmark.hourly : data.benchmark.daily, since);
    return { chain, stats, allTime, bench };
  }, [data, window, current, now]);

  const usd = (value: number) => (hidden ? MASK : formatUsd(value, { sign: metric === "pnl" }));
  const pct = (value: number) => formatPct(value * 100);

  const series =
    view === null
      ? []
      : view.chain.points
          .filter((point) => metric !== "equity" || point.equityUsd !== null)
          .map((point) => ({
            at: point.at,
            value: metric === "pnl" ? point.pnlUsd : metric === "return" ? point.returnPct : (point.equityUsd as number),
            known: point.known,
          }));
  const bench =
    view !== null && metric === "return" && benchmarkOn ? view.bench.map((point) => ({ at: point.at, value: point.returnPct })) : undefined;

  const tracking = data?.trackingSince ?? null;
  const emptyText =
    tracking === null
      ? t("Elyra records your portfolio's close every day from now on, and a reading every five minutes while you have Elyra open. The line starts at the second reading.")
      : t("Not enough readings in this window yet. Try a longer one.");

  const returnPct = view?.chain.returnPct ?? null;
  const gaps = view?.chain.gaps ?? 0;

  return (
    <Card className="gap-3 p-4">
      <CardHead
        title={t("Performance")}
        sub={t("Net of deposits and withdrawals")}
        right={
          <Segmented
            label={t("Performance window")}
            options={WINDOWS.map((value) => ({ value, label: t(WINDOW_LABELS[value]) }))}
            value={window}
            onChange={setWindow}
          />
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label={t("Chart")}
          options={METRICS.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
          value={metric}
          onChange={setMetric}
        />
        <label
          className={cn(
            "type-label inline-flex min-h-8 cursor-pointer items-center gap-2 text-text-secondary",
            metric !== "return" && "cursor-default text-text-muted",
          )}
        >
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={benchmarkOn && metric === "return"}
            disabled={metric !== "return"}
            onChange={(event) => setBenchmarkOn(event.target.checked)}
          />
          {t("Benchmark: {symbol}", { symbol: data?.benchmark.symbol ?? "BTC" })}
        </label>
      </div>

      {error !== null && data === null ? (
        <p className="type-body-sm rounded-card border border-border-subtle bg-surface-panel px-3 py-4 text-text-secondary">{error}</p>
      ) : loading && data === null ? (
        <div aria-busy="true" aria-label={t("Reading your performance")} className="h-64 animate-pulse rounded-card bg-surface-panel" />
      ) : (
        <PerformanceChart
          series={series}
          benchmark={bench}
          benchmarkLabel={bench === undefined ? undefined : data?.benchmark.symbol}
          format={metric === "return" ? pct : usd}
          baseline={metric === "equity" ? null : 0}
          label={t(METRICS.find((entry) => entry.value === metric)?.label ?? "Net PnL")}
          empty={emptyText}
        />
      )}

      {metric === "equity" && <p className="type-label text-text-muted">{t("Equity includes deposits and withdrawals; Net PnL and Return % take them out.")}</p>}

      {(gaps > 0 || (data?.flowNotes.length ?? 0) > 0) && (
        <div className="rounded-card border border-border-subtle bg-surface-panel px-3 py-2">
          {gaps > 0 && (
            <p className="type-label text-caution">
              {gaps === 1
                ? t("1 interval is left out of PnL and return: its deposits and withdrawals could not be read.")
                : t("{count} intervals are left out of PnL and return: their deposits and withdrawals could not be read.", { count: gaps })}
            </p>
          )}
          {data?.flowNotes.map((note) => (
            <p key={note.key + JSON.stringify(note.values ?? {})} className="type-label text-text-muted">
              {t(note.key, note.values)}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 @[44rem]:grid-cols-4">
        <StatCard
          label={t("Total return")}
          value={returnPct === null ? "—" : pct(returnPct)}
          sub={view?.allTime == null ? t("All time: not enough history yet") : t("All time: {value}", { value: pct(view.allTime) })}
          tip={t("Time-weighted return across every account in this window, net of deposits and withdrawals. All time runs from Elyra's first recorded close.")}
          tone={returnPct === null || returnPct === 0 ? null : returnPct > 0 ? "positive" : "negative"}
        />
        <StatCard
          label={t("Win rate")}
          value={view?.stats.winRate == null ? "—" : formatPct(view.stats.winRate * 100, { sign: false, decimals: 1 })}
          sub={
            view === null || view.stats.trades === 0
              ? t("No closed trades in this window")
              : view.stats.trades === 1
                ? t("{wins} of 1 trade", { wins: view.stats.wins })
                : t("{wins} of {count} trades", { wins: view.stats.wins, count: view.stats.trades })
          }
          tip={t("Winning trades over all closed trades: Hyperliquid closing fills, net of fees, and settled Polymarket positions. Paper trades are not counted.")}
        />
        <StatCard
          label={t("Profit factor")}
          value={view?.stats.profitFactor == null ? "—" : view.stats.profitFactor.toFixed(2)}
          sub={
            view === null || view.stats.trades === 0
              ? t("No closed trades in this window")
              : view.stats.losses === 0
                ? t("No losing trades in this window")
                : hidden
                  ? t("Gross profit over gross loss")
                  : t("{profit} won · {loss} lost", { profit: formatUsd(view.stats.grossProfitUsd), loss: formatUsd(view.stats.grossLossUsd) })
          }
          tip={t("Gross profit divided by gross loss over the window's closed trades. Above 1 means the winners outweighed the losers.")}
        />
        <StatCard
          label={t("Max drawdown")}
          value={view === null || view.chain.points.length < 2 ? "—" : formatPct(-view.chain.maxDrawdownPct * 100)}
          sub={t("Largest fall from a peak in this window")}
          tip={t("The largest peak-to-trough fall of the time-weighted return in this window, so a withdrawal is never counted as a fall.")}
          tone={view !== null && view.chain.maxDrawdownPct > 0 ? "negative" : null}
        />
      </div>

      {(data?.tradeNotes.length ?? 0) > 0 && (
        <ul className="flex list-none flex-col gap-0.5">
          {data?.tradeNotes.map((note) => (
            <li key={note.key + JSON.stringify(note.values ?? {})} className="type-label text-text-muted">
              {t(note.key, note.values)}
            </li>
          ))}
        </ul>
      )}

      {current !== null && current.equityUsd !== null && (
        <p className="type-label text-text-muted">
          {t("Equity now")} <Money value={current.equityUsd} className="type-data-sm text-text-secondary" />
        </p>
      )}
    </Card>
  );
}
