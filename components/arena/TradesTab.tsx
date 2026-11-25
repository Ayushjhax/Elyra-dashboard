"use client";

import { useEffect, useState } from "react";
import { MarketOptions } from "@/components/automation/MarketOptions";
import { Card, Done, Label, Problem, field } from "@/components/arena/parts";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { LABEL_TEXT, REVIEW_LABELS, type ReviewLabel } from "@/lib/arena/review";
import type { ArenaResponse, ReviewView } from "@/lib/arena/types";
import type { TradeView } from "@/lib/autotrade/types";
import { useAutomation, type AutomationFeed } from "@/lib/autotrade/useAutomation";
import { LIMITS, marketFor } from "@/lib/autotrade/rules";
import { formatPriceUsd, formatRelativeTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Take trades — on paper, with a plan, and get every one reviewed.

   The ticket here only ever sends paper: it posts to the same hand-trade
   route as Automation (`/api/automation/trade`), with mode "paper" fixed, so
   the same limits and the same account gate apply and no order reaches an
   exchange. Every trade must carry its plan — a take-profit and a stop —
   because the review judges how it was played against that plan, not how
   much it made. Nothing here rewards trading more, bigger or with more
   leverage: there is no PnL ladder, and size does not change a review's
   label (it is measured in R, the planned risk).
--------------------------------------------------------------------------- */

const marketLabel = (coin: string) => marketFor(coin)?.label ?? coin;

function PaperTicket({ feed }: { feed: AutomationFeed }) {
  const [form, setForm] = useState({ coin: "BTC", sizeUsd: "1000", leverage: "1", takeProfitPct: "4", stopLossPct: "2" });
  const [busy, setBusy] = useState<"long" | "short" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const tp = Number(form.takeProfitPct);
  const sl = Number(form.stopLossPct);
  const reward = Number.isFinite(tp) && Number.isFinite(sl) && sl > 0 ? tp / sl : null;

  const trade = (side: "long" | "short") => {
    setBusy(side);
    setProblem(null);
    setDone(null);
    void feed
      .write("/api/automation/trade", "POST", {
        coin: form.coin,
        side,
        sizeUsd: Number(form.sizeUsd),
        leverage: Number(form.leverage),
        takeProfitPct: tp,
        stopLossPct: sl,
        /* Arena is paper only. */
        mode: "paper",
      })
      .then((result) => {
        setProblem(result.error);
        if (result.error === null) {
          setDone(`Paper ${side} ${marketLabel(form.coin)} is open. It closes at its target or its stop, or when you close it; then it is reviewed.`);
        }
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="arena-trade-coin">Market</Label>
          <select id="arena-trade-coin" className={field} value={form.coin} onChange={set("coin")}>
            <MarketOptions />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="arena-trade-tp">Target (%)</Label>
          <input id="arena-trade-tp" inputMode="decimal" className={field} value={form.takeProfitPct} onChange={set("takeProfitPct")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="arena-trade-sl">Stop (%)</Label>
          <input id="arena-trade-sl" inputMode="decimal" className={field} value={form.stopLossPct} onChange={set("stopLossPct")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="arena-trade-size">Paper size ($)</Label>
          <input id="arena-trade-size" inputMode="decimal" className={field} value={form.sizeUsd} onChange={set("sizeUsd")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="arena-trade-leverage">Leverage (1–{LIMITS.maxLeverage}x)</Label>
          <input id="arena-trade-leverage" inputMode="numeric" className={field} value={form.leverage} onChange={set("leverage")} />
        </div>
      </div>
      <p className="type-label text-text-muted">
        {reward === null ? "Set a target and a stop: the plan the review judges." : `The plan risks 1 to make ${reward.toFixed(1)}.`} Paper only — it pays an
        estimated fee and slippage on each fill, and no order reaches an exchange. Size and leverage do not change the review: it is measured
        against the risk you planned.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => trade("long")}>
          {busy === "long" ? "Opening" : "Paper long"}
        </Button>
        <Button size="sm" variant="quiet" disabled={busy !== null} onClick={() => trade("short")}>
          {busy === "short" ? "Opening" : "Paper short"}
        </Button>
      </div>
      <Done text={done} />
      <Problem text={problem} />
    </div>
  );
}

function OpenTrade({ trade, feed, now }: { trade: TradeView; feed: AutomationFeed; now: number | null }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-data-sm min-w-0 truncate text-text-primary">
          {trade.side === "long" ? "Long" : "Short"} {marketLabel(trade.coin)} at {formatPriceUsd(trade.entryPrice)}
        </span>
        <span className="type-label shrink-0 text-text-muted">{trade.mode === "paper" ? "Paper" : "Live"}</span>
      </div>
      <span className="type-label text-text-muted">
        Target {formatPriceUsd(trade.takeProfit)} · stop {formatPriceUsd(trade.stopLoss)}
        {now !== null && <> · opened {formatRelativeTime(trade.openedAt, now)}</>}
      </span>
      {trade.mode === "paper" && trade.status === "open" && (
        <div>
          <Button
            size="xs"
            variant="quiet"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void feed
                .write(`/api/automation/positions/${trade.id}`, "DELETE")
                .then((result) => setProblem(result.error))
                .finally(() => setBusy(false));
            }}
          >
            Close at the market
          </Button>
        </div>
      )}
      <Problem text={problem} />
    </li>
  );
}

const LABEL_TONE: Record<ReviewLabel, string> = {
  brilliant: "border-positive/50 text-positive",
  great: "border-positive/40 text-positive",
  good: "border-border-strong text-text-primary",
  inaccuracy: "border-caution/50 text-caution",
  mistake: "border-negative/40 text-negative",
  blunder: "border-negative/60 text-negative",
};

function ReviewRow({ review, highlighted }: { review: ReviewView; highlighted: boolean }) {
  const { facts } = review;
  return (
    <li id={`review-${review.positionId}`} className={cn("flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0", highlighted && "rounded-card bg-surface-hover px-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="type-data-sm text-text-primary">
          {facts.coin} {facts.side} · {facts.mode}
        </span>
        <span className={cn("type-label rounded-chip border px-1.5", LABEL_TONE[review.label])}>{LABEL_TEXT[review.label]}</span>
      </div>
      <p className="type-body-sm text-text-secondary">{review.coaching}</p>
      <span className="type-label text-text-muted">
        In {formatPriceUsd(facts.entryPrice)} · out {formatPriceUsd(facts.exitPrice)} · {formatUsd(facts.pnlUsd, { sign: true })}
        {facts.rMultiple !== null && <> ({facts.rMultiple.toFixed(1)}R)</>}
        {facts.capture !== null && facts.pnlUsd > 0 && <> · kept {Math.round(facts.capture * 100)}% of the best move</>}
      </span>
    </li>
  );
}

function Reviews({ data, trade }: { data: ArenaResponse; trade: string | null }) {
  const total = REVIEW_LABELS.reduce((sum, label) => sum + data.labelCounts[label], 0);
  const wanted = trade === null ? null : (data.reviews.find((review) => review.positionId === trade) ?? null);
  useEffect(() => {
    if (wanted !== null) document.getElementById(`review-${wanted.positionId}`)?.scrollIntoView({ block: "center" });
  }, [wanted]);
  return (
    <div className="flex flex-col gap-3">
      <Card title="How your trades are played" right={<InfoTip text="Each closed trade is judged against its own plan: a loss taken at the planned stop is Good; a winner given back is not. The label is computed, never written by the AI." />}>
        {total === 0 ? (
          <p className="type-body-sm text-text-secondary">No reviews yet. Every closed trade, paper or live, is reviewed within a few minutes.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {REVIEW_LABELS.map((label) => (
              <li key={label} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2">
                <span className="type-label text-text-secondary">{LABEL_TEXT[label]}</span>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-surface-hover">
                  <span className="block h-full rounded-pill bg-accent-quiet" style={{ width: `${(data.labelCounts[label] / total) * 100}%` }} />
                </span>
                <span className="type-data-sm text-right text-text-primary">{data.labelCounts[label]}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {trade !== null && wanted === null && (
        <p className="type-label text-text-muted">That trade&apos;s review is not written yet — it appears within a few minutes of the trade closing.</p>
      )}
      {data.reviews.length > 0 && (
        <Card title="Reviews">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.reviews.map((review) => (
              <ReviewRow key={review.id} review={review} highlighted={review.positionId === trade} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function TradesTab({ data, trade, now }: { data: ArenaResponse; trade: string | null; now: number | null }) {
  const automation = useAutomation();
  const open = (automation.data?.trades ?? []).filter((row) => row.status === "open" || row.status === "opening");
  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Take a paper trade"
        right={<InfoTip text="A paper trade fills at Hyperliquid's mid less estimated slippage and fees, and is managed by the five-minute pass like any other. When it closes it gets a review, from Brilliant to Blunder, judged against its own plan." />}
      >
        <PaperTicket feed={automation} />
      </Card>
      <Card title="Open trades">
        {automation.loading && automation.data === null ? (
          <p className="type-body-sm text-text-secondary">Reading your trades…</p>
        ) : open.length === 0 ? (
          <p className="type-body-sm text-text-secondary">Nothing open. A trade you take above shows here until it closes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {open.map((row) => (
              <OpenTrade key={row.id} trade={row} feed={automation} now={now} />
            ))}
          </ul>
        )}
        {automation.error !== null && automation.data === null && <Problem text={automation.error} />}
      </Card>
      <Reviews data={data} trade={trade} />
    </div>
  );
}
