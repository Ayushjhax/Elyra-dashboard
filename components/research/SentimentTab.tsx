"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Problem, Timestamp } from "@/components/research/shared";
import { formatCompactUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { leaning, type Sentiment } from "@/lib/research/sentimentMath";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Market sentiment: the Fear & Greed Index, how Hyperliquid's traders are
   positioned, and how broad the day's move is — each shown as it is, with
   no blended score (lib/research/sentimentMath.ts says why).
--------------------------------------------------------------------------- */

/* How the crowd leans, as a headline: sentence case, translated here. */
const LEANING_LABEL: Record<ReturnType<typeof leaning>, string> = {
  "crowded long": msg("Crowded long"),
  "leaning long": msg("Leaning long"),
  balanced: msg("Balanced"),
  "leaning short": msg("Leaning short"),
  "crowded short": msg("Crowded short"),
};

/* alternative.me's five classes, translated as dynamic keys; anything else shows as sent. */
const FEAR_GREED_CLASSES = new Set(["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"]);

function useSentiment(active: boolean) {
  const [state, setState] = useState<{ data: Sentiment | null; loading: boolean; failed: boolean }>({ data: null, loading: true, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/research/sentiment")
      .then(async (response) => (await response.json()) as Sentiment)
      .then((data) => !cancelled && setState({ data, loading: false, failed: false }))
      .catch(() => !cancelled && setState((current) => ({ ...current, loading: false, failed: true })));
    return () => {
      cancelled = true;
    };
  }, [active, attempt]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true }));
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, reload };
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-border-subtle bg-surface-raised p-3">
      <p className="type-label text-text-muted">{label}</p>
      <p className={cn("type-h1 mt-1 tabular-nums text-text-primary", tone)}>{value}</p>
      {sub !== undefined && <p className="type-label mt-0.5 text-text-muted">{sub}</p>}
    </div>
  );
}

export function SentimentTab({ active }: { active: boolean }) {
  const t = useT();
  const { data, loading, failed, reload } = useSentiment(active);
  const fear = data?.fearGreed ?? null;
  const position = data?.positioning ?? null;
  const pct = (value: number) => `${value.toFixed(0)}%`;
  const signed = (value: number | null, digits = 1) => (value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`);

  return (
    <div className="@container flex flex-col gap-4">
      <div className="r-toolbar">
        <p className="type-body-sm min-w-0 flex-1 text-text-secondary">
          {t("What traders are doing, side by side: the Fear & Greed Index, how Hyperliquid's perps are positioned, and how broad the day's move is.")}
        </p>
        <button type="button" className="r-button" onClick={reload} disabled={loading}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden className={cn(loading && "motion-safe:animate-spin")} />
          {t("Refresh")}
        </button>
      </div>

      {failed && <Problem retry={reload}>{t("Sentiment could not be read just now.")}</Problem>}
      {data?.notes.map((note) => (
        <p key={note} className="type-label text-text-muted">
          {t(note)}
        </p>
      ))}

      <div className="grid grid-cols-1 gap-3 @[40rem]:grid-cols-3">
        {fear !== null && (
          <Stat
            label={t("Fear & Greed Index")}
            value={`${fear.value} · ${(FEAR_GREED_CLASSES.has(fear.classification) ? t(fear.classification) : fear.classification)}`}
            sub={t("Yesterday {yesterday} · a week ago {week}", { yesterday: fear.yesterday ?? "—", week: fear.weekAgo ?? "—" })}
            tone={fear.value <= 25 ? "text-negative" : fear.value >= 75 ? "text-positive" : undefined}
          />
        )}
        {position !== null && (
          <>
            <Stat
              label={t("Positioning")}
              value={t(LEANING_LABEL[leaning(position)])}
              sub={t("{pct} of {markets} liquid perps pay positive funding · OI-weighted {apr} a year", {
                pct: pct(position.positiveFundingPct),
                markets: position.markets,
                apr: signed(position.weightedFundingApr),
              })}
            />
            <Stat
              label={t("Breadth")}
              value={t("{pct} up", { pct: pct(position.upPct) })}
              sub={t("Median move {median} on the day · {oi} open interest", { median: signed(position.medianChangePct, 2), oi: formatCompactUsd(position.totalOpenInterestUsd) })}
              tone={position.upPct >= 60 ? "text-positive" : position.upPct <= 40 ? "text-negative" : undefined}
            />
          </>
        )}
      </div>

      {position !== null && position.majors.length > 0 && (
        <section aria-labelledby="sentiment-majors">
          <h2 id="sentiment-majors" className="type-h2 text-text-primary">
            {t("The majors")}
          </h2>
          <ul className="mt-2 grid grid-cols-1 gap-2 @[40rem]:grid-cols-3">
            {position.majors.map((major) => (
              <li key={major.symbol} className="rounded-card border border-border-subtle p-3">
                <p className="type-data text-text-primary">{major.symbol}</p>
                <p className="type-label mt-1 text-text-secondary">
                  {t("{change} on the day · funding {funding} a year", { change: signed(major.change24hPct, 2), funding: signed(major.fundingAprPct) })}
                </p>
                <p className="type-label text-text-muted">
                  {t("{oi} open interest", { oi: major.openInterestUsd === null ? "—" : formatCompactUsd(major.openInterestUsd) })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="type-label text-text-muted">
        {t("Positive funding means longs pay shorts: the crowd leans long, and a crowded side is the one squeezed when the price turns. Readings, not forecasts.")}
      </p>
      {data !== null && <Timestamp at={data.asOf} />}
    </div>
  );
}
