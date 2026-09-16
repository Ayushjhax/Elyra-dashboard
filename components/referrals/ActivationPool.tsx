"use client";

import { Check } from "lucide-react";
import { Card, CardHead, Skeleton } from "@/components/portfolio/primitives";
import { activationsToNextBonus } from "@/lib/referrals/pool";
import type { PoolState } from "@/lib/referrals/stats";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Activation Pool — the programme's signature mechanic.

   Nodes on a rail. A filled node is Elyra Green with a restrained check; an
   empty one is a low-opacity ring. The rail segment between two filled nodes
   lights; the rest stays dark. No glow, no confetti, no coins.

   ── Accessibility ─────────────────────────────────────────────────────

   The dots are decoration. `aria-hidden` on the whole rail, and the real
   state is the sentence under it — "3 of 5 referrals activated" — which is
   what a screen reader announces and what someone who cannot distinguish the
   fill colour reads. §"Do not make the dots the only indication."

   The node count comes from `target`, so a target of 3 or 8 draws 3 or 8
   nodes. Nothing here assumes five.
--------------------------------------------------------------------------- */

function Node({ filled, index }: { filled: boolean; index: number }) {
  return (
    <span
      className={cn(
        "relative z-10 grid size-6 shrink-0 place-items-center rounded-pill border",
        "transition-[background-color,border-color] duration-[var(--dur-slow)] ease-brand",
        filled
          ? "border-accent-quiet bg-surface-active text-accent"
          : "border-border-subtle bg-surface-panel",
      )}
      /* Staggered so the rail fills left to right rather than all at once. */
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {filled && <Check size={11} strokeWidth={2.5} aria-hidden />}
    </span>
  );
}

export function ActivationPool({ pool }: { pool: PoolState }) {
  const remaining = activationsToNextBonus(pool.lifetimeActivations, pool.target);
  const complete = pool.progress === 0 && pool.completedPools > 0;
  const nodes = Array.from({ length: pool.target }, (_, index) => index < pool.progress);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Activation Pool"
        sub={`${pool.target} activations unlock a bonus`}
        right={
          pool.completedPools > 0 ? (
            <span className="type-label rounded-chip border border-border-subtle px-1.5 py-0.5 text-text-muted">
              {pool.completedPools} complete
            </span>
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
        <div className="flex flex-col gap-3">
          {/* Decoration. The sentence below carries the state. */}
          <div aria-hidden className="relative flex items-center justify-between">
            <span className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-border-subtle" />
            <span
              className="absolute left-3 top-1/2 h-px -translate-y-1/2 bg-accent-quiet transition-[width] duration-[var(--dur-slow)] ease-brand"
              style={{
                width:
                  pool.progress === 0
                    ? 0
                    : `calc((100% - 1.5rem) * ${Math.min(pool.progress, pool.target - 1) / Math.max(1, pool.target - 1)})`,
              }}
            />
            {nodes.map((filled, index) => (
              <Node key={index} filled={filled} index={index} />
            ))}
          </div>

          <p className="type-data text-text-primary">
            {pool.progress} / {pool.target}
            <span className="type-label ml-1.5 text-text-muted">activated</span>
          </p>

          {/* The accessible statement of progress. */}
          <p className="sr-only" aria-live="polite">
            {pool.progress} of {pool.target} referrals activated in your current pool.
          </p>

          <p className="type-label text-text-secondary">
            {complete ? (
              <span className="text-positive">
                Pool complete — a new pool has started.
              </span>
            ) : (
              <>
                {remaining} more activation{remaining === 1 ? "" : "s"} to unlock your
                bonus.
              </>
            )}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-border-subtle pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="type-label uppercase tracking-[0.08em] text-text-muted">
              Next bonus
            </span>
            <span className="type-data tabular-nums text-accent">
              +{pool.nextBonusPoints.toLocaleString("en-US")} pts
            </span>
          </div>
          <span className="type-label text-right text-text-muted">
            Unlocks at {pool.target} / {pool.target}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function ActivationPoolSkeleton() {
  return (
    <Card className="min-w-0">
      <CardHead title="Activation Pool" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="size-6 rounded-pill" />
          ))}
        </div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-2.5 w-44" />
      </div>
    </Card>
  );
}
