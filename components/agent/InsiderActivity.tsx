"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import type { CompanyInsiders } from "@/lib/research/sec/alpha";
import { formatCompactUsd, formatPriceUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   What a company's insiders have done with their own shares.

   Read from the company's most recent Form 4s (/api/sec/insiders): who
   bought and who sold on the open market, how much, and whether a sale was
   scheduled in advance. A bar weighs the money in against the money out.
   Grants, exercises and tax withholding are left out — they are pay, not
   decisions.
--------------------------------------------------------------------------- */

const RETRY_MS = 4_000;
const MAX_TRIES = 8;

/** "14 Oct", or "14 Oct 2025" for another year. */
function dateLabel(iso: string | null): string {
  if (iso === null) return "";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const date = new Date(parsed);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function InsiderActivity({ query, onAsk }: { query: string; onAsk: (prompt: string) => void }) {
  const [state, setState] = useState<{ query: string; data: CompanyInsiders | null; error: string | null }>({
    query: "",
    data: null,
    error: null,
  });

  /* Asks again while the company's filings are still being read. */
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: number | null = null;
    const tick = () => {
      tries += 1;
      void fetch(`/api/sec/insiders?q=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ insiders: CompanyInsiders | null; error: string | null }>)
        .then((body) => {
          if (cancelled) return;
          setState({ query, data: body.insiders, error: body.error });
          if (body.insiders && body.insiders.pending > 0 && tries < MAX_TRIES) timer = window.setTimeout(tick, RETRY_MS);
        })
        .catch(() => {
          if (!cancelled) setState({ query, data: null, error: "Insider filings could not be read." });
        });
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [query]);

  const current = state.query === query ? state : null;
  const data = current?.data ?? null;

  return (
    <section aria-label="Insider activity" className="mx-4 mt-4 rounded-card border border-border-subtle bg-surface-raised">
      <p className="type-eyebrow flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 text-text-muted">
        <span>Insider activity</span>
        {data && (
          <span className="normal-case tracking-normal text-text-secondary">
            {data.pending > 0 ? `Reading ${data.pending} more…` : `${data.filings} Form 4s · since ${dateLabel(data.since)}`}
          </span>
        )}
      </p>

      {current === null ? (
        <div aria-busy="true" aria-label="Reading insider filings" className="space-y-2 p-3">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-2 w-full rounded-pill" />
          <div className="skeleton h-10 w-full rounded-control" />
        </div>
      ) : data === null ? (
        <p className="type-body-sm px-3 py-3 text-text-secondary">{current.error ?? "No insider filings found."}</p>
      ) : data.moves.length === 0 ? (
        <p className="type-body-sm px-3 py-3 text-text-secondary">
          {data.pending > 0
            ? "Reading its recent Form 4s…"
            : `No open-market buying or selling in its last ${data.filings} insider filings — only grants, exercises and tax withholding, if anything.`}
        </p>
      ) : (
        <div className="p-3">
          <InsiderBalance data={data} />
          <ul className="mt-3 flex list-none flex-col divide-y divide-border-subtle">
            {data.moves.slice(0, 8).map((move) => {
              const buy = move.kind === "buy";
              return (
                <li key={`${move.accession}-${move.kind}`} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-pill", buy ? "bg-sage" : "bg-text-muted")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="type-body-sm text-text-primary">
                      {move.insider} <span className="text-text-secondary">· {move.role}</span>
                    </p>
                    <p className="type-label flex flex-wrap gap-x-1 text-text-muted">
                      <span className="whitespace-nowrap">
                        {buy ? "Bought" : "Sold"} {move.shares.toLocaleString("en-US")} sh
                      </span>
                      {move.avgPrice !== null && <span className="whitespace-nowrap">at ~{formatPriceUsd(move.avgPrice)}</span>}
                      {move.tradeDate && <span className="whitespace-nowrap">· {dateLabel(move.tradeDate)}</span>}
                      {!buy && move.planned && <span className="whitespace-nowrap">· scheduled 10b5-1</span>}
                      {!buy && move.soldAll && <span className="whitespace-nowrap">· sold everything</span>}
                    </p>
                  </div>
                  <a
                    href={move.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open the Form 4"
                    className={cn(
                      "type-data inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control px-1 hover:bg-surface-hover",
                      buy ? "text-positive" : "text-text-primary",
                    )}
                  >
                    {move.value === null ? "—" : `${buy ? "+" : "−"}${formatCompactUsd(move.value)}`}
                    <ExternalLink size={10} strokeWidth={1.5} aria-hidden className="text-text-muted" />
                  </a>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() =>
              onAsk(
                `Over its last ${data.filings} Form 4s, insiders at ${data.company ?? query} (${data.ticker ?? query}) bought ${formatCompactUsd(data.summary.buyValue)} in ${data.summary.buys} trades and sold ${formatCompactUsd(data.summary.sellValue)} in ${data.summary.sells} trades. What does this pattern suggest, and what would change that reading?`,
              )
            }
            className="type-label mt-2 inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            Ask Elyra what this pattern says
          </button>
        </div>
      )}
    </section>
  );
}

/** Money in against money out, with the people behind each. */
function InsiderBalance({ data }: { data: CompanyInsiders }) {
  const { buyValue, sellValue, buys, sells, buyers, sellers } = data.summary;
  const total = buyValue + sellValue;
  const buyShare = total > 0 ? (buyValue / total) * 100 : 0;
  return (
    <div>
      <p className="type-label text-text-secondary">
        {buys === 0 ? (
          "Nothing bought on the open market"
        ) : (
          <>
            <span className="type-data text-positive">{formatCompactUsd(buyValue)}</span> bought · {buys} {buys === 1 ? "trade" : "trades"} by{" "}
            {buyers} {buyers === 1 ? "insider" : "insiders"}
          </>
        )}
      </p>
      <p className="type-label text-text-secondary">
        {sells === 0 ? (
          "Nothing sold on the open market"
        ) : (
          <>
            <span className="type-data text-text-primary">{formatCompactUsd(sellValue)}</span> sold · {sells} {sells === 1 ? "trade" : "trades"} by{" "}
            {sellers} {sellers === 1 ? "insider" : "insiders"}
          </>
        )}
      </p>
      <div
        role="img"
        aria-label={`${buyShare.toFixed(0)}% of insider money moved was buying`}
        className="mt-2 flex h-2 overflow-hidden rounded-pill bg-surface-hover"
      >
        {buyValue > 0 && <span className="h-full bg-sage" style={{ width: `${Math.max(buyShare, 2)}%` }} />}
        {sellValue > 0 && <span className="h-full flex-1 bg-surface-active" />}
      </div>
    </div>
  );
}
