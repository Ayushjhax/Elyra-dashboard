import type { AccountEvent } from "@/lib/activity/events";

/* ---------------------------------------------------------------------------
   The Activity widget's filters, as one pure function.

   Direction reads the transaction's decoded summary: "Received" is money
   that came in (a receive, a stake withdrawal), "Sent" is money that went
   out (a send, a stake). A swap moves both ways and is neither, so it shows
   under All only; so does a transaction the RPC could not decode.

   The only network this app reads is Solana mainnet. Alerts and actions
   awaiting review belong to no network, so choosing Solana leaves wallet
   transactions alone.
--------------------------------------------------------------------------- */

export type Direction = "all" | "received" | "sent";
export type DateRange = "all" | "today" | "7d" | "30d";
export type Network = "all" | "solana";

export interface ActivityFilters {
  direction: Direction;
  range: DateRange;
  network: Network;
  query: string;
}

export const DEFAULT_FILTERS: ActivityFilters = { direction: "all", range: "all", network: "all", query: "" };

export const RANGE_LABEL: Record<DateRange, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const DAY = 86_400_000;

export function directionOf(event: AccountEvent): "received" | "sent" | null {
  const kind = event.summary?.kind;
  if (kind === "receive" || kind === "unstake") return "received";
  if (kind === "send" || kind === "stake") return "sent";
  return null;
}

function inRange(event: AccountEvent, range: DateRange, now: number): boolean {
  if (range === "all") return true;
  /* Not yet in a block: it is happening now. */
  if (event.at === null) return true;
  const at = Date.parse(event.at);
  if (range === "today") return at >= Math.floor(now / DAY) * DAY;
  return now - at <= (range === "7d" ? 7 : 30) * DAY;
}

/** Everything a person might type to find a row: words, tokens, addresses, the signature. */
function haystack(event: AccountEvent): string {
  const summary = event.summary;
  return [
    event.text,
    event.id.startsWith("tx:") ? event.id.slice(3) : "",
    summary?.counterparty ?? "",
    summary?.via ?? "",
    ...(summary?.amounts ?? []).flatMap((entry) => [entry.symbol ?? "", entry.mint ?? ""]),
  ]
    .join(" ")
    .toLowerCase();
}

export function filterEvents(events: readonly AccountEvent[], filters: ActivityFilters, now: number): AccountEvent[] {
  const query = filters.query.trim().toLowerCase();
  return events.filter(
    (event) =>
      (filters.network === "all" || event.kind === "transaction") &&
      (filters.direction === "all" || directionOf(event) === filters.direction) &&
      inRange(event, filters.range, now) &&
      (query.length === 0 || haystack(event).includes(query)),
  );
}

/** A full-precision amount: thousands separated, up to nine decimals, never exponent notation. */
export function formatTokenAmount(value: number): string {
  return Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 9 });
}
