/* ---------------------------------------------------------------------------
   What the Connections drawer says about each connection, decided once.

   Pure, with no React and no DOM, so the rules are tested directly and the
   server can hold a request to the same shape rule the form does.

   One status vocabulary for every card. The words carry the meaning and the
   colour only echoes them, and nothing is green until something has actually
   been read back: a stored key or a saved address is "linked", not "working".
--------------------------------------------------------------------------- */

export type ConnectionStatus =
  | "not-connected"
  /** A read of the connection's own state, or of the venue, is in flight. */
  | "checking"
  /** The person started something and it is being done. */
  | "connecting"
  /** Waiting on the person, somewhere else — a code to send in Telegram. */
  | "awaiting"
  | "connected"
  | "expired"
  /** Linked, but the last read failed or found nothing to confirm it. */
  | "attention"
  /** Not offered by this deployment. A normal state, not an error. */
  | "unavailable";

export type StatusTone = "muted" | "progress" | "caution" | "positive" | "negative";

export const STATUS: Record<ConnectionStatus, { label: string; tone: StatusTone }> = {
  "not-connected": { label: "Not connected", tone: "muted" },
  checking: { label: "Checking", tone: "progress" },
  connecting: { label: "Connecting", tone: "progress" },
  awaiting: { label: "Awaiting action", tone: "caution" },
  connected: { label: "Connected", tone: "positive" },
  expired: { label: "Expired", tone: "negative" },
  attention: { label: "Needs attention", tone: "negative" },
  unavailable: { label: "Unavailable", tone: "muted" },
};

/* --- Input shapes ---------------------------------------------------------- */

/** An EVM address: what Polymarket and Hyperliquid accounts are keyed by. */
export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * A Binance HMAC key or secret as pasted: letters and digits, nothing else.
 *
 * Binance issues both at 64 characters. The range is wider than that on
 * purpose — the point is to catch a half-copied value, a stray space or a
 * pasted private key before a round trip, not to second-guess Binance's
 * format. Binance itself is the real check (lib/exchange/binance.ts).
 */
export function isBinanceCredential(value: string): boolean {
  return /^[A-Za-z0-9]{32,128}$/.test(value.trim());
}

/* --- Telegram link codes --------------------------------------------------- */

/** How often an open code asks whether it has been redeemed. */
export const LINK_POLL_MS = 3_000;

/**
 * When a code stops working, on this device's clock.
 *
 * The server sends both ends of the window on its own clock. Their difference
 * is the code's real lifetime, counted from when the response arrived — so a
 * device clock that is minutes out neither shows a dead code as live nor
 * throws away a live one. Without `issuedAt` the expiry is taken as given.
 */
export function codeDeadline(
  issuedAt: string | null | undefined,
  expiresAt: string,
  receivedAt: number,
): number {
  const expires = Date.parse(expiresAt);
  const issued = issuedAt === null || issuedAt === undefined ? Number.NaN : Date.parse(issuedAt);
  if (Number.isNaN(expires)) return receivedAt;
  if (Number.isNaN(issued) || issued > expires) return expires;
  return receivedAt + (expires - issued);
}

/** Milliseconds left, never negative. */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

/** `9:05`. Rounded up, so a code is never shown as 0:00 while it still works. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1_000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* --- Venue reads ------------------------------------------------------------ */

/** The part of a portfolio read this needs. */
export interface VenueReadInput {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  stale: boolean;
  snapshot: {
    scopes: Array<{ venue: string }>;
    notes: Array<{ scope: string; reason: string; kind: "failed" | "missing" }>;
  } | null;
}

export type VenueRead =
  | { status: "checking" }
  | { status: "synced" }
  | { status: "attention"; reason: string };

/** Strips the `[binance] ` source tag an upstream error message starts with. */
function plain(reason: string): string {
  return reason.replace(/^\[[a-z-]+\]\s*/i, "");
}

/**
 * Whether a venue's account was actually read, from the shared portfolio
 * snapshot rather than a request of its own.
 *
 * "Synced" only when the venue answered in the latest reading. A venue that
 * failed, a portfolio read that failed outright, and a reading that has not
 * caught up with a connection made a moment ago each say so instead.
 */
export function venueRead(feed: VenueReadInput, venue: string): VenueRead {
  const snapshot = feed.snapshot;

  if (snapshot === null) {
    if (feed.loading || feed.refreshing) return { status: "checking" };
    return { status: "attention", reason: plain(feed.error ?? "The portfolio could not be read.") };
  }

  const failed = snapshot.notes.find((note) => note.kind === "failed" && note.scope === venue);
  if (failed !== undefined) return { status: "attention", reason: plain(failed.reason) };

  const venues = snapshot.notes.find((note) => note.kind === "failed" && note.scope === "venues");
  if (venues !== undefined) return { status: "attention", reason: plain(venues.reason) };

  if (feed.stale) {
    return {
      status: "attention",
      reason: plain(feed.error ?? "The latest refresh failed, so this is an earlier reading."),
    };
  }

  if (snapshot.scopes.some((scope) => scope.venue === venue)) return { status: "synced" };

  /* Connected, but the reading on hand predates it. The next one says. */
  return { status: "checking" };
}
