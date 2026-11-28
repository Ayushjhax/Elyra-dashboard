"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Layers, Scale, Wallet } from "lucide-react";
import {
  AllocationBar,
  Disclosure,
  RiskTag,
  dayLabel,
  handFocusTo,
  segmentStyle,
  takeFocus,
  walletUnits,
  walletUsdc,
  weightLabel,
} from "@/components/invest/parts";
import { TradeDialog } from "@/components/invest/TradeDialog";
import { Delta, Money, Quantity, SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DrawerCard, InfoTip, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPriceUsd, formatQty, formatUsd } from "@/lib/format";
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
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   One Intelligent Portfolio: what you hold of it and the trades that buy or
   correct it, what it targets, and why — with its disclosures folded under
   the allocation.

   Every figure is derived from the shared stores by lib/invest/plan.ts; this
   component plans nothing itself. "Review swaps" only opens TradeDialog's
   review step: nothing is quoted or signed until the person starts the
   purchase there, and each swap is then signed in their wallet.

   The amount stays as typed whatever is wrong with it, and the reason the
   review is closed is said under the button — never only by a disabled
   state.
--------------------------------------------------------------------------- */

/** Held to `isOutOfBand` in lib/invest/plan.ts — plan.test.ts checks both examples against it. */
const RULE = msg(
  "A holding is out of band when it is more than {points} percentage points from its target, or more than {relative}% of its target away — whichever is tighter. A 40% holding may sit between 35% and 45%; a 4% one between 3% and 5%.",
);
const RULE_VALUES = { points: DRIFT_ABSOLUTE_BPS / 100, relative: DRIFT_RELATIVE * 100 };

function shareLabel(bps: number | null): string {
  return bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;
}

function AllocationRow({ row, index, count, held }: { row: DriftRow; index: number; count: number; held: boolean }) {
  const t = useT();
  const swatch = segmentStyle(index, count);
  return (
    <li className="flex min-w-0 items-start gap-2.5 py-2.5">
      <span
        aria-hidden
        data-lead={swatch.lead}
        className={cn(swatch.className, "mt-1 size-2.5 shrink-0 rounded-[3px]")}
        style={swatch.style}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-data min-w-0 truncate text-text-primary">{row.ticker}</span>
          <span className="type-data shrink-0 text-text-primary">
            <span className="sr-only">{t("Target")} </span>
            {weightLabel(row.targetBps)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-label min-w-0 truncate text-text-muted" title={`${row.name} · ${t(row.role)}`}>
            {row.name} · {t(row.role)}
          </span>
          <span className="type-data-sm inline-flex shrink-0 items-baseline gap-1.5 text-text-secondary">
            <Delta pct={row.change24hPct} reason={t("No 24-hour change reported.")} className="hidden @[26rem]:inline" />
            <span title={row.priceUsd === null ? t("No price right now") : undefined}>
              <span className="sr-only">{t("Price")} </span>
              {formatPriceUsd(row.priceUsd)}
            </span>
          </span>
        </div>
        {held && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-label min-w-0 truncate text-text-muted">
              {t("Yours ·")} <Quantity value={row.units} />
            </span>
            <span className={cn("type-data-sm shrink-0", row.outOfBand ? "text-caution" : "text-text-primary")}>
              {shareLabel(row.currentBps)}
              {row.outOfBand ? t(" · out of band") : ""}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

function DisclosureBlock({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
      <h3 className="type-panel-title text-text-primary">{heading}</h3>
      {children}
    </div>
  );
}

export function PortfolioView({ id }: { id: string }) {
  const t = useT();
  const auth = useElyraAuth();
  const invest = useInvest();
  const wallet = usePortfolio();
  const [amount, setAmount] = useState("");
  const [trade, setTrade] = useState<{ kind: "buy" | "rebalance"; legs: Leg[] } | null>(null);
  const backRef = useRef<HTMLAnchorElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  const portfolio = invest.portfolios.find((entry) => entry.id === id) ?? null;

  /* Arrived from a card on the list: focus lands on the way back. */
  useEffect(() => {
    if (takeFocus("detail") === id) backRef.current?.focus();
  }, [id]);

  const view = useMemo(() => {
    if (portfolio === null) return null;
    const units = walletUnits(wallet.snapshot, invest.portfolios);
    const held = invest.positions === null ? {} : heldUnits(invest.positions, units);
    const mine = held[portfolio.id] ?? {};
    const report = driftOf(portfolio, mine);
    /* Rebalancing sells, so it is offered only against a wallet that has
       been read: recorded units alone could ask to sell what is not there. */
    const rebalance = report.held && units !== null ? planRebalance(portfolio, mine, 0, t) : null;
    const newHoldings = portfolio.holdings.filter((holding) => (units?.[holding.symbol] ?? 0) <= 0).length;
    return { report, rebalance, newHoldings, walletRead: units !== null };
  }, [portfolio, invest.portfolios, invest.positions, wallet.snapshot, t]);

  const back = (
    <Link
      ref={backRef}
      href="/invest"
      onClick={() => handFocusTo("list", id)}
      className={cn(
        "type-label -mx-1 inline-flex min-h-8 items-center gap-1.5 self-start rounded-control px-1 text-text-secondary",
        "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
      )}
    >
      <ArrowLeft size={14} aria-hidden />
      {t("All portfolios")}
    </Link>
  );

  if (invest.loading && portfolio === null) {
    return (
      <>
        {back}
        <DrawerCard icon={Layers} title={t("Target allocation")}>
          <SkeletonRows rows={6} />
        </DrawerCard>
      </>
    );
  }

  if (portfolio === null || view === null) {
    return (
      <>
        {back}
        <EmptyState
          icon={Layers}
          title={t("This portfolio could not be read")}
          body={invest.error ?? t("Its prices are unavailable right now. It will try again shortly.")}
        />
      </>
    );
  }

  const { report, rebalance, newHoldings } = view;
  const minimum = minimumInvestmentUsd(portfolio);
  const typed = amount.trim();
  const plan = typed.length === 0 ? null : planBuy(portfolio, typed, t);
  const legs = plan !== null && "legs" in plan ? plan.legs : null;
  const usdc = walletUsdc(wallet.snapshot);
  const spend = legs === null ? 0 : legs.reduce((sum, leg) => sum + leg.usd, 0);
  const short = legs !== null && usdc !== null && spend > usdc;
  /* Not closed while the review is open: the dialog is modal already, and a
     button disabled under it loses focus, so closing could not hand it back. */
  const canReview = legs !== null && !short;
  const rebalanceLegs = rebalance !== null && !("error" in rebalance) ? [...rebalance.sells, ...rebalance.buys] : [];

  /* Why the review is closed, or what it will hold — one line, always. */
  const reason: { text: string; tone: "muted" | "error" } =
    plan === null
      ? { text: t("Enter an amount in USDC to see the swaps."), tone: "muted" }
      : "error" in plan
        ? { text: plan.error, tone: "error" }
        : short
          ? { text: t("Insufficient USDC: this wallet holds {value} USDC. Swap or deposit more first.", { value: formatQty(usdc ?? 0) }), tone: "error" }
          : {
              text:
                plan.legs.length === 1
                  ? t("1 swap, split by target weight. Nothing is signed until you start it.")
                  : t("{count} swaps, one per holding, split by target weight. Nothing is signed until you start them.", { count: plan.legs.length }),
              tone: "muted",
            };

  const outOfBandTickers = report.rows.filter((row) => row.outOfBand).map((row) => row.ticker);

  return (
    <>
      {back}

      <div className="flex flex-wrap items-center gap-2">
        <span className="type-eyebrow text-text-muted">{t(CATEGORY_LABEL[portfolio.category])}</span>
        <RiskTag risk={portfolio.risk} />
      </div>

      <DrawerCard
        icon={Wallet}
        title={t("Your position")}
        right={
          report.held ? (
            report.totalUsd === null ? null : report.outOfBand ? (
              <StatusDot tone="caution">{t("Drifted")}</StatusDot>
            ) : (
              <StatusDot tone="positive">{t("On target")}</StatusDot>
            )
          ) : null
        }
      >
        {!auth.ready ? (
          <SkeletonRows rows={2} />
        ) : !auth.authenticated ? (
          <div className="flex flex-col items-start gap-3">
            <p className="type-body-sm text-text-secondary">{t("Sign in to buy this portfolio into your own wallet.")}</p>
            <Button size="sm" variant="accent" onClick={auth.login}>
              {t("Sign in")}
            </Button>
          </div>
        ) : auth.solanaAddress === null ? (
          <p className="type-body-sm text-text-secondary">{t("Connect a Solana wallet to buy this portfolio.")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {report.held && (
              <div className="flex flex-col gap-1">
                <span className="type-price text-text-primary">
                  <Money value={report.totalUsd} reason={t("No price right now for {value}.", { value: report.unpriced.join(", ") })} />
                </span>
                <p className="type-label text-text-muted">
                  {report.outOfBand
                    ? outOfBandTickers.length === 1
                      ? t("{tickers} is outside its band.", { tickers: outOfBandTickers.join(", ") })
                      : t("{tickers} are outside their bands.", { tickers: outOfBandTickers.join(", ") })
                    : t("Every holding is within its band.")}{" "}
                  <InfoTip text={t(RULE, RULE_VALUES)} />
                </p>
              </div>
            )}

            {invest.positionsError !== null && <p className="type-label text-caution">{invest.positionsError}</p>}

            <form
              noValidate
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (canReview && legs !== null && trade === null) setTrade({ kind: "buy", legs });
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <label htmlFor={`${fieldId}-amount`} className="type-label text-text-secondary">
                  {report.held ? t("Add USDC") : t("Amount in USDC")}
                </label>
                <span id={`${fieldId}-minimum`} className="type-data-sm text-text-muted">
                  {t("Minimum {amount}", { amount: formatUsd(minimum, { decimals: 0 }) })}
                </span>
              </div>
              <input
                ref={amountRef}
                id={`${fieldId}-amount`}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                aria-invalid={plan !== null && "error" in plan ? true : undefined}
                aria-describedby={`${fieldId}-minimum ${fieldId}-balance ${fieldId}-reason`}
                className={cn(
                  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border bg-surface-base px-3 text-text-primary",
                  "placeholder:text-text-muted",
                  plan !== null && "error" in plan ? "border-negative/60" : "border-border-strong",
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="type-label text-text-muted">{t("Wallet balance")}</span>
                <span id={`${fieldId}-balance`} className="type-data-sm text-text-secondary">
                  <span className="sr-only">{t("Wallet balance")} </span>
                  {usdc !== null
                    ? t("{value} USDC", { value: formatQty(usdc) })
                    : wallet.loading
                      ? t("Reading your wallet…")
                      : t("Unavailable")}
                </span>
              </div>
              <Button type="submit" variant="accent" className="mt-1 w-full disabled:bg-surface-hover" disabled={!canReview}>
                {t("Review swaps")}
              </Button>
              <p
                id={`${fieldId}-reason`}
                aria-live="polite"
                className={cn("type-label text-center", reason.tone === "error" ? "text-negative" : "text-text-muted")}
              >
                {reason.text}
              </p>
            </form>

            {report.held && (
              <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                {rebalance !== null && "error" in rebalance ? (
                  <p className="type-label text-text-muted">{rebalance.error}</p>
                ) : rebalanceLegs.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="type-label text-text-secondary">
                      {rebalanceLegs.length} {rebalanceLegs.length === 1 ? t("trade brings") : t("trades bring")} {t("it back to target.")}
                    </p>
                    <Button size="sm" variant={report.outOfBand ? "accent" : "quiet"} onClick={() => setTrade({ kind: "rebalance", legs: rebalanceLegs })}>
                      <Scale size={14} aria-hidden />
                      {t("Review rebalance")}
                    </Button>
                  </div>
                ) : !view.walletRead ? (
                  <p className="type-label text-text-muted">{t("Rebalancing waits for your wallet balances to load.")}</p>
                ) : (
                  <p className="type-label text-text-muted">{t("Nothing to rebalance — every difference is under a swap's minimum.")}</p>
                )}
              </div>
            )}
          </div>
        )}
      </DrawerCard>

      <DrawerCard icon={Layers} title={t("Target allocation")}>
        <AllocationBar holdings={portfolio.holdings} />
        <ul
          aria-label={t("{name}: each holding's target weight and price.", { name: t(portfolio.name) })}
          className="mt-2 flex flex-col divide-y divide-border-subtle"
        >
          {report.rows.map((row, index) => (
            <AllocationRow key={row.symbol} row={row} index={index} count={report.rows.length} held={report.held} />
          ))}
        </ul>
        <div className="mt-1 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <p className="type-data-sm text-text-secondary">{t("Weights set {reviewedOn}", { reviewedOn: dayLabel(portfolio.reviewedOn, t.locale) })}</p>
          <p className="type-label text-text-muted">{t(NOT_ADVICE_NOTE)}</p>
        </div>
      </DrawerCard>

      <Disclosure icon={Info} title={t("Strategy & disclosures")}>
        <div className="flex flex-col gap-3">
          <DisclosureBlock heading={t("Why these holdings")}>
            {portfolio.thesis.map((line) => (
              <p key={line} className="type-body-sm text-text-secondary">
                {t(line)}
              </p>
            ))}
          </DisclosureBlock>
          <DisclosureBlock heading={t("When weights drift")}>
            <p className="type-body-sm text-text-secondary">{t(RULE, RULE_VALUES)}</p>
          </DisclosureBlock>
          {portfolio.category === "income" && (
            <DisclosureBlock heading={t("How income accrues")}>
              <p className="type-body-sm text-text-secondary">{t(INCOME_NOTE)}</p>
            </DisclosureBlock>
          )}
          <DisclosureBlock heading={t("Eligibility & risk")}>
            <p className="type-body-sm text-text-secondary">{t(ELIGIBILITY_NOTE)}</p>
          </DisclosureBlock>
        </div>
      </Disclosure>

      {trade !== null && (
        <TradeDialog
          portfolio={portfolio}
          kind={trade.kind}
          legs={trade.legs}
          newHoldings={trade.kind === "buy" ? newHoldings : 0}
          onClose={(ran) => {
            const kind = trade.kind;
            setTrade(null);
            /* Closed from the review, nothing ran: the amount is still what
               the person typed. After a run it is spent, so it clears — and
               with no amount the review button is closed, so focus goes back
               to the field rather than falling to the page. */
            if (!ran) return;
            invest.refetch();
            wallet.refetch();
            if (kind === "buy") {
              setAmount("");
              setTimeout(() => amountRef.current?.focus(), 0);
            }
          }}
        />
      )}
    </>
  );
}
