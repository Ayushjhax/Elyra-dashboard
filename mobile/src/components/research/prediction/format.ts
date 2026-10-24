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
