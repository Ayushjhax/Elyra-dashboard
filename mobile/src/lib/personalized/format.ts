import { formatPriceUsd } from "@/lib/format";
// Model/server display strings still pass every explicit USD figure through
// the same precision rule as portfolio prices. Non-currency text is unchanged.
export function formatAnswerText(value: string): string {
  return value.replace(
    /\$(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (whole, raw: string) => {
      const amount = Number(raw.replace(/,/g, ""));
      return Number.isFinite(amount) ? formatPriceUsd(amount) : whole;
    },
  );
}
