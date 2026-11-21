"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import type { CompanyInsiders } from "@/lib/research/sec/alpha";
import { formatCompactUsd, formatPriceUsd } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { translateNow, useT } from "@/lib/i18n/client";

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

/** "14 Oct", or "14 Oct 2025" for another year — or before the shared clock has hydrated. */
function dateLabel(iso: string | null, now: number | null): string {
  if (iso === null) return "";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const date = new Date(parsed);
  const sameYear = now !== null && date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function InsiderActivity({ query, onAsk }: { query: string; onAsk: (prompt: string) => void }) {
  const t = useT();
  const [state, setState] = useState<{ query: string; data: CompanyInsiders | null; error: string | null }>({
    query: "",
    data: null,
    error: null,
  });
  const now = useMinute();

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
          if (!cancelled) setState({ query, data: null, error: translateNow("Insider filings could not be read.") });
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
    <section aria-label={t("Insider activity")} className="mx-4 mt-4 rounded-card border border-border-subtle bg-surface-raised">
      <p className="type-eyebrow flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 text-text-muted">
        <span>{t("Insider activity")}</span>
        {data && (
          <span className="normal-case tracking-normal text-text-secondary">
            {data.pending > 0 ? t("Reading {pending} more…", { pending: data.pending }) : t("{filings} Form 4s · since {since}", { filings: data.filings, since: dateLabel(data.since, now) })}
          </span>
        )}
      </p>

      {current === null ? (
        <div aria-busy="true" aria-label={t("Reading insider filings")} className="space-y-2 p-3">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-2 w-full rounded-pill" />
          <div className="skeleton h-10 w-full rounded-control" />
        </div>
      ) : data === null ? (
        <p className="type-body-sm px-3 py-3 text-text-secondary">{current.error ?? t("No insider filings found.")}</p>
      ) : data.moves.length === 0 ? (
        <p className="type-body-sm px-3 py-3 text-text-secondary">
          {data.pending > 0
            ? t("Reading its recent Form 4s…")
            : t("No open-market buying or selling in its last {filings} insider filings — only grants, exercises and tax withholding, if anything.", { filings: data.filings })}
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
                        {(buy
                          ? t("Bought {shares} sh", { shares: move.shares.toLocaleString("en-US") })
                          : t("Sold {shares} sh", { shares: move.shares.toLocaleString("en-US") }))}
                      </span>
                      {move.avgPrice !== null && <span className="whitespace-nowrap">{t("at ~{avgPrice}", { avgPrice: formatPriceUsd(move.avgPrice) })}</span>}
                      {move.tradeDate && <span className="whitespace-nowrap">· {dateLabel(move.tradeDate, now)}</span>}
                      {!buy && move.planned && <span className="whitespace-nowrap">{t("· scheduled 10b5-1")}</span>}
                      {!buy && move.soldAll && <span className="whitespace-nowrap">{t("· sold everything")}</span>}
                    </p>
                  </div>
                  <a
                    href={move.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("Open the Form 4")}
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
                t("Over its last {filings} Form 4s, insiders at {company} ({ticker}) bought {buyValue} in {buys} trades and sold {sellValue} in {sells} trades. What does this pattern suggest, and what would change that reading?", {
                  filings: data.filings,
                  company: data.company ?? query,
                  ticker: data.ticker ?? query,
                  buyValue: formatCompactUsd(data.summary.buyValue),
                  buys: data.summary.buys,
                  sellValue: formatCompactUsd(data.summary.sellValue),
                  sells: data.summary.sells,
                }),
              )
            }
            className="type-label mt-2 inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {t("Ask Elyra what this pattern says")}
          </button>
        </div>
      )}
    </section>
  );
}

/** Money in against money out, with the people behind each. */
function InsiderBalance({ data }: { data: CompanyInsiders }) {
  const t = useT();
  const { buyValue, sellValue, buys, sells, buyers, sellers } = data.summary;
  const total = buyValue + sellValue;
  const buyShare = total > 0 ? (buyValue / total) * 100 : 0;
  return (
    <div>
      <p className="type-label text-text-secondary">
        {buys === 0 ? (
          t("Nothing bought on the open market")
        ) : (
          <>
            <span className="type-data text-positive">{formatCompactUsd(buyValue)}</span>{" "}{t("bought · {trades} by {insiders}", { trades: buys === 1 ? t("1 trade") : t("{count} trades", { count: buys }), insiders: buyers === 1 ? t("1 insider") : t("{count} insiders", { count: buyers }) })}
          </>
        )}
      </p>
      <p className="type-label text-text-secondary">
        {sells === 0 ? (
          t("Nothing sold on the open market")
        ) : (
          <>
            <span className="type-data text-text-primary">{formatCompactUsd(sellValue)}</span>{" "}{t("sold · {trades} by {insiders}", { trades: sells === 1 ? t("1 trade") : t("{count} trades", { count: sells }), insiders: sellers === 1 ? t("1 insider") : t("{count} insiders", { count: sellers }) })}
          </>
        )}
      </p>
      <div
        role="img"
        aria-label={t("{buyShare}% of insider money moved was buying", { buyShare: buyShare.toFixed(0) })}
        className="mt-2 flex h-2 overflow-hidden rounded-pill bg-surface-hover"
      >
        {buyValue > 0 && <span className="h-full bg-sage" style={{ width: `${Math.max(buyShare, 2)}%` }} />}
        {sellValue > 0 && <span className="h-full flex-1 bg-surface-active" />}
      </div>
    </div>
  );
}
