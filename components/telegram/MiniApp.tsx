"use client";

import { useEffect, useState } from "react";

/* ---------------------------------------------------------------------------
   The Mini App shell.

   ── The security rule this component exists to obey ────────────────────

   It sends `window.Telegram.WebApp.initData` — the RAW signed string — and
   never `initDataUnsafe`. The unsafe object is the same fields already
   parsed, and it is whatever the page was loaded with: a Mini App is an
   ordinary web page in an ordinary webview, so anyone can open its URL with a
   hand-written hash fragment. Reading a user id from it and trusting it is an
   authentication bypass with a convenient API.

   Everything this page knows about who the viewer is comes back from the
   server, which verified the signature with the bot token. The component
   never decides.

   ── Theme ──────────────────────────────────────────────────────────────

   Telegram publishes the client's theme as CSS variables on the webview.
   They are used for the surface so the app does not sit as a bright rectangle
   inside a dark client, with Elyra's own tokens as the fallback for a browser
   opened outside Telegram.
--------------------------------------------------------------------------- */

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: "light" | "dark";
}

function webApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const telegram = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return telegram?.WebApp ?? null;
}

type View =
  | "portfolio"
  | "holdings"
  | "risk"
  | "defi"
  | "prediction"
  | "prediction-trending"
  | "prediction-signals"
  | "prediction-alerts"
  | "backtests";

const TABS: Array<{ id: View; label: string }> = [
  { id: "portfolio", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "risk", label: "Risk" },
  { id: "defi", label: "DeFi" },
  { id: "prediction", label: "Predictions" },
  { id: "prediction-trending", label: "Markets" },
  { id: "prediction-signals", label: "Signals" },
  { id: "prediction-alerts", label: "Alerts" },
  { id: "backtests", label: "Backtests" },
];

interface Payload {
  linked: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

const money = (value: unknown): string => {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
};

/** What one completed load produced, and which tab it was for. */
interface Loaded {
  view: View;
  payload: Payload | null;
  error: string | null;
}

export function TelegramMiniApp() {
  const [view, setView] = useState<View>("portfolio");
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  /* Derived rather than its own state. A `loading` flag set at the top of the
     fetch is a setState inside the effect body — a cascading render, and the
     lint rule that forbids it is right. Comparing what was loaded against
     what is wanted says the same thing without the extra render. */
  const loading = loaded === null || loaded.view !== view;
  const error = loading ? null : loaded.error;
  const payload = loading ? null : loaded.payload;

  useEffect(() => {
    const app = webApp();
    app?.ready();
    app?.expand();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      const app = webApp();

      if (app === null) {
        /* Opened outside Telegram. Said plainly rather than shown as a broken
           page — there is nothing the visitor can do here. */
        if (!cancelled) {
          setLoaded({
            view,
            payload: null,
            error: "Open this from the Elyra bot in Telegram.",
          });
        }
        return;
      }

      try {
        const response = await fetch("/api/telegram/miniapp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          /* The raw signed string. Never initDataUnsafe. */
          body: JSON.stringify({ initData: app.initData, view }),
        });

        const body = (await response.json()) as Payload & { error?: string };
        if (cancelled) return;

        setLoaded(
          response.ok
            ? { view, payload: body, error: null }
            : { view, payload: null, error: body.error ?? "Could not load your account." },
        );
      } catch {
        if (cancelled) return;
        setLoaded({
          view,
          payload: null,
          error: "Could not reach Elyra. Check your connection and try again.",
        });
      }
    };

    void run();

    /* A fast tab switch must not let the slower response overwrite the newer
       one — the classic out-of-order render where the screen settles on the
       tab you left. */
    return () => {
      cancelled = true;
    };
  }, [view]);

  return (
    <div className="mini-root">
      <style>{CSS}</style>

      <header className="mini-header">
        <span className="mini-brand">Elyra</span>
        <span className="mini-sub">Your capital</span>
      </header>

      <nav className="mini-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            className="mini-tab"
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="mini-body">
        {loading ? <p className="mini-muted">Reading…</p> : null}

        {!loading && error !== null ? <p className="mini-error">{error}</p> : null}

        {!loading && error === null && payload?.linked === false ? (
          <div className="mini-card">
            <p>{payload.message}</p>
          </div>
        ) : null}

        {!loading && error === null && payload?.linked === true ? (
          <ViewBody view={view} data={payload.data ?? {}} />
        ) : null}
      </main>
    </div>
  );
}

function ViewBody({ view, data }: { view: View; data: Record<string, unknown> }) {
  /* A tool that could not read returns `error`. Shown as-is: the message was
     written for a person and already says what is unavailable. */
  if (typeof data.error === "string") {
    return <p className="mini-error">{data.error}</p>;
  }

  return (
    <>
      {data.incomplete === true ? (
        /* Never suppressed. A total presented as complete while a venue was
           unreadable is the one failure this product cannot afford. */
        <p className="mini-warn">
          Some sources could not be read. These figures are a floor, not the
          full picture.
        </p>
      ) : null}

      {view === "portfolio" ? <Overview data={data} /> : null}
      {view === "holdings" ? <Holdings data={data} /> : null}
      {view === "risk" ? <Risk data={data} /> : null}
      {view === "defi" ? <Defi data={data} /> : null}
      {view === "prediction" ? <Prediction data={data} /> : null}
      {view === "prediction-trending" ? <PredictionMarkets data={data} /> : null}
      {view === "prediction-signals" ? <PredictionSignals data={data} /> : null}
      {view === "prediction-alerts" ? <PredictionAlerts data={data} /> : null}
      {view === "backtests" ? <Backtests data={data} /> : null}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Backtests

   Read-only here. Configuring a run needs parameter controls that do not fit
   a 380px webview, so the Mini App shows recent results and links out.
--------------------------------------------------------------------------- */

function Backtests({ data }: { data: Record<string, unknown> }) {
  const results = (data.results ?? []) as Array<{
    id: string;
    instrument: string;
    timeframe: string;
    strategyId: string;
    quality: string | null;
    metrics: { totalReturnPct: number; maxDrawdownPct: number; trades: number } | null;
  }>;

  if (results.length === 0) {
    return (
      <div className="mini-card">
        <span className="mini-label">Backtests</span>
        <p className="mini-note">
          No backtests yet. Run one with <b>/backtest SOL rsi 1h 1y</b> in the
          chat, or open Elyra.
        </p>
      </div>
    );
  }

  return (
    <>
      {results.map((row) => (
        <div key={row.id} className="mini-card">
          <span className="mini-body">
            {row.instrument} · {row.strategyId.split("_")[0]}
          </span>
          <div className="mini-row">
            <span>Return</span>
            <span className="mini-prob">
              {row.metrics === null ? "—" : `${row.metrics.totalReturnPct.toFixed(1)}%`}
            </span>
          </div>
          <div className="mini-row">
            <span>Max drawdown</span>
            <span className="mini-num">
              {row.metrics === null ? "—" : `${row.metrics.maxDrawdownPct.toFixed(1)}%`}
            </span>
          </div>
          <p className="mini-note">
            {row.timeframe} · {row.metrics?.trades ?? 0} trades · {row.quality ?? "—"}
          </p>
        </div>
      ))}
      <p className="mini-note">
        Historical simulation. Long only, costs included, funding excluded.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Prediction signals

   Renders the stored record. Nothing is computed here — the figures were
   produced by the engine when the signal was generated, and recomputing any
   of them in the chat client would let the two disagree.
--------------------------------------------------------------------------- */

const SIGNAL_STATUS: Record<string, string> = {
  generated: "Generated",
  waiting_entry: "Waiting for entry",
  entered: "Entered",
  target_hit: "Target hit",
  invalidated: "Invalidated",
  expired: "Expired",
  cancelled: "Cancelled",
};

function PredictionSignals({ data }: { data: Record<string, unknown> }) {
  const signals = (data.signals ?? []) as Array<{
    id: string;
    status: string;
    entryPrice: number | null;
    resultPoints: number | null;
    signal: {
      marketQuestion: string;
      outcomeLabel: string;
      direction: string;
      strategyId: string;
      riskReward: number | null;
      strength: string;
      entry: { minPrice?: number; maxPrice?: number; price?: number };
      target: { price?: number };
      stop: { price?: number; executable: boolean };
      historicalWinRate: { valuePct: number; sampleSize: number; insufficientSample: boolean } | null;
    };
  }>;

  const forward = data.forwardTrackRecord as
    | {
        entered: number;
        targetHit: number;
        invalidated: number;
        winRatePct: number | null;
        basis: string;
      }
    | undefined;

  if (signals.length === 0) {
    return (
      <div className="mini-card">
        <span className="mini-label">Prediction signals</span>
        <p className="mini-note">
          No signals yet. Ask for one with <b>/signal prediction fed september</b>{" "}
          in the chat.
        </p>
      </div>
    );
  }

  const centsOf = (value: number | null | undefined): string =>
    typeof value === "number" && Number.isFinite(value)
      ? `${(value * 100).toFixed(value * 100 < 10 ? 1 : 0)}\u00A2`
      : "\u2014";

  return (
    <>
      {forward !== undefined && (
        <div className="mini-card">
          <span className="mini-label">Forward track record</span>
          <div className="mini-row">
            <span>Decided</span>
            <span className="mini-num">{forward.targetHit + forward.invalidated}</span>
          </div>
          <div className="mini-row">
            <span>Win rate</span>
            <span className="mini-prob">
              {forward.winRatePct === null
                ? "Not yet reportable"
                : `${forward.winRatePct.toFixed(1)}%`}
            </span>
          </div>
          {/* The basis is printed so this can never be read as the historical
              backtested figure — they are different statistics. */}
          <p className="mini-note">{forward.basis}</p>
        </div>
      )}

      {signals.map((row) => (
        <div key={row.id} className="mini-card">
          <span className="mini-body">{row.signal.marketQuestion}</span>
          <div className="mini-row">
            <span>{row.signal.outcomeLabel}</span>
            <span className="mini-prob">
              {row.signal.direction.replace("long_", "LONG ").toUpperCase()}
            </span>
          </div>
          <div className="mini-row">
            <span>Entry</span>
            <span className="mini-num">
              {row.signal.entry.minPrice !== undefined && row.signal.entry.maxPrice !== undefined
                ? `${centsOf(row.signal.entry.minPrice)}\u2013${centsOf(row.signal.entry.maxPrice)}`
                : centsOf(row.signal.entry.price)}
            </span>
          </div>
          <div className="mini-row">
            <span>Target</span>
            <span className="mini-num">{centsOf(row.signal.target.price)}</span>
          </div>
          <div className="mini-row">
            <span>{row.signal.stop.executable ? "Stop" : "Invalidation"}</span>
            <span className="mini-num">{centsOf(row.signal.stop.price)}</span>
          </div>
          <div className="mini-row">
            <span>Risk / reward</span>
            <span className="mini-num">
              {row.signal.riskReward === null ? "\u2014" : row.signal.riskReward.toFixed(2)}
            </span>
          </div>
          <div className="mini-row">
            <span>Win rate</span>
            <span className="mini-num">
              {row.signal.historicalWinRate === null
                ? "Not measurable"
                : row.signal.historicalWinRate.insufficientSample
                  ? `Insufficient \u00B7 ${row.signal.historicalWinRate.sampleSize}`
                  : `${row.signal.historicalWinRate.valuePct.toFixed(1)}% \u00B7 ${row.signal.historicalWinRate.sampleSize}`}
            </span>
          </div>
          <p className="mini-note">
            {SIGNAL_STATUS[row.status] ?? row.status} \u00B7 {row.signal.strategyId} \u00B7{" "}
            {row.signal.strength} strength
          </p>
        </div>
      ))}
      <p className="mini-note">
        Computed by Elyra&apos;s engine from live order books. Analysis, not advice
        \u2014 a signal does not place an order.
      </p>
    </>
  );
}

function PredictionAlerts({ data }: { data: Record<string, unknown> }) {
  const alerts = (data.alerts ?? []) as Array<{
    id: string;
    marketQuestion: string | null;
    outcomeLabel: string | null;
    kind: string;
    threshold: number | null;
    state: string;
  }>;

  if (alerts.length === 0) {
    return (
      <div className="mini-card">
        <span className="mini-label">Prediction alerts</span>
        <p className="mini-note">
          No alerts yet. Open a market in the chat and use <b>Set alert</b>.
        </p>
      </div>
    );
  }

  return (
    <>
      {alerts.map((alert) => (
        <div key={alert.id} className="mini-card">
          <span className="mini-body">{alert.marketQuestion ?? "Market"}</span>
          <div className="mini-row">
            <span>{alert.outcomeLabel ?? "Outcome"}</span>
            <span className="mini-prob">{alert.kind.replace(/_/g, " ")}</span>
          </div>
          {alert.threshold !== null && (
            <div className="mini-row">
              <span>Threshold</span>
              <span className="mini-num">{alert.threshold}</span>
            </div>
          )}
          <p className="mini-note">{alert.state}</p>
        </div>
      ))}
      <p className="mini-note">
        An alert fires once on the crossing, then re-arms when the condition clears.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Prediction markets

   Elyra's own palette throughout — Lime for a probability that is being
   emphasised, Clay only for a real loss. Polymarket supplies the data and
   none of the visual language.
--------------------------------------------------------------------------- */

function Prediction({ data }: { data: Record<string, unknown> }) {
  /* Not connected is its own screen, never a $0 card. Polymarket holds
     positions in a proxy wallet, so an unlinked account cannot be read at
     all — showing zero would be a claim nobody checked. */
  if (data.connected === false) {
    return (
      <>
        <div className="mini-card">
          <span className="mini-label">Prediction markets</span>
          <p className="mini-note">
            Market data is available and you can browse any market. Your own
            prediction account is not linked yet, so I cannot see your
            positions.
          </p>
        </div>
        <p className="mini-muted">Link it in Elyra to track them here.</p>
      </>
    );
  }

  const claimable = (data.claimable ?? {}) as { count?: number; valueUsd?: number };
  const largest = data.largestPosition as Record<string, unknown> | null;
  const next = data.nextResolution as Record<string, unknown> | null;

  return (
    <>
      <div className="mini-card">
        <span className="mini-label">Prediction value</span>
        <span className="mini-figure">{money(data.currentValueUsd)}</span>
      </div>

      <div className="mini-grid">
        <div className="mini-card">
          <span className="mini-label">At risk</span>
          <span className="mini-figure-sm">{money(data.capitalAtRiskUsd)}</span>
        </div>
        <div className="mini-card">
          <span className="mini-label">Max payout</span>
          <span className="mini-figure-sm">{money(data.maxPayoutUsd)}</span>
        </div>
      </div>

      <div className="mini-card">
        <div className="mini-row">
          <span>Active markets</span>
          <span className="mini-num">{String(data.activeMarkets ?? "—")}</span>
        </div>
        <div className="mini-row">
          <span>Resolving in 7 days</span>
          <span className="mini-num">{String(data.resolvingWithin7d ?? "—")}</span>
        </div>
        <div className="mini-row">
          <span>Open PnL</span>
          <span className="mini-num">{money(data.unrealisedPnlUsd)}</span>
        </div>
      </div>

      {(claimable.count ?? 0) > 0 ? (
        <div className="mini-card mini-claim">
          <span className="mini-label">Unclaimed winnings</span>
          <span className="mini-figure-sm">{money(claimable.valueUsd)}</span>
          <p className="mini-note">
            {claimable.count} market(s) settled in your favour. Claim them in Elyra.
          </p>
        </div>
      ) : null}

      {largest !== null ? (
        <div className="mini-card">
          <span className="mini-label">Largest position</span>
          <span className="mini-body">{String(largest.market)}</span>
          <p className="mini-note">
            {String(largest.outcome)} · {money(largest.currentValueUsd)} ·{" "}
            <span className="mini-prob">{String(largest.currentProbabilityPct ?? "—")}%</span>
          </p>
        </div>
      ) : null}

      {next !== null ? (
        <div className="mini-card">
          <span className="mini-label">Next resolution</span>
          <span className="mini-body">{String(next.market)}</span>
          <p className="mini-note">{String(next.endsAt ?? "").slice(0, 10)}</p>
        </div>
      ) : null}

      <p className="mini-note">
        Probabilities are market prices, not Elyra forecasts. Each share
        settles at $1 or $0.
      </p>
    </>
  );
}

function PredictionMarkets({ data }: { data: Record<string, unknown> }) {
  const markets = (data.markets ?? []) as Array<{
    question: string;
    outcomes: Array<{ label: string; impliedProbabilityPct: number }>;
    volume24hUsd: number | null;
    endsAt: string | null;
  }>;

  if (markets.length === 0) return <p className="mini-muted">No markets to show.</p>;

  return (
    <>
      {markets.map((market) => (
        <div key={market.question} className="mini-card">
          <span className="mini-body">{market.question}</span>
          {market.outcomes.slice(0, 3).map((outcome) => (
            <div key={outcome.label} className="mini-row">
              <span>{outcome.label}</span>
              <span className="mini-prob">{outcome.impliedProbabilityPct}%</span>
            </div>
          ))}
          <p className="mini-note">
            {market.volume24hUsd === null ? "" : `Vol ${money(market.volume24hUsd)}`}
            {market.endsAt === null ? "" : ` · Ends ${market.endsAt.slice(0, 10)}`}
          </p>
        </div>
      ))}
      <p className="mini-note">Market-implied probabilities, not Elyra forecasts.</p>
    </>
  );
}

function Overview({ data }: { data: Record<string, unknown> }) {
  const venues = (data.venues ?? []) as Array<{ label: string; valueUsd: number | null }>;

  return (
    <>
      <div className="mini-card">
        <span className="mini-label">Total value</span>
        <span className="mini-figure">{money(data.totalValueUsd)}</span>
      </div>

      <div className="mini-grid">
        <div className="mini-card">
          <span className="mini-label">Available</span>
          <span className="mini-figure-sm">{money(data.availableCapitalUsd)}</span>
        </div>
        <div className="mini-card">
          <span className="mini-label">Open PnL</span>
          <span className="mini-figure-sm">{money(data.unrealizedPnlUsd)}</span>
        </div>
      </div>

      {venues.length > 0 ? (
        <div className="mini-card">
          <span className="mini-label">Where it sits</span>
          {venues.map((venue) => (
            <div key={venue.label} className="mini-row">
              <span>{venue.label}</span>
              <span className="mini-num">{money(venue.valueUsd)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Holdings({ data }: { data: Record<string, unknown> }) {
  const holdings = (data.holdings ?? []) as Array<{
    symbol: string;
    valueUsd: number | null;
    change24hPct: number | null;
    counted: boolean;
  }>;

  if (holdings.length === 0) return <p className="mini-muted">Nothing above $1.</p>;

  return (
    <div className="mini-card">
      {holdings.map((holding) => (
        <div key={holding.symbol} className="mini-row">
          <span>
            {holding.symbol}
            {holding.counted ? null : <span className="mini-flag">unverified</span>}
          </span>
          <span className="mini-num">{money(holding.valueUsd)}</span>
        </div>
      ))}
    </div>
  );
}

function Risk({ data }: { data: Record<string, unknown> }) {
  const exposures = (data.largestExposures ?? []) as Array<{
    asset: string;
    exposureUsd: number | null;
    pctOfEquity: number | null;
  }>;

  return (
    <>
      <div className="mini-card">
        <span className="mini-label">Equity</span>
        <span className="mini-figure">{money(data.equityUsd)}</span>
      </div>

      <div className="mini-card">
        <span className="mini-label">Largest exposures</span>
        {exposures.map((exposure) => (
          <div key={exposure.asset} className="mini-row">
            <span>{exposure.asset}</span>
            <span className="mini-num">
              {money(exposure.exposureUsd)}
              {exposure.pctOfEquity === null ? "" : ` · ${exposure.pctOfEquity}%`}
            </span>
          </div>
        ))}
        <p className="mini-note">
          Spot and perpetual exposure to the same asset are counted together.
        </p>
      </div>
    </>
  );
}

function Defi({ data }: { data: Record<string, unknown> }) {
  const positions = (data.positions ?? []) as Array<{
    label: string;
    netUsd: number | null;
    pctFromLiquidation: number | null;
    borrowedUsd: number | null;
  }>;
  const warnings = (data.warnings ?? []) as string[];

  return (
    <>
      {positions.length === 0 ? <p className="mini-muted">No positions found.</p> : null}

      {positions.map((position) => (
        <div key={position.label} className="mini-card">
          <span className="mini-label">{position.label}</span>
          <span className="mini-figure-sm">{money(position.netUsd)}</span>
          {position.borrowedUsd !== null && position.borrowedUsd > 0 ? (
            <p className="mini-note">
              {position.pctFromLiquidation === null
                ? /* The protocol published no threshold. Silence would read
                     as safety; a guess from leverage would read as fact. */
                  "Distance to liquidation not published by the protocol."
                : `${position.pctFromLiquidation}% from liquidation.`}
            </p>
          ) : null}
        </div>
      ))}

      {warnings.map((warning) => (
        <p key={warning} className="mini-warn">
          {warning}
        </p>
      ))}
    </>
  );
}

/* Telegram's theme variables first, Elyra's tokens (app/globals.css) as the
   fallback for a browser opened outside the client. Lines and tints are
   mixed from the text colour, so they hold in Telegram's light theme too. */
const CSS = `
.mini-root {
  --bg: var(--tg-theme-bg-color, var(--surface-base));
  --fg: var(--tg-theme-text-color, var(--text-primary));
  --muted: var(--tg-theme-hint-color, var(--text-muted));
  --card: var(--tg-theme-secondary-bg-color, var(--surface-panel));
  --mini-accent: var(--tg-theme-button-color, var(--accent));
  --mini-on-accent: var(--tg-theme-button-text-color, var(--text-on-accent));
  min-height: 100dvh;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-fustat, ui-sans-serif, system-ui, sans-serif);
  padding: 12px 12px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mini-header { display: flex; align-items: baseline; gap: 8px; }
.mini-brand { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.mini-sub { font-size: 12px; color: var(--muted); }
.mini-tabs {
  display: flex; gap: 6px; overflow-x: auto;
  scrollbar-width: none; -webkit-overflow-scrolling: touch;
}
.mini-tabs::-webkit-scrollbar { display: none; }
.mini-tab {
  flex: 0 0 auto; padding: 7px 12px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent); background: transparent;
  color: var(--muted); font-size: 13px; font: inherit; font-size: 13px;
  cursor: pointer;
}
.mini-tab[aria-selected="true"] { background: var(--mini-accent); color: var(--mini-on-accent); border-color: transparent; font-weight: 600; }
.mini-body { display: flex; flex-direction: column; gap: 10px; }
.mini-card {
  background: var(--card); border-radius: 14px; padding: 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mini-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.mini-figure { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.mini-figure-sm { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.mini-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 7px 0; border-bottom: 1px solid color-mix(in srgb, var(--fg) 7%, transparent);
  font-size: 14px;
}
.mini-row:last-of-type { border-bottom: 0; }
.mini-num { font-variant-numeric: tabular-nums; }
.mini-flag {
  margin-left: 6px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--muted);
}
.mini-note { font-size: 12px; color: var(--muted); margin: 4px 0 0; }
.mini-body { font-size: 14px; line-height: 1.35; }
/* The accent, for the probability the reader is being pointed at: Elyra
   Lime, or Telegram's own button colour inside Telegram, which is chosen to
   read on its theme. Never Polymarket's palette — the data is theirs, the
   product is not. */
.mini-prob {
  color: var(--mini-accent);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
/* The accent at low alpha. Claimable money is good news, so it does not get
   the Clay treatment reserved for real losses. */
.mini-claim { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mini-accent) 35%, transparent); }
.mini-muted { color: var(--muted); font-size: 14px; }
.mini-error { color: var(--negative); font-size: 14px; }
.mini-warn {
  background: var(--negative-bg); border-radius: 10px;
  padding: 10px 12px; font-size: 12px; color: var(--negative); margin: 0;
}
`;
