"use client";

import { useState } from "react";
import { PackagePlus, ShoppingBasket, Trash2, X } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { Notice, SignedPct } from "@/components/scout/parts";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { useBasketDraft } from "@/lib/poly/basketDraft";
import { BASKET_LIMITS } from "@/lib/poly/basketMath";
import type { BasketsResponse, BasketView } from "@/lib/poly/types";
import { useScoutFeed, type ScoutFeed } from "@/lib/scout/useScout";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Poly baskets: Polymarket outcomes held together on paper. Each leg is
   bought at the order book walked for its share of the stake and valued at
   what its shares would sell for now; a resolved leg pays $1 a share or
   nothing. Elyra places no Polymarket orders.
--------------------------------------------------------------------------- */

const usd = (value: number | null) => (value === null ? "—" : formatUsd(value));

function Builder({ feed, onScan }: { feed: ScoutFeed<BasketsResponse>; onScan: () => void }) {
  const t = useT();
  const legs = useBasketDraft((state) => state.legs);
  const remove = useBasketDraft((state) => state.remove);
  const clear = useBasketDraft((state) => state.clear);
  const [name, setName] = useState("");
  const [stake, setStake] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const make = async () => {
    setSaving(true);
    setError(null);
    const result = await feed.write("/api/poly/baskets", "POST", { name: name.trim() === "" ? t("My basket") : name, stakeUsd: stake, legs });
    setSaving(false);
    if (result.error !== null) setError(result.error);
    else {
      clear();
      setName("");
    }
  };

  if (legs.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="type-body-sm text-text-secondary">{t("Pick outcomes in Poly scan — what smart money holds, or today's movers — and make a paper basket from them here.")}</p>
        <div>
          <Button size="sm" variant="quiet" onClick={onScan}>
            {t("Open Poly scan")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border-subtle">
        {legs.map((leg) => (
          <li key={leg.tokenId} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <span className="flex min-w-0 flex-col">
              <span className="type-body-sm text-text-primary">{leg.question}</span>
              <span className="type-label text-accent">{leg.outcome}</span>
            </span>
            <Button size="icon" variant="ghost" onClick={() => remove(leg.tokenId)} aria-label={t("Remove {name}", { name: leg.question })}>
              <X size={14} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="type-label text-text-muted">{t("Name")}</span>
          <input
            value={name}
            maxLength={BASKET_LIMITS.maxName}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("My basket")}
            className="type-body-sm h-9 w-full rounded-control border border-border-strong bg-surface-base px-2.5 text-text-primary"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="type-label text-text-muted">{t("Paper stake (USD)")}</span>
          <input
            type="number"
            inputMode="decimal"
            value={stake}
            min={BASKET_LIMITS.minStakeUsd}
            max={BASKET_LIMITS.maxStakeUsd}
            step={10}
            onChange={(event) => setStake(Number(event.target.value))}
            className="type-body-sm h-9 w-full rounded-control border border-border-strong bg-surface-base px-2.5 tabular-nums text-text-primary"
          />
        </label>
      </div>
      <p className="type-label text-text-muted">
        {legs.length < BASKET_LIMITS.minLegs
          ? t("Add at least {count} outcomes.", { count: BASKET_LIMITS.minLegs })
          : t("The stake is split evenly; each leg is bought at the order book walked for its share, not the midpoint.")}
      </p>
      {error !== null && <Notice tone="negative">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={() => void make()} disabled={saving || legs.length < BASKET_LIMITS.minLegs || !feed.signedIn}>
          <PackagePlus size={14} aria-hidden /> {t("Make paper basket")}
        </Button>
        <Button variant="ghost" onClick={clear}>
          {t("Clear")}
        </Button>
      </div>
    </div>
  );
}

function BasketCard({ basket, feed, now }: { basket: BasketView; feed: ScoutFeed<BasketsResponse>; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <article className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
      <header className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{basket.name}</span>
        <span className="flex items-baseline gap-2">
          <span className="type-data-sm tabular-nums text-text-primary">{usd(basket.valueUsd)}</span>
          <SignedPct value={basket.pnlPct} />
        </span>
      </header>
      <p className="type-label text-text-muted">
        {t("Cost {cost} · {settled} of {legs} settled", { cost: usd(basket.costUsd), settled: basket.settledLegs, legs: basket.legs.length })}
        {now !== null && ` · ${formatRelativeTime(basket.createdAt, now, t.locale)}`}
      </p>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {basket.legs.map((leg) => (
          <li key={leg.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <span className="type-label text-text-primary">{leg.question}</span>
            <span className="type-label text-text-secondary">
              <span className="text-accent">{leg.outcome}</span>
              {" · "}
              {t("{shares} shares at {entry}¢ · cost {cost} · worth {value}", {
                shares: leg.shares.toFixed(2),
                entry: (leg.entryPrice * 100).toFixed(1),
                cost: usd(leg.costUsd),
                value: usd(leg.valueUsd),
              })}
              {leg.settled !== null && (
                <span className={cn("ml-1", leg.settled === 1 ? "text-positive" : "text-negative")}>{leg.settled === 1 ? t("· Won") : t("· Lost")}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void feed.write(`/api/poly/baskets/${basket.id}`, "DELETE").finally(() => setBusy(false));
          }}
          aria-label={t("Delete {name}", { name: basket.name })}
        >
          <Trash2 size={12} aria-hidden /> {t("Delete")}
        </Button>
      </div>
    </article>
  );
}

export function PolyBasketsTab({ onOpenScan }: { onOpenScan: () => void }) {
  const t = useT();
  const now = useMinute();
  const feed = useScoutFeed<BasketsResponse>("/api/poly/baskets", { needsAuth: true });

  if (feed.ready && !feed.signedIn) return <Notice>{t("Sign in to keep paper baskets.")}</Notice>;

  return (
    <>
      <DrawerCard icon={PackagePlus} title={t("New paper basket")}>
        <Builder feed={feed} onScan={onOpenScan} />
      </DrawerCard>
      <DrawerCard icon={ShoppingBasket} title={t("Your baskets")}>
        {feed.error !== null ? (
          <Notice tone="negative">{feed.error}</Notice>
        ) : feed.data?.error ? (
          <Notice tone="caution">{feed.data.error}</Notice>
        ) : feed.loading && feed.data === null ? (
          <SkeletonRows rows={3} />
        ) : (feed.data?.baskets ?? []).length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("No baskets yet.")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {feed.data?.baskets.map((basket) => (
              <BasketCard key={basket.id} basket={basket} feed={feed} now={now} />
            ))}
          </div>
        )}
      </DrawerCard>
      <p className="type-label px-1 text-text-muted">
        {t("Paper only: Elyra places no Polymarket orders. Values are what the shares would sell for into the book now, so a thin book shows less than its midpoint.")}
      </p>
    </>
  );
}
