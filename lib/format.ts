/* ---------------------------------------------------------------------------
   Formatters. Everything that renders a number goes through here so precision
   and sign conventions stay identical across panels.
--------------------------------------------------------------------------- */

import { priceDecimals } from "@/lib/market/precision";

export function formatUsd(
  value: number,
  { decimals = 2, sign = false }: { decimals?: number; sign?: boolean } = {},
): string {
  const abs = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = value < 0 ? "-" : sign ? "+" : "";
  return `${prefix}$${abs}`;
}

/** Large quote values: $1.28B, $412.8M, $84.2K. */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-$" : "$";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      return `${prefix}${(abs / threshold).toFixed(abs / threshold >= 100 ? 0 : abs / threshold >= 10 ? 1 : 2)}${suffix}`;
    }
  }
  return `${prefix}${abs.toFixed(2)}`;
}

export function formatPct(
  value: number,
  { decimals = 2, sign = true }: { decimals?: number; sign?: boolean } = {},
): string {
  const prefix = value < 0 ? "-" : sign ? "+" : "";
  return `${prefix}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatQty(value: number, decimals = 2): string {
  return Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A market price in dollars at the instrument's own precision — $107.7439,
 * $0.00000421. Every price shown with a currency sign goes through here, so a
 * small token can never round to $0.00 or print in exponent notation.
 */
export function formatPriceUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value < 0 ? "-" : ""}$${formatPrice(Math.abs(value), priceDecimals(value))}`;
}

/** Price with the asset's own precision, no currency symbol. */
export function formatPrice(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * "just now", "4m ago", "2h ago", "3d ago".
 *
 * `now` is required. There is no instant the server and the client agree on,
 * so a caller passes the shared clock from lib/useClock.ts — null until
 * hydration — and renders nothing relative until it has one.
 */
export function formatRelativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

/**
 * How old a reading is, to the second while it is fresh: "just now", "8s
 * ago", "3m ago". For "Updated …" lines over data that polls every thirty
 * seconds, where `formatRelativeTime`'s 45-second "just now" would hide a
 * whole missed poll. `now` is the shared second clock, as above.
 */
export function formatAge(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return formatRelativeTime(new Date(at).toISOString(), now);
}

/** Clock time, to the minute: 14:06. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Date + clock for rows that can be older than today. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return `${day} ${formatClock(iso)}`;
}

/** Today / Yesterday / 28 Aug — the Activity feed's group headers. */
export function formatDayGroup(iso: string, now: number): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const days = Math.round(
    (startOfDay(now) - startOfDay(Date.parse(iso))) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function truncateMiddle(value: string, lead = 4, tail = 4): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/**
 * Wall-clock time in the viewer's own timezone: `03:32PM`.
 *
 * Local, unlike every other formatter here, which pins UTC because the mock
 * data is a fixed instant. This one shows the operator what time it is where
 * they are, so it must not.
 *
 * The separator is stripped rather than formatted away. Intl puts a space
 * before the day period, and since ICU 72 that space is U+202F (narrow
 * no-break) rather than U+0020 — so a `.replace(" ", "")` silently stopped
 * working when Node updated. `\s` matches both.
 */
export function formatClock12(at: number): string {
  return new Date(at)
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s+/g, "")
    .toUpperCase();
}
