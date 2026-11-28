"use client";

import { useId, useRef, useState } from "react";
import { ChevronRight, Play, Save } from "lucide-react";
import { field, GroupEditor, NumberField, Problem } from "@/components/strategies/editors";
import { ResultCard } from "@/components/strategies/ResultCard";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";
import {
  DESIGN_LIMITS,
  DESIGN_TIMEFRAMES,
  defaultTestDays,
  groupText,
  ruleWords,
  testPeriods,
  validateDesign,
  type ConditionGroup,
  type DesignTimeframe,
  type StrategyDesign,
} from "@/lib/strategies/spec";
import type { DesignResult, DesignSource } from "@/lib/strategies/types";
import type { StrategiesFeed } from "@/lib/strategies/useStrategies";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The designer: a strategy's rules, edited, put in words by code as they
   change, backtested on real history and saved. Nothing here trades.

   What is drafted is checked by `validateDesign` before it is tested or
   saved — the same check the server makes again — and "Rules in words" is
   written from that checked design, the very object the backtest is sent,
   so the words and the test cannot disagree.

   Turning exit conditions off parks them in the draft rather than dropping
   them: they leave the strategy (its exit is null, so the backtest and the
   words go without them) and come back as they were when turned on again.
--------------------------------------------------------------------------- */

export interface Draft {
  design: StrategyDesign;
  /** Exit conditions turned off, kept to restore when they are turned on again. */
  parkedExit: ConditionGroup | null;
  /** Where it came from, and the saved row it updates, if any. */
  source: DesignSource;
  savedId: string | null;
  result: DesignResult | null;
}

export const MARKETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TON", "PEPE"];

/** The exit a design gets when it has none to restore: the entry's first condition, crossed the other way. */
function mirrorExit(entry: ConditionGroup): ConditionGroup {
  const first = entry.conditions[0];
  const op = first.op === "crosses_above" ? "crosses_below" : first.op === "crosses_below" ? "crosses_above" : first.op === "above" ? "below" : "above";
  return { match: "all", conditions: [{ ...first, op }] };
}

export function MarketField({ symbol, onSymbol }: { symbol: string; onSymbol: (value: string) => void }) {
  const t = useT();
  const list = useId();
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="type-label text-text-secondary">{t("Market (Binance spot)")}</span>
      <input className={field} list={list} autoComplete="off" spellCheck={false} value={symbol} onChange={(event) => onSymbol(event.target.value.toUpperCase())} />
      <datalist id={list}>
        {MARKETS.map((market) => (
          <option key={market} value={market} />
        ))}
      </datalist>
    </label>
  );
}

export function PeriodField({ days, onDays, timeframe }: { days: number; onDays: (value: number) => void; timeframe: DesignTimeframe }) {
  const t = useT();
  const periods = testPeriods(timeframe);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="type-label text-text-secondary">{t("Test period")}</span>
      <select className={field} value={periods.includes(days) ? days : defaultTestDays(timeframe)} onChange={(event) => onDays(Number(event.target.value))}>
        {periods.map((value) => (
          <option key={value} value={value}>
            {value === 90 ? t("Last 90 days") : value === 180 ? t("Last 180 days") : value === 365 ? t("Last year") : value === 730 ? t("Last 2 years") : t("Last 4 years")}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The rules in words, "Buy" and "Sell" beside each half — written by code from the design. */
export function RuleWords({ design, className }: { design: StrategyDesign; className?: string }) {
  const t = useT();
  const words = ruleWords(design, t);
  return (
    <dl className={cn("flex flex-col divide-y divide-border-subtle", className)}>
      {(
        [
          [t("Buy"), words.buy],
          [t("Sell"), words.sell],
        ] as const
      ).map(([side, text]) => (
        <div key={side} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="type-label inline-flex h-6 items-center justify-center rounded-chip bg-surface-active font-medium text-text-primary">{side}</dt>
          <dd className="type-body-sm text-text-primary">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A group of conditions under its heading, folding to a one-line summary and opening again as it was. */
function GroupSection({
  title,
  group,
  onChange,
  control,
  off,
}: {
  title: string;
  group: ConditionGroup | null;
  onChange: (group: ConditionGroup) => void;
  /** Beside the heading, outside the fold toggle: the exit switch. */
  control?: React.ReactNode;
  /** Shown instead of the editor when the group is switched off. */
  off?: React.ReactNode;
}) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(true);
  const folded = !open && group !== null;

  return (
    <section aria-labelledby={`${id}-toggle`} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            id={`${id}-toggle`}
            aria-expanded={group === null ? undefined : open}
            aria-controls={group === null ? undefined : `${id}-body`}
            disabled={group === null}
            onClick={() => setOpen(!open)}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-control text-left transition-colors duration-[var(--dur-fast)] ease-brand",
              folded ? "min-h-12 border border-border-subtle bg-surface-base px-3 hover:bg-surface-hover" : "min-h-8 disabled:cursor-default",
            )}
          >
            <span className={cn("shrink-0 text-text-primary", folded ? "type-panel-title" : "type-h2")}>{title}</span>
            {folded && <span className="type-body-sm min-w-0 flex-1 truncate text-text-secondary">· {groupText(group, t)}</span>}
            {group !== null && (
              <ChevronRight
                size={16}
                aria-hidden
                className={cn("ml-auto shrink-0 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand", open && "rotate-90")}
              />
            )}
          </button>
        </h3>
        {control}
      </div>
      {group === null ? (
        off
      ) : (
        <div id={`${id}-body`} hidden={!open}>
          <GroupEditor label={title} group={group} onChange={onChange} />
        </div>
      )}
    </section>
  );
}

export function Designer({ draft, onChange, feed }: { draft: Draft; onChange: (draft: Draft) => void; feed: StrategiesFeed }) {
  const t = useT();
  const id = useId();
  const authedFetch = useAuthedFetch();
  const [symbol, setSymbol] = useState(draft.result?.symbol ?? "BTC");
  const [days, setDays] = useState(draft.result?.days ?? defaultTestDays(draft.design.timeframe));
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const design = draft.design;
  const setDesign = (next: StrategyDesign) => onChange({ ...draft, design: next, result: null });
  const checked = validateDesign(design);
  const problem = "error" in checked ? checked.error : null;
  const periods = testPeriods(design.timeframe);
  const testDays = periods.includes(days) ? days : defaultTestDays(design.timeframe);

  const test = async () => {
    if (!("design" in checked) || sending.current) return;
    sending.current = true;
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const response = await authedFetch("/api/strategies/backtest", { method: "POST", body: JSON.stringify({ design: checked.design, symbol, days: testDays }) });
      const body = (await response.json().catch(() => ({}))) as { result?: DesignResult; error?: string };
      /* A failure leaves the draft exactly as it was. */
      if (!response.ok || body.result === undefined) setError(body.error ?? t("The backtest could not run."));
      else onChange({ ...draft, design: checked.design, result: body.result });
    } catch {
      setError(t("The network did not answer."));
    } finally {
      sending.current = false;
      setBusy(null);
    }
  };

  const save = async () => {
    if (!("design" in checked) || sending.current) return;
    sending.current = true;
    setBusy("save");
    setError(null);
    setNotice(null);
    const payload = { design: checked.design, source: draft.source, result: draft.result };
    const sent = draft.savedId === null ? await feed.write("/api/strategies", "POST", payload) : await feed.write(`/api/strategies/${draft.savedId}`, "PATCH", payload);
    sending.current = false;
    setBusy(null);
    if (sent.error !== null) return setError(sent.error);
    const saved = sent.body.saved as { id?: string } | undefined;
    onChange({ ...draft, design: checked.design, savedId: saved?.id ?? draft.savedId });
    setNotice(draft.savedId === null ? t("Saved to your strategies.") : t("Changes saved."));
  };

  const exitOn = design.exit !== null;
  const exitSwitch = (
    <label className="type-label flex min-h-8 shrink-0 items-center gap-2 text-text-secondary">
      <input
        type="checkbox"
        className="size-5 accent-[var(--accent)]"
        checked={exitOn}
        onChange={(event) =>
          event.target.checked
            ? onChange({ ...draft, design: { ...design, exit: draft.parkedExit ?? mirrorExit(design.entry) }, parkedExit: null, result: null })
            : onChange({ ...draft, design: { ...design, exit: null }, parkedExit: design.exit, result: null })
        }
      />
      {t("Exit conditions")}
    </label>
  );

  return (
    <>
      <section aria-label={t("Strategy and rules")} className="flex min-w-0 flex-col gap-5 rounded-panel border border-border-subtle bg-surface-raised p-4 @max-[340px]:p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 @max-[340px]:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-name`} className="type-label text-text-secondary">
              {t("Strategy name")}
            </label>
            <input id={`${id}-name`} className={field} maxLength={DESIGN_LIMITS.maxName} autoComplete="off" value={design.name} onChange={(event) => setDesign({ ...design, name: event.target.value })} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-timeframe`} className="type-label text-text-secondary">
              {t("Timeframe")}
            </label>
            <select
              id={`${id}-timeframe`}
              className={field}
              value={design.timeframe}
              onChange={(event) => {
                const timeframe = event.target.value as DesignTimeframe;
                setDesign({ ...design, timeframe });
                if (!testPeriods(timeframe).includes(days)) setDays(defaultTestDays(timeframe));
              }}
            >
              {DESIGN_TIMEFRAMES.map((timeframe) => (
                <option key={timeframe} value={timeframe}>
                  {timeframe}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-idea`} className="type-label text-text-secondary">
            {t("Strategy idea (optional)")}
          </label>
          <textarea
            id={`${id}-idea`}
            className={cn(field, "h-auto min-h-20 resize-y py-2 leading-relaxed")}
            maxLength={DESIGN_LIMITS.maxSummary}
            value={design.summary}
            onChange={(event) => setDesign({ ...design, summary: event.target.value })}
          />
        </div>

        <GroupSection title={t("Buy when")} group={design.entry} onChange={(entry) => setDesign({ ...design, entry })} />
        <GroupSection
          title={t("Sell when")}
          group={design.exit}
          onChange={(exit) => setDesign({ ...design, exit })}
          control={exitSwitch}
          off={
            <p className="type-label text-text-muted">
              {draft.parkedExit !== null
                ? t("Exit conditions are off and kept aside. The strategy leaves by its stop, target or time limit.")
                : t("No exit conditions: the strategy leaves by its stop, target or time limit.")}
            </p>
          }
        />
      </section>

      <section aria-labelledby={`${id}-risk`} className="flex min-w-0 flex-col gap-3 rounded-panel border border-border-subtle bg-surface-raised p-4 @max-[340px]:p-3">
        <h3 id={`${id}-risk`} className="type-h2 text-text-primary">
          {t("Risk limits")}
        </h3>
        <div className="grid grid-cols-3 gap-2 @max-[300px]:grid-cols-1">
          <NumberField label={t("Stop-loss")} suffix="%" value={design.risk.stopLossPct} onChange={(value) => setDesign({ ...design, risk: { ...design.risk, stopLossPct: value } })} />
          <NumberField label={t("Take-profit")} suffix="%" value={design.risk.takeProfitPct} onChange={(value) => setDesign({ ...design, risk: { ...design.risk, takeProfitPct: value } })} />
          <NumberField label={t("Time limit")} suffix={t("bars")} value={design.risk.maxBarsHeld} onChange={(value) => setDesign({ ...design, risk: { ...design.risk, maxBarsHeld: value } })} />
        </div>
        <p className="type-label text-text-muted">{t("Leave a limit blank to skip it. Stops and targets are measured from the fill and checked within each bar.")}</p>

        <div className="mt-1 flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
          <span className="type-eyebrow text-text-muted">{t("Rules in words")}</span>
          {"design" in checked ? <RuleWords design={checked.design} /> : <Problem text={problem} />}
        </div>
      </section>

      <DrawerCard icon={Play} title={t("Backtest")}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 @max-[340px]:grid-cols-1">
            <MarketField symbol={symbol} onSymbol={setSymbol} />
            <PeriodField days={testDays} onDays={setDays} timeframe={design.timeframe} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" disabled={busy !== null || problem !== null || !feed.signedIn} aria-busy={busy === "test" || undefined} onClick={() => void test()}>
              <Play size={14} aria-hidden /> {busy === "test" ? t("Testing on real history…") : t("Run backtest")}
            </Button>
            <Button variant="quiet" disabled={busy !== null || problem !== null || !feed.signedIn} onClick={() => void save()}>
              <Save size={14} aria-hidden /> {busy === "save" ? t("Saving") : draft.savedId === null ? t("Save") : t("Save changes")}
            </Button>
          </div>
          <p className="type-label text-text-muted">{t("A simulation on past prices, after fees. Nothing here places an order.")}</p>
          {!feed.signedIn && <p className="type-label text-text-muted">{t("Sign in to backtest and save strategies.")}</p>}
          <Problem text={error} />
          {notice !== null && (
            <p role="status" className="type-label text-positive">
              {notice}
            </p>
          )}
          {draft.result !== null && <ResultCard result={draft.result} />}
        </div>
      </DrawerCard>
    </>
  );
}
