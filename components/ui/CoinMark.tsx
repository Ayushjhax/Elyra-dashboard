"use client";

import { useState } from "react";
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
 * A plain `<img>` rather than `next/image`: these are 64px PNGs from a CDN
 * that already serves them at the right size, and routing thousands of
 * possible logos through the image optimiser would cost far more than it
 * saves.
 */
export function CoinMark({
  symbol,
  logo = null,
  size = 20,
  className,
}: {
  symbol: string;
  logo?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = logo !== null && !failed;

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
          src={logo}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
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
