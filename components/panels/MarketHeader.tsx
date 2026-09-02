"use client";

import { PanelRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { Panel } from "@/components/ui/Panel";
import { Separator } from "@/components/ui/separator";
import { StatPill } from "@/components/ui/StatPill";
import { formatPrice } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssets, usePrice } from "@/lib/market/usePrices";
import { useElyraStore } from "@/lib/store";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";

/** Skeleton width for a value that has not arrived yet. */
function Pending({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3 rounded-chip bg-surface-raised", className)}
    />
  );
}

export function MarketHeader() {
  const assetId = useElyraStore((state) => state.selectedAssetId);
  const favorite = useElyraStore((state) => state.favorites.includes(assetId));
  const toggleFavorite = useElyraStore((state) => state.toggleFavorite);
  const setRightDrawerOpen = useElyraStore((state) => state.setRightDrawerOpen);

  const ids = [assetId];
  const { byId } = useAssets(ids);
  const asset = byId.get(assetId);

  const { row, status, error, direction, seq } = usePrice(assetId);
  const flash = useFlash(seq, direction);

  const symbol = asset?.symbol ?? "—";
  const decimals = priceDecimals(row?.price);

  /* A price that failed to refresh is still shown, because the last observed
     price is real and useful — but it is labelled, so nobody reads a stale
     number as a live one. */
  const stale = status === "error" && row !== undefined;

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
            onClick={() => toggleFavorite(assetId)}
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

          <CoinMark symbol={symbol} logo={asset?.logo ?? null} />
          <h1 className="type-h1 truncate text-text-primary">
            {asset?.name ?? <Pending className="w-28 align-middle" />}
          </h1>
          <span className="type-label shrink-0 text-text-muted">
            {asset ? `${asset.symbol}/${asset.quoteCurrency}` : ""}
          </span>

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
            {row ? (
              <span
                className={cn("type-price rounded-chip px-1 text-text-primary", flash)}
                aria-live="polite"
              >
                ${formatPrice(row.price, decimals)}
              </span>
            ) : status === "error" ? (
              <span className="type-price px-1 text-text-muted">—</span>
            ) : (
              <Pending className="h-6 w-32" />
            )}

            {row?.change24hPct !== null && row?.change24hPct !== undefined ? (
              <DeltaText value={row.change24hPct} className="type-data" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex w-max items-stretch">
              <StatPill
                label="Confidence"
                value={row ? `±${formatPrice(row.confidence, decimals)}` : "—"}
                className="pl-0"
              />
              <Separator orientation="vertical" />
              <StatPill
                label="EMA"
                value={row ? formatPrice(row.emaPrice, decimals) : "—"}
              />
              <Separator orientation="vertical" />
              <StatPill
                label="Publishers"
                value={row ? String(row.publisherCount) : "—"}
              />
              <Separator orientation="vertical" />
              <StatPill
                label="Session"
                value={row?.marketSession ?? "—"}
                tone={
                  row?.marketSession && row.marketSession !== "regular"
                    ? "muted"
                    : undefined
                }
              />
              <Separator orientation="vertical" />
              <StatPill
                label="Source"
                value={stale ? "Pyth · stale" : "Pyth"}
                tone={stale ? "negative" : "muted"}
                className="pr-0"
              />
            </div>
          </div>
        </div>

        {status === "error" && (
          <p role="status" className="type-label text-negative">
            {row
              ? `Showing the last price Pyth returned. ${error ?? ""}`.trim()
              : (error ?? "Pyth prices are unavailable.")}
          </p>
        )}
      </div>
    </Panel>
  );
}
