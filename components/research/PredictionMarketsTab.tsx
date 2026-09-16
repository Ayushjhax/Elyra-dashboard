"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Prediction Markets.

   ── This panel renders. It does not compute. ───────────────────────────

   Every figure comes from /api/prediction/*, which reads the same services
   the Agent and Telegram read. Nothing here recalculates a spread or a
   microprice, so the three surfaces cannot disagree.

   ── Three states, and the third is the point ───────────────────────────

   Loading, content, and UNAVAILABLE-WITH-A-REASON. A signal that was refused
   because the book is stale, or a win rate that does not exist because the
   venue publishes no historical depth, renders as that sentence — not as a
   blank, and never as a plausible number. An empty panel reads as "nothing is
   happening", which is a different and false claim.
--------------------------------------------------------------------------- */

interface OutcomeRow {
  tokenId: string;
  label: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  spread: number | null;
  transport: string;
}

interface LiveResponse {
  market: {
    id: string;
    question: string;
    endsAt: string | null;
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    url: string | null;
  };
  phase: string;
  outcomes: OutcomeRow[];
  warnings: string[];
}

interface DepthReading {
  bidUsd: number;
  askUsd: number;
  imbalance: number | null;
}

interface Analytics {
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  microprice: number | null;
  spreadPoints: number | null;
  spreadBps: number | null;
  depth: { top1: DepthReading; top5: DepthReading; top10: DepthReading; within2c: DepthReading };
  weightedImbalance: number | null;
  bidWalls: Array<{ price: number; notionalUsd: number; persistenceCount: number }>;
  askWalls: Array<{ price: number; notionalUsd: number; persistenceCount: number }>;
  crossed: boolean;
  oneSided: boolean;
  transport: string;
}

interface BookResponse {
  outcome: string | null;
  bids: Array<{ price: number; size: number; notional: number }>;
  asks: Array<{ price: number; size: number; notional: number }>;
  analytics: Analytics | null;
  transport: string;
}

interface Basket {
  observedMidpoint: number | null;
  microprice: number | null;
  recentVwap: number | null;
  observedLastTrade: number | null;
  complementCheck: number | null;
  complementDeviationPoints: number | null;
  basketProbability: number | null;
  components: Array<{ label: string; value: number; weight: number }>;
  confidence: string;
  warnings: string[];
  deviationFromAskPoints: number | null;
  reading: string | null;
}

interface Signal {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcomeLabel: string;
  strategyId: string;
  strategyVersion: string;
  direction: string;
  entry: {
    type: string;
    price?: number;
    minPrice?: number;
    maxPrice?: number;
    trigger?: string;
    executablePrice?: number | null;
    missed?: boolean;
  };
  target: { price?: number; maxPrice?: number; basis: string };
  stop: { price?: number; invalidation?: string; basis: string; executable: boolean };
  riskReward: number | null;
  historicalWinRate: {
    valuePct: number;
    sampleSize: number;
    insufficientSample: boolean;
    marketUniverse: string;
    successDefinition: string;
    lookback: string;
    dataSource: string;
  } | null;
  winRateUnavailableReason: string | null;
  strength: string;
  liquidityQuality: string;
  evidence: Array<{ label: string; value: number | string; direction: string; source: string }>;
  resolutionProximity: string;
  eventRisk: boolean;
  dataFreshnessMs: number;
  transport: string;
  generatedAt: string;
  warnings: string[];
}

interface SignalResponse {
  signal: Signal | null;
  reason?: string;
  skipped: Array<{ strategyId: string; reason: string }>;
  basket: Basket | null;
  phase: string | null;
}

/* ---------------------------------------------------------------------------
   Formatting
--------------------------------------------------------------------------- */

/* A decimal only when the value is not a whole cent — otherwise a 11.5¢
   midpoint prints as "12¢" and looks identical to the 12¢ ask. */
const cents = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const points = value * 100;
  const whole = Math.abs(points - Math.round(points)) < 1e-9;
  return `${points.toFixed(whole ? 0 : 1)}¢`;
};

const pct = (value: number | null | undefined, digits = 1): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : "—";

const usd = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
  return `$${Math.round(value)}`;
};

const signed = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
    : "—";

const DIRECTION_LABEL: Record<string, string> = {
  long_yes: "LONG YES",
  long_no: "LONG NO",
  long_outcome: "LONG OUTCOME",
  watch: "WATCH",
  neutral: "NEUTRAL",
};

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-base p-4">
      <p className="type-body-sm text-text-secondary">{reason}</p>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-text-muted">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      <span className="type-label">{label}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-label text-text-muted">{label}</p>
      <p className="type-body-sm tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Order book ladder
--------------------------------------------------------------------------- */

function Ladder({ book }: { book: BookResponse }) {
  const analytics = book.analytics;
  const rows = 8;

  /* Cumulative depth is what a taker actually walks through, so it is shown
     beside each level rather than left for the reader to add up. */
  const asks = book.asks.slice(0, rows);
  const bids = book.bids.slice(0, rows);

  /* Cumulative depth, without reassigning a variable during render: each
     level's running total is the sum of everything at or better than it. */
  const withCumulative = (levels: Array<{ price: number; size: number; notional: number }>) =>
    levels.map((level, index) => ({
      ...level,
      cumulative: levels
        .slice(0, index + 1)
        .reduce((total, entry) => total + entry.notional, 0),
    }));

  const askRows = withCumulative(asks);
  const bidRows = withCumulative(bids);

  const widest = Math.max(
    ...askRows.map((row) => row.notional),
    ...bidRows.map((row) => row.notional),
    1,
  );

  return (
    <div className="space-y-2">
      <div className="space-y-px">
        {[...askRows].reverse().map((level) => (
          <Row key={`ask-${level.price}`} level={level} widest={widest} side="ask" />
        ))}
      </div>

      <div className="flex items-center justify-between rounded-card border border-border-subtle bg-surface-base px-3 py-2">
        <span className="type-label text-text-muted">Mid</span>
        <span className="type-body-sm tabular-nums text-text-primary">
          {cents(analytics?.midpoint)}
        </span>
        <span className="type-label text-text-muted">Microprice</span>
        <span className="type-body-sm tabular-nums text-text-primary">
          {cents(analytics?.microprice)}
        </span>
      </div>

      <div className="space-y-px">
        {bidRows.map((level) => (
          <Row key={`bid-${level.price}`} level={level} widest={widest} side="bid" />
        ))}
      </div>
    </div>
  );
}

function Row({
  level,
  widest,
  side,
}: {
  level: { price: number; size: number; notional: number; cumulative: number };
  widest: number;
  side: "bid" | "ask";
}) {
  const share = Math.min(100, (level.notional / widest) * 100);

  return (
    <div className="relative flex items-center justify-between overflow-hidden rounded px-2 py-1">
      {/* Depth bar. Decorative — the figures beside it carry the meaning. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0",
          side === "bid" ? "bg-accent-positive/12" : "bg-accent-negative/12",
        )}
        style={{ width: `${share}%` }}
      />
      <span
        className={cn(
          "relative type-body-sm tabular-nums",
          side === "bid" ? "text-accent-positive" : "text-accent-negative",
        )}
      >
        {cents(level.price)}
      </span>
      <span className="relative type-body-sm tabular-nums text-text-secondary">
        {Math.round(level.size).toLocaleString()}
      </span>
      <span className="relative type-label tabular-nums text-text-muted">
        {usd(level.cumulative)}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The signal panel
--------------------------------------------------------------------------- */

function SignalPanel({ response }: { response: SignalResponse }) {
  const signal = response.signal;

  if (signal === null) {
    return (
      <div className="space-y-3">
        <Unavailable
          reason={response.reason ?? "No signal could be produced from this order book."}
        />
        {response.skipped.length > 0 && (
          <div className="rounded-card border border-border-subtle bg-surface-base p-4">
            <p className="type-label text-text-muted">Not evaluated</p>
            <ul className="mt-2 space-y-1">
              {response.skipped.slice(0, 6).map((entry) => (
                <li key={entry.strategyId} className="type-body-sm text-text-secondary">
                  <span className="text-text-primary">{entry.strategyId}</span> — {entry.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const actionable =
    signal.direction === "long_yes" ||
    signal.direction === "long_no" ||
    signal.direction === "long_outcome";

  const entry =
    signal.entry.minPrice !== undefined && signal.entry.maxPrice !== undefined
      ? `${cents(signal.entry.minPrice)}–${cents(signal.entry.maxPrice)}`
      : cents(signal.entry.price);

  const rate = signal.historicalWinRate;

  return (
    <div className="space-y-4 rounded-card border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="type-label text-text-muted">Technical signal</p>
          <p className="type-body text-text-primary">
            {DIRECTION_LABEL[signal.direction] ?? signal.direction}
            <span className="text-text-muted"> · {signal.outcomeLabel}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <span className="type-label rounded-full border border-border-subtle px-2 py-0.5 text-text-secondary">
            {signal.strength} strength
          </span>
          <span className="type-label rounded-full border border-border-subtle px-2 py-0.5 text-text-secondary">
            {signal.liquidityQuality} liquidity
          </span>
        </div>
      </div>

      {actionable && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Entry" value={entry} />
          <Field label="Target" value={cents(signal.target.price ?? signal.target.maxPrice)} />
          {/* "Invalidation" wherever a fill cannot be promised — a thin book
              gaps through a level rather than filling at it. */}
          <Field
            label={signal.stop.executable ? "Stop" : "Invalidation"}
            value={cents(signal.stop.price)}
          />
          <Field
            label="Risk / Reward"
            value={signal.riskReward === null ? "—" : signal.riskReward.toFixed(2)}
          />
        </div>
      )}

      {!actionable && signal.entry.trigger !== undefined && (
        <p className="type-body-sm text-text-secondary">{signal.entry.trigger}</p>
      )}

      <div>
        <p className="type-label text-text-muted">Historical win rate</p>
        {rate === null ? (
          /* The engine's own sentence — for an order-book strategy it carries
             the forward-collection progress, which is "not yet" rather than
             "never". A hard-coded replacement here would freeze that. */
          <p className="type-body-sm text-text-secondary">
            {signal.winRateUnavailableReason ??
              "Not available — no comparable historical sample exists for this strategy."}
          </p>
        ) : rate.insufficientSample ? (
          <p className="type-body-sm text-text-secondary">
            Insufficient sample · {rate.sampleSize} comparable signals
          </p>
        ) : (
          <>
            <p className="type-body tabular-nums text-text-primary">
              {rate.valuePct.toFixed(1)}%{" "}
              <span className="type-body-sm text-text-muted">
                · {rate.sampleSize} comparable signals
              </span>
            </p>
            <p className="type-label text-text-muted">
              {signal.strategyId} · {rate.marketUniverse}
            </p>
            <p className="type-label text-text-muted">{rate.successDefinition}</p>
          </>
        )}
      </div>

      {signal.evidence.length > 0 && (
        <div>
          <p className="type-label text-text-muted">Evidence</p>
          <ul className="mt-1 space-y-1">
            {signal.evidence.map((item) => (
              <li key={item.label} className="type-body-sm text-text-secondary">
                <span
                  aria-hidden
                  className={cn(
                    "mr-1.5",
                    item.direction === "supports"
                      ? "text-accent-positive"
                      : item.direction === "contradicts"
                        ? "text-accent-negative"
                        : "text-text-muted",
                  )}
                >
                  {item.direction === "supports" ? "✓" : item.direction === "contradicts" ? "✗" : "·"}
                </span>
                {item.label}: <span className="tabular-nums">{String(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Strategy" value={`${signal.strategyId} v${signal.strategyVersion}`} />
        <Field label="Resolution" value={signal.resolutionProximity} />
        <Field
          label="Data"
          value={signal.transport === "realtime" ? "Live feed" : "REST snapshot"}
        />
        <Field label="Age" value={`${Math.round(signal.dataFreshnessMs / 1000)}s`} />
      </div>

      {signal.target.basis.length > 0 && (
        <p className="type-label text-text-muted">Target basis: {signal.target.basis}</p>
      )}
      {signal.stop.basis.length > 0 && (
        <p className="type-label text-text-muted">Invalidation basis: {signal.stop.basis}</p>
      )}

      {signal.warnings.length > 0 && (
        <ul className="space-y-1">
          {signal.warnings.map((warning) => (
            <li key={warning} className="type-body-sm text-accent-warning">
              {warning}
            </li>
          ))}
        </ul>
      )}

      <p className="type-label text-text-muted">
        Computed by Elyra&apos;s deterministic engine from the venue&apos;s live order book.
        Analysis, not advice — a signal does not place an order.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Basket panel
--------------------------------------------------------------------------- */

function BasketPanel({ basket }: { basket: Basket }) {
  return (
    <div className="space-y-3 rounded-card border border-border-subtle bg-surface-raised p-4">
      <div className="flex items-baseline justify-between">
        <p className="type-label text-text-muted">Elyra Probability Basket</p>
        <span className="type-label rounded-full border border-border-subtle px-2 py-0.5 text-text-secondary">
          {basket.confidence} confidence
        </span>
      </div>

      <p className="type-display tabular-nums text-text-primary">
        {pct(basket.basketProbability)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Observed mid" value={pct(basket.observedMidpoint)} />
        <Field label="Microprice" value={pct(basket.microprice)} />
        <Field label="Recent VWAP" value={pct(basket.recentVwap)} />
        <Field label="Last trade" value={pct(basket.observedLastTrade)} />
      </div>

      {basket.components.length > 0 && (
        <div>
          <p className="type-label text-text-muted">Components</p>
          <ul className="mt-1 space-y-0.5">
            {basket.components.map((part) => (
              <li key={part.label} className="type-body-sm text-text-secondary">
                {part.label}{" "}
                <span className="tabular-nums text-text-primary">{pct(part.value)}</span>
                <span className="type-label text-text-muted"> × {part.weight.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {basket.complementCheck !== null && (
        <div>
          <p className="type-label text-text-muted">YES/NO integrity check</p>
          <p className="type-body-sm text-text-secondary">
            <span className="tabular-nums text-text-primary">{pct(basket.complementCheck)}</span>
            {" · deviation "}
            <span className="tabular-nums">
              {signed(basket.complementDeviationPoints, 2)} pts
            </span>
          </p>
          <p className="type-label text-text-muted">
            Weighted zero. On Polymarket a NO share is the complement of a YES share in the same
            order book, so this equals the midpoint by construction — a non-zero deviation means
            one side is stale, the book is crossed, or an arbitrage is open.
          </p>
        </div>
      )}

      {basket.deviationFromAskPoints !== null && (
        <Field
          label="Difference vs executable ask"
          value={`${signed(basket.deviationFromAskPoints, 1)} pts`}
        />
      )}

      {basket.warnings.length > 0 && (
        <ul className="space-y-1">
          {basket.warnings.map((warning) => (
            <li key={warning} className="type-label text-text-muted">
              {warning}
            </li>
          ))}
        </ul>
      )}

      <p className="type-label text-text-muted">
        An analytical reference built from observable prices. Not a guaranteed probability, and
        not a forecast Elyra is making.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The tab
--------------------------------------------------------------------------- */

const EXAMPLES = ["fed september", "bitcoin", "election"];

export function PredictionMarketsTab() {
  const authedFetch = useAuthedFetch();

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [book, setBook] = useState<BookResponse | null>(null);
  const [signal, setSignal] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (market: string) => {
      setBusy(true);
      setError(null);
      try {
        const encoded = encodeURIComponent(market);
        const liveResponse = await authedFetch(`/api/prediction/markets/${encoded}/live`);
        if (!liveResponse.ok) {
          setError(`No Polymarket market matched "${market}".`);
          setLive(null);
          setBook(null);
          setSignal(null);
          return;
        }

        const liveBody = (await liveResponse.json()) as LiveResponse;
        setLive(liveBody);

        /* Book and signal are fetched against the RESOLVED id rather than the
           original text, so all three panels describe the same market even
           when the search matched something unexpected. */
        const id = encodeURIComponent(liveBody.market.id);

        const [bookResponse, signalResponse] = await Promise.all([
          authedFetch(`/api/prediction/markets/${id}/orderbook`),
          authedFetch(`/api/prediction/markets/${id}/signal`),
        ]);

        setBook(bookResponse.ok ? ((await bookResponse.json()) as BookResponse) : null);
        setSignal(signalResponse.ok ? ((await signalResponse.json()) as SignalResponse) : null);
      } catch {
        setError("The market could not be read.");
      } finally {
        setBusy(false);
      }
    },
    [authedFetch],
  );

  const analytics = book?.analytics ?? null;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = query.trim();
          if (trimmed.length === 0) return;
          setSubmitted(trimmed);
          void load(trimmed);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search prediction markets…"
          aria-label="Search prediction markets"
          className="min-w-0 flex-1 rounded-card border border-border-subtle bg-surface-base px-3 py-2 type-body-sm text-text-primary placeholder:text-text-muted"
        />
        <Button type="submit" disabled={busy || query.trim().length === 0}>
          {busy ? "Reading…" : "Read book"}
        </Button>
      </form>

      {submitted === null && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                setSubmitted(example);
                void load(example);
              }}
              className="type-label rounded-full border border-border-subtle px-3 py-1 text-text-secondary hover:text-text-primary"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {busy && <Spinner label="Reading the live order book…" />}
      {error !== null && <Unavailable reason={error} />}

      {live !== null && !busy && (
        <>
          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <p className="type-body text-text-primary">{live.market.question}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="24h volume" value={usd(live.market.volume24hUsd)} />
              <Field label="Liquidity" value={usd(live.market.liquidityUsd)} />
              <Field
                label="Resolves"
                value={
                  live.market.endsAt === null
                    ? "—"
                    : new Date(live.market.endsAt).toISOString().slice(0, 10)
                }
              />
              {/* The phase is shown because a snapshot is not a live feed and
                  the difference changes what the numbers can support. */}
              <Field label="Feed" value={live.phase} />
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              {live.outcomes.map((outcome) => (
                <div key={outcome.tokenId}>
                  <p className="type-label text-text-muted">{outcome.label}</p>
                  <p className="type-body-sm tabular-nums text-text-primary">
                    {cents(outcome.bestBid)} / {cents(outcome.bestAsk)}
                  </p>
                </div>
              ))}
            </div>

            {live.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {live.warnings.map((warning) => (
                  <li key={warning} className="type-label text-text-muted">
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {signal !== null && <SignalPanel response={signal} />}

          {book !== null && (
            <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
              <div className="flex items-baseline justify-between">
                <p className="type-label text-text-muted">
                  {book.outcome} order book
                </p>
                <span className="type-label text-text-muted">
                  {book.transport === "realtime" ? "Live feed" : "REST snapshot"}
                </span>
              </div>

              {analytics !== null && (
                <div className="mb-3 mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field
                    label="Spread"
                    value={
                      analytics.spreadPoints === null
                        ? "—"
                        : `${analytics.spreadPoints.toFixed(1)} pts`
                    }
                  />
                  <Field
                    label="Imbalance (top 5)"
                    value={signed(analytics.depth.top5.imbalance)}
                  />
                  <Field label="Bid depth" value={usd(analytics.depth.top5.bidUsd)} />
                  <Field label="Ask depth" value={usd(analytics.depth.top5.askUsd)} />
                </div>
              )}

              <div className="overflow-x-auto">
                <Ladder book={book} />
              </div>

              {analytics !== null &&
                analytics.bidWalls.length === 0 &&
                analytics.askWalls.length === 0 && (
                  <p className="mt-3 type-label text-text-muted">
                    No level has been observed often enough to be called persistent. That is not
                    the same as &ldquo;no large orders&rdquo; — persistence needs repeated
                    observations, which a snapshot cannot provide.
                  </p>
                )}
            </div>
          )}

          {signal?.basket != null && <BasketPanel basket={signal.basket} />}
        </>
      )}
    </div>
  );
}
