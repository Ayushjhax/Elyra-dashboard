/* ---------------------------------------------------------------------------
   How prediction-market figures are written, everywhere in the app.

   A Polymarket share pays $1 if its outcome happens, so its price IS the
   market's implied probability: 63¢ and 63% are the same number. Both are
   shown — the percent for reading odds, the cents for reading the book.
   Moves are in percentage POINTS (54% → 64% is +10 pts), never percent.
   These are prices set by traders, not forecasts Elyra makes.
--------------------------------------------------------------------------- */

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** 0.115 → "11.5¢"; a whole cent prints without a decimal. */
export function cents(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  const points = value * 100;
  return `${points.toFixed(Math.abs(points - Math.round(points)) < 1e-9 ? 0 : 1)}¢`;
}

/** 0.634 → "63.4%". */
export function probability(value: number | null | undefined, digits = 1): string {
  return finite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

/** A percentage the tools already give in percent: 63.4 → "63.4%". */
export function percent(value: number | null | undefined, digits = 1): string {
  return finite(value) ? `${value.toFixed(digits)}%` : "—";
}

/** "+2.5 pts". */
export function points(value: number | null | undefined, digits = 1): string {
  return finite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)} pts` : "—";
}

/** $1.2M, $34.5k, $812. */
export function usdShort(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);
  if (size >= 1e6) return `${sign}$${(size / 1e6).toFixed(1)}M`;
  if (size >= 1e3) return `${sign}$${(size / 1e3).toFixed(1)}k`;
  return `${sign}$${size.toFixed(size < 10 ? 2 : 0)}`;
}

/** "Closes 14 Nov", "Closes in 3h", "Closed", or "No close date". */
export function closing(endsAt: string | null | undefined, now: number, closed = false): string {
  if (closed) return "Closed";
  const at = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (!Number.isFinite(at)) return "No close date";
  const hours = (at - now) / 3_600_000;
  if (hours < 0) return "Past its close date";
  if (hours < 48) return `Closes in ${Math.max(1, Math.round(hours))}h`;
  return `Closes ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(at).getUTCFullYear() === new Date(now).getUTCFullYear() ? undefined : "numeric", timeZone: "UTC" })}`;
}

/** Shown wherever probabilities are. */
export const PRICES_NOT_FORECASTS = "Implied probabilities are prices set by traders on Polymarket, not forecasts by Elyra.";

/**
 * A quote in cents for a tile. Never rounds an open price into certainty:
 * 0.9996 is ">99.9¢", not "100¢", and 0.0004 is "<0.1¢", not "0¢" — those
 * would say the market has resolved. An exact 0 or 1 prints as it is.
 */
export function quoteCents(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  if (value > 0.999 && value < 1) return ">99.9¢";
  if (value > 0 && value < 0.001) return "<0.1¢";
  return cents(value);
}

export type MarketLifecycle = "open" | "past-close" | "closed" | "resolved" | "cancelled";

/**
 * Where a market stands. Past its close date is NOT resolved: the provider
 * says when it has resolved, and until then a market whose date has gone by
 * is only that.
 */
export function marketLifecycle(
  market: { status?: string | null; closed?: boolean; endsAt: string | null },
  now: number,
): MarketLifecycle {
  if (market.status === "resolved") return "resolved";
  if (market.status === "cancelled") return "cancelled";
  if (market.status === "closed" || market.closed === true) return "closed";
  const at = market.endsAt ? Date.parse(market.endsAt) : Number.NaN;
  return Number.isFinite(at) && at < now ? "past-close" : "open";
}
