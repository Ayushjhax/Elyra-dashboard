import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/format";

/**
 * A signed percentage. Sage for up, Clay for down, Stone when flat — the one
 * colour rule the product never breaks. Lime is never used here.
 */
export function DeltaText({
  value,
  decimals = 2,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const tone =
    value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-neutral-flat";

  return (
    <span className={cn("tabular-nums", tone, className)}>
      {formatPct(value, { decimals })}
    </span>
  );
}

/** Same colour rule, applied to an arbitrary already-formatted value. */
export function ValueTone({
  value,
  children,
  className,
}: {
  value: number;
  children: React.ReactNode;
  className?: string;
}) {
  const tone =
    value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-neutral-flat";
  return <span className={cn("tabular-nums", tone, className)}>{children}</span>;
}
