"use client";

import { useState } from "react";
import { Monogram } from "@/components/ui/Monogram";
import { cn } from "@/lib/utils";

/**
 * Circular asset mark.
 *
 * The logo URL comes from the asset record, which derives it from the
 * CoinMarketCap id Pyth publishes alongside each feed — no local artwork and
 * no per-symbol table, so an asset added to Pyth tomorrow gets its logo for
 * free.
 *
 * Most of what Pyth carries has no logo at all: equities, metals, FX and
 * commodities have no CMC listing. Those pass `logo={null}` and render the
 * lettered chip, which is the same fallback used when a URL 404s — CMC
 * answers an unknown id with a 403, so a broken image is a normal outcome
 * rather than an error worth surfacing.
 *
 * `fallbackLogo` is a second source tried when the first fails — a ticker
 * Pyth does not list can still have its venue's own icon — before the chip.
 *
 * A plain `<img>` rather than `next/image`: these are 64px PNGs from a CDN
 * that already serves them at the right size, and routing thousands of
 * possible logos through the image optimiser would cost far more than it
 * saves.
 */
export function CoinMark({
  symbol,
  logo = null,
  fallbackLogo = null,
  fallback,
  size = 20,
  className,
}: {
  symbol: string;
  logo?: string | null;
  fallbackLogo?: string | null;
  /** Drawn instead of the lettered chip once every source has failed. */
  fallback?: React.ReactNode;
  size?: number;
  className?: string;
}) {
  /* The URLs that failed, by value rather than by count. The logo usually
     arrives a render after the fallback — the catalogue read is async — and a
     count would then index past it: a fallback that failed first left
     `failures` at 1, which skipped the logo the moment it appeared. */
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const source = [logo, fallbackLogo].find((url): url is string => url !== null && !failed.has(url)) ?? null;
  const showImage = source !== null;
  if (!showImage && fallback !== undefined) return <>{fallback}</>;

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
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element -- these are 64px
           PNGs the CDN already serves at the right size, and the set spans
           every asset Pyth carries. Routing them through the image optimiser
           would add cost and latency to fetch the same bytes back. */
        <img
          key={source}
          src={source}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed((current) => new Set(current).add(source))}
          className="size-full object-contain"
        />
      ) : (
        <Monogram name={symbol} size={size} />
      )}
    </span>
  );
}
