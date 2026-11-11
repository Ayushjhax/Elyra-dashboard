"use client";

import { CATEGORY_LABEL, RISK_LABEL } from "@/lib/invest/catalog";
import type { PricedPortfolio, RiskLevel } from "@/lib/invest/types";
import { onSolanaWallet } from "@/lib/portfolio/chain";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Pieces shared by the Intelligent Portfolios list, a portfolio's page and
   its trade dialog.
--------------------------------------------------------------------------- */

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
  return (
    <span
      className={cn(
        "type-label inline-flex h-6 shrink-0 items-center rounded-chip border px-2 whitespace-nowrap",
        risk === "higher" ? "border-border-strong text-text-primary" : "border-border-subtle text-text-secondary",
        className,
      )}
    >
      {RISK_LABEL[risk]}
    </span>
  );
}

export function CategoryEyebrow({ category }: { category: PricedPortfolio["category"] }) {
  return <span className="type-eyebrow text-text-muted">{CATEGORY_LABEL[category]}</span>;
}
