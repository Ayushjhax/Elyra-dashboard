"use client";

import { useState } from "react";
import { BellOff, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatRelativeTime } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { useAssetsBySymbols } from "@/lib/market/usePrices";
import { signalPrompt } from "@/lib/mock/chat";
import { useElyraStore } from "@/lib/store";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   One signal, as a card.

   The three levels are shown as a row of their own because that is the part
   an operator reads first — where it is measured from, where it is going, and
   where the idea is wrong. Target and stop carry their distance from entry,
   since a level without its distance says nothing about the shape of the
   setup.

   Everything here is observational: a side is which way the setup leans, not
   an instruction, and the historical win rate sits next to the fire count so
   a 34% over 29 fires cannot be read as a promise.
--------------------------------------------------------------------------- */

/** Percent from entry to a level, in the direction the setup leans. */
function distancePct(from: number, to: number, side: Signal["side"]): number {
  const raw = (to / from - 1) * 100;
  return side === "long" ? raw : -raw;
}

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
        ${value.toLocaleString(undefined, {
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

export function SignalCard({
  signal,
  onViewSetup,
}: {
  signal: Signal;
  onViewSetup: (signal: Signal) => void;
}) {
  const [metricsOpen, setMetricsOpen] = useState(false);

  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const askElyra = useElyraStore((state) => state.askElyra);
  const setRightDrawerOpen = useElyraStore((state) => state.setRightDrawerOpen);
  const bySymbol = useAssetsBySymbols([signal.symbol]);
  const asset = bySymbol.get(signal.symbol.toUpperCase());

  const expired = signal.status === "expired";
  const decimals = priceDecimals(signal.entry);

  const toTarget = distancePct(signal.entry, signal.target, signal.side);
  const toStop = distancePct(signal.entry, signal.stop, signal.side);

  function select(): void {
    if (asset) setSelectedAssetId(asset.id);
  }

  return (
    <li>
      <article
        className={cn(
          "flex flex-col gap-2.5 border-b border-border-subtle px-3 py-3",
          /* Expired cards stay on the list as a record, recessed rather than
             hidden — the reasoning is still worth reading after the fact. */
          expired ? "opacity-65" : "agent-rail pl-2.5",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "type-label inline-flex shrink-0 items-center gap-1.5 rounded-pill px-1.5 py-0.5",
              expired
                ? "bg-negative-bg text-negative"
                : "bg-positive-bg text-positive",
            )}
          >
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-pill bg-current"
            />
            {expired ? "Expired" : "Active"}
          </span>
          <span className="type-label ml-auto shrink-0 text-text-muted">
            {expired
              ? `Expired ${formatRelativeTime(signal.expiresAt)}`
              : `${signal.source} · ${formatRelativeTime(signal.createdAt)}`}
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
            <span className="type-data truncate text-text-primary">
              {signal.symbol}
            </span>
          </button>
          <span
            className={cn(
              "type-data-sm shrink-0 rounded-chip border px-1.5 py-0.5",
              signal.side === "long"
                ? "border-border-subtle text-positive"
                : "border-border-subtle text-negative",
            )}
          >
            {signal.side === "long" ? "Long" : "Short"}
          </span>
        </div>

        <div>
          <Eyebrow className="mb-1">Setup</Eyebrow>
          <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-card border border-border-subtle bg-surface-raised">
            <Level
              label="Entry"
              value={signal.entry}
              note="Market"
              decimals={decimals}
            />
            <Level
              label="Target"
              value={signal.target}
              note={`${toTarget >= 0 ? "+" : ""}${toTarget.toFixed(1)}%`}
              tone="positive"
              decimals={decimals}
            />
            <Level
              label="Stop"
              value={signal.stop}
              note={`${toStop >= 0 ? "+" : ""}${toStop.toFixed(1)}%`}
              tone="negative"
              decimals={decimals}
            />
          </div>
        </div>

        <div className="agent-rail pl-2.5">
          <Eyebrow className="mb-1">Thesis</Eyebrow>
          <p className="type-body-sm text-text-primary">{signal.thesis}</p>
          <p className="type-label mt-1 text-text-muted">
            Regime: {signal.regime}. {signal.winRatePct}% win rate over{" "}
            {signal.backtestFires} backtested fires.
          </p>
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
            <dl className="mt-1 flex flex-col gap-1 px-2">
              {signal.metrics.map((metric) => (
                <div key={metric.label} className="flex items-baseline gap-2">
                  <dt className="type-label min-w-0 flex-1 truncate text-text-muted">
                    {metric.label}
                  </dt>
                  <dd
                    className={cn(
                      "type-data-sm shrink-0",
                      metric.tone === "positive" && "text-positive",
                      metric.tone === "negative" && "text-negative",
                      metric.tone === undefined && "text-text-secondary",
                    )}
                  >
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="quiet"
            className="flex-1"
            disabled={expired}
            onClick={() => onViewSetup(signal)}
          >
            {expired ? "Expired" : "View setup"}
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
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Mute ${signal.source} signals for ${signal.symbol}`}
            disabled={expired}
          >
            <BellOff size={14} strokeWidth={1.5} aria-hidden />
          </Button>
        </div>
      </article>
    </li>
  );
}
