"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus, RefreshCw, Sparkles } from "lucide-react";
import type { MarketSignalsResponse } from "@/app/api/market/signals/route";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/format";
import { useAssets } from "@/lib/market/usePrices";
import type { MarketSignal } from "@/lib/research/signals";
import { useElyraStore } from "@/lib/store";
import { parseTrackerSignalList, type TrackerSignal } from "@/lib/tracker/types";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Elyra's signals, in the agent panel.

   Two reads Elyra makes itself, neither of which needs an external service or
   the database:

   - Market signals, from lib/research/signals.ts: what the data shows on the
     selected market and the watchlist — a move, a funding dislocation, a gap
     between venues — each with the readings behind it and anything pointing
     the other way. Strength is earned by corroboration, never asserted.
   - Smart-money consensus: where the most profitable Hyperliquid wallets
     agree, from the same feed as the Smart money widget.

   "Nothing notable" is a real answer and is said plainly. A panel that always
   finds a signal is a panel whose signals mean nothing.
--------------------------------------------------------------------------- */

const REFRESH_MS = 60_000;
const MAX_SYMBOLS = 6;
const CONSENSUS_SHOWN = 4;

const STRENGTH: Record<MarketSignal["strength"], { label: string; tone: string }> = {
  high: { label: "High", tone: "border-accent-quiet bg-surface-active text-text-primary" },
  medium: { label: "Medium", tone: "border-border-strong bg-surface-raised text-text-secondary" },
  low: { label: "Low", tone: "border-border-subtle text-text-muted" },
};

function DirectionIcon({ direction }: { direction: MarketSignal["direction"] }) {
  if (direction === "positive") {
    return <ArrowUpRight size={14} strokeWidth={1.5} aria-label="Up" className="text-positive" />;
  }
  if (direction === "negative") {
    return <ArrowDownRight size={14} strokeWidth={1.5} aria-label="Down" className="text-negative" />;
  }
  return <Minus size={14} strokeWidth={1.5} aria-label="Flat" className="text-neutral-flat" />;
}

function SignalCard({
  signal,
  now,
  onAsk,
}: {
  signal: MarketSignal;
  now: number | null;
  onAsk: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const strength = STRENGTH[signal.strength];

  return (
    <li className="agent-rail rounded-r-card bg-surface-raised px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="type-data text-text-primary">{signal.symbol}</span>
        <DirectionIcon direction={signal.direction} />
        <span className={cn("type-label rounded-chip border px-1.5", strength.tone)}>
          {strength.label}
        </span>
        <span className="type-data-sm ml-auto text-text-muted">
          {now === null ? "" : formatRelativeTime(signal.generatedAt, now)}
        </span>
      </div>

      <p className="type-body-sm mt-1.5 font-medium text-text-primary">{signal.title}</p>
      <p className="type-body-sm mt-0.5 text-text-secondary">{signal.summary}</p>

      {signal.contradictions.length > 0 && (
        <p className="type-label mt-1.5 text-text-muted">
          Against: {signal.contradictions.join(" · ")}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="type-label flex items-center gap-1 rounded-control px-1 py-1 text-text-secondary hover:text-text-primary"
        >
          <ChevronRight
            size={13}
            strokeWidth={1.5}
            aria-hidden
            className={cn("transition-transform duration-[var(--dur-base)] ease-brand", open && "rotate-90")}
          />
          {signal.evidence.length} readings · {signal.confirmationCount} confirming
        </button>
        <button
          type="button"
          onClick={() =>
            onAsk(`About ${signal.symbol}: "${signal.title}". What is behind it, and what would change it?`)
          }
          className="type-label ml-auto flex items-center gap-1 rounded-control px-2 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
          Ask Elyra
        </button>
      </div>

      {open && (
        <dl className="mt-1 space-y-1 border-t border-border-subtle pt-2">
          {signal.evidence.map((reading) => (
            <div key={`${reading.source}-${reading.label}`} className="flex items-baseline gap-2">
              <dt className="type-label min-w-0 flex-1 truncate text-text-muted">
                {reading.label} · {reading.source}
              </dt>
              <dd className="type-data-sm shrink-0 text-text-primary">{reading.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function ConsensusRow({ signal }: { signal: TrackerSignal }) {
  const long = signal.side === "LONG";
  return (
    <li className="flex items-center gap-2.5 border-t border-border-subtle px-1 py-2 first:border-t-0">
      <span className="type-data w-14 shrink-0 text-text-primary">{signal.symbol}</span>
      <span
        className={cn(
          "type-label rounded-chip px-1.5",
          long ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative",
        )}
      >
        {long ? "Long" : "Short"}
      </span>
      <span className="type-label min-w-0 flex-1 truncate text-text-secondary">{signal.status}</span>
      <span className="type-data-sm shrink-0 text-text-muted">{signal.weightedScore}% of value</span>
    </li>
  );
}

type MarketState = { data: MarketSignalsResponse | null; error: string | null; loading: boolean };
type ConsensusState = { signals: TrackerSignal[]; note: string | null; error: string | null; loading: boolean };

export function ElyraSignals({ onAsk }: { onAsk: (prompt: string) => void }) {
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const watchlist = useElyraStore((state) => state.watchlist);
  const ids = useMemo(() => [selectedAssetId, ...watchlist], [selectedAssetId, watchlist]);
  const { byId } = useAssets(ids);
  const now = useMinute();

  /* The selected market first, then the watchlist; crypto only, because the
     generator reads crypto venues and has nothing to say about a stock. */
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    for (const id of ids) {
      const asset = byId.get(id);
      if (!asset || asset.assetType !== "crypto") continue;
      seen.add(asset.symbol.toUpperCase());
      if (seen.size >= MAX_SYMBOLS) break;
    }
    return [...seen];
  }, [ids, byId]);
  const key = symbols.join(",");

  const [market, setMarket] = useState<MarketState>({ data: null, error: null, loading: true });
  const [consensus, setConsensus] = useState<ConsensusState>({
    signals: [],
    note: null,
    error: null,
    loading: true,
  });

  /* Pure fetches; every setState sits behind a `.then`. */
  const loadMarket = useCallback(async (): Promise<MarketState> => {
    if (key === "") return { data: null, error: null, loading: true };
    try {
      const response = await fetch(`/api/market/signals?symbols=${encodeURIComponent(key)}`);
      return { data: (await response.json()) as MarketSignalsResponse, error: null, loading: false };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error.message : "Signals could not be read.", loading: false };
    }
  }, [key]);

  const loadConsensus = useCallback(async (): Promise<ConsensusState> => {
    try {
      const response = await fetch("/api/tracker/signals?limit=50", { cache: "no-store" });
      const list = parseTrackerSignalList((await response.json()) as unknown);
      return {
        signals: list.signals.slice(0, CONSENSUS_SHOWN),
        note: list.origin === "hyperliquid" ? "Elyra's read of top Hyperliquid wallets" : "Smart-money tracker",
        error: list.error ?? null,
        loading: false,
      };
    } catch (error: unknown) {
      return { signals: [], note: null, error: error instanceof Error ? error.message : "Unavailable", loading: false };
    }
  }, []);

  const refresh = useCallback(() => {
    void loadMarket().then(setMarket);
    void loadConsensus().then(setConsensus);
  }, [loadConsensus, loadMarket]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void loadMarket().then((next) => {
        if (!cancelled) setMarket(next);
      });
      void loadConsensus().then((next) => {
        if (!cancelled) setConsensus(next);
      });
    };
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadConsensus, loadMarket]);

  const signals = (market.data?.results ?? []).flatMap((result) => result.signals);
  const quiet = (market.data?.results ?? [])
    .filter((result) => result.signals.length === 0 && result.warnings.length === 0)
    .map((result) => result.symbol);
  const unread = (market.data?.results ?? []).filter((result) => result.warnings.length > 0 && result.signals.length === 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="type-eyebrow text-text-muted">Market signals</p>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh signals"
          className="inline-flex size-7 items-center justify-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <RefreshCw size={13} strokeWidth={1.5} aria-hidden className={cn(market.loading && "animate-spin")} />
        </button>
      </div>

      {market.loading ? (
        <ul aria-busy="true" aria-label="Loading signals" className="mt-2 list-none space-y-2">
          <li className="skeleton h-24 rounded-card" />
          <li className="skeleton h-24 rounded-card" />
        </ul>
      ) : market.error !== null ? (
        <div className="mt-2 rounded-card border border-border-subtle px-3 py-4 text-center">
          <p className="type-body-sm text-text-secondary">Signals could not be read.</p>
          <p className="type-label mt-1 text-text-muted">{market.error}</p>
          <Button className="mt-3" size="sm" variant="quiet" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {signals.length > 0 && (
            <ul className="mt-2 list-none space-y-2">
              {signals.map((signal) => (
                <SignalCard
                  key={`${signal.symbol}-${signal.type}`}
                  signal={signal}
                  now={now}
                  onAsk={onAsk}
                />
              ))}
            </ul>
          )}
          {quiet.length > 0 && (
            <p className="type-body-sm mt-2 rounded-card border border-border-subtle px-3 py-2.5 text-text-secondary">
              Nothing notable on {quiet.join(", ")} right now
              <span className="text-text-muted"> — no move, funding or venue gap past its threshold.</span>
            </p>
          )}
          {unread.length > 0 && (
            <p className="type-label mt-2 text-text-muted">
              Not read: {unread.map((result) => result.symbol).join(", ")}
            </p>
          )}
        </>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="type-eyebrow text-text-muted">Smart-money consensus</p>
        {consensus.note && <span className="type-label truncate text-text-muted">{consensus.note}</span>}
      </div>
      {consensus.loading ? (
        <div aria-busy="true" aria-label="Loading consensus" className="skeleton mt-2 h-28 rounded-card" />
      ) : consensus.signals.length > 0 ? (
        <ul className="mt-1 list-none">
          {consensus.signals.map((signal) => (
            <ConsensusRow key={signal.id} signal={signal} />
          ))}
        </ul>
      ) : (
        <p className="type-body-sm mt-2 text-text-secondary">
          {consensus.error ?? "No market where top wallets agree right now."}
        </p>
      )}

      <p className="type-label mt-4 text-text-muted">
        Observations from live data, not recommendations. Elyra never places orders.
      </p>
    </div>
  );
}
