"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Layers, ShieldCheck } from "lucide-react";
import { CategoryEyebrow, RiskTag, walletUnits } from "@/components/invest/parts";
import { Delta, Money, SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard, StatusDot, Tip } from "@/components/shell/RouteDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CATEGORY_ORDER, HOW_IT_WORKS, NOT_ADVICE_NOTE } from "@/lib/invest/catalog";
import { driftOf, heldUnits, minimumInvestmentUsd, weightedMove } from "@/lib/invest/plan";
import type { PricedPortfolio } from "@/lib/invest/types";
import { useInvest } from "@/lib/invest/useInvest";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Intelligent Portfolios list: seven published recipes, steadiest first.

   Opens beside the chart like any route. Reads the shared stores only —
   `useInvest` for the catalog, prices and recorded positions, `usePortfolio`
   for what the wallet actually holds.
--------------------------------------------------------------------------- */

function PortfolioRow({
  portfolio,
  valueUsd,
  held,
  outOfBand,
}: {
  portfolio: PricedPortfolio;
  valueUsd: number | null;
  held: boolean;
  outOfBand: boolean;
}) {
  const move = weightedMove(portfolio);
  const partial = move.pct !== null && move.coveredBps < 10_000;
  const tickers = portfolio.holdings.map((holding) => holding.ticker);

  return (
    <li>
      <Link
        href={`/invest/${portfolio.id}`}
        className={cn(
          "group flex min-w-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface-panel p-3",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong hover:bg-surface-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="type-panel-title truncate text-text-primary">{portfolio.name}</span>
            <span className="type-body-sm text-text-secondary">{portfolio.summary}</span>
          </div>
          <ChevronRight size={16} aria-hidden className="mt-0.5 shrink-0 text-text-muted group-hover:text-text-secondary" />
        </div>

        <p className="type-label truncate text-text-muted" title={tickers.join(", ")}>
          {portfolio.holdings.length} holdings · {tickers.slice(0, 5).join(", ")}
          {tickers.length > 5 ? ` and ${tickers.length - 5} more` : ""}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <RiskTag risk={portfolio.risk} />
          <span className="type-label text-text-muted">From ${minimumInvestmentUsd(portfolio)}</span>
          <span className="type-data-sm inline-flex items-center gap-1 text-text-muted">
            24h{" "}
            <Delta
              pct={move.pct}
              reason="None of this portfolio's holdings report a 24-hour change right now."
            />
            {partial && <span className="text-text-muted">· {Math.round(move.coveredBps / 100)}% of holdings</span>}
          </span>
          {held && (
            <span className="type-data-sm ml-auto inline-flex items-center gap-2 text-text-primary">
              <Money value={valueUsd} reason="A holding in this portfolio has no price right now." />
              {outOfBand ? <StatusDot tone="caution">Drifted</StatusDot> : <StatusDot tone="positive">On target</StatusDot>}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

export function InvestList() {
  const invest = useInvest();
  const wallet = usePortfolio();

  const views = useMemo(() => {
    const units = walletUnits(wallet.snapshot, invest.portfolios);
    const held = invest.positions === null ? {} : heldUnits(invest.positions, units);
    return new Map(
      invest.portfolios.map((portfolio) => {
        const report = driftOf(portfolio, held[portfolio.id] ?? {});
        return [portfolio.id, report] as const;
      }),
    );
  }, [invest.portfolios, invest.positions, wallet.snapshot]);

  return (
    <>
      <DrawerCard icon={ShieldCheck} title="How these work">
        <ol className="flex flex-col gap-2">
          {HOW_IT_WORKS.map((line, index) => (
            <li key={line} className="flex items-start gap-2.5">
              <span className="type-data-sm mt-px w-4 shrink-0 text-text-muted">{index + 1}</span>
              <p className="type-body-sm text-text-secondary">{line}</p>
            </li>
          ))}
        </ol>
        <p className="type-label mt-3 text-text-muted">{NOT_ADVICE_NOTE}</p>
      </DrawerCard>

      {invest.loading && invest.portfolios.length === 0 ? (
        <DrawerCard icon={Layers} title="Portfolios">
          <SkeletonRows rows={5} />
        </DrawerCard>
      ) : invest.portfolios.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Portfolios are unavailable"
          body={invest.error ?? "The catalog could not be read. It will try again shortly."}
        />
      ) : (
        CATEGORY_ORDER.map((category) => {
          const portfolios = invest.portfolios.filter((portfolio) => portfolio.category === category);
          if (portfolios.length === 0) return null;
          return (
            <section key={category} aria-label={category} className="flex flex-col gap-2">
              <CategoryEyebrow category={category} />
              <ul className="flex flex-col gap-2">
                {portfolios.map((portfolio) => {
                  const report = views.get(portfolio.id);
                  return (
                    <PortfolioRow
                      key={portfolio.id}
                      portfolio={portfolio}
                      valueUsd={report?.totalUsd ?? null}
                      held={report?.held ?? false}
                      outOfBand={report?.outOfBand ?? false}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {invest.error !== null && invest.portfolios.length > 0 && (
        <Tip openOnTap label={invest.error}>
          <span tabIndex={0} className="self-start rounded-chip">
            <StatusDot tone="caution">Some prices are missing</StatusDot>
          </span>
        </Tip>
      )}
      {invest.positionsError !== null && (
        <p role="status" className="type-label text-text-muted">
          {invest.positionsError}
        </p>
      )}
    </>
  );
}
