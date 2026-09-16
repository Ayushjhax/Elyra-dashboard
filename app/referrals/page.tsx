"use client";

import { useCallback, useEffect, useState } from "react";
import { ActivationPool, ActivationPoolSkeleton } from "@/components/referrals/ActivationPool";
import {
  HowItWorks,
  ReferralMetrics,
  ReferralMetricsSkeleton,
} from "@/components/referrals/Metrics";
import { ReferralCard, ReferralCardSkeleton } from "@/components/referrals/ReferralCard";
import { ReferralsTable } from "@/components/referrals/ReferralsTable";
import { Unavailable } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import type { ReferralsResponse } from "@/app/api/referrals/route";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { truncateMiddle } from "@/lib/format";

/* ---------------------------------------------------------------------------
   Referrals — the growth console.

   Everything on this page is rendered from one server aggregate. The page
   computes no reward state of its own: pool progress, activation rate and the
   next bonus all arrive already worked out, because a component that derives
   what someone is owed is a component that can disagree with the ledger.

   Layout follows §42: metrics across the top, then the referral card beside
   the Activation Pool at roughly 62/38, then How It Works, then the list.
   Container queries rather than viewport ones — this page renders inside a
   shell column whose width changes on a drag.
--------------------------------------------------------------------------- */

const EMPTY: ReferralsResponse = {
  stats: null,
  referrals: [],
  error: null,
  unconfigured: false,
};

export default function ReferralsPage() {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<ReferralsResponse | null>(null);
  const [nonce, setNonce] = useState(0);

  const signedIn = auth.ready && auth.authenticated;

  /* Pure fetch with no setState of its own — `react-hooks/set-state-in-effect`
     rejects any setState reachable before an effect's first await. */
  const load = useCallback(async (): Promise<ReferralsResponse> => {
    if (!signedIn) return EMPTY;
    try {
      const response = await authedFetch("/api/referrals", { cache: "no-store" });
      return (await response.json()) as ReferralsResponse;
    } catch (error: unknown) {
      return {
        ...EMPTY,
        error:
          error instanceof Error ? error.message : "We couldn't load your referral data.",
      };
    }
  }, [authedFetch, signedIn]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  const stats = data?.stats ?? null;
  const loading = !auth.ready || (signedIn && data === null);

  /* The account's own identity, from the Privy session rather than from the
     referral payload — the server has no reason to send the viewer their own
     name back. */
  const displayName =
    auth.account?.accounts.find((entry) => entry.type === "email")?.detail ??
    auth.solanaAddress ??
    "Your account";
  const handle =
    auth.solanaAddress === null ? null : truncateMiddle(auth.solanaAddress, 4, 4);

  async function copyLink(): Promise<void> {
    if (stats?.referralUrl == null) return;
    try {
      await navigator.clipboard.writeText(stats.referralUrl);
    } catch {
      /* The card's own copy control carries the fallback and the feedback. */
    }
  }

  return (
    <Panel label="Referrals" className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>Referrals</Eyebrow>
        <span className="type-label ml-auto truncate text-text-muted">
          Grow Elyra. Earn points.
        </span>
      </PanelHeader>

      <PanelBody className="@container">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            <ReferralMetricsSkeleton />
            <div className="grid grid-cols-1 gap-2.5 @[56rem]:grid-cols-[1.6fr_1fr]">
              <ReferralCardSkeleton />
              <ActivationPoolSkeleton />
            </div>
          </div>
        ) : !signedIn ? (
          <EmptyState
            mark="forest"
            title="Sign in to get your referral link"
            body="Your referral code is tied to your Elyra account. Connect a wallet to claim yours."
            action={
              auth.available ? (
                <Button size="sm" variant="accent" onClick={auth.login}>
                  Connect wallet
                </Button>
              ) : undefined
            }
          />
        ) : stats === null ? (
          <div className="p-4">
            <Unavailable
              tone={data?.unconfigured === true ? "neutral" : "warning"}
              title={
                data?.unconfigured === true
                  ? "Referrals are not set up yet"
                  : "We couldn't load your referral data."
              }
              body={data?.error ?? "Something went wrong reading your referrals."}
              onRetry={data?.unconfigured === true ? undefined : refetch}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <header className="flex flex-col gap-0.5">
              <h1 className="type-h2 text-text-primary">Grow Elyra. Earn points.</h1>
              <p className="type-body-sm max-w-prose text-text-secondary">
                Share your referral link. Earn points when people activate, and unlock
                additional bonuses as your Activation Pool fills.
              </p>
            </header>

            <ReferralMetrics stats={stats} />

            {/* §42: referral card ~62%, pool ~38% at width; stacked below. */}
            <div className="grid grid-cols-1 gap-2.5 @[56rem]:grid-cols-[1.6fr_1fr]">
              <ReferralCard
                name={displayName}
                handle={handle}
                code={stats.referralCode}
                url={stats.referralUrl}
                totalPoints={stats.totalPoints}
              />
              <ActivationPool pool={stats.pool} />
            </div>

            <HowItWorks
              activationRequirement={stats.activationRequirement}
              target={stats.pool.target}
              bonusPoints={stats.pool.nextBonusPoints}
              activationPoints={stats.activationPoints}
            />

            <ReferralsTable
              referrals={data?.referrals ?? []}
              loading={false}
              onCopyLink={() => void copyLink()}
              canCopy={stats.referralUrl !== null}
            />

            {stats.pendingReferrals > 0 && (
              <p className="type-label px-1 text-text-muted">
                Pending referrals activate the next time they open Elyra and meet the
                requirement — {stats.activationRequirement.toLowerCase()}
              </p>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
