"use client";

import { useState } from "react";
import { FlaskConical, Play, Save } from "lucide-react";
import { field, GroupEditor, NumberField, Problem } from "@/components/strategies/editors";
import { ResultCard } from "@/components/strategies/ResultCard";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";
import {
  DESIGN_LIMITS,
  DESIGN_TIMEFRAMES,
  defaultTestDays,
  describeDesign,
  testPeriods,
  validateDesign,
  type DesignTimeframe,
  type StrategyDesign,
} from "@/lib/strategies/spec";
import type { DesignResult, DesignSource } from "@/lib/strategies/types";
import type { StrategiesFeed } from "@/lib/strategies/useStrategies";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The designer: a strategy's rules, edited, described in words by code as
   they change, backtested on real history and saved.

   What is drafted here is checked by `validateDesign` before it is tested
   or saved — the same check the server makes again — so the person sees
   the reason a design cannot run before anything is sent.
--------------------------------------------------------------------------- */

export interface Draft {
  design: StrategyDesign;
  /** Where it came from, and the saved row it updates, if any. */
  source: DesignSource;
  savedId: string | null;
  result: DesignResult | null;
}

export const MARKETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TON", "PEPE"];

const TIMEFRAME_WORD: Record<DesignTimeframe, string> = { "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" };

export function TestControls({
  symbol,
  onSymbol,
  days,
  onDays,
  timeframe,
}: {
  symbol: string;
  onSymbol: (value: string) => void;
  days: number;
  onDays: (value: number) => void;
  timeframe: DesignTimeframe;
}) {
  const t = useT();
  const periods = testPeriods(timeframe);
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex min-w-0 flex-col gap-1">
        <span className="type-label text-text-muted">{t("Market (Binance spot)")}</span>
        <input className={field} list="strategy-markets" value={symbol} onChange={(event) => onSymbol(event.target.value.toUpperCase())} />
        <datalist id="strategy-markets">
          {MARKETS.map((market) => (
            <option key={market} value={market} />
          ))}
        </datalist>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="type-label text-text-muted">{t("Test over")}</span>
        <select className={field} value={periods.includes(days) ? days : defaultTestDays(timeframe)} onChange={(event) => onDays(Number(event.target.value))}>
          {periods.map((value) => (
            <option key={value} value={value}>
              {value === 90
                ? t("Last 90 days")
                : value === 180
                  ? t("Last 180 days")
                  : value === 365
                    ? t("Last year")
                    : value === 730
                      ? t("Last 2 years")
                      : t("Last 4 years")}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function Designer({ draft, onChange, feed }: { draft: Draft; onChange: (draft: Draft) => void; feed: StrategiesFeed }) {
  const t = useT();
  const authedFetch = useAuthedFetch();
  const [symbol, setSymbol] = useState(draft.result?.symbol ?? "BTC");
  const [days, setDays] = useState(draft.result?.days ?? defaultTestDays(draft.design.timeframe));
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const design = draft.design;
  const setDesign = (next: StrategyDesign) => onChange({ ...draft, design: next, result: null });
  const checked = validateDesign(design);
  const problem = "error" in checked ? checked.error : null;
  const words = "design" in checked ? describeDesign(checked.design, t) : null;
  const periods = testPeriods(design.timeframe);
  const testDays = periods.includes(days) ? days : defaultTestDays(design.timeframe);

  const test = async () => {
    if (!("design" in checked)) return;
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const response = await authedFetch("/api/strategies/backtest", { method: "POST", body: JSON.stringify({ design: checked.design, symbol, days: testDays }) });
      const body = (await response.json().catch(() => ({}))) as { result?: DesignResult; error?: string };
      if (!response.ok || body.result === undefined) setError(body.error ?? t("The backtest could not run."));
      else onChange({ ...draft, design: checked.design, result: body.result });
    } catch {
      setError(t("The network did not answer."));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!("design" in checked)) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    const payload = { design: checked.design, source: draft.source, result: draft.result };
    const sent = draft.savedId === null ? await feed.write("/api/strategies", "POST", payload) : await feed.write(`/api/strategies/${draft.savedId}`, "PATCH", payload);
    setBusy(null);
    if (sent.error !== null) return setError(sent.error);
    const saved = sent.body.saved as { id?: string } | undefined;
    onChange({ ...draft, design: checked.design, savedId: saved?.id ?? draft.savedId });
    setNotice(draft.savedId === null ? t("Saved to your strategies.") : t("Changes saved."));
  };

  return (
    <>
      <DrawerCard icon={FlaskConical} title={t("Design")}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="type-label text-text-muted">{t("Name")}</span>
              <input className={field} maxLength={DESIGN_LIMITS.maxName} value={design.name} onChange={(event) => setDesign({ ...design, name: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="type-label text-text-muted">{t("Timeframe")}</span>
              <select
                className={cn(field, "w-24")}
                value={design.timeframe}
                onChange={(event) => {
                  const timeframe = event.target.value as DesignTimeframe;
                  setDesign({ ...design, timeframe });
                  if (!testPeriods(timeframe).includes(days)) setDays(defaultTestDays(timeframe));
                }}
              >
                {DESIGN_TIMEFRAMES.map((timeframe) => (
                  <option key={timeframe} value={timeframe}>
                    {TIMEFRAME_WORD[timeframe]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-muted">{t("The idea, in your words (optional)")}</span>
            <textarea
              className={cn(field, "h-auto min-h-16 py-2 leading-relaxed")}
              maxLength={DESIGN_LIMITS.maxSummary}
              value={design.summary}
              onChange={(event) => setDesign({ ...design, summary: event.target.value })}
            />
          </label>

          <section aria-label={t("Entry")} className="flex flex-col gap-2">
            <h3 className="type-panel-title text-text-primary">{t("Buy when")}</h3>
            <GroupEditor group={design.entry} onChange={(entry) => setDesign({ ...design, entry })} />
          </section>

          <section aria-label={t("Exit")} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="type-panel-title text-text-primary">{t("Sell when")}</h3>
              <label className="type-label flex items-center gap-2 text-text-secondary">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={design.exit !== null}
                  onChange={(event) =>
                    setDesign({
                      ...design,
                      exit: event.target.checked ? { match: "any", conditions: [{ left: { kind: "rsi", period: 14 }, op: "above", right: { kind: "number", value: 70 } }] } : null,
                    })
                  }
                />
                {t("Exit conditions")}
              </label>
            </div>
            {design.exit === null ? (
              <p className="type-label text-text-muted">{t("No exit conditions: the strategy leaves by its stop, target or time limit.")}</p>
            ) : (
              <GroupEditor group={design.exit} onChange={(exit) => setDesign({ ...design, exit })} />
            )}
          </section>

          <section aria-label={t("Risk")} className="flex flex-col gap-2">
            <h3 className="type-panel-title text-text-primary">{t("Risk limits")}</h3>
            <div className="grid grid-cols-3 gap-2 @max-[380px]:grid-cols-1">
              <NumberField label={t("Stop-loss")} suffix="%" value={design.risk.stopLossPct} onChange={(value) => setDesign({ ...design, risk: { ...design.risk, stopLossPct: value } })} />
              <NumberField label={t("Take-profit")} suffix="%" value={design.risk.takeProfitPct} onChange={(value) => setDesign({ ...design, risk: { ...design.risk, takeProfitPct: value } })} />
              <NumberField label={t("Time limit, bars")} value={design.risk.maxBarsHeld} onChange={(value) => setDesign({ ...design, risk: { ...design.risk, maxBarsHeld: value } })} />
            </div>
            <p className="type-label text-text-muted">{t("Leave a limit empty to go without it. Stops and targets are measured from the fill and checked inside every bar.")}</p>
          </section>

          {words !== null ? (
            <div className="flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
              <span className="type-eyebrow text-text-muted">{t("The rules, in words")}</span>
              <p className="type-body-sm text-text-primary">{words.entry}</p>
              <p className="type-body-sm text-text-primary">{words.exit}</p>
            </div>
          ) : (
            <Problem text={problem} />
          )}
        </div>
      </DrawerCard>

      <DrawerCard icon={Play} title={t("Backtest")}>
        <div className="flex flex-col gap-3">
          <TestControls symbol={symbol} onSymbol={setSymbol} days={testDays} onDays={setDays} timeframe={design.timeframe} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" disabled={busy !== null || problem !== null || !feed.signedIn} onClick={() => void test()}>
              <Play size={13} aria-hidden /> {busy === "test" ? t("Testing on real history…") : t("Run backtest")}
            </Button>
            <Button size="sm" variant="quiet" disabled={busy !== null || problem !== null || !feed.signedIn} onClick={() => void save()}>
              <Save size={13} aria-hidden /> {busy === "save" ? t("Saving") : draft.savedId === null ? t("Save") : t("Save changes")}
            </Button>
          </div>
          {!feed.signedIn && <p className="type-label text-text-muted">{t("Sign in to backtest and save strategies.")}</p>}
          <Problem text={error} />
          {notice !== null && <p className="type-label text-positive">{notice}</p>}
          {draft.result !== null && <ResultCard result={draft.result} />}
        </div>
      </DrawerCard>
    </>
  );
}
