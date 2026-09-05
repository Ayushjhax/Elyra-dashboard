"use client";

import { useState } from "react";
import { ChevronDown, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatRelativeTime } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssetsBySymbols } from "@/lib/market/usePrices";
import { signalPrompt } from "@/lib/mock/chat";
import { useElyraStore } from "@/lib/store";
import { isClosed, type SignalDto } from "@/lib/signals/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   One engine signal, as a card.

   This renders what the engine actually computed, including the parts that
   are inconvenient. Four of those are load-bearing and none may be dropped
   to tidy the layout:

   1. **The win rate is a fraction, never a bare percentage.** The engine
      sends `winRateText` pre-formatted — "24/64 (37.5%)", or an em dash
      below the twenty-fire floor. The card prints that string. It never
      computes a percentage of its own, because "37.5%" without "of 64" is
      the same number carrying a claim it cannot support.

   2. **Unmeasured statistics say so, on every figure derived from them.**
      A fixture-backed signal arrives with `[FIXTURE — not a measurement]`
      already at the front of its thesis and `— fixture` on each metric row.
      The card also draws a banner, because a reader scanning levels may
      never reach the prose.

   3. **The disclaimer is not collapsible.** It is the one piece of text that
      must be read by someone who reads nothing else.

   4. **Every level shows its distance from entry.** A price without its
      distance says nothing about the shape of the setup.

   Nothing here is an instruction. A direction is which way the setup leans,
   and the suggested size names the constraint that bound it so a reader can
   see whether it was risk or the portfolio cap.
--------------------------------------------------------------------------- */

function Level({
  label,
  value,
  note,
  tone,
  decimals,
}: {
  label: string;
  value: number;
  note: string;
  tone?: "positive" | "negative";
  decimals: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-1.5">
      <span className="type-label text-text-muted">{label}</span>
      <span className="type-data truncate text-text-primary">
        $
        {value.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </span>
      <span
        className={cn(
          "type-data-sm",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === undefined && "text-text-muted",
        )}
      >
        {note}
      </span>
    </div>
  );
}

/** Sits above the levels, where it cannot be missed by someone skimming. */
function FixtureBanner() {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-1.5 rounded-card border px-2 py-1.5",
        "border-negative/40 bg-negative-bg",
      )}
    >
      <ShieldAlert
        size={13}
        strokeWidth={1.5}
        aria-hidden
        className="mt-0.5 shrink-0 text-negative"
      />
      <p className="type-label text-negative">
        Fixture data — these statistics were not measured. Shown to exercise
        the card; not a result.
      </p>
    </div>
  );
}

export function EngineSignalCard({
  signal,
  onViewSetup,
}: {
  signal: SignalDto;
  onViewSetup: (signal: SignalDto) => void;
}) {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const askElyra = useElyraStore((state) => state.askElyra);
  const setRightDrawerOpen = useElyraStore((state) => state.setRightDrawerOpen);
  /* Keyed on `baseSymbol`, not `symbol`. The engine emits the venue's
     instrument — SOLUSDT — while the asset catalogue is keyed on the asset,
     SOL, so looking up the venue symbol never matched and every engine
     signal rendered the lettered chip instead of its logo. The engine sends
     the base symbol precisely so the UI does not have to guess at suffixes. */
  const lookup = (signal.baseSymbol || signal.symbol).toUpperCase();
  const bySymbol = useAssetsBySymbols([lookup]);
  const asset = bySymbol.get(lookup);

  const closed = isClosed(signal.status);
  const decimals = priceDecimals(signal.levels.entry);
  const fixture = !signal.backtest.statisticsAreMeasured;

  function select(): void {
    if (asset) setSelectedAssetId(asset.id);
  }

  const signed = (value: number): string =>
    `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

  return (
    <li>
      <article
        className={cn(
          "flex flex-col gap-2.5 border-b border-border-subtle px-3 py-3",
          /* Closed cards stay on the list as a record, recessed rather than
             hidden — the reasoning is still worth reading after the fact. */
          closed ? "opacity-65" : "agent-rail pl-2.5",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "type-label inline-flex shrink-0 items-center gap-1.5 rounded-pill px-1.5 py-0.5",
              closed ? "bg-negative-bg text-negative" : "bg-positive-bg text-positive",
            )}
          >
            <span aria-hidden className="inline-block size-1.5 rounded-pill bg-current" />
            {signal.status.replace(/_/g, " ")}
          </span>
          <span className="type-label ml-auto shrink-0 text-text-muted">
            {closed
              ? `Ended ${formatRelativeTime(signal.expiresAt)}`
              : `${signal.backtest.ruleId} · ${formatRelativeTime(signal.createdAt)}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={select}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-chip py-0.5 pr-1.5",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
            )}
          >
            <CoinMark symbol={signal.symbol} logo={asset?.logo ?? null} size={16} />
            <span className="type-data truncate text-text-primary">{signal.symbol}</span>
          </button>
          <span
            className={cn(
              "type-data-sm shrink-0 rounded-chip border border-border-subtle px-1.5 py-0.5",
              signal.direction === "long" ? "text-positive" : "text-negative",
            )}
          >
            {signal.direction === "long" ? "Long" : "Short"}
          </span>
          <span className="type-label shrink-0 rounded-chip border border-border-subtle px-1.5 py-0.5 text-text-muted">
            {signal.regime.replace(/_/g, " ")}
          </span>
          <span className="type-data-sm ml-auto shrink-0 text-text-secondary">
            {signal.conviction.toFixed(0)}
            <span className="type-label text-text-muted"> conviction</span>
          </span>
        </div>

        {fixture && <FixtureBanner />}

        <div>
          <Eyebrow className="mb-1">Setup</Eyebrow>
          <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-card border border-border-subtle bg-surface-raised">
            <Level
              label="Entry"
              value={signal.levels.entry}
              note={signal.levels.entryType}
              decimals={decimals}
            />
            <Level
              label="Target"
              value={signal.levels.target}
              note={signed(signal.levels.targetPct)}
              tone="positive"
              decimals={decimals}
            />
            <Level
              label="Stop"
              value={signal.levels.stop}
              note={signed(signal.levels.stopPct)}
              tone="negative"
              decimals={decimals}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-0.5">
            <span className="type-label text-text-muted">
              R{" "}
              <span className="type-data-sm text-text-secondary">
                {signal.levels.rMultiple.toFixed(2)}
              </span>
            </span>
            <span className="type-label text-text-muted">
              Breakeven{" "}
              <span className="type-data-sm text-text-secondary">
                {(signal.levels.breakevenWinRate * 100).toFixed(1)}%
              </span>
            </span>
            <span className="type-label text-text-muted">
              Size{" "}
              <span className="type-data-sm text-text-secondary">
                {signal.suggestedSizePct.toFixed(2)}%
              </span>{" "}
              ({signal.sizeConstraint.replace(/_/g, " ")})
            </span>
          </div>
        </div>

        <div className="agent-rail pl-2.5">
          <Eyebrow className="mb-1">Thesis</Eyebrow>
          {/* Printed verbatim. The engine's origin label is part of this
              string, and reformatting it here could drop the label. */}
          <p className="type-body-sm text-text-primary">{signal.thesis}</p>
          <p className="type-label mt-1 text-text-muted">
            Win rate{" "}
            <span className={cn(fixture && "text-negative")}>
              {signal.backtest.winRateText}
            </span>
            {signal.backtest.winRate === null && (
              /* Not an omission — the engine refuses to publish a rate below
                 twenty fires, and the card says which it is. */
              <> · below the {20}-fire floor, so no rate is published</>
            )}
          </p>
          {signal.backtest.sampleWarning !== null && (
            <p className="type-label mt-0.5 text-negative">
              {signal.backtest.sampleWarning}
            </p>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setMetricsOpen((open) => !open)}
            aria-expanded={metricsOpen}
            className={cn(
              "type-label flex w-full items-center justify-between rounded-control px-2 py-1.5",
              "border border-border-subtle text-text-secondary",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              "hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            Supporting metrics
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className={cn(
                "transition-transform duration-[var(--dur-base)] ease-brand",
                metricsOpen && "rotate-180",
              )}
            />
          </button>

          {metricsOpen && (
            <>
              <dl className="mt-1 flex flex-col gap-1 px-2">
                {signal.supportingMetrics.map((metric) => (
                  <div key={metric.label} className="flex items-baseline gap-2">
                    <dt className="type-label min-w-0 flex-1 truncate text-text-muted">
                      {metric.label}
                    </dt>
                    <dd
                      className={cn(
                        "type-data-sm shrink-0",
                        metric.tone === "positive" && "text-positive",
                        metric.tone === "negative" && "text-negative",
                        (metric.tone === undefined || metric.tone === "neutral") &&
                          "text-text-secondary",
                      )}
                    >
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Provenance. Every number above came from somewhere, and this
                  is where a reader checks. */}
              <div className="mt-2 px-2">
                <Eyebrow className="mb-1">Provenance</Eyebrow>
                <ul className="flex list-none flex-col gap-0.5">
                  {signal.edges.map((edge) => (
                    <li
                      key={edge.key}
                      className="type-label flex items-baseline gap-2 text-text-muted"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {edge.label} · {edge.family}
                      </span>
                      <span className="shrink-0">
                        {edge.source.provider} · knowable{" "}
                        {formatRelativeTime(edge.source.availableAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="type-label mt-1 text-text-muted">
                  rule {signal.backtest.ruleId} · config{" "}
                  {signal.backtest.configHash.slice(0, 8)} · data{" "}
                  {signal.backtest.dataSnapshotId.slice(0, 8)} · {signal.backtest.gitSha}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="quiet"
            className="flex-1"
            disabled={closed}
            onClick={() => onViewSetup(signal)}
          >
            {closed ? signal.status.replace(/_/g, " ") : "View setup"}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Ask Elyra about the ${signal.symbol} signal`}
            onClick={() => {
              select();
              askElyra(signalPrompt(signal.symbol, signal.thesis));
              setRightDrawerOpen(true);
            }}
          >
            <Search size={14} strokeWidth={1.5} aria-hidden />
          </Button>
        </div>

        {/* Never collapsible. The one line that must reach someone who reads
            nothing else on the card. */}
        <p className="type-label text-text-muted">{signal.disclaimer}</p>
      </article>
    </li>
  );
}
