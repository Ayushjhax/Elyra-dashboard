"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Layers, Scale, Wallet } from "lucide-react";
import { RiskTag, walletUnits, walletUsdc, weightLabel } from "@/components/invest/parts";
import { TradeDialog } from "@/components/invest/TradeDialog";
import { Delta, Money, Quantity, SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DrawerCard, InfoTip, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPriceUsd, formatUsd } from "@/lib/format";
import { CATEGORY_LABEL, ELIGIBILITY_NOTE, INCOME_NOTE, NOT_ADVICE_NOTE } from "@/lib/invest/catalog";
import {
  DRIFT_ABSOLUTE_BPS,
  DRIFT_RELATIVE,
  driftOf,
  heldUnits,
  minimumInvestmentUsd,
  planBuy,
  planRebalance,
  type DriftRow,
  type Leg,
} from "@/lib/invest/plan";
import { useInvest } from "@/lib/invest/useInvest";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   One Intelligent Portfolio: what it holds and why, what you hold of it, how
   far that has drifted, and the trades that buy or correct it.

   Every figure is derived from the shared stores by lib/invest/plan.ts; this
   component plans nothing itself. The trades it proposes open TradeDialog,
   which runs each as a swap the person signs.
--------------------------------------------------------------------------- */

const RULE = `A holding is out of band when it is more than ${DRIFT_ABSOLUTE_BPS / 100} percentage points from its target, or more than ${DRIFT_RELATIVE * 100}% of its target away — whichever is tighter. A 40% holding may sit between 35% and 45%; a 4% one between 3% and 5%.`;

function shareLabel(bps: number | null): string {
  return bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;
}

export function PortfolioView({ id }: { id: string }) {
  const auth = useElyraAuth();
  const invest = useInvest();
  const wallet = usePortfolio();
  const [amount, setAmount] = useState("");
  const [trade, setTrade] = useState<{ kind: "buy" | "rebalance"; legs: Leg[] } | null>(null);

  const portfolio = invest.portfolios.find((entry) => entry.id === id) ?? null;

  const view = useMemo(() => {
    if (portfolio === null) return null;
    const units = walletUnits(wallet.snapshot, invest.portfolios);
    const held = invest.positions === null ? {} : heldUnits(invest.positions, units);
    const mine = held[portfolio.id] ?? {};
    const report = driftOf(portfolio, mine);
    /* Rebalancing sells, so it is offered only against a wallet that has
       been read: recorded units alone could ask to sell what is not there. */
    const rebalance = report.held && units !== null ? planRebalance(portfolio, mine) : null;
    const newHoldings = portfolio.holdings.filter((holding) => (units?.[holding.symbol] ?? 0) <= 0).length;
    return { report, rebalance, newHoldings, walletRead: units !== null };
  }, [portfolio, invest.portfolios, invest.positions, wallet.snapshot]);

  if (invest.loading && portfolio === null) {
    return (
      <DrawerCard icon={Layers} title="Holdings">
        <SkeletonRows rows={6} />
      </DrawerCard>
    );
  }

  if (portfolio === null || view === null) {
    return (
      <EmptyState
        icon={Layers}
        title="This portfolio could not be read"
        body={invest.error ?? "Its prices are unavailable right now. It will try again shortly."}
      />
    );
  }

  const { report, rebalance, newHoldings } = view;
  const plan = amount.trim().length === 0 ? null : planBuy(portfolio, amount);
  const usdc = walletUsdc(wallet.snapshot);
  const spend = plan !== null && "legs" in plan ? plan.legs.reduce((sum, leg) => sum + leg.usd, 0) : 0;
  const short = usdc !== null && spend > usdc;
  const rebalanceLegs = rebalance !== null && !("error" in rebalance) ? [...rebalance.sells, ...rebalance.buys] : [];

  const columns: Column<DriftRow>[] = [
    {
      key: "holding",
      header: "Holding",
      width: "34%",
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="type-data-sm truncate text-text-primary">{row.ticker}</span>
          <span className="type-label truncate text-text-muted" title={row.role}>
            {row.name}
          </span>
        </div>
      ),
    },
    { key: "target", header: "Target", align: "right", width: "14%", render: (row) => <span className="type-data-sm">{weightLabel(row.targetBps)}</span> },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: "18%",
      render: (row) => (
        <span className="type-data-sm" title={row.priceUsd === null ? "No price right now" : undefined}>
          {formatPriceUsd(row.priceUsd)}
        </span>
      ),
    },
    {
      key: "change",
      header: "24h",
      align: "right",
      width: "14%",
      className: "hidden @[30rem]:table-cell",
      render: (row) => <Delta pct={row.change24hPct} reason="No 24-hour change reported." className="type-data-sm" />,
    },
    {
      key: "yours",
      header: "Yours",
      align: "right",
      width: "20%",
      render: (row) =>
        !report.held ? (
          <span className="type-data-sm text-text-muted">—</span>
        ) : (
          <span className={cn("type-data-sm", row.outOfBand ? "text-caution" : "text-text-primary")}>
            {shareLabel(row.currentBps)}
            {row.outOfBand && <span className="sr-only"> — out of band</span>}
          </span>
        ),
    },
  ];

  return (
    <>
      <Link href="/invest" className="type-label inline-flex items-center gap-1.5 self-start text-text-secondary hover:text-text-primary">
        <ArrowLeft size={14} aria-hidden />
        All portfolios
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <span className="type-eyebrow text-text-muted">{CATEGORY_LABEL[portfolio.category]}</span>
        <RiskTag risk={portfolio.risk} />
      </div>

      <DrawerCard
        icon={Wallet}
        title="Your position"
        right={
          report.held ? (
            report.totalUsd === null ? null : report.outOfBand ? (
              <StatusDot tone="caution">Drifted</StatusDot>
            ) : (
              <StatusDot tone="positive">On target</StatusDot>
            )
          ) : null
        }
      >
        {!auth.ready ? (
          <SkeletonRows rows={2} />
        ) : !auth.authenticated ? (
          <div className="flex flex-col items-start gap-3">
            <p className="type-body-sm text-text-secondary">Sign in to buy this portfolio into your own wallet.</p>
            <Button size="sm" variant="accent" onClick={auth.login}>
              Sign in
            </Button>
          </div>
        ) : auth.solanaAddress === null ? (
          <p className="type-body-sm text-text-secondary">Connect a Solana wallet to buy this portfolio.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {report.held && (
              <div className="flex flex-col gap-1">
                <span className="type-price text-text-primary">
                  <Money value={report.totalUsd} reason={`No price right now for ${report.unpriced.join(", ")}.`} />
                </span>
                <p className="type-label text-text-muted">
                  {report.outOfBand
                    ? `${report.rows.filter((row) => row.outOfBand).map((row) => row.ticker).join(", ")} ${report.rows.filter((row) => row.outOfBand).length === 1 ? "is" : "are"} outside ${report.rows.filter((row) => row.outOfBand).length === 1 ? "its band" : "their bands"}.`
                    : "Every holding is within its band."}{" "}
                  <InfoTip text={RULE} />
                </p>
              </div>
            )}

            {invest.positionsError !== null && <p className="type-label text-caution">{invest.positionsError}</p>}

            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (plan !== null && "legs" in plan && !short) setTrade({ kind: "buy", legs: plan.legs });
              }}
            >
              <label htmlFor="invest-amount" className="type-label text-text-secondary">
                {report.held ? "Add USDC" : "Amount in USDC"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="invest-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={String(minimumInvestmentUsd(portfolio))}
                  className={cn(
                    "type-data h-[var(--control-h)] min-w-0 flex-1 rounded-control border border-border-subtle bg-surface-base px-3",
                    "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
                  )}
                />
                <Button type="submit" variant="accent" disabled={plan === null || "error" in plan || short}>
                  Review
                </Button>
              </div>
              <p className="type-label text-text-muted" role={plan !== null && "error" in plan ? "alert" : undefined}>
                {plan !== null && "error" in plan
                  ? plan.error
                  : short
                    ? `This wallet holds ${formatUsd(usdc ?? 0)} USDC. Swap or deposit more first.`
                    : `From $${minimumInvestmentUsd(portfolio)}. Split by target weight, one swap per holding.${usdc !== null ? ` Wallet: ${formatUsd(usdc)} USDC.` : ""}`}
              </p>
            </form>

            {report.held && (
              <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                {rebalance !== null && "error" in rebalance ? (
                  <p className="type-label text-text-muted">{rebalance.error}</p>
                ) : rebalanceLegs.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="type-label text-text-secondary">
                      {rebalanceLegs.length} {rebalanceLegs.length === 1 ? "trade brings" : "trades bring"} it back to target.
                    </p>
                    <Button size="sm" variant={report.outOfBand ? "accent" : "quiet"} onClick={() => setTrade({ kind: "rebalance", legs: rebalanceLegs })}>
                      <Scale size={14} aria-hidden />
                      Review rebalance
                    </Button>
                  </div>
                ) : !view.walletRead ? (
                  <p className="type-label text-text-muted">Rebalancing waits for your wallet balances to load.</p>
                ) : (
                  <p className="type-label text-text-muted">
                    {"Nothing to rebalance — every difference is under a swap's minimum."}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </DrawerCard>

      <DrawerCard icon={Layers} title="Holdings" right={<span className="type-label text-text-muted">Weights set {portfolio.reviewedOn}</span>}>
        <DataTable
          caption={`${portfolio.name}: each holding's target weight, price and, if you hold it, its share of your position.`}
          columns={columns}
          rows={report.rows}
          getRowKey={(row) => row.symbol}
          minWidth={420}
          card={(row) => (
            <div className="flex flex-col gap-1 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="type-data-sm text-text-primary">{row.ticker}</span>
                <span className="type-data-sm text-text-primary">{weightLabel(row.targetBps)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="type-label truncate text-text-muted">{row.name} · {row.role}</span>
                <span className="type-data-sm shrink-0 text-text-secondary">{formatPriceUsd(row.priceUsd)}</span>
              </div>
              {report.held && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="type-label text-text-muted">
                    Yours · <Quantity value={row.units} />
                  </span>
                  <span className={cn("type-data-sm", row.outOfBand ? "text-caution" : "text-text-primary")}>
                    {shareLabel(row.currentBps)}
                    {row.outOfBand ? " · out of band" : ""}
                  </span>
                </div>
              )}
            </div>
          )}
        />
      </DrawerCard>

      <DrawerCard icon={Info} title="Why these">
        <ul className="flex flex-col gap-2">
          {portfolio.thesis.map((line) => (
            <li key={line} className="type-body-sm text-text-secondary">
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <p className="type-label text-text-muted">{RULE}</p>
          {portfolio.category === "income" && <p className="type-label text-text-muted">{INCOME_NOTE}</p>}
          <p className="type-label text-text-muted">{ELIGIBILITY_NOTE}</p>
          <p className="type-label text-text-muted">{NOT_ADVICE_NOTE}</p>
        </div>
      </DrawerCard>

      {trade !== null && (
        <TradeDialog
          portfolio={portfolio}
          kind={trade.kind}
          legs={trade.legs}
          newHoldings={trade.kind === "buy" ? newHoldings : 0}
          onClose={() => {
            setTrade(null);
            setAmount("");
            invest.refetch();
            wallet.refetch();
          }}
        />
      )}
    </>
  );
}
