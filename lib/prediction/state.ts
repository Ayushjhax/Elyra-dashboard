import "server-only";

import {
  normalizeBook,
  type BookLevel,
  type NormalizedBook,
} from "@/lib/prediction/book";
import { LiquidityTracker } from "@/lib/prediction/book-analytics";
import {
  PolymarketRealtime,
  type ConnectionState,
  type MarketEvent,
  type RealtimeStats,
} from "@/lib/prediction/realtime";
import { polymarketBooks, polymarketTrades } from "@/lib/providers/polymarket";
import type { PredictionTrade } from "@/lib/providers/types";
import type { MarketPhase } from "@/lib/prediction/api";

export type { MarketPhase };

/* ---------------------------------------------------------------------------
   Live market state, and who is watching it.

   ── The state machine ──────────────────────────────────────────────────

     disconnected → connecting → snapshot → live
                                              ↓
                                            stale
                                              ↓
                                        reconnecting → snapshot → live

   The rule the machine exists to enforce: after a disconnect the local book
   is WRONG, not merely old. Deltas that arrived while the socket was down are
   gone and this feed's `hash` is a content digest, not a sequence counter, so
   there is no way to detect or replay the gap. The only correct recovery is
   to discard the book, read a fresh REST snapshot, and re-subscribe. Anything
   cheaper leaves a ladder that looks plausible and is missing fills.

   ── Serverless reality ─────────────────────────────────────────────────

   A WebSocket needs a process that outlives a request. That holds in
   `next dev` and on a long-lived Node host; it does not hold in a serverless
   invocation, which is frozen between requests and may never thaw.

   So realtime is an UPGRADE, never a prerequisite. Every caller gets a
   correct book either way, and every book carries the transport that produced
   it. A REST snapshot is labelled `rest_snapshot` and any strategy needing
   update-to-update persistence declines rather than pretending a single frame
   demonstrated it. Spec §93: polling is not represented as realtime.
--------------------------------------------------------------------------- */

/** A book older than this cannot support an actionable signal. */
export const STALE_AFTER_MS = 30_000;

/** A REST snapshot is re-read after this rather than served again. */
const SNAPSHOT_TTL_MS = 5_000;

/** Prints held per market for the VWAP window. */
const TRADE_BUFFER = 250;

export interface OutcomeState {
  tokenId: string;
  outcomeLabel: string | null;
  book: NormalizedBook;
}

export interface MarketState {
  marketId: string;
  conditionId: string | null;
  phase: MarketPhase;
  outcomes: Map<string, OutcomeState>;
  trades: PredictionTrade[];
  /** When any book for this market last changed. */
  lastUpdateAt: string | null;
  warnings: string[];
}

interface Entry {
  marketId: string;
  conditionId: string | null;
  /** Token id → label, so a book can name its own outcome. */
  labels: Map<string, string>;
  books: Map<string, NormalizedBook>;
  trades: PredictionTrade[];
  phase: MarketPhase;
  lastUpdateAt: number | null;
  lastSnapshotAt: number | null;
  /** Reference count. Zero means nobody is watching and it may be dropped. */
  watchers: number;
}

/* ---------------------------------------------------------------------------
   The service
--------------------------------------------------------------------------- */

class PredictionMarketStateService {
  private readonly entries = new Map<string, Entry>();
  /** Token id → market id, for routing an event back to its market. */
  private readonly routing = new Map<string, string>();
  private readonly tracker = new LiquidityTracker();
  private realtime: PolymarketRealtime | null = null;
  private realtimeState: ConnectionState = "disconnected";

  /**
   * Whether this process can hold a socket open.
   *
   * A serverless invocation cannot, and opening one there costs a handshake
   * against the venue for a connection that is frozen moments later. Opt in
   * explicitly via the environment rather than guessing from the runtime.
   */
  private realtimeEnabled(): boolean {
    return process.env.ENABLE_PREDICTION_REALTIME === "true";
  }

  /* ---- Subscription management (spec §11) ---------------------------- */

  /**
   * Registers interest in a market and returns a release function.
   *
   * Reference-counted: the dashboard, an alert, the Agent and a Telegram
   * session watching the same market share ONE upstream subscription. The
   * alternative — a socket per viewer — multiplies the venue's load by the
   * viewer count for data that is byte-identical for all of them.
   */
  watch(input: {
    marketId: string;
    conditionId: string | null;
    tokens: Array<{ tokenId: string; label: string }>;
  }): () => void {
    const entry = this.entryFor(input.marketId, input.conditionId);
    entry.watchers += 1;

    for (const token of input.tokens) {
      entry.labels.set(token.tokenId, token.label);
      this.routing.set(token.tokenId, input.marketId);
    }

    if (this.realtimeEnabled()) {
      this.ensureRealtime().subscribe(input.tokens.map((token) => token.tokenId));
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.watchers = Math.max(0, entry.watchers - 1);
      if (entry.watchers === 0) this.release(input.marketId);
    };
  }

  private release(marketId: string): void {
    const entry = this.entries.get(marketId);
    if (entry === undefined || entry.watchers > 0) return;

    const tokens = [...entry.labels.keys()];
    if (this.realtime !== null) this.realtime.unsubscribe(tokens);
    for (const token of tokens) {
      this.routing.delete(token);
      this.tracker.forget(token);
    }
    this.entries.delete(marketId);
  }

  private entryFor(marketId: string, conditionId: string | null): Entry {
    const existing = this.entries.get(marketId);
    if (existing !== undefined) {
      if (existing.conditionId === null && conditionId !== null) {
        existing.conditionId = conditionId;
      }
      return existing;
    }

    const created: Entry = {
      marketId,
      conditionId,
      labels: new Map(),
      books: new Map(),
      trades: [],
      phase: "disconnected",
      lastUpdateAt: null,
      lastSnapshotAt: null,
      watchers: 0,
    };
    this.entries.set(marketId, created);
    return created;
  }

  private ensureRealtime(): PolymarketRealtime {
    if (this.realtime !== null) return this.realtime;

    this.realtime = new PolymarketRealtime({
      onEvent: (event) => this.apply(event),
      onState: (state) => {
        this.realtimeState = state;
        for (const entry of this.entries.values()) {
          if (state === "live") {
            entry.phase = entry.books.size > 0 ? "live" : "snapshot";
          } else if (state === "reconnecting") {
            /* Everything held is now suspect. Marked stale immediately so no
               signal is generated from it before the re-snapshot lands. */
            entry.phase = "reconnecting";
          } else if (state === "connecting") {
            entry.phase = "connecting";
          } else {
            entry.phase = "disconnected";
          }
        }
      },
      onResubscribed: (tokens) => {
        /* Deltas missed while the socket was down cannot be replayed, so the
           local books are discarded rather than patched. The next read takes
           a fresh REST snapshot — see `snapshot()`. */
        for (const token of tokens) {
          const marketId = this.routing.get(token);
          if (marketId === undefined) continue;
          const entry = this.entries.get(marketId);
          if (entry === undefined) continue;
          entry.books.delete(token);
          entry.lastSnapshotAt = null;
          entry.phase = "snapshot";
        }
      },
    });

    return this.realtime;
  }

  /* ---- Applying live events ------------------------------------------ */

  private apply(event: MarketEvent): void {
    const marketId = this.routing.get(event.tokenId);
    if (marketId === undefined) return;
    const entry = this.entries.get(marketId);
    if (entry === undefined) return;

    const now = Date.now();

    if (event.kind === "book") {
      const book = normalizeBook(
        {
          marketId: event.marketId,
          tokenId: event.tokenId,
          bids: event.bids,
          asks: event.asks,
          midpoint: null,
          spread: null,
          lastTradePrice: event.lastTradePrice,
          minOrderSize: entry.books.get(event.tokenId)?.minOrderSize ?? null,
          tickSize: event.tickSize,
        },
        {
          outcomeLabel: entry.labels.get(event.tokenId) ?? null,
          transport: "realtime",
          timestamp: event.at,
          sequence: event.hash,
        },
      );
      entry.books.set(event.tokenId, book);
      this.tracker.observe(book, now);
      entry.lastUpdateAt = now;
      entry.phase = "live";
      return;
    }

    if (event.kind === "price_change") {
      const current = entry.books.get(event.tokenId);
      /* A delta with no book to apply it to is dropped. Building a book from
         deltas alone yields a ladder containing only the levels that happened
         to change, which reads as a thin market rather than an unknown one. */
      if (current === undefined) return;

      const bids = new Map(current.bids.map((level) => [level.price, level]));
      const asks = new Map(current.asks.map((level) => [level.price, level]));

      for (const change of event.changes) {
        const side = change.side === "bid" ? bids : asks;
        /* Size zero is a REMOVAL, not an empty level. */
        if (change.size <= 0) side.delete(change.price);
        else {
          side.set(change.price, {
            price: change.price,
            size: change.size,
            notional: change.price * change.size,
          });
        }
      }

      const book = normalizeBook(
        {
          marketId: current.marketId,
          tokenId: current.tokenId,
          bids: [...bids.values()] as BookLevel[],
          asks: [...asks.values()] as BookLevel[],
          midpoint: null,
          spread: null,
          lastTradePrice: current.lastTradePrice,
          minOrderSize: current.minOrderSize,
          tickSize: current.tickSize,
        },
        {
          outcomeLabel: current.outcomeLabel,
          transport: "realtime",
          timestamp: event.at,
          sequence: event.hash,
        },
      );

      entry.books.set(event.tokenId, book);
      this.tracker.observe(book, now);
      entry.lastUpdateAt = now;
      entry.phase = "live";
      return;
    }

    if (event.kind === "trade") {
      entry.trades.unshift({
        tokenId: event.tokenId,
        marketId: entry.conditionId ?? event.marketId,
        side: event.side,
        size: event.size,
        price: event.price,
        at: event.at,
        outcome: entry.labels.get(event.tokenId) ?? null,
        txHash: event.txHash,
      });
      if (entry.trades.length > TRADE_BUFFER) entry.trades.length = TRADE_BUFFER;

      const book = entry.books.get(event.tokenId);
      if (book !== undefined) book.lastTradePrice = event.price;
      entry.lastUpdateAt = now;
      return;
    }

    if (event.kind === "tick_size") {
      const book = entry.books.get(event.tokenId);
      if (book !== undefined) book.tickSize = event.tickSize;
    }
  }

  /* ---- Reading state -------------------------------------------------- */

  /**
   * The current state of a market, snapshotting over REST when needed.
   *
   * Takes a snapshot when there is no live book, when the held one has aged
   * past its TTL, or when a reconnect invalidated it. A live feed that is
   * delivering keeps its own books and costs no REST call.
   */
  async read(input: {
    marketId: string;
    conditionId: string | null;
    tokens: Array<{ tokenId: string; label: string }>;
    /** Skips the trade tape when the caller does not need a VWAP. */
    withTrades?: boolean;
  }): Promise<MarketState> {
    const entry = this.entryFor(input.marketId, input.conditionId);
    for (const token of input.tokens) {
      entry.labels.set(token.tokenId, token.label);
      this.routing.set(token.tokenId, input.marketId);
    }

    const now = Date.now();
    const warnings: string[] = [];

    const missing = input.tokens.filter((token) => !entry.books.has(token.tokenId));
    const expired =
      entry.lastSnapshotAt === null || now - entry.lastSnapshotAt > SNAPSHOT_TTL_MS;
    const feedDelivering =
      this.realtimeState === "live" &&
      entry.lastUpdateAt !== null &&
      now - entry.lastUpdateAt < STALE_AFTER_MS;

    if (missing.length > 0 || (!feedDelivering && expired)) {
      const snapshotWarnings = await this.snapshot(entry, input.tokens);
      warnings.push(...snapshotWarnings);
    }

    if (input.withTrades !== false && entry.conditionId !== null) {
      const tapeExpired =
        entry.trades.length === 0 ||
        now - Date.parse(entry.trades[0]?.at ?? "") > SNAPSHOT_TTL_MS;

      if (tapeExpired && !feedDelivering) {
        const tape = await polymarketTrades(entry.conditionId, TRADE_BUFFER);
        if (tape.ok && tape.data !== undefined) entry.trades = tape.data;
        else if (tape.error !== undefined) {
          warnings.push(`Trade tape unavailable: ${tape.error.message}`);
        }
      }
    }

    /* Staleness is judged on the BOOK's own timestamp, not on when we last
       asked. A venue that keeps answering with a frozen book is stale even
       though the fetch succeeded. */
    const oldest = [...entry.books.values()].reduce<number>(
      (max, book) => Math.max(max, now - Date.parse(book.timestamp)),
      0,
    );

    let phase: MarketPhase = entry.phase;
    if (entry.books.size === 0) {
      phase = "disconnected";
    } else if (oldest > STALE_AFTER_MS) {
      phase = "stale";
      warnings.push(
        `The order book is ${Math.round(oldest / 1000)}s old — past the ${STALE_AFTER_MS / 1000}s freshness limit.`,
      );
    } else if (feedDelivering) {
      phase = "live";
    } else {
      phase = "snapshot";
    }
    entry.phase = phase;

    const outcomes = new Map<string, OutcomeState>();
    for (const token of input.tokens) {
      const book = entry.books.get(token.tokenId);
      if (book === undefined) continue;
      outcomes.set(token.tokenId, {
        tokenId: token.tokenId,
        outcomeLabel: entry.labels.get(token.tokenId) ?? token.label,
        book,
      });
    }

    return {
      marketId: input.marketId,
      conditionId: entry.conditionId,
      phase,
      outcomes,
      trades: entry.trades,
      lastUpdateAt: entry.lastUpdateAt === null ? null : new Date(entry.lastUpdateAt).toISOString(),
      warnings,
    };
  }

  /** Reads every requested book from REST in ONE batched call. */
  private async snapshot(
    entry: Entry,
    tokens: Array<{ tokenId: string; label: string }>,
  ): Promise<string[]> {
    entry.phase = "snapshot";

    const result = await polymarketBooks(tokens.map((token) => token.tokenId));
    if (!result.ok || result.data === undefined) {
      entry.phase = "disconnected";
      return [result.error?.message ?? "The order book snapshot failed."];
    }

    const now = Date.now();
    for (const token of tokens) {
      const raw = result.data.get(token.tokenId);
      if (raw === undefined) continue;

      const book = normalizeBook(raw, {
        outcomeLabel: entry.labels.get(token.tokenId) ?? token.label,
        /* Labelled for what it is. A snapshot is correct at its timestamp and
           has no update stream behind it, and every consumer is told so. */
        transport: "rest_snapshot",
        timestamp: new Date(now).toISOString(),
      });

      entry.books.set(token.tokenId, book);
      this.tracker.observe(book, now);
    }

    entry.lastSnapshotAt = now;
    entry.lastUpdateAt = now;
    return result.warnings ?? [];
  }

  /** The shared liquidity tracker, for the analytics pass. */
  liquidityTracker(): LiquidityTracker {
    return this.tracker;
  }

  /* ---- Health (spec §92, §106) ---------------------------------------- */

  health(): {
    realtime: RealtimeStats | null;
    realtimeEnabled: boolean;
    marketsTracked: number;
    watchers: number;
    tokensRouted: number;
    levelsTracked: number;
    staleMarkets: number;
  } {
    let watchers = 0;
    let stale = 0;
    for (const entry of this.entries.values()) {
      watchers += entry.watchers;
      if (entry.phase === "stale" || entry.phase === "disconnected") stale += 1;
    }

    return {
      realtime: this.realtime?.stats() ?? null,
      realtimeEnabled: this.realtimeEnabled(),
      marketsTracked: this.entries.size,
      watchers,
      tokensRouted: this.routing.size,
      levelsTracked: this.tracker.size(),
      staleMarkets: stale,
    };
  }

  /** Drops everything. Tests only. */
  reset(): void {
    this.realtime?.close();
    this.realtime = null;
    this.realtimeState = "disconnected";
    this.entries.clear();
    this.routing.clear();
  }
}

/* ---------------------------------------------------------------------------
   One instance per process.

   Held on `globalThis` so Next's dev-mode module reloading does not leave
   several services each holding their own socket to the venue — the same
   pattern the rest of the repo uses for per-process state.
--------------------------------------------------------------------------- */

const GLOBAL_KEY = Symbol.for("elyra.prediction.state");

interface GlobalWithState {
  [GLOBAL_KEY]?: PredictionMarketStateService;
}

function service(): PredictionMarketStateService {
  const store = globalThis as unknown as GlobalWithState;
  store[GLOBAL_KEY] ??= new PredictionMarketStateService();
  return store[GLOBAL_KEY];
}

export const marketState = {
  watch: (input: Parameters<PredictionMarketStateService["watch"]>[0]) =>
    service().watch(input),
  read: (input: Parameters<PredictionMarketStateService["read"]>[0]) => service().read(input),
  liquidityTracker: () => service().liquidityTracker(),
  health: () => service().health(),
  reset: () => service().reset(),
};

export type { PredictionMarketStateService };
