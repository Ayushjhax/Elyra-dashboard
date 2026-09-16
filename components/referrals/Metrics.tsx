"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Skeleton } from "@/components/portfolio/primitives";
import type { ReferralStats } from "@/lib/referrals/stats";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The four figures, and the How It Works strip.

   §"Do not build a giant marketing hero" — these are restrained metric cards
   in the same geometry the rest of Elyra uses, not feature tiles.

   The count-up runs ONCE on first arrival, per §"count-up once". A number
   that re-animates on every poll is a number nobody can read, and the value
   here changes rarely enough that the animation is a first impression rather
   than a recurring event.
--------------------------------------------------------------------------- */

function useCountUp(value: number, enabled: boolean): number {
  /* Starts at zero only when it is going to animate, so the first paint and
     the first frame agree and there is no flash of the final number. */
  const [shown, setShown] = useState(enabled ? 0 : value);
  const from = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    /* Every write below happens inside a requestAnimationFrame callback
       rather than in the effect body. `react-hooks/set-state-in-effect`
       rejects a synchronous setState here, and it is right to: a synchronous
       write is a second render pass before the browser has painted the
       first. */
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      const frame = requestAnimationFrame(() => {
        from.current = value;
        setShown(value);
      });
      return () => cancelAnimationFrame(frame);
    }

    const start = from.current;
    const delta = value - start;
    if (delta === 0) return;

    const duration = 520;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / duration);
      /* Ease-out: fast then settling, so it reads as the number arriving
         rather than as a counter spinning. */
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(start + delta * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, enabled]);

  return enabled ? shown : value;
}

function Metric({
  label,
  value,
  sub,
  animate = false,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string | null;
  animate?: boolean;
  tone?: "default" | "accent";
}) {
  const numeric = typeof value === "number" ? value : 0;
  const counted = useCountUp(numeric, animate && typeof value === "number");

  return (
    <Card className="min-w-0">
      <div className="flex flex-col gap-0.5 p-3.5">
        <span className="type-label truncate uppercase tracking-[0.08em] text-text-muted">
          {label}
        </span>
        <span
          className={cn(
            "type-data truncate tabular-nums",
            tone === "accent" ? "text-accent" : "text-text-primary",
          )}
        >
          {typeof value === "number" ? counted.toLocaleString("en-US") : value}
        </span>
        {sub != null && <span className="type-label truncate text-text-muted">{sub}</span>}
      </div>
    </Card>
  );
}

export function ReferralMetrics({ stats }: { stats: ReferralStats }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 @[56rem]:grid-cols-4">
      <Metric
        label="Total points"
        value={stats.totalPoints}
        sub={
          stats.bonusPoints > 0
            ? `${stats.referralPoints.toLocaleString("en-US")} referral · ${stats.bonusPoints.toLocaleString("en-US")} bonus`
            : "From activated referrals"
        }
        animate
      />
      <Metric
        label="Referrals"
        value={stats.totalReferrals}
        sub={`${stats.activatedReferrals} activated`}
        animate
      />
      <Metric
        label="Activation rate"
        /* Null rather than 0% when nobody has joined: 0% reads as a failure
           to convert, and nothing has been attempted yet. */
        value={stats.activationRate === null ? "—" : `${stats.activationRate.toFixed(1)}%`}
        sub={
          stats.activationRate === null
            ? "No referrals yet"
            : `${stats.pendingReferrals} pending`
        }
      />
      <Metric
        label="Bonus earned"
        value={stats.pool.totalBonusPoints}
        sub={`${stats.pool.completedPools} pool${stats.pool.completedPools === 1 ? "" : "s"} completed`}
        tone={stats.pool.totalBonusPoints > 0 ? "accent" : "default"}
        animate
      />
    </div>
  );
}

export function ReferralMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 @[56rem]:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="min-w-0">
          <div className="flex flex-col gap-1.5 p-3.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   How it works
--------------------------------------------------------------------------- */

export function HowItWorks({
  activationRequirement,
  target,
  bonusPoints,
  activationPoints,
}: {
  activationRequirement: string;
  target: number;
  bonusPoints: number;
  activationPoints: number;
}) {
  /* Every number in this copy comes from server config, so the explanation
     cannot promise a reward the backend does not pay. */
  const steps = [
    { n: "01", title: "Share", body: "Send your unique Elyra referral link." },
    { n: "02", title: "Join", body: "Your friend creates their account through your link." },
    { n: "03", title: "Activate", body: activationRequirement },
    {
      n: "04",
      title: "Earn",
      body: `You receive ${activationPoints} points and their activation advances your pool.`,
    },
  ];

  return (
    <Card className="min-w-0">
      <ol className="grid list-none grid-cols-1 gap-px bg-border-subtle @[34rem]:grid-cols-2 @[64rem]:grid-cols-4">
        {steps.map((step) => (
          <li key={step.n} className="flex flex-col gap-1 bg-surface-panel p-3.5">
            <span className="type-label tabular-nums text-accent-quiet">{step.n}</span>
            <span className="type-data-sm text-text-primary">{step.title}</span>
            <span className="type-label text-balance text-text-muted">{step.body}</span>
          </li>
        ))}
      </ol>
      <p className="type-label border-t border-border-subtle px-3.5 py-2.5 text-text-secondary">
        Complete your Activation Pool — {target} activated referrals — to unlock an
        additional{" "}
        <span className="text-accent">{bonusPoints.toLocaleString("en-US")} points</span>.
        Pools repeat, so the next one starts immediately.
      </p>
    </Card>
  );
}
