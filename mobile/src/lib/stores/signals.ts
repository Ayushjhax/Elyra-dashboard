import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { PulseResponse } from "@/lib/market/pulse";
import type { MarketSignalsResponse } from "@/lib/research/signalTypes";
import { parseTrackerSignalList, type TrackerSignal } from "@/lib/tracker/types";
import { api, streamSse } from "~/lib/api";

/* ---------------------------------------------------------------------------
   Live signals — the website's SignalsWidget feeds and the market pulse.

   SMART MONEY is wallet consensus from the tracker service: polled every
   minute from /api/tracker/signals, and pushed live through
   /api/tracker/stream (Server-Sent Events, through the streaming helper)
   when the service is up. A dropped stream reconnects with backoff — one
   second, doubling to a minute — and polling carries the feed meanwhile.
   Both stop while the app is in the background and resume when it returns.

   The proxy answers 200 with an empty list and the reason in `error` when
   the tracker cannot be reached; reading it is what keeps a connection
   failure from being shown as a quiet market.
--------------------------------------------------------------------------- */

export type Connection = "live" | "polling" | "offline";

export interface SmartMoneyState {
  signals: TrackerSignal[];
  origin: "tracker" | "hyperliquid" | null;
  notice: string | null;
  disclaimer: string;
  error: string | null;
  loading: boolean;
  fetchedAt: string | null;
  connection: Connection;
}

const INITIAL: SmartMoneyState = {
  signals: [],
  origin: null,
  notice: null,
  disclaimer: "",
  error: null,
  loading: true,
  fetchedAt: null,
  connection: "polling",
};

const POLL_MS = 60_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

async function readSignals(): Promise<SmartMoneyState> {
  try {
    const payload = parseTrackerSignalList(await api.get<unknown>("/api/tracker/signals?limit=50", { auth: false }));
    const error = payload.error ?? null;
    return {
      signals: payload.signals,
      origin: payload.origin ?? null,
      notice: payload.notice ?? null,
      disclaimer: payload.disclaimer,
      error,
      loading: false,
      fetchedAt: new Date().toISOString(),
      connection: error === null ? "polling" : "offline",
    };
  } catch (error) {
    return {
      ...INITIAL,
      error: error instanceof Error ? error.message : "Could not reach the tracker",
      loading: false,
      fetchedAt: new Date().toISOString(),
      connection: "offline",
    };
  }
}

/** The smart-money feed, live while `active` (the tab is on screen) and the app is in front. */
export function useSmartMoney(active: boolean): { state: SmartMoneyState; reload: () => void } {
  const [state, setState] = useState<SmartMoneyState>(INITIAL);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  const reload = useCallback(() => {
    void readSignals().then((next) => {
      if (mounted.current) setState(next);
    });
  }, []);

  /* Polling. */
  useEffect(() => {
    if (!active || !foreground) return;
    let cancelled = false;
    const tick = () =>
      void readSignals().then((next) => {
        if (!cancelled) setState(next);
      });
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, foreground]);

  /* The stream, with reconnect backoff. */
  useEffect(() => {
    if (!active || !foreground) return;
    const controller = new AbortController();
    let backoff = BACKOFF_START_MS;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      try {
        for await (const event of streamSse("/api/tracker/stream", { auth: false, signal: controller.signal })) {
          if (event.event !== "snapshot") continue;
          try {
            const parsed = JSON.parse(event.data) as { signals?: unknown[] };
            const next = parseTrackerSignalList({
              ...parsed,
              disclaimer: "Signals are observational consensus data, not financial advice.",
              count: parsed.signals?.length ?? 0,
              generatedAt: new Date().toISOString(),
            });
            backoff = BACKOFF_START_MS;
            setState({
              signals: next.signals,
              origin: "tracker",
              notice: null,
              disclaimer: next.disclaimer,
              error: null,
              loading: false,
              fetchedAt: next.generatedAt,
              connection: "live",
            });
          } catch {
            /* A malformed frame: polling remains the recovery path. */
          }
        }
      } catch {
        /* Dropped, refused, or aborted — handled below. */
      }
      if (controller.signal.aborted) return;
      setState((current) => ({ ...current, connection: current.error === null ? "polling" : "offline" }));
      retry = setTimeout(() => void connect(), backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    };

    void connect();
    return () => {
      controller.abort();
      if (retry !== null) clearTimeout(retry);
    };
  }, [active, foreground]);

  return { state, reload };
}

/** The Hyperliquid board, every thirty seconds while shown. */
export function usePulse(active: boolean): { data: PulseResponse | null; failed: boolean } {
  const [state, setState] = useState<{ data: PulseResponse | null; failed: boolean }>({ data: null, failed: false });
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground) return;
    let cancelled = false;
    const tick = () =>
      void api
        .get<PulseResponse>("/api/market/pulse", { auth: false })
        .then((data) => {
          if (!cancelled) setState({ data, failed: data.pulse === null });
        })
        .catch(() => {
          if (!cancelled) setState((current) => ({ ...current, failed: true }));
        });
    tick();
    const timer = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, foreground]);
  return state;
}

/* ---- Elyra's market signals (the website's ElyraSignals) ---- */

export interface ElyraSignalsState {
  data: MarketSignalsResponse | null;
  error: string | null;
  loading: boolean;
}

/**
 * /api/market/signals for these symbols, every minute while shown and the
 * app is in front. Evidence-backed observations from public market data —
 * a move, a funding dislocation, a gap between venues — or an empty list
 * when nothing crosses a threshold.
 */
export function useElyraSignals(symbols: readonly string[], active: boolean): ElyraSignalsState & { reload: () => void } {
  const key = symbols.join(",");
  const [state, setState] = useState<ElyraSignalsState & { key: string }>({ data: null, error: null, loading: true, key });
  const [nonce, setNonce] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground || key === "") return;
    let cancelled = false;
    const tick = () =>
      void api
        .get<MarketSignalsResponse>(`/api/market/signals?symbols=${encodeURIComponent(key)}`, { auth: false, timeoutMs: 30_000 })
        .then((data) => {
          if (!cancelled) setState({ data, error: null, loading: false, key });
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState((current) => ({
              data: current.key === key ? current.data : null,
              error: error instanceof Error ? error.message : "Signals could not be read.",
              loading: false,
              key,
            }));
          }
        });
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, foreground, key, nonce]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true }));
    setNonce((value) => value + 1);
  }, []);
  /* Another set of symbols has nothing to show until its own read lands. */
  const shown = state.key === key ? state : { data: null, error: null, loading: true };
  return { data: shown.data, error: shown.error, loading: shown.loading, reload };
}
