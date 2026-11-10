/* ---------------------------------------------------------------------------
   Exact conversion between a decimal amount and a token's base units.

   Pure, and listed in lib/core.ts: the swap route, the transfer route, the
   portfolio planner and the Android app all hold an amount to this one
   definition rather than to several that can drift.
--------------------------------------------------------------------------- */

/**
 * Converts a decimal amount STRING to base units, exactly.
 *
 * No floating point anywhere in here, which is the whole point. Two ways the
 * obvious implementations go wrong:
 *
 *   `1.1 * 10 ** 9`        → 1100000000.0000001 — a swap amount one lamport
 *                            off is one the venue rejects.
 *   `Number("1234.567891")` → 1234.56789099999991… — truncating THAT loses the
 *                            user's last unit, and rounding it up quotes a
 *                            swap for more than they typed.
 *
 * So the digits the user typed are shifted by hand. Precision beyond the
 * token's decimals is truncated, never rounded: rounding up would quote a
 * trade larger than the balance it was sized against.
 */
export function toBaseUnits(amount: string, decimals: number): string | null {
  const text = amount.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;

  const [whole = "", fraction = ""] = text.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${whole}${padded}`.replace(/^0+(?=\d)/, "");

  /* An amount that rounds away to nothing at this precision is not a trade. */
  return /^\d+$/.test(combined) && /[1-9]/.test(combined) ? combined : null;
}

/**
 * Base units back to a plain decimal string, exactly: `1500000, 6` → `"1.5"`.
 *
 * Never exponent notation and never a float on the way — the result is fed
 * straight back into a swap amount, where "1e-7" is not something the
 * parser above (or a person) reads as a number.
 */
export function fromBaseUnits(base: bigint | string, decimals: number): string {
  const value = typeof base === "bigint" ? base : BigInt(base);
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction.length > 0 ? `.${fraction}` : ""}`;
}
