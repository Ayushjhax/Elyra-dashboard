import { cn } from "@/lib/utils";

/**
 * One label/value pair in the market header's stat strip. Label in `label`,
 * value in `data`, separated from its neighbours by a hairline divider.
 */
export function StatPill({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "muted";
  className?: string;
}) {
  const valueTone = {
    default: "text-text-primary",
    positive: "text-positive",
    negative: "text-negative",
    muted: "text-neutral-flat",
  }[tone];

  return (
    <div className={cn("flex min-w-0 flex-col justify-center gap-0.5 px-3", className)}>
      <span className="type-label whitespace-nowrap text-text-muted">{label}</span>
      <span className={cn("type-data whitespace-nowrap", valueTone)}>{value}</span>
    </div>
  );
}
