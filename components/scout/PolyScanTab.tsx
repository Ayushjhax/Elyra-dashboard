"use client";

import { useState } from "react";
import { Check, Plus, RefreshCw, Scale, TrendingUp, Users } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/scout/parts";
import { formatCompactUsd, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { useBasketDraft } from "@/lib/poly/basketDraft";
import type { LegChoice } from "@/lib/poly/basketMath";
import { POLY_CATEGORIES, type PolyCategory, type PolyScanResponse } from "@/lib/poly/types";
import { useScoutFeed } from "@/lib/scout/useScout";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Poly scan: Polymarket read three ways — what its most profitable wallets
   hold, what moved most today, and one-winner events whose books do not
   add up to $1. Any outcome can be added to a paper basket.
--------------------------------------------------------------------------- */

const CATEGORY_LABEL: Record<PolyCategory, string> = {
  overall: msg("All"),
  politics: msg("Politics"),
  crypto: msg("Crypto"),
  sports: msg("Sports"),
};

const cents = (price: number) => `${(price * 100).toFixed(price < 0.1 || price > 0.9 ? 1 : 0)}¢`;
const marketUrl = (eventSlug: string | null, slug: string | null) =>
  eventSlug !== null ? `https://polymarket.com/event/${eventSlug}` : slug !== null ? `https://polymarket.com/market/${slug}` : null;

function AddButton({ leg }: { leg: LegChoice }) {
  const t = useT();
  const legs = useBasketDraft((state) => state.legs);
  const toggle = useBasketDraft((state) => state.toggle);
  const added = legs.some((entry) => entry.tokenId === leg.tokenId);
  return (
    <Button size="xs" variant={added ? "accent" : "quiet"} onClick={() => toggle(leg)} aria-pressed={added} aria-label={added ? t("Remove from basket") : t("Add to basket")}>
      {added ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
      {added ? t("In basket") : t("Basket")}
    </Button>
  );
}

export function PolyScanTab({ onOpenBaskets }: { onOpenBaskets: () => void }) {
  const t = useT();
  const now = useMinute();
  const [category, setCategory] = useState<PolyCategory>("overall");
  const feed = useScoutFeed<PolyScanResponse>(`/api/poly/scan?category=${category}`);
  const scan = feed.data;
  const draft = useBasketDraft((state) => state.legs);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <label className="flex items-center gap-2">
          <span className="type-label text-text-muted">{t("Leaderboard")}</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as PolyCategory)}
            className="type-label h-8 rounded-control border border-border-strong bg-surface-base px-2 text-text-primary"
          >
            {POLY_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {t(CATEGORY_LABEL[id])}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          {draft.length > 0 && (
            <Button size="sm" variant="accent" onClick={onOpenBaskets}>
              {t("Basket ({count})", { count: draft.length })}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void feed.refresh()} aria-label={t("Refresh")}>
            <RefreshCw size={13} aria-hidden /> {t("Refresh")}
          </Button>
        </div>
      </div>

      {feed.error !== null && <Notice tone="negative">{feed.error}</Notice>}
      {(scan?.errors ?? []).map((error) => (
        <Notice key={error} tone="caution">
          {error}
        </Notice>
      ))}

      <DrawerCard icon={Users} title={t("Polymarket smart money")}>
        <div className="flex flex-col gap-2">
          <p className="type-label text-text-secondary">
            {t("Open positions of Polymarket's most profitable wallets over 30 days, from its own leaderboard. An outcome shows when at least three of them hold it and two thirds of those in the market agree.")}
          </p>
          {scan !== null && scan.wallets.asked > 0 && (
            <p className="type-label text-text-muted">
              {t("{read} of {asked} wallets read", { read: scan.wallets.read, asked: scan.wallets.asked })}
              {now !== null && ` · ${formatRelativeTime(scan.at, now, t.locale)}`}
            </p>
          )}
          {feed.loading && scan === null ? (
            <SkeletonRows rows={5} />
          ) : scan !== null && scan.read?.smartMoney === false ? (
            <p className="type-body-sm text-text-secondary">{t("Could not be read just now.")}</p>
          ) : (scan?.smartMoney ?? []).length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("The top wallets do not agree on any open outcome right now.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {scan?.smartMoney.map((entry) => {
                const url = marketUrl(entry.eventSlug, entry.slug);
                return (
                  <li key={entry.tokenId} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      {url !== null ? (
                        <a href={url} target="_blank" rel="noreferrer noopener" className="type-body-sm min-w-0 text-text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:py-2">
                          {entry.title}
                        </a>
                      ) : (
                        <span className="type-body-sm min-w-0 text-text-primary">{entry.title}</span>
                      )}
                      <AddButton
                        leg={{ conditionId: entry.conditionId, tokenId: entry.tokenId, outcome: entry.outcome, question: entry.title, slug: entry.slug, eventSlug: entry.eventSlug }}
                      />
                    </div>
                    <span className="type-label text-text-secondary">
                      <span className="text-accent">{entry.outcome}</span>
                      {" · "}
                      {t("{wallets} top wallets, {against} on the other side · {value} held · entered near {entry}, now {price}", {
                        wallets: entry.wallets,
                        against: entry.against,
                        value: formatCompactUsd(entry.valueUsd),
                        entry: cents(entry.avgEntry),
                        price: cents(entry.price),
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DrawerCard>

      <DrawerCard icon={TrendingUp} title={t("Biggest moves today")}>
        {feed.loading && scan === null ? (
          <SkeletonRows rows={4} />
        ) : scan !== null && scan.read?.markets === false ? (
          <p className="type-body-sm text-text-secondary">{t("Could not be read just now.")}</p>
        ) : (scan?.movers ?? []).length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("No liquid market moved four points or more today.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {scan?.movers.map(({ market, changePts }) => {
              const url = marketUrl(market.eventSlug, market.slug);
              const outcome = market.outcomes[0] ?? "Yes";
              return (
                <li key={market.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    {url !== null ? (
                      <a href={url} target="_blank" rel="noreferrer noopener" className="type-body-sm min-w-0 text-text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:py-2">
                        {market.question}
                      </a>
                    ) : (
                      <span className="type-body-sm min-w-0 text-text-primary">{market.question}</span>
                    )}
                    {market.tokenIds[0] !== undefined && (
                      <AddButton leg={{ conditionId: market.conditionId, tokenId: market.tokenIds[0], outcome, question: market.question, slug: market.slug, eventSlug: market.eventSlug }} />
                    )}
                  </div>
                  <span className="type-label text-text-secondary">
                    {outcome}{" "}
                    <span className={cn("tabular-nums", changePts > 0 ? "text-positive" : "text-negative")}>
                      {changePts > 0 ? "+" : ""}
                      {changePts.toFixed(1)}
                    </span>{" "}
                    {t("points · now {price} · {volume} traded today", {
                      price: Number.isFinite(market.prices[0]) ? cents(market.prices[0]) : "—",
                      volume: formatCompactUsd(market.volume24h),
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DrawerCard>

      <DrawerCard icon={Scale} title={t("Books that do not add up")}>
        <div className="flex flex-col gap-2">
          <p className="type-label text-text-secondary">
            {t("In an event with exactly one winner, buying YES on every outcome should cost about $1. Under $1 at the asks, or over $1 at the bids, is a gap. Before fees and before depth: the best quote may hold only a few shares.")}
          </p>
          {feed.loading && scan === null ? (
            <SkeletonRows rows={3} />
          ) : scan !== null && scan.read?.events === false ? (
            <p className="type-body-sm text-text-secondary">{t("Could not be read just now.")}</p>
          ) : (scan?.bookSums ?? []).length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("Every busy one-winner event adds up to within half a point.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {scan?.bookSums.map((sum) => (
                <li key={sum.eventSlug} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                  <a href={`https://polymarket.com/event/${sum.eventSlug}`} target="_blank" rel="noreferrer noopener" className="type-body-sm text-text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:py-2">
                    {sum.title}
                  </a>
                  <span className="type-label text-text-secondary">
                    {t("{outcomes} outcomes · asks sum to {ask} · bids sum to {bid}", { outcomes: sum.outcomes, ask: formatPriceUsd(sum.askSum), bid: formatPriceUsd(sum.bidSum) })}
                  </span>
                  <span className="type-label text-accent">
                    {sum.buyGapPts > 0
                      ? t("Every outcome costs {gap} points under $1.", { gap: sum.buyGapPts.toFixed(1) })
                      : t("Every outcome sells for {gap} points over $1.", { gap: sum.sellGapPts.toFixed(1) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerCard>

      <p className="type-label px-1 text-text-muted">
        {t("Prices are Polymarket's; nothing here is a forecast. Elyra places no Polymarket orders — open a market on Polymarket to trade it, where its own terms and regional limits apply.")}
      </p>
    </>
  );
}
