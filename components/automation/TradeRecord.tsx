"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronRight, History, Info } from "lucide-react";
import { ModeChip, Problem, field, marketLabel } from "@/components/automation/parts";
import { FillReport, PartialsNote, PositionControls } from "@/components/trade/PositionControls";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { formatPriceUsd, formatUsd } from "@/lib/format";
import type { GroupStats, PaperAnalysis } from "@/lib/autotrade/analysis";
import { ALL, analyseHistory, closedPaperTrades, filterChoices, filterTrades, heldMinutes, NO_FILTERS, outcomeOf, paperCosts, type HistoryFilters } from "@/lib/autotrade/history";
import type { AutomationResponse, TradeView } from "@/lib/autotrade/types";
import type { AutomationFeed } from "@/lib/autotrade/useAutomation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/locales";
import { msg, type Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   The record: trade history, and the analysis of exactly the trades it
   shows. One set of filters chooses the trades; the analysis reads the
   closed paper trades among them (lib/autotrade/history.ts), so a figure in
   the analysis is always one the history above it can account for.

   A row says what matters at a glance — market, side, paper or live, the
   realised result with its sign, how it ended — and opens to the rest: entry
   and exit, take-profit and stop-loss, the fill against the mid it was sent
   at, and what a paper fill was charged. An open position opens with its
   controls, the chart ticket's own (close in part or whole, move the exits).
--------------------------------------------------------------------------- */

const OUTCOME_WORDS: Record<string, string> = {
  take_profit: msg("Take-profit"),
  stop_loss: msg("Stop-loss"),
  exit_rule: msg("Exit rule"),
  closed_outside_elyra: msg("Closed outside Elyra"),
  closed_by_hand: msg("Closed by you"),
  leader_closed: msg("Leader closed it"),
  other: msg("Other"),
  open: msg("Open"),
  failed: msg("Failed"),
};

const PAGE = 20;

const outcomeWord = (outcome: string, t: Translator) => t(OUTCOME_WORDS[outcome] ?? outcome);
const signedUsd = (value: number | null) => (value === null ? "—" : formatUsd(value, { sign: true }));
const percent = (value: number | null) => (value === null ? "—" : `${value.toFixed(0)}%`);
const tone = (value: number | null) => (value === null || value === 0 ? "text-text-primary" : value > 0 ? "text-positive" : "text-negative");

function held(minutes: number | null, t: Translator): string {
  if (minutes === null) return "—";
  if (minutes < 60) return t("{minutes}m", { minutes });
  if (minutes < 48 * 60) return t("{hours}h {minutes}m", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  return t("{days}d {hours}h", { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60) });
}

/** "27 Nov, 09:15 UTC": the analysis buckets entries by UTC hour, so the history says UTC too. */
function utc(iso: string, t: Translator): string {
  const when = new Date(iso).toLocaleString(intlLocale(t.locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  return `${when} UTC`;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="type-data-sm tabular-nums text-text-primary">{children}</dd>
    </div>
  );
}

function TradeRow({ trade, feed, now }: { trade: TradeView; feed: AutomationFeed; now: number | null }) {
  const t = useT();
  /* An open position opens with its controls showing. */
  const [open, setOpen] = useState(trade.status === "open");
  const [note, setNote] = useState<string | null>(null);
  const detailsId = useId();
  const pnl = trade.realisedPnlUsd;
  const outcome = outcomeOf(trade);
  const costs = paperCosts(trade);
  const opened = trade.originalSize ?? trade.size;
  const side = trade.side === "long" ? t("Long") : t("Short");

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
          className="-mx-1 flex min-w-0 flex-1 items-start gap-1.5 rounded-control px-1 py-0.5 text-left transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
        >
          <ChevronRight
            size={15}
            aria-hidden
            className={cn("mt-0.5 shrink-0 text-text-muted transition-transform duration-[var(--dur-fast)] motion-reduce:transition-none", open && "rotate-90")}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="type-data-sm min-w-0 truncate text-text-primary">
                {marketLabel(trade.coin)} {side}
              </span>
              <ModeChip mode={trade.mode} network={trade.network} />
              <span className={cn("type-data-sm ml-auto shrink-0 tabular-nums", pnl === null ? "text-text-muted" : tone(pnl))}>
                {pnl !== null ? signedUsd(pnl) : trade.status === "opening" ? t("Opening") : outcomeWord(outcome, t)}
              </span>
            </span>
            {/* Wraps rather than truncating: the time is the end of the line and the part most often cut. */}
            <span className="type-label break-words text-text-muted">
              {outcomeWord(outcome, t)} · {trade.ruleName} · {utc(trade.openedAt, t)}
            </span>
          </span>
        </button>
        {trade.status === "closed" && (
          <Link
            href={`/arena?tab=reviews&trade=${trade.id}`}
            aria-label={t("Review the {market} {side} trade", { market: marketLabel(trade.coin), side })}
            className="type-label inline-flex h-7 shrink-0 items-center rounded-control border border-border-strong px-2.5 text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
          >
            {t("Review")}
          </Link>
        )}
      </div>

      <div id={detailsId} hidden={!open} className="@container mt-2 flex flex-col gap-2 pl-6">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 @[26rem]:grid-cols-4">
          <Detail label={t("Entry")}>{formatPriceUsd(trade.entryPrice)}</Detail>
          <Detail label={t("Exit")}>{trade.exitPrice === null ? "—" : formatPriceUsd(trade.exitPrice)}</Detail>
          <Detail label={t("Take-profit")}>{formatPriceUsd(trade.takeProfit)}</Detail>
          <Detail label={t("Stop-loss")}>{formatPriceUsd(trade.stopLoss)}</Detail>
          <Detail label={t("Size")}>
            {Number(opened.toPrecision(6))} {marketLabel(trade.coin)}
          </Detail>
          <Detail label={t("Leverage")}>{trade.leverage === null || trade.leverage === undefined ? "—" : `${trade.leverage}x`}</Detail>
          <Detail label={t("Opened")}>{utc(trade.openedAt, t)}</Detail>
          <Detail label={t("Held")}>{held(heldMinutes(trade, now), t)}</Detail>
        </dl>

        {trade.status === "open" ? (
          <PositionControls trade={trade} write={feed.write} onNote={setNote} />
        ) : (
          trade.status !== "failed" && (
            <>
              <FillReport trade={trade} />
              <PartialsNote trade={trade} />
            </>
          )
        )}

        {trade.status !== "failed" && (
          <p className="type-label tabular-nums text-text-muted">
            {costs === null
              ? t("Live fills pay Hyperliquid's own fees, already in the result.")
              : t("Modeled costs {total}: taker fees {fees} and slippage {slippage}, already in the result.", {
                  total: formatUsd(costs.totalUsd),
                  fees: formatUsd(costs.feesUsd),
                  slippage: formatUsd(costs.slippageUsd),
                })}
          </p>
        )}
        {trade.error !== null && <span className="type-label text-negative">{trade.error}</span>}
        <Problem text={note} />
      </div>
    </li>
  );
}

function Filter({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} className={cn(field, "type-body-sm h-9")} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

function HistoryCard({
  data,
  feed,
  now,
  filters,
  setFilters,
  shown,
}: {
  data: AutomationResponse;
  feed: AutomationFeed;
  now: number | null;
  filters: HistoryFilters;
  setFilters: (next: HistoryFilters) => void;
  shown: TradeView[];
}) {
  const t = useT();
  const [limit, setLimit] = useState(PAGE);
  const choices = filterChoices(data.trades);
  const filtered = filters.coin !== ALL || filters.outcome !== ALL || filters.mode !== ALL;
  const update = (patch: Partial<HistoryFilters>) => {
    setFilters({ ...filters, ...patch });
    setLimit(PAGE);
  };

  return (
    <DrawerCard
      icon={History}
      title={t("Trade history")}
      right={<span className="type-label tabular-nums text-text-muted">{shown.length === 1 ? t("1 trade") : t("{count} trades", { count: shown.length })}</span>}
    >
      {data.trades.length === 0 ? (
        <p className="type-body-sm text-text-secondary">{t("Nothing traded yet. Entries appear here as rules fire.")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="@container">
          <div role="group" aria-label={t("Filter the history")} className={cn("grid gap-2", choices.modes.length > 1 ? "grid-cols-1 @[21rem]:grid-cols-3" : "grid-cols-2")}>
            <Filter id="history-market" label={t("Market")} value={filters.coin} onChange={(coin) => update({ coin })}>
              <option value={ALL}>{t("All markets")}</option>
              {choices.coins.map((coin) => (
                <option key={coin} value={coin}>
                  {marketLabel(coin)}
                </option>
              ))}
            </Filter>
            <Filter id="history-outcome" label={t("Outcome")} value={filters.outcome} onChange={(outcome) => update({ outcome })}>
              <option value={ALL}>{t("All outcomes")}</option>
              {choices.outcomes.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcomeWord(outcome, t)}
                </option>
              ))}
            </Filter>
            {/* Only when there is a choice to make: a paper-only record has no live trades to separate. */}
            {choices.modes.length > 1 && (
              <Filter id="history-mode" label={t("Account")} value={filters.mode} onChange={(mode) => update({ mode: mode as HistoryFilters["mode"] })}>
                <option value={ALL}>{t("Paper and live")}</option>
                <option value="paper">{t("Paper")}</option>
                <option value="live">{t("Live")}</option>
              </Filter>
            )}
          </div>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="type-body-sm text-text-secondary">{t("No trades match these filters.")}</p>
              <Button size="xs" variant="quiet" onClick={() => update(NO_FILTERS)}>
                {t("Clear filters")}
              </Button>
            </div>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {shown.slice(0, limit).map((trade) => (
                  <TradeRow key={trade.id} trade={trade} feed={feed} now={now} />
                ))}
              </ul>
              {shown.length > limit && (
                <Button size="sm" variant="quiet" onClick={() => setLimit(limit + PAGE)}>
                  {t("Show more")}
                </Button>
              )}
            </>
          )}
          {filtered && shown.length > 0 && (
            <button type="button" onClick={() => update(NO_FILTERS)} className="type-label self-start text-text-secondary underline underline-offset-2 hover:text-text-primary">
              {t("Clear filters")}
            </button>
          )}
        </div>
      )}
    </DrawerCard>
  );
}

function Figure({ label, value, valueTone, large = false }: { label: string; value: string; valueTone?: string; large?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className={cn("font-sans font-semibold tabular-nums", large ? "text-[22px] leading-7" : "type-data", valueTone ?? "text-text-primary")}>{value}</dd>
    </div>
  );
}

function Breakdown({ title, groups }: { title: string; groups: GroupStats[] }) {
  const t = useT();
  if (groups.length === 0) return null;
  return (
    <tbody>
      <tr>
        <th scope="rowgroup" colSpan={4} className="type-eyebrow pb-1 pt-3 text-left text-text-muted">
          {title}
        </th>
      </tr>
      {groups.map((group) => (
        <tr key={group.key} className="border-t border-border-subtle">
          <th scope="row" className="type-data-sm py-1.5 pr-2 text-left font-normal text-text-primary">
            {t(group.label)}
          </th>
          <td className="type-data-sm py-1.5 pl-2 text-right tabular-nums text-text-secondary">{group.trades}</td>
          <td className="type-data-sm py-1.5 pl-2 text-right tabular-nums text-text-secondary">{percent(group.winRate)}</td>
          <td className={cn("type-data-sm py-1.5 pl-2 text-right tabular-nums", tone(group.netPnlUsd))}>{signedUsd(group.netPnlUsd)}</td>
        </tr>
      ))}
    </tbody>
  );
}

function AnalysisCard({ analysis, anyClosed, onClear }: { analysis: PaperAnalysis | null; anyClosed: boolean; onClear: () => void }) {
  const t = useT();

  let body: React.ReactNode;
  if (!anyClosed) {
    body = (
      <p className="type-body-sm text-text-secondary">
        {t("No closed paper trades yet. Once some close, this shows your real win rate, which leverage pays and which bleeds, long against short, and the hours you trade best.")}
      </p>
    );
  } else if (analysis === null) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="type-body-sm text-text-secondary">{t("None of the trades these filters show is a closed paper trade.")}</p>
        <Button size="xs" variant="quiet" onClick={onClear}>
          {t("Clear filters")}
        </Button>
      </div>
    );
  } else {
    const { overall } = analysis;
    const pays = analysis.bestLeverage !== null && analysis.bestLeverage.netPnlUsd > 0 ? analysis.bestLeverage : null;
    const bleeds =
      analysis.worstLeverage !== null && analysis.worstLeverage.netPnlUsd < 0 && analysis.worstLeverage.key !== pays?.key ? analysis.worstLeverage : null;
    const sharpest = analysis.sharpestWindow !== null && analysis.sharpestWindow.netPnlUsd > 0 ? analysis.sharpestWindow : null;
    body = (
      <div className="flex flex-col gap-4">
        <p className="type-label text-text-secondary">
          {overall.trades === 1
            ? t("From the 1 closed paper trade in the history above, as filtered.")
            : t("From the {count} closed paper trades in the history above, as filtered.", { count: overall.trades })}
        </p>

        <dl className="grid grid-cols-3 divide-x divide-border-subtle rounded-card border border-border-subtle bg-surface-base py-3 *:px-3">
          <Figure large label={t("Closed trades")} value={String(overall.trades)} />
          <Figure large label={t("Win rate")} value={percent(overall.winRate)} />
          <Figure large label={t("Net result")} value={signedUsd(overall.netPnlUsd)} valueTone={tone(overall.netPnlUsd)} />
        </dl>
        <dl className="grid grid-cols-3 gap-3">
          <Figure label={t("Profit factor")} value={overall.profitFactor === null ? "—" : overall.profitFactor.toFixed(2)} />
          <Figure label={t("Average win")} value={signedUsd(overall.avgWinUsd)} valueTone={tone(overall.avgWinUsd)} />
          <Figure label={t("Average loss")} value={signedUsd(overall.avgLossUsd)} valueTone={tone(overall.avgLossUsd)} />
          <Figure label={t("Best trade")} value={signedUsd(overall.bestUsd)} valueTone={tone(overall.bestUsd)} />
          <Figure label={t("Worst trade")} value={signedUsd(overall.worstUsd)} valueTone={tone(overall.worstUsd)} />
          <Figure label={t("Average hold")} value={held(overall.avgHoldMinutes === null ? null : Math.round(overall.avgHoldMinutes), t)} />
        </dl>

        <ul className="flex flex-col gap-1.5">
          {pays !== null && (
            <li className="type-body-sm text-text-secondary">
              <span className="text-text-primary">{t("{label} pays:", { label: pays.label })}</span> {t("{netPnlUsd} over {trades} trades, {winRate} won.", { netPnlUsd: signedUsd(pays.netPnlUsd), trades: pays.trades, winRate: percent(pays.winRate) })}
            </li>
          )}
          {bleeds !== null && (
            <li className="type-body-sm text-text-secondary">
              <span className="text-text-primary">{t("{label} bleeds:", { label: bleeds.label })}</span> {t("{netPnlUsd} over {trades} trades, {winRate} won.", { netPnlUsd: signedUsd(bleeds.netPnlUsd), trades: bleeds.trades, winRate: percent(bleeds.winRate) })}
            </li>
          )}
          {sharpest !== null && (
            <li className="type-body-sm text-text-secondary">
              <span className="text-text-primary">{t("Sharpest timing:")}</span>{" "}{t("entries {label} — {winRate} won, {netPnlUsd} over {trades} trades.", { label: sharpest.label, winRate: percent(sharpest.winRate), netPnlUsd: signedUsd(sharpest.netPnlUsd), trades: sharpest.trades })}
            </li>
          )}
          {pays === null && bleeds === null && sharpest === null && (
            <li className="type-body-sm text-text-secondary">{t("No leverage band or time window has the five trades it takes to call it yet.")}</li>
          )}
        </ul>

        {/* Before the splits, where it has to be read first. */}
        {analysis.smallSample && (
          <p className="type-label flex items-start gap-2 rounded-card border border-border-subtle bg-surface-base px-3 py-2 text-caution">
            <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
            {t("Fewer than 20 closed trades: treat every split below as noise until there are more.")}
          </p>
        )}

        <table className="w-full border-collapse">
          <caption className="sr-only">{t("Paper results by leverage, side, entry time, exit and market")}</caption>
          <thead>
            <tr>
              <th scope="col" className="type-eyebrow pb-1 text-left font-normal text-text-muted">
                <span className="sr-only">{t("Group")}</span>
              </th>
              <th scope="col" className="type-eyebrow w-[4.25rem] pb-1 pl-2 text-right font-normal text-text-muted">{t("Trades")}</th>
              <th scope="col" className="type-eyebrow w-[5rem] pb-1 pl-2 text-right font-normal text-text-muted">{t("Win rate")}</th>
              <th scope="col" className="type-eyebrow w-[5.75rem] pb-1 pl-2 text-right font-normal text-text-muted">{t("P&L (USD)")}</th>
            </tr>
          </thead>
          <Breakdown title={t("By leverage")} groups={analysis.byLeverage} />
          <Breakdown title={t("Long vs short")} groups={analysis.bySide} />
          <Breakdown title={t("By entry time")} groups={analysis.byWindow} />
          <Breakdown title={t("By exit")} groups={analysis.byExit} />
          <Breakdown title={t("By market")} groups={analysis.byCoin.map((group) => ({ ...group, label: marketLabel(group.key) }))} />
        </table>

        <p className="type-label text-text-muted">
          {t("Paper trades only, after estimated fees and slippage. Win rate counts a trade as a win when it closed above zero after costs.")}
        </p>
      </div>
    );
  }

  return (
    <DrawerCard icon={BarChart3} title={t("Paper trade analysis")}>
      {body}
    </DrawerCard>
  );
}

export function TradeRecord({ data, feed, now }: { data: AutomationResponse; feed: AutomationFeed; now: number | null }) {
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS);
  const shown = filterTrades(data.trades, filters);
  const analysis = analyseHistory(shown, data.rules);
  const anyClosed = closedPaperTrades(data.trades, data.rules).length > 0;
  return (
    <>
      <HistoryCard data={data} feed={feed} now={now} filters={filters} setFilters={setFilters} shown={shown} />
      <AnalysisCard analysis={analysis} anyClosed={anyClosed} onClear={() => setFilters(NO_FILTERS)} />
    </>
  );
}
