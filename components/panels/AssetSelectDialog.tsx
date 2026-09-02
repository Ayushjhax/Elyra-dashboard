"use client";

import { useEffect, useRef, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAssetSearch } from "@/lib/market/useAssetSearch";
import type { PythAsset, PythAssetType } from "@/lib/market/pyth/types";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The asset picker.

   One component, used by both the watchlist and the chart's market selector,
   so the two can never offer different universes. Every row does two things:
   the row itself selects the asset as the active market, and the trailing
   button toggles watchlist membership without changing the selection.
--------------------------------------------------------------------------- */

const TYPE_FILTERS: Array<{ value: PythAssetType | null; label: string }> = [
  { value: null, label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "equity", label: "Stocks" },
  { value: "metal", label: "Metals" },
  { value: "commodity", label: "Commodities" },
  { value: "fx", label: "FX" },
  { value: "crypto-index", label: "Indices" },
];

/** Class shown on the row, shortened where the catalogue name is unwieldy. */
function classLabel(assetType: PythAssetType): string {
  if (assetType === "crypto-index") return "index";
  if (assetType === "commodity") return "cmdty";
  return assetType;
}

export function AssetSelectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const watchlist = useElyraStore((state) => state.watchlist);
  const addToWatchlist = useElyraStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useElyraStore((state) => state.removeFromWatchlist);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);

  const [query, setQuery] = useState("");
  const [type, setType] = useState<PythAssetType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { assets, status, error } = useAssetSearch(query, type, open);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function select(asset: PythAsset): void {
    setSelectedAssetId(asset.id);
    /* Selecting something off-list adds it, so the chart's market is always
       reachable again from the watchlist rather than being a dead end. */
    if (!watchlist.includes(asset.id)) addToWatchlist(asset.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="asset-picker-help">
        <DialogHeader>
          <DialogTitle>Select an asset</DialogTitle>
          <DialogDescription id="asset-picker-help">
            Everything with a live Pyth price feed — crypto, stocks, metals,
            commodities, FX and indices. Search by ticker, name or class.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-col gap-2 px-4 pb-2">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SOL, Bitcoin, Gold, Tesla…"
              aria-label="Search assets"
              className={cn(
                "type-label h-8 w-full rounded-control border border-border-strong bg-surface-raised",
                "pl-7 pr-2 text-text-primary placeholder:text-text-muted",
                "focus:border-accent-quiet focus:outline-none",
              )}
            />
          </div>

          <div role="group" aria-label="Asset class" className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map((filter) => {
              const active = filter.value === type;
              return (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(filter.value)}
                  className={cn(
                    "type-data-sm h-6 rounded-pill px-2.5",
                    "transition-colors duration-[var(--dur-fast)] ease-brand",
                    active
                      ? "bg-accent text-text-on-accent"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* A plain overflow container rather than the Radix ScrollArea: its
            viewport is sized with height:100%, which needs a definite height
            on the root to resolve. With eight seeded tokens the list never
            overflowed and the difference never showed; against a catalogue of
            1,749 it does, and the results below the fold became unreachable.
            This is the same pattern PanelBody scrolls with. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {status === "error" ? (
            <EmptyState
              icon={SearchX}
              title="Asset list unavailable"
              body={error ?? "Pyth could not be reached. Check PYTH_API_KEY and retry."}
            />
          ) : assets.length === 0 && status === "ready" ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches that"
              body={`No Pyth feed matches "${query.trim()}". Try a ticker, a company name, or a class like "metals".`}
            />
          ) : (
            <ul className="list-none">
              {assets.map((asset) => {
                const onList = watchlist.includes(asset.id);
                const isSelected = asset.id === selectedAssetId;
                return (
                  <li
                    key={asset.id}
                    className={cn(
                      "flex h-[var(--row-h)] items-center border-b border-border-subtle last:border-b-0",
                      isSelected && "bg-surface-active",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => select(asset)}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex h-full min-w-0 flex-1 items-center gap-2 px-4 text-left",
                        "transition-colors duration-[var(--dur-fast)] ease-brand",
                        !isSelected && "hover:bg-surface-hover",
                      )}
                    >
                      <CoinMark symbol={asset.symbol} logo={asset.logo} />
                      <span className="type-data shrink-0 text-text-primary">
                        {asset.symbol}
                      </span>
                      <span className="type-label min-w-0 flex-1 truncate text-text-muted">
                        {asset.name}
                      </span>
                      <span className="type-data-sm shrink-0 text-text-muted">
                        {classLabel(asset.assetType)}
                      </span>
                      {/* Says up front that this asset has a price but no chart. */}
                      {asset.tradingViewSymbol === null && (
                        <span className="type-data-sm shrink-0 text-text-muted">
                          no chart
                        </span>
                      )}
                    </button>

                    <span className="shrink-0 pr-4">
                      <Button
                        size="xs"
                        variant={onList ? "ghost" : "accent"}
                        onClick={() =>
                          onList ? removeFromWatchlist(asset.id) : addToWatchlist(asset.id)
                        }
                        aria-label={
                          onList
                            ? `Remove ${asset.symbol} from the watchlist`
                            : `Add ${asset.symbol} to the watchlist`
                        }
                      >
                        {onList ? "Remove" : "Add"}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
