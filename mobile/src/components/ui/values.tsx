import type { StyleProp, TextStyle } from "react-native";
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
  /** A size the type role does not carry — the wallet's headline total. */
  style?: StyleProp<TextStyle>;
}

function Absent({ reason, variant = "data", style }: { reason?: string; variant?: TypeVariant; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant={variant} tone="muted" accessibilityLabel={reason ? `Unavailable: ${reason}` : "Unavailable"} style={style}>
      —
    </Text>
  );
}

function Masked({ variant = "data", style }: { variant?: TypeVariant; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant={variant} tone="muted" accessibilityLabel="Hidden" style={style}>
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
  style,
}: {
  value: number | null;
  reason?: string;
  sign?: boolean;
  compact?: boolean;
  decimals?: number;
} & FigureProps) {
  const hidden = useBalancesHidden();
  if (value === null) return <Absent reason={reason} variant={variant} style={style} />;
  if (hidden) return <Masked variant={variant} style={style} />;

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
    <Text variant={variant} tone={tone} style={style}>
      {text}
    </Text>
  );
}

/** A token quantity as text. Precision rises for small balances, never past 8. */
export function formatQuantity(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: decimals });
}

/** A token quantity, masked with the other figures when balances are hidden. */
export function Quantity({ value, variant = "data", tone = "primary", style }: { value: number } & FigureProps) {
  const hidden = useBalancesHidden();
  if (hidden) return <Masked variant={variant} style={style} />;
  return (
    <Text variant={variant} tone={tone} style={style}>
      {formatQuantity(value)}
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
