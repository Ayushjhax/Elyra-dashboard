"use client";

import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { Card, CardHead, SkeletonRows, Unavailable } from "@/components/portfolio/primitives";
import { brief, capitalHealth } from "@/lib/portfolio/derive";
import { truncateMiddle } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { useWalletActivity } from "@/lib/wallet/useWalletActivity";
import { cn } from "@/lib/utils";
import type { HealthTone, PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   Capital health, the brief, and what just happened.

   The three panels below are the ones that distinguish a capital dashboard
   from a balance list, and all three are held to the same rule: every line
   is derived from a figure already on this page. Nothing is fetched here
   that the snapshot does not already contain, except activity, which reuses
   the wallet feed the dashboard route already polls.
--------------------------------------------------------------------------- */

const TONE: Record<HealthTone, string> = {
  good: "text-positive",
  watch: "text-accent",
  risk: "text-negative",
  neutral: "text-text-secondary",
};

export function CapitalHealthCard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const metrics = capitalHealth(snapshot);

  return (
    <Card className="min-w-0">
      <CardHead title="Capital Health" />
      {metrics.length === 0 ? (
        <p className="type-label px-3 py-5 text-center text-text-muted">
          Health metrics need a priced portfolio to measure against.
        </p>
      ) : (
        <ul className="flex list-none flex-col">
          {metrics.map((metric) => (
            <li
              key={metric.key}
              className="flex items-baseline gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0"
            >
              <span className="type-label min-w-0 flex-1 truncate text-text-secondary">
                {metric.label}
              </span>
              <span className="type-data-sm shrink-0 tabular-nums text-text-primary">
                {metric.value}
              </span>
              {/* The tone is carried by the word as well as the colour, so
                  "Concentrated" reads the same in greyscale. */}
              <span className={cn("type-label w-24 shrink-0 text-right", TONE[metric.tone])}>
                {metric.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Elyra Brief
--------------------------------------------------------------------------- */

export function ElyraBriefCard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const observations = brief(snapshot);
  const askElyra = useElyraStore((state) => state.askElyra);
  const setAssistOpen = useElyraStore((state) => state.setAssistOpen);

  /* The prompt carries the figures already on screen rather than asking the
     model to go and find them. It prefills the existing composer — this does
     not send, and there is no second chat implementation here. */
  const total = snapshot.summary.totalValueUsd;
  const prompt = [
    "Review my portfolio.",
    total !== null && `Net value is about $${total.toFixed(2)}.`,
    snapshot.spot.length > 0 &&
      `Largest holdings: ${[...snapshot.spot]
        .filter((h) => h.verified && h.valueUsd !== null)
        .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
        .slice(0, 4)
        .map((h) => h.symbol)
        .join(", ")}.`,
    snapshot.perps.length > 0 &&
      `Open perps: ${snapshot.perps.map((p) => `${p.side} ${p.market}`).join(", ")}.`,
    "What should I be paying attention to?",
  ]
    .filter((line): line is string => typeof line === "string")
    .join(" ");

  return (
    <Card className="min-w-0">
      <CardHead
        title="Elyra Brief"
        right={<Sparkles size={13} strokeWidth={1.5} aria-hidden className="text-agent-accent" />}
      />

      {observations.length === 0 ? (
        <p className="type-label px-3 py-5 text-text-muted">
          Nothing stands out yet. Observations appear as the portfolio moves —
          they are derived from the figures on this page, never generated.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-1.5 p-3">
          {observations.map((observation) => (
            <li key={observation.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 size-1 shrink-0 rounded-pill",
                  observation.tone === "positive"
                    ? "bg-positive"
                    : observation.tone === "negative"
                      ? "bg-negative"
                      : "bg-text-muted",
                )}
              />
              <p className="type-body-sm text-text-secondary">{observation.text}</p>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          setAssistOpen(true);
          askElyra(prompt);
        }}
        className={cn(
          "type-label flex items-center gap-1 border-t border-border-subtle px-3 py-2 text-left",
          "text-agent-accent transition-colors duration-[var(--dur-fast)] ease-brand",
          "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        )}
      >
        Ask Elyra about this portfolio
        <ArrowRight size={11} strokeWidth={1.5} aria-hidden />
      </button>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Recent activity
--------------------------------------------------------------------------- */

const STATUS_TONE: Record<string, string> = {
  confirmed: "text-positive",
  pending: "text-accent",
  failed: "text-negative",
};

function ago(iso: string | null, now: number | null): string {
  if (iso === null) return "just now";
  if (now === null) return "—";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function RecentActivityCard() {
  /* The existing wallet feed, not a new endpoint. It returns confirmed
     signatures rather than decoded transfers — the route says why — so each
     row names what the chain actually reports and links out for the rest,
     instead of guessing "Swapped 250 USDC" from partial data. */
  const feed = useWalletActivity(12);
  const now = useMinute();

  return (
    <Card className="min-w-0">
      <CardHead title="Recent Activity" sub="Confirmed on-chain, newest first" />

      {feed.unconfigured ? (
        <Unavailable
          title="Activity unavailable"
          body="SOLANA_RPC_URL is not set, so transaction history cannot be read."
        />
      ) : feed.error !== null ? (
        <Unavailable
          tone="warning"
          title="Activity unavailable"
          body={`${feed.error} Other portfolio data is up to date.`}
          onRetry={feed.refetch}
        />
      ) : feed.isLoading ? (
        <SkeletonRows rows={4} />
      ) : feed.items.length === 0 ? (
        <p className="type-label px-3 py-5 text-center text-text-muted">
          No transactions yet.
        </p>
      ) : (
        <ul className="flex list-none flex-col">
          {feed.items.map((item) => (
            <li key={item.signature}>
              <a
                href={txExplorerUrl(item.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0",
                  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1 shrink-0 rounded-pill",
                    item.status === "confirmed"
                      ? "bg-positive"
                      : item.status === "pending"
                        ? "bg-accent"
                        : "bg-negative",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="type-data-sm text-text-primary">
                    {item.memo ?? "Transaction"}
                  </span>
                  <span className="type-mono-addr ml-1.5 text-text-muted">
                    {truncateMiddle(item.signature, 4, 4)}
                  </span>
                </span>
                <span className={cn("type-label shrink-0", STATUS_TONE[item.status])}>
                  {item.status}
                </span>
                <span className="type-label w-8 shrink-0 text-right text-text-muted">
                  {ago(item.at, now)}
                </span>
                <ExternalLink size={10} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
