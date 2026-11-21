"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Landmark, Plus } from "lucide-react";
import { LaunchFund } from "@/components/funds/LaunchFund";
import { FundStatusTag, ModeTag, Spark } from "@/components/funds/parts";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { DeltaText } from "@/components/ui/DeltaText";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import { FUND_LIMITS } from "@/lib/funds/policy";
import type { FundSummary } from "@/lib/funds/types";
import { useFunds } from "@/lib/funds/useFunds";
import { useMinute } from "@/lib/useClock";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Funds: autonomous AI funds over the person's own capital.

   The person is the investor and the board: they write the charter, put
   capital in and take it out, and decide when the fund goes live or
   closes. An AI agent — Claude, ChatGPT, a bot of their own, connected by
   an Elyra key — is the portfolio manager. Elyra is the administrator and
   risk officer: it holds every order to the charter, marks the book, keeps
   units and the high-water mark, halts the fund at its drawdown limit and
   seals every event into the ledger. Nothing is pooled; Elyra holds no key
   that can withdraw.
--------------------------------------------------------------------------- */

const LIFE = [
  { step: msg("Charter"), text: msg("You write the brief and the limits.") },
  { step: msg("Incubate"), text: msg("On paper, at real prices, at least {days} days.") },
  { step: msg("Graduate"), text: msg("Into your own Hyperliquid account.") },
  { step: msg("Operate"), text: msg("The AI trades; Elyra marks, limits and halts.") },
  { step: msg("Close"), text: msg("Wind down to flat, the record frozen.") },
];

function Lifecycle() {
  const t = useT();
  return (
    <ol className="grid grid-cols-5 gap-1.5 @max-[520px]:grid-cols-1">
      {LIFE.map((entry, index) => (
        <li key={entry.step} className="flex min-w-0 flex-col gap-0.5 rounded-card border border-border-subtle bg-surface-base px-2.5 py-2 @max-[520px]:flex-row @max-[520px]:items-baseline @max-[520px]:gap-2">
          <span className="type-eyebrow shrink-0 whitespace-nowrap text-accent">
            {index + 1} · {t(entry.step)}
          </span>
          <span className="type-label text-text-secondary">{t(entry.text, { days: FUND_LIMITS.minIncubationDays })}</span>
        </li>
      ))}
    </ol>
  );
}

function FundRow({ fund, now }: { fund: FundSummary; now: number | null }) {
  const t = useT();
  return (
    <li>
      <Link href={`/funds/${fund.id}`} className="-mx-2 flex items-center gap-3 rounded-card px-2 py-2.5 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{fund.name}</span>
            <ModeTag mode={fund.mode} />
          </div>
          <span className="type-label flex flex-wrap items-center gap-x-2 text-text-muted">
            <FundStatusTag status={fund.status} closedReason={fund.closedReason} />
            <span>{fund.manager === null ? t("No manager") : fund.manager.name}</span>
            {fund.managerSeenAt !== null && now !== null && <span>{t("checked in {managerSeenAt}", { managerSeenAt: formatRelativeTime(fund.managerSeenAt, now, t.locale) })}</span>}
          </span>
        </div>
        <Spark values={fund.spark} className="@max-[400px]:hidden" />
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="type-data text-text-primary">{fund.navUsd === null ? "—" : formatUsd(fund.navUsd)}</span>
          {fund.returnPct !== null && <DeltaText value={fund.returnPct} className="type-data-sm" />}
        </div>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}

export function FundsView() {
  const t = useT();
  const auth = useElyraAuth();
  const feed = useFunds();
  const now = useMinute();
  const [launching, setLaunching] = useState(false);

  if (!auth.ready || (feed.signedIn && feed.loading && feed.data === null)) {
    return (
      <DrawerCard icon={Landmark} title={t("Funds")}>
        <SkeletonRows rows={4} />
      </DrawerCard>
    );
  }
  if (!feed.signedIn) {
    return (
      <EmptyState
        icon={Landmark}
        title={t("Sign in to run AI funds")}
        body={t("Write a charter, give an AI agent the fund to manage, and let Elyra hold it to the charter — on paper first, then in your own Hyperliquid account.")}
        action={
          <Button size="sm" variant="accent" onClick={auth.login}>
            {t("Sign in")}
          </Button>
        }
      />
    );
  }
  const data = feed.data;
  if (data === null) return <EmptyState icon={Landmark} title={t("Funds are unavailable")} body={feed.error ?? t("It will try again shortly.")} />;

  const open = data.funds.filter((fund) => fund.status !== "closed");
  const closed = data.funds.filter((fund) => fund.status === "closed");
  const canLaunch = open.length < FUND_LIMITS.maxOpenFunds;

  return (
    <>
      <p className="type-body-sm px-1 text-text-secondary">
        {t("An AI manages the fund; you own it; Elyra runs the back office and the risk desk. Every order is held to the charter you write, the book is marked to market every five minutes, and the fund is halted and flattened at its drawdown limit. Your capital never leaves your own account.")}
      </p>
      {launching ? (
        <LaunchFund feed={feed} managers={data.managers} onClose={() => setLaunching(false)} />
      ) : (
        <DrawerCard
          icon={Landmark}
          title={t("Your funds")}
          right={
            canLaunch ? (
              <Button size="sm" variant={open.length === 0 ? "accent" : "quiet"} onClick={() => setLaunching(true)}>
                <Plus size={14} aria-hidden />{" "}{t("New fund")}
              </Button>
            ) : undefined
          }
        >
          {open.length === 0 ? (
            <p className="type-body-sm text-text-secondary">
              {t("No funds running. Launch one on paper: write its brief and limits, and connect the AI that will manage it.")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {open.map((fund) => (
                <FundRow key={fund.id} fund={fund} now={now} />
              ))}
            </ul>
          )}
          {!canLaunch && <p className="type-label mt-2 text-text-muted">{t("{maxOpenFunds} funds are running, the most at once. Wind one down to launch another.", { maxOpenFunds: FUND_LIMITS.maxOpenFunds })}</p>}
        </DrawerCard>
      )}

      <Lifecycle />

      {closed.length > 0 && (
        <DrawerCard icon={Landmark} title={t("Closed and graduated")}>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {closed.map((fund) => (
              <FundRow key={fund.id} fund={fund} now={now} />
            ))}
          </ul>
        </DrawerCard>
      )}

      {!data.live.enabled && (
        <p className="type-label px-1 text-text-muted">
          {t("This server trades paper only, so funds can incubate but not graduate. Live trading is switched on by the deployment (Hyperliquid {network}).", { network: data.live.network })}
        </p>
      )}
    </>
  );
}
