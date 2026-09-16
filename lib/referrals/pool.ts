/* ---------------------------------------------------------------------------
   Pool arithmetic, extracted so it can be tested without a database.

   These three functions are the whole mechanic. `settlePools` in rewards.ts
   does the paying; this decides what is owed, and it is pure so the rules can
   be pinned by unit tests rather than inferred from integration behaviour.

   No `server-only`: the page renders the same progress this computes, and
   both sides importing one function is what stops the bar and the bonus from
   ever disagreeing.
--------------------------------------------------------------------------- */

/** How many pools a lifetime activation count has filled. */
export function completedPoolCount(activated: number, target: number): number {
  if (target <= 0) return 0;
  return Math.floor(Math.max(0, activated) / target);
}

/**
 * Slots filled in the pool currently being worked on, 0..target-1.
 *
 * The modulo is what makes pools repeat rather than stopping at the first:
 * 13 activations against a target of 5 is two completed pools and three
 * slots into the third.
 */
export function currentPoolProgress(activated: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, activated) % target;
}

/** Activations still needed to fill the current pool. Never 0 — see below. */
export function activationsToNextBonus(activated: number, target: number): number {
  if (target <= 0) return 0;
  const remaining = target - currentPoolProgress(activated, target);
  /* At an exact multiple the current pool is empty and a whole one is
     needed — not zero, which would read as "your bonus is ready" when the
     bonus for that boundary has already been paid. */
  return remaining === 0 ? target : remaining;
}

/** Pool numbers owed but not yet settled, given what has been settled. */
export function unsettledPools(
  activated: number,
  target: number,
  alreadySettled: number,
): number[] {
  const earned = completedPoolCount(activated, target);
  const pools: number[] = [];
  for (let poolNumber = alreadySettled + 1; poolNumber <= earned; poolNumber += 1) {
    pools.push(poolNumber);
  }
  return pools;
}
