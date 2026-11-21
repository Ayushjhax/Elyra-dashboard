"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Flame, Radio, Sprout, Sunrise } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { briefingDate, briefingText, itemText } from "@/lib/briefing/format";
import type { BriefingExtras, BriefingItem, BriefingResponse, BriefingSignal } from "@/lib/briefing/types";
import { useCopy } from "@/lib/clipboard";
import { formatCompactUsd, formatPriceUsd } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/locales";
import type { Translator } from "@/lib/i18n/translate";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Daily Briefing: ten developments, numbered, each with its token, what
   happened and the source to read it at; then "And more" — the day's
   movers, stablecoin yields and signals as they stood at publication.

   Numbers are drawn in the brand's figures. The keycap emoji of a posted
   digest are in the copied text only (lib/briefing/format.ts). A ticker the
   chart can show opens on it.
--------------------------------------------------------------------------- */

interface State {
  data: BriefingResponse | null;
  loading: boolean;
  failed: boolean;
}

function useBriefing(day: string | null): State & { reload: () => void } {
  const [state, setState] = useState<State>({ data: null, loading: true, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(day === null ? "/api/briefing" : `/api/briefing?day=${day}`)
      .then(async (response) => (await response.json()) as BriefingResponse)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [day, attempt]);
  return { ...state, reload: useCallback(() => setAttempt((value) => value + 1), []) };
}

/** A signal's code-written title in the reader's language. */
function signalLine(signal: BriefingSignal, t: Translator): string {
  const move = /^(\S+) (up|down) ([\d.]+)% over 24h$/.exec(signal.title);
  if (move) return move[2] === "up" ? t("{symbol} up {pct}% over 24h", { symbol: move[1], pct: move[3] }) : t("{symbol} down {pct}% over 24h", { symbol: move[1], pct: move[3] });
  const spread = /^(\S+) prices differ by ([\d.]+) bps across venues$/.exec(signal.title);
  if (spread) return t("{symbol} prices differ by {bps} bps across venues", { symbol: spread[1], bps: spread[2] });
  const funding = /^(\S+) funding at (-?[\d.]+)% annualised$/.exec(signal.title);
  if (funding) return t("{symbol} funding at {pct}% annualised", { symbol: funding[1], pct: funding[2] });
  return signal.title;
}

function ItemRow({ item, index }: { item: BriefingItem; index: number }) {
  const t = useT();
  const locale = useLocale();
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const { headline, body } = itemText(item, locale);

  return (
    <li className="flex gap-3 border-b border-border-subtle py-3.5 first:pt-1 last:border-b-0 last:pb-1">
      <span
        aria-hidden
        className="type-data grid size-7 shrink-0 place-items-center rounded-control border border-border-subtle bg-surface-raised tabular-nums text-accent"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="type-body font-medium text-text-primary">
          {item.ticker !== null && item.assetId !== null && (
            <>
              <button
                type="button"
                onClick={() => setSelectedAssetId(item.assetId as number)}
                title={t("Show {symbol} on the chart", { symbol: item.ticker })}
                className="type-data rounded-chip text-accent underline-offset-2 hover:underline"
              >
                ${item.ticker}
              </button>
              {locale === "zh-CN" ? "：" : ": "}
            </>
          )}
          {headline}
        </h3>
        <p className="type-body-sm mt-1 text-text-secondary">{body}</p>
        <p className="type-label mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
          {item.sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-text-primary"
            >
              {source.name}
              <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
              <span className="sr-only">{t("(opens in a new tab)")}</span>
            </a>
          ))}
          {item.writtenBy === "source" && <span>{t("In the source's own words")}</span>}
        </p>
      </div>
    </li>
  );
}

function Mover({ symbol, changePct, priceUsd }: { symbol: string; changePct: number; priceUsd: number }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1">
      <span className="type-data text-text-primary">{symbol}</span>
      <span className="type-data-sm text-text-muted">{formatPriceUsd(priceUsd)}</span>
      <span className={cn("type-data ml-auto tabular-nums", changePct >= 0 ? "text-positive" : "text-negative")}>
        {changePct >= 0 ? "+" : ""}
        {changePct.toFixed(2)}%
      </span>
    </li>
  );
}

function AndMore({ extras }: { extras: BriefingExtras }) {
  const t = useT();
  const empty = extras.gainers.length + extras.losers.length + extras.yields.length + extras.signals.length === 0;
  if (empty) return null;

  return (
    <DrawerCard icon={Sunrise} title={t("And more")}>
      <div className="grid grid-cols-1 gap-4 @[44rem]:grid-cols-3">
        <section aria-labelledby="briefing-movers" className="min-w-0">
          <h3 id="briefing-movers" className="type-eyebrow flex items-center gap-1.5 text-text-muted">
            <Flame size={12} strokeWidth={1.5} aria-hidden />
            {t("Trending token moves")}
          </h3>
          {extras.gainers.length + extras.losers.length === 0 ? (
            <p className="type-body-sm mt-2 text-text-muted">{t("Hyperliquid did not answer at publication.")}</p>
          ) : (
            <ul className="mt-1.5 flex flex-col">
              {[...extras.gainers, ...extras.losers].map((mover) => (
                <Mover key={mover.symbol} {...mover} />
              ))}
            </ul>
          )}
          <p className="type-label mt-1 text-text-muted">{t("Hyperliquid perps over $1M of volume, past 24 hours.")}</p>
        </section>

        <section aria-labelledby="briefing-yields" className="min-w-0">
          <h3 id="briefing-yields" className="type-eyebrow flex items-center gap-1.5 text-text-muted">
            <Sprout size={12} strokeWidth={1.5} aria-hidden />
            {t("On-chain opportunities")}
          </h3>
          {extras.yields.length === 0 ? (
            <p className="type-body-sm mt-2 text-text-muted">{t("Kamino did not answer at publication.")}</p>
          ) : (
            <ul className="mt-1.5 flex flex-col">
              {extras.yields.map((vault) => (
                <li key={vault.name} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="min-w-0 truncate">
                    <span className="type-body-sm text-text-primary">{vault.name}</span>
                    {vault.tvlUsd !== null && (
                      <span className="type-label text-text-muted"> · {t("{tvl} deposited", { tvl: formatCompactUsd(vault.tvlUsd) })}</span>
                    )}
                  </span>
                  <span className="type-data shrink-0 tabular-nums text-positive">{t("{apy}% APY", { apy: vault.apyPct.toFixed(2) })}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="type-label mt-1 text-text-muted">{t("Kamino stablecoin vaults over $1M. Rates move; they are not a promise.")}</p>
        </section>

        <section aria-labelledby="briefing-signals" className="min-w-0">
          <h3 id="briefing-signals" className="type-eyebrow flex items-center gap-1.5 text-text-muted">
            <Radio size={12} strokeWidth={1.5} aria-hidden />
            {t("Market signals")}
          </h3>
          {extras.signals.length === 0 ? (
            <p className="type-body-sm mt-2 text-text-muted">{t("Nothing on BTC, ETH or SOL crossed a threshold.")}</p>
          ) : (
            <ul className="mt-1.5 flex flex-col">
              {extras.signals.map((signal) => (
                <li key={`${signal.symbol}-${signal.title}`} className="flex items-baseline justify-between gap-3 py-1">
                  <span
                    className={cn(
                      "type-body-sm min-w-0",
                      signal.direction === "positive" ? "text-positive" : signal.direction === "negative" ? "text-negative" : "text-text-primary",
                    )}
                  >
                    {signalLine(signal, t)}
                  </span>
                  <span className="type-label shrink-0 text-text-muted">{t("{strength} strength", { strength: t(signal.strength) })}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="type-label mt-1 text-text-muted">{t("Observations, not recommendations.")}</p>
        </section>
      </div>
    </DrawerCard>
  );
}

export function BriefingView() {
  const t = useT();
  const locale = useLocale();
  const [day, setDay] = useState<string | null>(null);
  const { data, loading, failed, reload } = useBriefing(day);
  const { state: copied, copy } = useCopy();

  const briefing = data?.briefing ?? null;
  const days = data?.days ?? [];
  const at = briefing === null ? -1 : days.indexOf(briefing.day);
  const older = at >= 0 ? (days[at + 1] ?? null) : null;
  const newer = at > 0 ? days[at - 1] : null;

  if (loading && data === null) {
    return (
      <DrawerCard icon={Sunrise} title={t("Elyra Daily Briefing")}>
        <SkeletonRows rows={6} />
      </DrawerCard>
    );
  }

  if (failed || (data !== null && data.error !== null && briefing === null)) {
    return (
      <EmptyState
        icon={Sunrise}
        title={t("The briefing could not be read")}
        body={data?.error ? t(data.error) : t("The network did not answer. Try again.")}
        action={
          <Button size="sm" onClick={reload}>
            {t("Try again")}
          </Button>
        }
      />
    );
  }

  if (briefing === null) {
    return (
      <EmptyState
        icon={Sunrise}
        title={t("No briefing yet")}
        body={t("The Daily Briefing is published every day at 08:00 Beijing time (00:00 UTC): ten developments from the last 24 hours, each with its source.")}
      />
    );
  }

  const published = new Date(briefing.publishedAt).toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  return (
    <>
      <DrawerCard
        icon={Sunrise}
        title={t("Elyra Daily Briefing")}
        right={
          <Button
            size="sm"
            onClick={() => void copy(briefingText(briefing, locale, `${window.location.origin}/briefing?day=${briefing.day}`))}
            aria-label={t("Copy the briefing as text")}
          >
            {copied === "copied" ? <Check size={14} strokeWidth={1.5} aria-hidden /> : <Copy size={14} strokeWidth={1.5} aria-hidden />}
            {copied === "copied" ? t("Copied") : copied === "failed" ? t("Couldn't copy") : t("Copy")}
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" disabled={older === null} onClick={() => setDay(older)} aria-label={t("Older briefing")}>
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="type-h2 text-text-primary">{briefingDate(briefing.day, locale)}</p>
            <p className="type-label text-text-muted">{t("Published {time} UTC · {count} developments", { time: published, count: briefing.items.length })}</p>
          </div>
          <Button size="icon" variant="ghost" disabled={newer === null} onClick={() => setDay(newer)} aria-label={t("Newer briefing")}>
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
          </Button>
        </div>

        <ol aria-label={t("Elyra Daily Briefing")} className="mt-2 flex list-none flex-col">
          {briefing.items.map((item, index) => (
            <ItemRow key={`${briefing.day}-${index}`} item={item} index={index} />
          ))}
        </ol>
      </DrawerCard>

      <AndMore extras={briefing.extras} />

      <p className="type-label px-1 text-text-muted">
        {t("Written by Elyra's AI from the sources linked on each item and checked against them; where a line did not hold, the source's own words are shown. Not investment advice.")}
      </p>
    </>
  );
}
