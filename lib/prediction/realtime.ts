import "server-only";

import type { BookLevel } from "@/lib/prediction/book";

/* ---------------------------------------------------------------------------
   The Polymarket market WebSocket.

   Endpoint, subscribe frame, heartbeat and event shapes were taken from
   docs.polymarket.com/market-data/realtime-data and then VERIFIED against the
   live feed, which disagreed with the documentation in one place that matters:

     the docs describe `price_change` entries carrying `bestBid` / `bestAsk`;
     the live feed sends `best_bid` / `best_ask`.

   Both spellings are accepted below. A parser that trusted the documented one
   would have read `undefined` as "no touch" on every delta and quietly fallen
   back to the last snapshot forever.

   ── Snapshots and deltas ───────────────────────────────────────────────

   `book` is a full replacement. `price_change` carries per-level updates
   where a size of zero means the level is GONE, not that it holds nothing.
   Applying a zero-size level as a real level puts a price in the ladder with
   no order behind it, which is how a best bid ends up at a level nobody is
   bidding at.

   The venue sends a `hash` per book. It is retained and exposed as the
   sequence marker, but it is a content digest rather than a monotonic
   counter, so it can detect "this is the same book" and cannot detect a
   dropped message. That limitation is why the state service re-snapshots on
   reconnect instead of trying to replay a gap.

   ── Where this can and cannot run ──────────────────────────────────────

   This needs a process that outlives a request. That is true in `next dev`
   and on any long-lived Node host; it is NOT true of a serverless invocation,
   which is frozen between requests and may never thaw. `lib/prediction/state.ts`
   therefore treats realtime as an upgrade over REST snapshots, never as a
   prerequisite, and labels every book with the transport that produced it.
--------------------------------------------------------------------------- */

export const MARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

/** The venue replies PONG. Ten seconds is what the documentation asks for. */
const PING_INTERVAL_MS = 10_000;

/** No frame at all for this long means the feed is not delivering. */
const SILENCE_TIMEOUT_MS = 45_000;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface WireLevel {
  price?: string | number;
  size?: string | number;
}

export interface BookEvent {
  kind: "book";
  tokenId: string;
  marketId: string;
  bids: BookLevel[];
  asks: BookLevel[];
  tickSize: number | null;
  lastTradePrice: number | null;
  hash: string | null;
  at: string;
}

export interface PriceChangeEvent {
  kind: "price_change";
  tokenId: string;
  marketId: string;
  changes: Array<{ price: number; size: number; side: "bid" | "ask" }>;
  bestBid: number | null;
  bestAsk: number | null;
  hash: string | null;
  at: string;
}

export interface TradeEvent {
  kind: "trade";
  tokenId: string;
  marketId: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  at: string;
  txHash: string | null;
}

export interface TickSizeEvent {
  kind: "tick_size";
  tokenId: string;
  marketId: string;
  tickSize: number;
  at: string;
}

export type MarketEvent = BookEvent | PriceChangeEvent | TradeEvent | TickSizeEvent;

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "live"
  | "reconnecting"
  | "closed";

export interface RealtimeHandlers {
  onEvent(event: MarketEvent): void;
  /** Fired on every transition, for health reporting. */
  onState(state: ConnectionState, detail?: string): void;
  /**
   * Fired after a reconnect completes.
   *
   * The state service responds by re-snapshotting over REST. Deltas missed
   * while the socket was down cannot be replayed, so the only correct
   * recovery is to throw the local book away and read a fresh one.
   */
  onResubscribed(tokenIds: string[]): void;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Venue timestamps are milliseconds as a string on this feed. */
function stamp(value: string | number | null | undefined): string {
  const parsed = num(value);
  if (parsed === null || parsed <= 0) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function levels(raw: WireLevel[] | undefined): BookLevel[] {
  const rows: BookLevel[] = [];
  for (const entry of raw ?? []) {
    const price = num(entry.price);
    const size = num(entry.size);
    if (price === null || size === null || size <= 0) continue;
    rows.push({ price, size, notional: price * size });
  }
  return rows;
}

/**
 * One frame, normalised.
 *
 * Exported so the parser can be tested without a socket — which is the only
 * way to get deterministic coverage of a live feed's shapes.
 */
export function parseFrame(raw: unknown): MarketEvent[] {
  const payload = Array.isArray(raw) ? raw : [raw];
  const events: MarketEvent[] = [];

  for (const entry of payload) {
    if (entry === null || typeof entry !== "object") continue;
    const message = entry as Record<string, unknown>;
    const type = message.event_type;
    const marketId = typeof message.market === "string" ? message.market : "";

    if (type === "book") {
      const tokenId = typeof message.asset_id === "string" ? message.asset_id : "";
      if (tokenId === "") continue;
      events.push({
        kind: "book",
        tokenId,
        marketId,
        bids: levels(message.bids as WireLevel[] | undefined),
        asks: levels(message.asks as WireLevel[] | undefined),
        tickSize: num(message.tick_size as string | undefined),
        lastTradePrice: num(message.last_trade_price as string | undefined),
        hash: typeof message.hash === "string" ? message.hash : null,
        at: stamp(message.timestamp as string | undefined),
      });
      continue;
    }

    if (type === "price_change") {
      const rows = Array.isArray(message.price_changes) ? message.price_changes : [];
      /* One frame carries changes for SEVERAL tokens — both outcomes of a
         market arrive together. Grouped by token so each book applies only
         its own deltas; folding them into one would corrupt both. */
      const byToken = new Map<string, PriceChangeEvent>();

      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const change = row as Record<string, unknown>;
        const tokenId = typeof change.asset_id === "string" ? change.asset_id : "";
        const price = num(change.price as string | undefined);
        const size = num(change.size as string | undefined);
        if (tokenId === "" || price === null || size === null) continue;

        const existing = byToken.get(tokenId) ?? {
          kind: "price_change" as const,
          tokenId,
          marketId,
          changes: [],
          bestBid: null,
          bestAsk: null,
          hash: typeof change.hash === "string" ? change.hash : null,
          at: stamp(message.timestamp as string | undefined),
        };

        existing.changes.push({
          price,
          size,
          /* BUY means a bid-side level. The feed names the side of the order,
             not the side of the book, and they are the same thing here. */
          side: String(change.side).toUpperCase() === "BUY" ? "bid" : "ask",
        });

        /* Documented as bestBid/bestAsk, delivered as best_bid/best_ask.
           Both read; neither trusted to exist. */
        existing.bestBid =
          num((change.best_bid ?? change.bestBid) as string | undefined) ?? existing.bestBid;
        existing.bestAsk =
          num((change.best_ask ?? change.bestAsk) as string | undefined) ?? existing.bestAsk;

        byToken.set(tokenId, existing);
      }

      events.push(...byToken.values());
      continue;
    }

    if (type === "last_trade_price") {
      const tokenId = typeof message.asset_id === "string" ? message.asset_id : "";
      const price = num(message.price as string | undefined);
      const size = num(message.size as string | undefined);
      if (tokenId === "" || price === null) continue;
      events.push({
        kind: "trade",
        tokenId,
        marketId,
        price,
        size: size ?? 0,
        side: String(message.side).toUpperCase() === "SELL" ? "sell" : "buy",
        at: stamp(message.timestamp as string | undefined),
        txHash: typeof message.transaction_hash === "string" ? message.transaction_hash : null,
      });
      continue;
    }

    if (type === "tick_size_change") {
      const tokenId = typeof message.asset_id === "string" ? message.asset_id : "";
      const tick = num(message.new_tick_size as string | undefined);
      if (tokenId === "" || tick === null) continue;
      events.push({
        kind: "tick_size",
        tokenId,
        marketId,
        tickSize: tick,
        at: stamp(message.timestamp as string | undefined),
      });
    }
  }

  return events;
}

/* ---------------------------------------------------------------------------
   The client
--------------------------------------------------------------------------- */

export interface RealtimeStats {
  state: ConnectionState;
  connectedAt: string | null;
  lastEventAt: string | null;
  /** Milliseconds between the venue's stamp and our receipt. Rolling mean. */
  lagMs: number | null;
  reconnects: number;
  eventsReceived: number;
  subscribedTokens: number;
  lastError: string | null;
}

/**
 * A single shared connection to the venue's market feed.
 *
 * One socket for the whole process, carrying every token anyone is watching.
 * The venue supports dynamic subscribe and unsubscribe on an open connection,
 * so a new watcher does not cost a new handshake — which matters because the
 * alternative, a socket per user, multiplies the venue's load by the user
 * count for data that is identical for all of them.
 */
export class PolymarketRealtime {
  private socket: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private readonly tokens = new Set<string>();

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  private connectedAt: number | null = null;
  private lastEventAt: number | null = null;
  private lagMs: number | null = null;
  private reconnects = 0;
  private eventsReceived = 0;
  private lastError: string | null = null;
  /** Set when `close()` was called, so the reconnect loop stands down. */
  private deliberatelyClosed = false;

  constructor(private readonly handlers: RealtimeHandlers) {}

  stats(): RealtimeStats {
    return {
      state: this.state,
      connectedAt: this.connectedAt === null ? null : new Date(this.connectedAt).toISOString(),
      lastEventAt: this.lastEventAt === null ? null : new Date(this.lastEventAt).toISOString(),
      lagMs: this.lagMs,
      reconnects: this.reconnects,
      eventsReceived: this.eventsReceived,
      subscribedTokens: this.tokens.size,
      lastError: this.lastError,
    };
  }

  /** Adds tokens to the subscription, opening the socket if needed. */
  subscribe(tokenIds: string[]): void {
    const added = tokenIds.filter((token) => !this.tokens.has(token));
    for (const token of tokenIds) this.tokens.add(token);

    if (this.socket === null || this.state === "disconnected" || this.state === "closed") {
      this.open();
      return;
    }

    if (this.state === "live" && added.length > 0) {
      this.send({ assets_ids: added, operation: "subscribe" });
    }
  }

  unsubscribe(tokenIds: string[]): void {
    const removed = tokenIds.filter((token) => this.tokens.delete(token));
    if (removed.length === 0) return;

    if (this.state === "live") {
      this.send({ assets_ids: removed, operation: "unsubscribe" });
    }

    /* Nothing left to watch: drop the connection rather than holding a socket
       open against the venue for no subscriber. */
    if (this.tokens.size === 0) this.close();
  }

  close(): void {
    this.deliberatelyClosed = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.transition("closed");
    try {
      socket?.close();
    } catch {
      /* Already closing. Nothing to recover. */
    }
  }

  private open(): void {
    if (this.tokens.size === 0) return;
    this.deliberatelyClosed = false;
    this.transition(this.reconnects > 0 ? "reconnecting" : "connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(MARKET_WS_URL);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Could not open the socket.";
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.connectedAt = Date.now();
      this.attempt = 0;
      this.transition("live");
      this.send({ assets_ids: [...this.tokens], type: "market" });
      this.startPing();
      this.armSilence();
      this.handlers.onResubscribed([...this.tokens]);
    };

    socket.onmessage = (message: MessageEvent) => {
      this.armSilence();
      const text = typeof message.data === "string" ? message.data : "";

      /* The heartbeat reply is a bare text frame, not JSON. */
      if (text === "PONG" || text === "PING") return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }

      const events = parseFrame(parsed);
      if (events.length === 0) return;

      const now = Date.now();
      this.lastEventAt = now;
      this.eventsReceived += events.length;

      /* Lag is the venue's stamp against our clock. A rolling mean, so one
         GC pause does not redefine the connection's health. */
      const stampedAt = Date.parse(events[0].at);
      if (Number.isFinite(stampedAt)) {
        const sample = Math.max(0, now - stampedAt);
        this.lagMs = this.lagMs === null ? sample : this.lagMs * 0.8 + sample * 0.2;
      }

      for (const event of events) {
        try {
          this.handlers.onEvent(event);
        } catch (error) {
          /* One bad subscriber must not take down the feed for the others. */
          this.lastError = error instanceof Error ? error.message : "Handler threw.";
        }
      }
    };

    socket.onerror = () => {
      this.lastError = "The market feed reported a socket error.";
    };

    socket.onclose = (event: CloseEvent) => {
      this.clearTimers();
      this.socket = null;
      if (this.deliberatelyClosed) {
        this.transition("closed");
        return;
      }
      this.lastError = `Socket closed (${event.code}).`;
      this.scheduleReconnect();
    };
  }

  private send(payload: unknown): void {
    if (this.socket === null || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Send failed.";
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === 1) {
        try {
          this.socket.send("PING");
        } catch {
          /* The close handler will pick this up. */
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /**
   * A socket that is open but silent is worse than one that is closed.
   *
   * TCP can hold a connection that delivers nothing indefinitely, and every
   * consumer above would go on reading a book frozen at the last update while
   * the state stayed "live". The silence timer forces the failure to surface.
   */
  private armSilence(): void {
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.lastError = `No frame for ${SILENCE_TIMEOUT_MS / 1000}s — treating the feed as dead.`;
      try {
        this.socket?.close();
      } catch {
        /* The close handler drives the reconnect either way. */
      }
    }, SILENCE_TIMEOUT_MS);
  }

  private clearTimers(): void {
    this.stopPing();
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.deliberatelyClosed || this.tokens.size === 0) {
      this.transition("closed");
      return;
    }

    this.transition("reconnecting", this.lastError ?? undefined);
    this.reconnects += 1;
    this.attempt += 1;

    /* Exponential with jitter. Without the jitter a fleet reconnects in step
       and delivers the venue a thundering herd at every blip. */
    const delay =
      Math.min(RECONNECT_BASE_MS * 2 ** (this.attempt - 1), RECONNECT_MAX_MS) +
      Math.random() * 500;

    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private transition(next: ConnectionState, detail?: string): void {
    if (this.state === next) return;
    this.state = next;
    try {
      this.handlers.onState(next, detail);
    } catch {
      /* State reporting must never break the connection it reports on. */
    }
  }
}
