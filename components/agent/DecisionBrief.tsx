"use client";

import { useId } from "react";
import { ChevronDown, Eye, Layers, LineChart } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAlerts } from "@/lib/alerts/useAlerts";
import { exposureLine, structureLine, watchNextLine, type BriefLine } from "@/lib/market/brief";
import { useLevels } from "@/lib/market/useLevels";
import { useAssets, usePrice } from "@/lib/market/usePrices";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The decision brief: three rows about the market on the chart.

   - Price structure — where the price sits in today's range, against its
     EMA and between yesterday's pivot levels, from the live Pyth feed, the
     exchanges' 24h window and the last completed daily candle.
   - Your exposure — what the signed-in account actually holds in this
     market, spot and perp, from /api/portfolio.
   - Watch next — the nearest price alert you have armed on this market,
     otherwise the nearest pivot level, otherwise today's range edge.

   Every row says where it came from and how fresh it is, and says plainly
   when it cannot be computed. Nothing is inferred to fill a gap: no exposure
   is shown for an account that could not be read, and "none" is only said
   when the read succeeded and found none.
--------------------------------------------------------------------------- */

const ROWS = [
  { key: "structure", label: "Price structure", icon: LineChart },
  { key: "exposure", label: "Your exposure", icon: Layers },
  { key: "watch", label: "Watch next", icon: Eye },
] as const;

export function DecisionBrief() {
  const open = useElyraStore((state) => state.decisionBriefOpen);
  const setOpen = useElyraStore((state) => state.setDecisionBriefOpen);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const asset = byId.get(selectedAssetId);
  const symbol = asset?.symbol.toUpperCase() ?? "";
  const { row } = usePrice(selectedAssetId);
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const alerts = useAlerts();
  const { data: levelData } = useLevels(asset?.assetType === "crypto" ? symbol : null);
  const levels = levelData?.levels ?? null;
  const now = useMinute();
  const bodyId = useId();

  const lines: Record<(typeof ROWS)[number]["key"], BriefLine> = {
    structure: symbol ? structureLine(symbol, row, levels, now) : { kind: "loading" },
    exposure: symbol
      ? exposureLine(symbol, { ...feed, available: auth.available, ready: auth.ready, authenticated: auth.authenticated }, now)
      : { kind: "loading" },
    watch: symbol ? watchNextLine(symbol, row, alerts, levels, "web") : { kind: "loading" },
  };

  return (
    <section aria-label="Decision brief" className="rounded-card border border-border-subtle bg-surface-raised">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="type-eyebrow text-text-muted">Decision brief</span>
        {symbol && <span className="type-data-sm text-text-secondary">{symbol}</span>}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "ml-auto text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
            !open && "-rotate-90",
          )}
        />
      </button>

      <dl id={bodyId} hidden={!open} className="divide-y divide-border-subtle border-t border-border-subtle">
        {ROWS.map(({ key, label, icon: Icon }) => {
          const line = lines[key];
          return (
            <div key={key} className="flex gap-2.5 px-3 py-2.5">
              <Icon size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <dt className="type-label text-text-secondary">{label}</dt>
                <dd className="mt-0.5">
                  {line.kind === "loading" ? (
                    <span aria-label="Loading" className="skeleton block h-4 w-4/5" />
                  ) : line.kind === "unavailable" ? (
                    <p className="type-body-sm text-text-muted">{line.text}</p>
                  ) : (
                    <>
                      <p className="type-body-sm text-text-primary">{line.text}</p>
                      <p className="type-data-sm mt-0.5 text-text-muted">{line.source}</p>
                    </>
                  )}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
