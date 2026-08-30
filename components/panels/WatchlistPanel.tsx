"use client";

import { useMemo, useState } from "react";
import { Plus, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ASSETS, ASSETS_BY_SYMBOL } from "@/lib/mock/assets";
import { formatPrice } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";

function WatchRow({ symbol }: { symbol: string }) {
  const asset = ASSETS_BY_SYMBOL[symbol];
  const live = useElyraStore((state) => state.prices[symbol]);
  const selected = useElyraStore((state) => state.selectedSymbol === symbol);
  const setSelectedSymbol = useElyraStore((state) => state.setSelectedSymbol);
  const flash = useFlash(live?.seq ?? 0, live?.direction ?? "flat");

  if (!asset) return null;

  const price = live?.price ?? asset.price;
  const change = live?.change24hPct ?? asset.change24hPct;

  return (
    <li>
      <button
        type="button"
        onClick={() => setSelectedSymbol(symbol)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex h-[var(--row-h)] w-full items-center gap-2 border-b border-border-subtle px-3 text-left",
          "transition-colors duration-[var(--dur-fast)] ease-brand",
          selected
            ? "bg-surface-active text-text-primary"
            : "hover:bg-surface-hover",
        )}
      >
        <CoinMark symbol={symbol} />
        <span className="type-data shrink-0 text-text-primary">{symbol}</span>
        <span
          className={cn(
            "type-label min-w-0 flex-1 truncate",
            selected ? "text-text-secondary" : "text-text-muted",
          )}
        >
          {asset.name}
        </span>
        <span className={cn("type-data shrink-0 rounded-chip px-1 text-text-primary", flash)}>
          {formatPrice(price, asset.pricePrecision)}
        </span>
        <DeltaText value={change} className="type-data-sm w-14 shrink-0 text-right" />
      </button>
    </li>
  );
}

function TokenPicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const watchlist = useElyraStore((state) => state.watchlist);
  const addToWatchlist = useElyraStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useElyraStore((state) => state.removeFromWatchlist);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="token-picker-help">
        <DialogHeader>
          <DialogTitle>Add a token</DialogTitle>
          <DialogDescription id="token-picker-help">
            Everything Elyra tracks. Adding a token puts it on the watchlist and
            in the mock price feed.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="list-none">
          {ASSETS.map((asset) => {
            const onList = watchlist.includes(asset.symbol);
            return (
              <li
                key={asset.symbol}
                className="flex h-[var(--row-h)] items-center gap-2 border-b border-border-subtle px-4 last:border-b-0"
              >
                <CoinMark symbol={asset.symbol} />
                <span className="type-data text-text-primary">{asset.symbol}</span>
                <span className="type-label min-w-0 flex-1 truncate text-text-muted">
                  {asset.name}
                </span>
                <Button
                  size="xs"
                  variant={onList ? "ghost" : "accent"}
                  onClick={() =>
                    onList
                      ? removeFromWatchlist(asset.symbol)
                      : addToWatchlist(asset.symbol)
                  }
                >
                  {onList ? "Remove" : "Add"}
                </Button>
              </li>
              );
            })}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function WatchlistPanel() {
  const watchlist = useElyraStore((state) => state.watchlist);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return watchlist;
    return watchlist.filter((symbol) => {
      const asset = ASSETS_BY_SYMBOL[symbol];
      return (
        symbol.toLowerCase().includes(needle) ||
        asset?.name.toLowerCase().includes(needle)
      );
    });
  }, [watchlist, query]);

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
        {filtered.length > 0 ? (
          <ul className="list-none">
            {filtered.map((symbol) => (
              <WatchRow key={symbol} symbol={symbol} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={SearchX}
            title="Nothing matches that"
            body={`No watchlist token matches "${query.trim()}". Clear the search, or add the token from the picker.`}
          />
        )}
      </PanelBody>

      <TokenPicker open={pickerOpen} onOpenChange={setPickerOpen} />
    </Panel>
  );
}
