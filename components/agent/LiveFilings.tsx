"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CompanyMark } from "@/components/ui/CompanyMark";
import { useAssets } from "@/lib/market/usePrices";
import type { FilingsFeed } from "@/lib/smartmoney/filings";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The latest SEC filings, live from EDGAR.

   Shown in Filings whenever the findings scan has nothing to offer — most
   often because its database cannot be reached. The selected market joins
   the list when it is a listed company. Every row is the filing itself, one
   click away on sec.gov.
--------------------------------------------------------------------------- */

const REFRESH_MS = 5 * 60_000;

type State = { feed: FilingsFeed | null; error: string | null; loading: boolean };

function filedLabel(date: string): string {
  const filed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(filed)) return date;
  const days = Math.floor((Date.now() - filed) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(filed).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function LiveFilings() {
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const asset = byId.get(selectedAssetId);
  const ticker = asset?.assetType === "equity" ? asset.symbol : null;
  const [state, setState] = useState<State>({ feed: null, error: null, loading: true });

  /* Pure fetch with no setState of its own — every write is behind a `.then`. */
  const load = useCallback(async (): Promise<State> => {
    try {
      const response = await fetch(`/api/filings${ticker ? `?ticker=${ticker}` : ""}`);
      const feed = (await response.json()) as FilingsFeed;
      return { feed, error: null, loading: false };
    } catch (error: unknown) {
      return {
        feed: null,
        error: error instanceof Error ? error.message : "EDGAR could not be reached.",
        loading: false,
      };
    }
  }, [ticker]);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      void load().then((next) => {
        if (!cancelled) setState(next);
      });
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  const feed = state.feed;

  return (
    <section aria-label="Latest SEC filings">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3">
        <p className="type-eyebrow text-text-muted">Latest filings · SEC EDGAR</p>
        {feed && feed.companies.length > 0 && (
          <ul aria-label="Companies in this feed" className="flex list-none flex-wrap gap-1.5">
            {feed.companies.map((company) => (
              <li key={company} className="flex items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-raised py-1 pl-1 pr-2">
                <CompanyMark ticker={company} size={18} />
                <span className="type-data-sm text-text-secondary">{company}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.loading ? (
        <ul aria-busy="true" aria-label="Loading filings" className="list-none space-y-2 px-4 py-2">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="skeleton h-12 rounded-control" />
          ))}
        </ul>
      ) : state.error !== null || feed === null ? (
        <div className="px-4 py-6 text-center">
          <p className="type-body-sm text-text-secondary">EDGAR could not be reached.</p>
          <p className="type-label mt-1 text-text-muted">{state.error}</p>
          <Button className="mt-3" size="sm" variant="quiet" onClick={() => void load().then(setState)}>
            Try again
          </Button>
        </div>
      ) : feed.filings.length === 0 ? (
        <p className="type-body-sm px-4 py-6 text-center text-text-secondary">
          {feed.configured ? "No recent filings from these companies." : feed.errors[0]}
        </p>
      ) : (
        <ul className="list-none">
          {feed.filings.map((filing) => (
            <li key={`${filing.ticker}-${filing.form}-${filing.filedAt}-${filing.url}`}>
              <a
                href={filing.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "metallic research-card group flex flex-wrap items-start gap-3 border-t border-border-subtle px-4 py-3.5",
                  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-agent-accent",
                )}
              >
                <span className="mt-0.5 flex w-12 shrink-0 flex-col items-center gap-1">
                  <CompanyMark ticker={filing.ticker} name={filing.company} size={28} />
                  <span className="type-data-sm text-text-secondary">{filing.ticker}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-body-sm block text-text-primary">
                    {filing.label}
                    <span className="text-text-muted"> · {filing.form}</span>
                  </span>
                  {filing.items.length > 0 && (
                    <span className="type-label block text-text-secondary">
                      {filing.items.join(", ")}
                    </span>
                  )}
                  <span className="type-label mt-1 block break-words leading-5 text-text-secondary">{filing.company}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <time dateTime={filing.filedAt} className="type-data-sm text-text-muted">
                    {filedLabel(filing.filedAt)}
                  </time>
                  <ExternalLink
                    size={13}
                    strokeWidth={1.5}
                    aria-hidden
                    className="text-text-muted group-hover:text-text-primary"
                  />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {feed && feed.errors.length > 0 && feed.configured && (
        <p className="type-label flex items-center gap-1.5 px-4 py-2 text-text-muted">
          <FileText size={12} strokeWidth={1.5} aria-hidden />
          Not read: {feed.errors.join(" · ")}
        </p>
      )}
    </section>
  );
}
