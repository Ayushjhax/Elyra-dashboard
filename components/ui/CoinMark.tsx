import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Circular coin mark, 20px by default.
 *
 * Marks are served from /public/coins/<SYMBOL>.svg. Only symbols listed in
 * LOCAL_MARKS are requested, so a missing file can never produce a 404 — every
 * other symbol renders the brand's lettered fallback chip. Drop an SVG into
 * public/coins and add its ticker here to switch a coin over.
 */
const LOCAL_MARKS = new Set<string>([]);

export function CoinMark({
  symbol,
  size = 20,
  className,
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const hasMark = LOCAL_MARKS.has(symbol);

  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill",
        "border border-border-subtle bg-surface-raised",
        className,
      )}
    >
      {hasMark ? (
        <Image
          src={`/coins/${symbol}.svg`}
          alt=""
          width={size}
          height={size}
          className="size-full object-contain"
        />
      ) : (
        <span
          className="type-label font-semibold leading-none text-text-secondary"
          style={{ fontSize: Math.max(9, Math.round(size * 0.44)) }}
        >
          {symbol.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
