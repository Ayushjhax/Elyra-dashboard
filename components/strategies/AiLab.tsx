"use client";

import { useState } from "react";
import { PencilRuler, Save, Sparkles } from "lucide-react";
import { field, Problem } from "@/components/strategies/editors";
import { TestControls } from "@/components/strategies/Designer";
import { ResultLine } from "@/components/strategies/ResultCard";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";
import { DESIGN_TIMEFRAMES, defaultTestDays, describeDesign, type DesignTimeframe, type StrategyDesign } from "@/lib/strategies/spec";
import type { DesignResult, GeneratedStrategy, GenerateResponse } from "@/lib/strategies/types";
import type { StrategiesFeed } from "@/lib/strategies/useStrategies";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The AI lab: the person describes an idea, Elyra's AI proposes three
   strategies in the designer's vocabulary, and code checks and backtests
   each one before it is shown (lib/strategies/generate.ts).

   What the AI wrote is labelled as its own and kept only when it stays on
   the strategy's own figures; the rules are described by code, and every
   result is the backtest engine's.
--------------------------------------------------------------------------- */

const MAX_IDEA = 600;

function Proposal({ entry, onOpen, feed }: { entry: GeneratedStrategy; onOpen: (design: StrategyDesign, result: DesignResult | null) => void; feed: StrategiesFeed }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = describeDesign(entry.design, t);
  const save = async () => {
    const sent = await feed.write("/api/strategies", "POST", { design: entry.design, source: "ai", result: entry.result });
    if (sent.error !== null) setError(sent.error);
    else setSaved(true);
  };
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
      <p className="type-body-sm font-medium text-text-primary">{entry.design.name}</p>
      {entry.aiSummary !== null && (
        <p className="agent-rail type-label rounded-control rounded-l-none bg-surface-base px-2.5 py-1.5 text-text-secondary">
          <span className="text-text-muted">{t("Elyra's AI: ")}</span>
          {entry.aiSummary}
        </p>
      )}
      <p className="type-label text-text-secondary">{words.entry}</p>
      <p className="type-label text-text-secondary">{words.exit}</p>
      {entry.result !== null ? <ResultLine result={entry.result} /> : <p className="type-label text-caution">{entry.error ?? t("It could not be backtested.")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="quiet" onClick={() => onOpen(entry.design, entry.result)}>
          <PencilRuler size={12} aria-hidden /> {t("Open in the designer")}
        </Button>
        <Button size="xs" variant="ghost" disabled={saved} onClick={() => void save()}>
          <Save size={12} aria-hidden /> {saved ? t("Saved") : t("Save")}
        </Button>
      </div>
      <Problem text={error} />
    </li>
  );
}

export function AiLab({ feed, onOpen }: { feed: StrategiesFeed; onOpen: (design: StrategyDesign, result: DesignResult | null) => void }) {
  const t = useT();
  const authedFetch = useAuthedFetch();
  const [idea, setIdea] = useState("");
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState<DesignTimeframe>("4h");
  const [days, setDays] = useState(defaultTestDays("4h"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<GenerateResponse | null>(null);

  const generate = async () => {
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
      setBusy(false);
    }
  };

  return (
    <DrawerCard icon={Sparkles} title={t("AI lab")}>
      <div className="flex flex-col gap-3">
        <p className="type-body-sm text-text-secondary">
          {t("Describe what you want — a market behaviour, a style, a risk you will accept — and Elyra's AI proposes three strategies. Elyra checks each against the rules and backtests it before you see it; the AI never sees or claims a result.")}
        </p>
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("Your idea (optional)")}</span>
          <textarea
            className={cn(field, "h-auto min-h-20 py-2 leading-relaxed")}
            maxLength={MAX_IDEA}
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={t("For example: buy strength after a quiet week, never hold more than five days, and keep losses small.")}
          />
        </label>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <TestControls symbol={symbol} onSymbol={setSymbol} days={days} onDays={setDays} timeframe={timeframe} />
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-muted">{t("Timeframe")}</span>
            <select
              className={cn(field, "w-20")}
              value={timeframe}
              onChange={(event) => {
                const next = event.target.value as DesignTimeframe;
                setTimeframe(next);
                setDays(defaultTestDays(next));
              }}
            >
              {DESIGN_TIMEFRAMES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <Button size="sm" variant="accent" disabled={busy || !feed.signedIn} onClick={() => void generate()}>
            <Sparkles size={13} aria-hidden /> {busy ? t("Proposing, then backtesting each one…") : t("Propose strategies")}
          </Button>
        </div>
        {!feed.signedIn && <p className="type-label text-text-muted">{t("Sign in to use the AI lab. Each run counts as one question to Elyra.")}</p>}
        <Problem text={error} />
        {answer !== null && (
          <>
            {answer.strategies.length === 0 ? (
              <p className="type-body-sm text-text-secondary">{t("No proposal passed Elyra's checks this time. Try again, or put the idea differently.")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
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
          </>
        )}
      </div>
    </DrawerCard>
  );
}
