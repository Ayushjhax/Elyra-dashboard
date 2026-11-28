"use client";

import { useId, useRef, useState } from "react";
import { PencilRuler, Save, Sparkles } from "lucide-react";
import { field, Problem } from "@/components/strategies/editors";
import { MarketField, PeriodField, RuleWords } from "@/components/strategies/Designer";
import { ResultLine } from "@/components/strategies/ResultCard";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";
import { DESIGN_TIMEFRAMES, defaultTestDays, testPeriods, type DesignTimeframe, type StrategyDesign } from "@/lib/strategies/spec";
import type { DesignResult, GeneratedStrategy, GenerateResponse } from "@/lib/strategies/types";
import type { StrategiesFeed } from "@/lib/strategies/useStrategies";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The AI lab: the person describes an idea (or none), Elyra's AI proposes
   three strategies in the designer's vocabulary, and code checks and
   backtests each one before it is shown (lib/strategies/generate.ts).

   What the AI wrote is labelled as its own and kept only when it stays on
   the strategy's own figures; the rules are put in words by code, and every
   figure shown is from a completed backtest — a proposal whose test did not
   finish says so and shows none. The form stays as it was through a
   failure, and one request runs at a time.
--------------------------------------------------------------------------- */

const MAX_IDEA = 600;

function Proposal({ entry, onOpen, feed }: { entry: GeneratedStrategy; onOpen: (design: StrategyDesign, result: DesignResult | null) => void; feed: StrategiesFeed }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    const sent = await feed.write("/api/strategies", "POST", { design: entry.design, source: "ai", result: entry.result });
    setSaving(false);
    if (sent.error !== null) setError(sent.error);
    else setSaved(true);
  };
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
      <div className="flex flex-col gap-0.5">
        <span className="type-label text-text-muted">{entry.design.timeframe}</span>
        <p className="type-h2 text-text-primary">{entry.design.name}</p>
      </div>
      {entry.aiSummary !== null && (
        <p className="agent-rail type-label rounded-control rounded-l-none bg-surface-raised px-2.5 py-1.5 text-text-secondary">
          <span className="text-text-muted">{t("Elyra's AI: ")}</span>
          {entry.aiSummary}
        </p>
      )}
      <RuleWords design={entry.design} />
      {entry.result !== null ? <ResultLine result={entry.result} /> : <p className="type-label text-caution">{entry.error ?? t("It could not be backtested.")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="quiet" onClick={() => onOpen(entry.design, entry.result)}>
          <PencilRuler size={13} aria-hidden /> {t("Open in the designer")}
        </Button>
        <Button size="sm" variant="ghost" disabled={saved || saving} onClick={() => void save()}>
          <Save size={13} aria-hidden /> {saved ? t("Saved") : saving ? t("Saving") : t("Save")}
        </Button>
      </div>
      <Problem text={error} />
    </li>
  );
}

export function AiLab({ feed, onOpen }: { feed: StrategiesFeed; onOpen: (design: StrategyDesign, result: DesignResult | null) => void }) {
  const t = useT();
  const id = useId();
  const authedFetch = useAuthedFetch();
  const [idea, setIdea] = useState("");
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState<DesignTimeframe>("4h");
  const [days, setDays] = useState(defaultTestDays("4h"));
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<GenerateResponse | null>(null);

  const generate = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await authedFetch("/api/strategies/generate", { method: "POST", body: JSON.stringify({ idea, symbol, timeframe, days }) });
      const body = (await response.json().catch(() => ({}))) as GenerateResponse & { error?: string };
      if (!response.ok) setError(body.error ?? t("Elyra's AI could not propose strategies just now."));
      else setAnswer(body);
    } catch {
      setError(t("The network did not answer."));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <DrawerCard icon={Sparkles} title={t("AI lab")}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <p className="type-body-sm text-text-secondary">
          {t("Describe an idea. Elyra's AI proposes three strategies; Elyra checks their rules and backtests each one on historical data before you see it. The AI never sees or claims a result.")}
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-idea`} className="type-label text-text-secondary">
            {t("Your idea (optional)")}
          </label>
          <textarea
            id={`${id}-idea`}
            className={cn(field, "h-auto min-h-24 resize-y py-2 leading-relaxed")}
            maxLength={MAX_IDEA}
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={t("For example: buy strength after a quiet week, and hold for up to five days.")}
          />
        </div>
        <MarketField symbol={symbol} onSymbol={setSymbol} />
        <div className="grid grid-cols-2 gap-3 @max-[340px]:grid-cols-1">
          <PeriodField days={days} onDays={setDays} timeframe={timeframe} />
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-timeframe`} className="type-label text-text-secondary">
              {t("Timeframe")}
            </label>
            <select
              id={`${id}-timeframe`}
              className={field}
              value={timeframe}
              onChange={(event) => {
                const next = event.target.value as DesignTimeframe;
                setTimeframe(next);
                if (!testPeriods(next).includes(days)) setDays(defaultTestDays(next));
              }}
            >
              {DESIGN_TIMEFRAMES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit" variant="accent" className="w-full disabled:bg-surface-hover" disabled={busy || !feed.signedIn} aria-busy={busy || undefined}>
          <Sparkles size={14} aria-hidden /> {busy ? t("Proposing, then backtesting each one…") : t("Propose strategies")}
        </Button>
        <p aria-live="polite" className={cn("type-label text-text-muted", !busy && "sr-only")}>
          {busy ? t("This takes up to a minute: three proposals, each checked and tested on real history.") : ""}
        </p>
        {!feed.signedIn && <p className="type-label text-text-muted">{t("Sign in to use the AI lab. Each run counts as one question to Elyra.")}</p>}
        <Problem text={error} />
      </form>

      {answer !== null && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4">
          {answer.strategies.length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("No proposal passed Elyra's checks this time. Try again, or put the idea differently.")}</p>
          ) : (
            <ul aria-label={t("Proposed strategies")} className="flex flex-col gap-3">
              {answer.strategies.map((entry, index) => (
                <Proposal key={`${entry.design.name}-${index}`} entry={entry} onOpen={onOpen} feed={feed} />
              ))}
            </ul>
          )}
          {answer.rejected > 0 && (
            <p className="type-label text-text-muted">
              {answer.rejected === 1 ? t("One proposal broke the rules and was dropped.") : t("{count} proposals broke the rules and were dropped.", { count: answer.rejected })}
            </p>
          )}
        </div>
      )}
    </DrawerCard>
  );
}
