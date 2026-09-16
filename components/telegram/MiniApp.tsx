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

type View = "portfolio" | "holdings" | "risk" | "defi";

const TABS: Array<{ id: View; label: string }> = [
  { id: "portfolio", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "risk", label: "Risk" },
  { id: "defi", label: "DeFi" },
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

/* Telegram's theme variables first, Elyra's tokens as the fallback for a
   browser opened outside the client. */
const CSS = `
.mini-root {
  --bg: var(--tg-theme-bg-color, #05060a);
  --fg: var(--tg-theme-text-color, #f4f1ea);
  --muted: var(--tg-theme-hint-color, #8b8b85);
  --card: var(--tg-theme-secondary-bg-color, #0d0f14);
  --accent: var(--tg-theme-button-color, #c8f169);
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
  border: 1px solid rgba(255,255,255,0.08); background: transparent;
  color: var(--muted); font-size: 13px; font: inherit; font-size: 13px;
  cursor: pointer;
}
.mini-tab[aria-selected="true"] { background: var(--accent); color: #05060a; border-color: transparent; font-weight: 600; }
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
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 14px;
}
.mini-row:last-of-type { border-bottom: 0; }
.mini-num { font-variant-numeric: tabular-nums; }
.mini-flag {
  margin-left: 6px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--muted);
}
.mini-note { font-size: 12px; color: var(--muted); margin: 4px 0 0; }
.mini-muted { color: var(--muted); font-size: 14px; }
.mini-error { color: #e2725b; font-size: 14px; }
.mini-warn {
  background: rgba(226,114,91,0.12); border-radius: 10px;
  padding: 10px 12px; font-size: 12px; color: #e8a08d; margin: 0;
}
`;
