"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Plus, Search, SearchX, Star } from "lucide-react";
import { AssetSelectDialog } from "@/components/panels/AssetSelectDialog";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section, SectionControl } from "@/components/ui/Section";
import type { WidgetProps } from "@/components/workspace/WidgetColumn";
import { formatPrice } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssets, usePrices } from "@/lib/market/usePrices";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import { useElyraStore } from "@/lib/store";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The watchlist: live Pyth prices for the markets the operator follows.

   Selecting a row sets the selected market — the store's spine — so the
   chart, its header, the trading table's ordering and the agent's suggested
   prompts all follow it. The star beside a row is the same favourite the
   chart header toggles, and the Favorites filter reads it.
--------------------------------------------------------------------------- */

type Filter = "all" | "favorites";

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
  const favorite = useElyraStore((state) => state.favorites.includes(asset.id));
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const toggleFavorite = useElyraStore((state) => state.toggleFavorite);

  const direction =
    row === undefined || previous === undefined || row.price === previous
      ? "flat"
      : row.price > previous
        ? "up"
        : "down";
  const flash = useFlash(seq, direction);

  return (
    <li
      className={cn(
        "group/row relative flex items-center rounded-card border",
        "transition-colors duration-[var(--dur-fast)] ease-brand",
        /* Forest fill with a hairline of lime: selected, not alarming. */
        selected
          ? "border-accent/45 bg-surface-active"
          : "border-transparent hover:bg-surface-hover",
      )}
    >
      <button
        type="button"
        onClick={() => setSelectedAssetId(asset.id)}
        aria-current={selected ? "true" : undefined}
        aria-label={`${asset.symbol}, ${asset.name}${row ? `, ${formatPrice(row.price, priceDecimals(row.price))}` : ""}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2.5 pr-1 text-left"
      >
        <CoinMark symbol={asset.symbol} logo={asset.logo} size={30} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-data truncate text-text-primary">{asset.symbol}</span>
          <span className={cn("type-label truncate", selected ? "text-text-secondary" : "text-text-muted")}>
            {asset.name}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {row ? (
            <span className={cn("type-data rounded-chip px-1 text-text-primary", flash)}>
              {formatPrice(row.price, priceDecimals(row.price))}
            </span>
          ) : (
            <span aria-hidden className="skeleton my-0.5 h-3.5 w-14" />
          )}
          {/* Pyth publishes no 24h window, so assets the exchange sources do
              not list show a dash rather than an invented figure. */}
          {row?.change24hPct !== null && row?.change24hPct !== undefined ? (
            <DeltaText value={row.change24hPct} className="type-data-sm px-1" />
          ) : (
            <span className="type-data-sm px-1 text-text-muted">—</span>
          )}
        </span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={favorite}
        aria-label={favorite ? `Remove ${asset.symbol} from favourites` : `Add ${asset.symbol} to favourites`}
        onClick={() => toggleFavorite(asset.id)}
        className={cn(
          "mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-chip",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
          favorite ? "text-accent" : "text-text-muted hover:text-text-secondary",
        )}
      >
        <Star size={14} strokeWidth={1.5} aria-hidden fill={favorite ? "currentColor" : "none"} />
      </button>
    </li>
  );
}

export function WatchlistWidget({ open, onOpenChange, controls }: WidgetProps) {
  const watchlist = useElyraStore((state) => state.watchlist);
  const favorites = useElyraStore((state) => state.favorites);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { byId } = useAssets(watchlist);
  const feed = usePrices(watchlist);

  /* "/" jumps to the search from anywhere that is not already a text field. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const input = searchRef.current;
      if (!input || input.offsetParent === null) return;
      event.preventDefault();
      input.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* Filtering happens over the resolved assets so a search matches the name
     as well as the ticker, the same as the picker. */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return watchlist
      .map((id) => byId.get(id))
      .filter((asset): asset is PythAsset => asset !== undefined)
      .filter((asset) => filter === "all" || favorites.includes(asset.id))
      .filter(
        (asset) =>
          needle === "" ||
          asset.symbol.toLowerCase().includes(needle) ||
          asset.name.toLowerCase().includes(needle),
      );
  }, [watchlist, byId, query, filter, favorites]);

  const resolving = watchlist.length > 0 && byId.size === 0;

  return (
    <Section
      title="Watchlist"
      icon={<Eye size={16} strokeWidth={1.5} />}
      open={open}
      onOpenChange={onOpenChange}
      actions={
        <>
          <SectionControl
            label="Add a market"
            aria-haspopup="dialog"
            onClick={() => setPickerOpen(true)}
            className="size-6"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
          </SectionControl>
          {controls}
        </>
      }
    >
      <div className="flex flex-col gap-2.5 px-3 pt-3">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.5}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a market…"
            aria-label="Search the watchlist"
            aria-keyshortcuts="/"
            className={cn(
              "type-body-sm h-10 w-full rounded-card border border-border-strong bg-surface-raised",
              "pl-9 pr-9 text-text-primary placeholder:text-text-muted",
              "focus:border-accent-quiet focus:outline-none",
            )}
          />
          <kbd
            aria-hidden
            className="type-data-sm pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-chip border border-border-strong px-1.5 text-text-muted"
          >
            /
          </kbd>
        </div>

        <div role="radiogroup" aria-label="Show" className="flex gap-1 border-b border-border-subtle">
          {(
            [
              ["all", "All markets"],
              ["favorites", "Favorites"],
            ] as const
          ).map(([value, label]) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(value)}
                className={cn(
                  "type-label -mb-px flex h-9 items-center gap-1.5 border-b-2 px-2",
                  "transition-colors duration-[var(--dur-fast)] ease-brand",
                  active
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
                {value === "favorites" && (
                  <Star size={12} strokeWidth={1.5} aria-hidden fill={active ? "currentColor" : "none"} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto px-2 py-2">
        {watchlist.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nothing on the watchlist"
            body="Add a market to follow its live Pyth price here."
          />
        ) : resolving ? (
          <ul aria-busy="true" aria-label="Loading the watchlist" className="list-none space-y-1">
            {watchlist.slice(0, 5).map((id) => (
              <li key={id} className="flex h-14 items-center gap-3 px-2.5">
                <span className="skeleton size-[30px] rounded-pill" />
                <span className="skeleton h-3.5 w-20" />
                <span className="skeleton ml-auto h-3.5 w-14" />
              </li>
            ))}
          </ul>
        ) : visible.length > 0 ? (
          <ul className="list-none space-y-1">
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
            title={filter === "favorites" && query.trim() === "" ? "No favourites yet" : "Nothing matches that"}
            body={
              filter === "favorites" && query.trim() === ""
                ? "Star a market to keep it here."
                : `No watchlist market matches "${query.trim()}". Clear the search, or add it from the picker.`
            }
          />
        )}
      </div>

      <p className="type-label flex items-center gap-1.5 border-t border-border-subtle px-4 py-2.5 text-text-muted">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-pill",
            feed.status === "live" ? "bg-positive" : feed.status === "error" ? "bg-negative" : "bg-text-muted",
          )}
        />
        {feed.status === "live" ? "Pyth live" : feed.status === "error" ? "Prices delayed" : "Connecting"} · USD
      </p>

      <AssetSelectDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </Section>
  );
}
