import { formatCompactUsd, formatPct, formatUsd } from "@/lib/format";
import { Text, type TextTone } from "~/components/ui/Text";
import { useBalancesHidden } from "~/lib/store";
import type { TypeVariant } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Figures — ported from the website's components/portfolio/primitives.tsx,
   with the same three rules:

   1. A missing number is an em dash WITH a reason. `<Money value={null}
      reason="…" />` is the only way to draw an absent figure, so no screen
      can quietly show 0.00 for something nobody could read. The reason is
      what a screen reader hears.
   2. Hiding balances masks figures and nothing else, here, so a screen added
      later cannot forget it.
   3. Positive is Sage and negative is Clay — never lime. Lime means "you can
      press this".
--------------------------------------------------------------------------- */

/** Fixed width, so masking does not reflow the row. */
const MASK = "▒▒▒▒▒▒";

interface FigureProps {
  variant?: TypeVariant;
  tone?: TextTone;
}

function Absent({ reason, variant = "data" }: { reason?: string; variant?: TypeVariant }) {
  return (
    <Text variant={variant} tone="muted" accessibilityLabel={reason ? `Unavailable: ${reason}` : "Unavailable"}>
      —
    </Text>
  );
}

function Masked({ variant = "data" }: { variant?: TypeVariant }) {
  return (
    <Text variant={variant} tone="muted" accessibilityLabel="Hidden">
      {MASK}
    </Text>
  );
}

/** A USD figure, or an explained absence. */
export function Money({
  value,
  reason,
  sign = false,
  compact = false,
  decimals = 2,
  variant = "data",
  tone = "primary",
}: {
  value: number | null;
  reason?: string;
  sign?: boolean;
  compact?: boolean;
  decimals?: number;
} & FigureProps) {
  const hidden = useBalancesHidden();
  if (value === null) return <Absent reason={reason} variant={variant} />;
  if (hidden) return <Masked variant={variant} />;

  /* A balance worth less than the smallest step shown is not zero, and
     printing "$0.00" for it says it is. */
  const step = 10 ** -decimals;
  const text =
    value !== 0 && Math.abs(value) < step
      ? `${value < 0 ? "-" : sign ? "+" : ""}<$${step.toFixed(decimals)}`
      : compact
        ? /* Not Intl's compact notation, which Hermes ignores. */
          `${sign && value > 0 ? "+" : ""}${formatCompactUsd(value)}`
        : formatUsd(value, { decimals, sign });

  return (
    <Text variant={variant} tone={tone}>
      {text}
    </Text>
  );
}

/** A token quantity. Precision rises for small balances, never past 8. */
export function Quantity({ value, variant = "data", tone = "primary" }: { value: number } & FigureProps) {
  const hidden = useBalancesHidden();
  if (hidden) return <Masked variant={variant} />;
  const abs = Math.abs(value);
  const decimals = abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8;
  return (
    <Text variant={variant} tone={tone}>
      {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: decimals })}
    </Text>
  );
}

/**
 * A signed change, coloured by direction. The sign carries the direction for
 * anyone who cannot use the colour, so it is never suppressed. The USD part
 * is a balance and is masked with the others; the percentage is not.
 */
export function Delta({
  pct,
  usd,
  reason,
  variant = "data",
}: {
  pct: number | null;
  usd?: number | null;
  reason?: string;
  variant?: TypeVariant;
}) {
  const hidden = useBalancesHidden();
  if (pct === null && (usd === null || usd === undefined)) return <Absent reason={reason} variant={variant} />;
  const up = (pct ?? usd ?? 0) >= 0;
  const parts = [
    usd !== undefined && usd !== null && !hidden ? formatUsd(usd, { sign: true }) : null,
    pct !== null ? formatPct(pct) : null,
  ].filter((part): part is string => part !== null);
  return (
    <Text variant={variant} tone={up ? "positive" : "negative"}>
      {parts.join(" ")}
    </Text>
  );
}

/** A plain percentage — a share, a probability — with no direction colour. */
export function Percent({
  value,
  reason,
  decimals = 1,
  variant = "data",
  tone = "primary",
}: { value: number | null; reason?: string; decimals?: number } & FigureProps) {
  if (value === null) return <Absent reason={reason} variant={variant} />;
  return (
    <Text variant={variant} tone={tone}>
      {formatPct(value, { sign: false, decimals })}
    </Text>
  );
}
