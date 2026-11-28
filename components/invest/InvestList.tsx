"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { ChevronRight, Layers, ShieldCheck } from "lucide-react";
import { CategoryEyebrow, Disclosure, RiskTag, handFocusTo, takeFocus, walletUnits } from "@/components/invest/parts";
import { Delta, Money, SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard, StatusDot, Tip } from "@/components/shell/RouteDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CATEGORY_LABEL, CATEGORY_ORDER, HOW_IT_WORKS, NOT_ADVICE_NOTE } from "@/lib/invest/catalog";
import { driftOf, heldUnits, minimumInvestmentUsd, weightedMove } from "@/lib/invest/plan";
import type { PricedPortfolio } from "@/lib/invest/types";
import { useInvest } from "@/lib/invest/useInvest";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   The Intelligent Portfolios list: seven published recipes, steadiest first.

   Opens beside the chart like any route. Reads the shared stores only —
   `useInvest` for the catalog, prices and recorded positions, `usePortfolio`
   for what the wallet actually holds.

   "How portfolios work" folds to its heading, so the cards are the first
   thing on screen; every card has the same four lines — what it is for, what
   it holds, its risk and minimum, and its 24-hour move with the share of the
   portfolio that move stands for when it is not all of it.
--------------------------------------------------------------------------- */

function PortfolioRow({
  portfolio,
  valueUsd,
  held,
  outOfBand,
  linkRef,
}: {
  portfolio: PricedPortfolio;
  valueUsd: number | null;
  held: boolean;
  outOfBand: boolean;
  linkRef: (node: HTMLAnchorElement | null) => void;
}) {
  const t = useT();
  const move = weightedMove(portfolio);
  const partial = move.pct !== null && move.coveredBps < 10_000;
  const tickers = portfolio.holdings.map((holding) => holding.ticker);

  return (
    <li>
      <Link
        ref={linkRef}
        href={`/invest/${portfolio.id}`}
        onClick={() => handFocusTo("detail", portfolio.id)}
        className={cn(
          "group flex min-w-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4 @max-[340px]:p-3",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong hover:bg-surface-hover",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="type-h2 text-text-primary">{t(portfolio.name)}</span>
            <span className="type-body-sm text-text-secondary">{t(portfolio.summary)}</span>
          </div>
          <ChevronRight size={16} aria-hidden className="mt-1 shrink-0 text-text-muted group-hover:text-text-secondary" />
        </div>

        <p className="type-label truncate text-text-muted" title={tickers.join(", ")}>
          {tickers.length > 5
            ? t("{count} holdings · {tickers} and {more} more", { count: portfolio.holdings.length, tickers: tickers.slice(0, 5).join(", "), more: tickers.length - 5 })
            : t("{count} holdings · {tickers}", { count: portfolio.holdings.length, tickers: tickers.join(", ") })}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <RiskTag risk={portfolio.risk} />
          <span className="type-data-sm text-text-secondary">{t("From ${portfolio}", { portfolio: minimumInvestmentUsd(portfolio) })}</span>
          <span className="type-data-sm inline-flex items-center gap-1 text-text-muted">
            24h{" "}
            <Delta pct={move.pct} reason={t("None of this portfolio's holdings report a 24-hour change right now.")} />
            {partial && <span className="text-text-muted">{t("· {value}% of holdings", { value: Math.round(move.coveredBps / 100) })}</span>}
          </span>
          {held && (
            <span className="type-data-sm ml-auto inline-flex items-center gap-2 text-text-primary">
              <Money value={valueUsd} reason={t("A holding in this portfolio has no price right now.")} />
              {outOfBand ? <StatusDot tone="caution">{t("Drifted")}</StatusDot> : <StatusDot tone="positive">{t("On target")}</StatusDot>}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

export function InvestList() {
  const t = useT();
  const invest = useInvest();
  const wallet = usePortfolio();
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const ready = invest.portfolios.length > 0;

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

  /* Back from a portfolio's page: focus returns to that portfolio's card. */
  useEffect(() => {
    if (!ready) return;
    const id = takeFocus("list");
    if (id !== null) links.current.get(id)?.focus();
  }, [ready]);

  return (
    <>
      <Disclosure icon={ShieldCheck} title={t("How portfolios work")}>
        <ol className="flex flex-col gap-2">
          {HOW_IT_WORKS.map((line, index) => (
            <li key={line} className="flex items-start gap-2.5">
              <span className="type-data-sm mt-px w-4 shrink-0 text-text-muted">{index + 1}</span>
              <p className="type-body-sm text-text-secondary">{t(line)}</p>
            </li>
          ))}
        </ol>
        <p className="type-label mt-3 border-t border-border-subtle pt-3 text-text-muted">{t(NOT_ADVICE_NOTE)}</p>
      </Disclosure>

      {invest.loading && !ready ? (
        <DrawerCard icon={Layers} title={t("Portfolios")}>
          <SkeletonRows rows={5} />
        </DrawerCard>
      ) : !ready ? (
        <EmptyState
          icon={Layers}
          title={t("Portfolios are unavailable")}
          body={invest.error ?? t("The catalog could not be read. It will try again shortly.")}
        />
      ) : (
        CATEGORY_ORDER.map((category) => {
          const portfolios = invest.portfolios.filter((portfolio) => portfolio.category === category);
          if (portfolios.length === 0) return null;
          return (
            <section key={category} aria-label={t(CATEGORY_LABEL[category])} className="mt-1 flex flex-col gap-2">
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
                      linkRef={(node) => {
                        if (node === null) links.current.delete(portfolio.id);
                        else links.current.set(portfolio.id, node);
                      }}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {invest.error !== null && ready && (
        <Tip openOnTap label={invest.error}>
          <span tabIndex={0} className="self-start rounded-chip">
            <StatusDot tone="caution">{t("Some prices are missing")}</StatusDot>
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
