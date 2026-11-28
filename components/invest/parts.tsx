"use client";

import { useId, useState } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { CATEGORY_LABEL, RISK_LABEL } from "@/lib/invest/catalog";
import type { PortfolioHolding, PricedPortfolio, RiskLevel } from "@/lib/invest/types";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { onSolanaWallet } from "@/lib/portfolio/chain";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Pieces shared by the Intelligent Portfolios list, a portfolio's page and
   its trade dialog.
--------------------------------------------------------------------------- */

/* ---- focus across the list and a portfolio's page ----

   Each is its own route, so following a card or "All portfolios" unmounts
   the link that had focus and the keyboard would start again from the top
   of the document. The link that was followed says where focus should land
   next; the page it opens takes it once. A page opened any other way (a
   typed URL, a reload) takes nothing, so focus is never pulled on load. */

let focusHandoff: { view: "list" | "detail"; id: string } | null = null;

export function handFocusTo(view: "list" | "detail", id: string): void {
  focusHandoff = { view, id };
}

/** The portfolio id focus was handed to `view` for, once; null otherwise. */
export function takeFocus(view: "list" | "detail"): string | null {
  if (focusHandoff === null || focusHandoff.view !== view) return null;
  const { id } = focusHandoff;
  focusHandoff = null;
  return id;
}

/** "2026-11-09" → "9 Nov 2026", or "2026年11月9日" for a Chinese reader. */
export function dayLabel(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * A card that folds to its heading — "How portfolios work", "Strategy &
 * disclosures". The heading is the toggle; folding hides the body without
 * unmounting it.
 */
export function Disclosure({
  icon: Icon,
  title,
  defaultOpen = false,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <section
      aria-labelledby={`${id}-toggle`}
      className={cn("min-w-0 rounded-panel border border-border-subtle bg-surface-raised", className)}
    >
      <h2>
        <button
          type="button"
          id={`${id}-toggle`}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex min-h-12 w-full min-w-0 items-center gap-2.5 px-4 py-3 text-left @max-[340px]:px-3",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
            open ? "rounded-t-panel" : "rounded-panel",
          )}
        >
          <Icon size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
          <span className="type-h2 min-w-0 flex-1 text-text-primary">{title}</span>
          <ChevronRight
            size={16}
            aria-hidden
            className={cn(
              "shrink-0 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
              open && "rotate-90",
            )}
          />
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} className="px-4 pb-4 @max-[340px]:px-3">
        {children}
      </div>
    </section>
  );
}

/* ---- the target-allocation bar ---- */

/** How much Khaki a segment after the first carries: 80% stepping down to 30%. */
function khakiMix(index: number, count: number): string {
  const steps = Math.max(1, count - 2);
  return `${Math.round(80 - ((index - 1) * 50) / steps)}%`;
}

/** The colour of a holding's segment, for its swatch in the rows below the bar. */
export function segmentStyle(index: number, count: number): { className: string; lead?: ""; style?: React.CSSProperties } {
  return index === 0
    ? { className: "allocation-segment", lead: "" }
    : { className: "allocation-segment", style: { "--mix": khakiMix(index, count) } as React.CSSProperties };
}

/**
 * Each holding's target weight as one segment of a bar, in the catalog's
 * order. Hidden from assistive technology: the rows beneath it say the same
 * thing in words, and the bar would only say it twice. A segment shows its
 * weight only where the figure fits (each segment is its own container).
 */
export function AllocationBar({ holdings }: { holdings: readonly Pick<PortfolioHolding, "symbol" | "weightBps">[] }) {
  return (
    <div aria-hidden className="flex h-8 w-full gap-0.5 overflow-hidden rounded-control">
      {holdings.map((holding, index) => {
        const segment = segmentStyle(index, holdings.length);
        return (
          <span
            key={holding.symbol}
            data-lead={segment.lead}
            className={cn(segment.className, "@container grid min-w-0 place-items-center overflow-hidden")}
            style={{ ...segment.style, flex: `${holding.weightBps} 1 0%` }}
          >
            <span className="type-data-sm hidden whitespace-nowrap @[2rem]:inline">{weightLabel(holding.weightBps)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** 2000 → "20%", 350 → "3.5%". */
export function weightLabel(bps: number): string {
  const pct = bps / 100;
  return `${pct.toFixed(Number.isInteger(pct) ? 0 : 1)}%`;
}

/**
 * The wallet's balance of every catalog holding, by allowlist symbol.
 *
 * Matched by MINT, never by symbol: a token named "NVDAon" costs pennies to
 * mint and airdrop, and only the mint says which one is real. Unverified
 * holdings are skipped for the same reason the portfolio total skips them.
 * Null when the wallet has not been read, which is different from empty.
 */
export function walletUnits(
  snapshot: PortfolioSnapshot | null,
  portfolios: readonly PricedPortfolio[],
): Record<string, number> | null {
  if (snapshot === null) return null;
  const symbolByMint = new Map<string, string>();
  for (const portfolio of portfolios) {
    for (const holding of portfolio.holdings) symbolByMint.set(holding.mint, holding.symbol);
  }
  const units: Record<string, number> = {};
  for (const holding of snapshot.spot) {
    if (!onSolanaWallet(holding) || !holding.verified || holding.address === null) continue;
    const symbol = symbolByMint.get(holding.address);
    if (symbol !== undefined) units[symbol] = (units[symbol] ?? 0) + holding.quantity;
  }
  return units;
}

/**
 * The Solana wallet's verified USDC, which is what a purchase spends. USDC on
 * Ethereum or Robinhood Chain is real money but cannot pay for a Solana swap,
 * so it is not counted as spendable here.
 */
export function walletUsdc(snapshot: PortfolioSnapshot | null): number | null {
  if (snapshot === null) return null;
  return snapshot.spot
    .filter((holding) => onSolanaWallet(holding) && holding.verified && holding.symbol === "USDC")
    .reduce((sum, holding) => sum + holding.quantity, 0);
}

export function RiskTag({ risk, className }: { risk: RiskLevel; className?: string }) {
  const t = useT();
  return (
    <span
      className={cn(
        "type-label inline-flex h-6 shrink-0 items-center rounded-chip border px-2 whitespace-nowrap",
        risk === "higher" ? "border-border-strong text-text-primary" : "border-border-subtle text-text-secondary",
        className,
      )}
    >
      {t(RISK_LABEL[risk])}
    </span>
  );
}

export function CategoryEyebrow({ category }: { category: PricedPortfolio["category"] }) {
  const t = useT();
  return <span className="type-eyebrow text-text-muted">{t(CATEGORY_LABEL[category])}</span>;
}
