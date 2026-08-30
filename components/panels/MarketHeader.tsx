"use client";

import { PanelRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { Panel } from "@/components/ui/Panel";
import { Separator } from "@/components/ui/separator";
import { StatPill } from "@/components/ui/StatPill";
import { formatCompactUsd, formatPct, formatPrice } from "@/lib/format";
import { useElyraStore, useLiveAsset } from "@/lib/store";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";

export function MarketHeader() {
  const symbol = useElyraStore((state) => state.selectedSymbol);
  const asset = useLiveAsset(symbol);
  const live = useElyraStore((state) => state.prices[symbol]);
  const favorite = useElyraStore((state) => state.favorites.includes(symbol));
  const toggleFavorite = useElyraStore((state) => state.toggleFavorite);
  const setRightDrawerOpen = useElyraStore((state) => state.setRightDrawerOpen);
  const flash = useFlash(live?.seq ?? 0, live?.direction ?? "flat");

  return (
    <Panel label={`${symbol} market summary`} className="shrink-0">
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={favorite}
            aria-label={
              favorite ? `Remove ${symbol} from favourites` : `Add ${symbol} to favourites`
            }
            onClick={() => toggleFavorite(symbol)}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-chip",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
              favorite ? "text-accent" : "text-text-muted hover:text-text-secondary",
            )}
          >
            <Star
              size={16}
              strokeWidth={1.5}
              aria-hidden
              fill={favorite ? "currentColor" : "none"}
            />
          </button>

          <CoinMark symbol={symbol} />
          <h1 className="type-h1 truncate text-text-primary">{asset.name}</h1>
          <span className="type-label shrink-0 text-text-muted">{symbol}/USDC</span>

          <div className="ml-auto shrink-0 full:hidden">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRightDrawerOpen(true)}
              aria-haspopup="dialog"
            >
              <PanelRight size={14} strokeWidth={1.5} aria-hidden />
              Signals
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-4">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className={cn("type-price rounded-chip px-1 text-text-primary", flash)}>
              ${formatPrice(asset.price, asset.pricePrecision)}
            </span>
            <DeltaText value={asset.change24hPct} className="type-data" />
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex w-max items-stretch">
              <StatPill
                label="24h High"
                value={formatPrice(asset.high24h, asset.pricePrecision)}
                className="pl-0"
              />
              <Separator orientation="vertical" />
              <StatPill
                label="24h Low"
                value={formatPrice(asset.low24h, asset.pricePrecision)}
              />
              <Separator orientation="vertical" />
              <StatPill label="24h Volume" value={formatCompactUsd(asset.volume24h)} />
              <Separator orientation="vertical" />
              <StatPill
                label="Open Interest"
                value={formatCompactUsd(asset.openInterest)}
              />
              <Separator orientation="vertical" />
              <StatPill
                label="Funding"
                value={formatPct(asset.fundingPct, { decimals: 4 })}
                tone={asset.fundingPct > 0 ? "positive" : asset.fundingPct < 0 ? "negative" : "muted"}
              />
              <Separator orientation="vertical" />
              <StatPill
                label="Mark"
                value={formatPrice(asset.markPrice, asset.pricePrecision)}
                className="pr-0"
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
