"use client";

import { useMemo, useState } from "react";
import { Plus, Search, SearchX } from "lucide-react";
import { AssetSelectDialog } from "@/components/panels/AssetSelectDialog";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { formatPrice } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssets, usePrices } from "@/lib/market/usePrices";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import { useElyraStore } from "@/lib/store";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";

function WatchRow({
  asset,
  row,
  seq,
  previous,
}: {
  asset: PythAsset;
  row: PriceRow | undefined;
  seq: number;
  previous: number | undefined;
}) {
  const selected = useElyraStore((state) => state.selectedAssetId === asset.id);
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);

  const direction =
    row === undefined || previous === undefined || row.price === previous
      ? "flat"
      : row.price > previous
        ? "up"
        : "down";
  const flash = useFlash(seq, direction);

  return (
    <li>
      <button
        type="button"
        onClick={() => setSelectedAssetId(asset.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex h-[var(--row-h)] w-full items-center gap-2 border-b border-border-subtle px-3 text-left",
          "transition-colors duration-[var(--dur-fast)] ease-brand",
          selected
            ? "fill-active bg-surface-active text-text-primary"
            : "hover:bg-surface-hover",
        )}
      >
        <CoinMark symbol={asset.symbol} logo={asset.logo} />
        <span className="type-data shrink-0 text-text-primary">{asset.symbol}</span>
        <span
          className={cn(
            "type-label min-w-0 flex-1 truncate",
            selected ? "text-text-secondary" : "text-text-muted",
          )}
        >
          {asset.name}
        </span>

        {row ? (
          <span
            className={cn("type-data shrink-0 rounded-chip px-1 text-text-primary", flash)}
          >
            {formatPrice(row.price, priceDecimals(row.price))}
          </span>
        ) : (
          <span
            aria-hidden
            className="inline-block h-3 w-16 shrink-0 rounded-chip bg-surface-raised"
          />
        )}

        {/* Pyth publishes no 24h window, so assets the exchange sources do not
            list show a dash rather than an invented figure. */}
        {row?.change24hPct !== null && row?.change24hPct !== undefined ? (
          <DeltaText value={row.change24hPct} className="type-data-sm w-14 shrink-0 text-right" />
        ) : (
          <span className="type-data-sm w-14 shrink-0 text-right text-text-muted">—</span>
        )}
      </button>
    </li>
  );
}

export function WatchlistPanel() {
  const watchlist = useElyraStore((state) => state.watchlist);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const { byId } = useAssets(watchlist);
  const feed = usePrices(watchlist);

  /* Filtering happens over the resolved assets so a search matches the name
     as well as the ticker, the same as the picker. */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = watchlist
      .map((id) => byId.get(id))
      .filter((asset): asset is PythAsset => asset !== undefined);
    if (!needle) return rows;
    return rows.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle),
    );
  }, [watchlist, byId, query]);

  return (
    <Panel label="Watchlist">
      <PanelHeader className="gap-2">
        <Eyebrow className="shrink-0">Watchlist</Eyebrow>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search the watchlist"
              className={cn(
                "type-label h-8 w-full rounded-control border border-border-strong bg-surface-raised",
                "pl-7 pr-2 text-text-primary placeholder:text-text-muted",
                "focus:border-accent-quiet focus:outline-none",
              )}
            />
          </div>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden />
            Add
          </Button>
        </div>
      </PanelHeader>

      <PanelBody>
        {watchlist.length === 0 ? (
          <EmptyState
            icon={Search}
            mark="forest"
            title="Nothing on the watchlist"
            body="Add an asset to follow its live Pyth price here."
          />
        ) : visible.length > 0 ? (
          <ul className="list-none">
            {visible.map((asset) => (
              <WatchRow
                key={asset.id}
                asset={asset}
                row={feed.rows.get(asset.id)}
                previous={feed.previous.get(asset.id)}
                seq={feed.seq}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={SearchX}
            title="Nothing matches that"
            body={`No watchlist asset matches "${query.trim()}". Clear the search, or add it from the picker.`}
          />
        )}
      </PanelBody>

      <AssetSelectDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </Panel>
  );
}
